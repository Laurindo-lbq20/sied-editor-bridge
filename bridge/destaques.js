// Destaques de texto e etiquetas na margem, só de ecrã. A bridge não sabe o que
// o texto significa: a aplicação anfitriã diz quais intervalos de cada parágrafo
// se destacam, com que cor, e que etiquetas ficam na margem da folha.
//
//   aplicação → bridge  `destacar` { paragrafos: [{ p, texto, intervalos: [{ id, ini, len,
//                          estilo, dica, grupo }] }], estilos: { <estilo>: [r, g, b] } }
//   aplicação → bridge  `etiquetas` { etiquetas: [{ chave, cor, titulo, partes: [{ t, k }],
//                          ancora, ligacoes }], aberta }
//   bridge → aplicação  `documento-mudou` { paragrafos }   o texto, um parágrafo por posição
//   bridge → aplicação  `etiqueta` { chave, x, y, direita } clicaram numa etiqueta
//
// O destaque desenha-o o próprio motor, como anotação de texto (as dos
// corretores), pintada como fundo translúcido. Fica certo em tabelas, linhas
// partidas, zoom e scroll, e não entra no documento nem no anular.
//
// A cada quadro vê-se se o documento mudou (o histórico do motor); se mudou,
// lê-se o texto directamente dos parágrafos e avisa-se a aplicação. As posições
// recalculam-se em cada quadro.
//
// Usa peças internas do motor (não as altera): `CDocument.GetAllParagraphs`,
// `History`, os elementos dos parágrafos, `Paragraph.GetPosByElement` e
// `Get_XYByContentPos`, `DrawingDocument.ConvertCoordsToCursorWR`,
// `#id_main_view` e `#id_target_cursor`. Se uma versão nova as mudar, os
// destaques não aparecem e o editor continua a funcionar.

/** Opacidade do fundo dos destaques (0 a 255). */
const OPACIDADE = 97;
/** Largura reservada à direita da folha para as etiquetas. */
const LARGURA_DA_FAIXA = 240;
const ALTURA = 26;
const INTERVALO = 6;
/** O prefixo das anotações desta bridge no motor. */
const PREFIXO = 'destaque-';

export default function destaques(bridge) {
  // ─── O que a aplicação mandou ────────────────────────────────────────────
  /** Os intervalos por posição de parágrafo, com o texto em que foram medidos. */
  let porParagrafo = new Map();
  let estilos = {};
  let etiquetas = [];
  let aberta = null;
  /** A posição de cada parágrafo (por id do motor) na lista que a aplicação recebe. */
  const indiceDe = new Map();
  /** O que se desenhou da última vez nas etiquetas (para só refazer quando muda), e a versão das etiquetas. */
  let desenhadoChave = '';
  let versao = 0;

  bridge.responder('destacar', ({ paragrafos: lista = [], estilos: e = {} }) => {
    porParagrafo = new Map(lista.map((x) => [x.p, x]));
    estilos = e ?? {};
    desenhadoChave = '';
    montarOcorrencias();
    aplicarCores();
    reanotar();
    return lista.length;
  });

  bridge.responder('etiquetas', ({ etiquetas: lista = [], aberta: a = null }) => {
    etiquetas = Array.isArray(lista) ? lista : [];
    aberta = a;
    versao += 1;
    return etiquetas.length;
  });

  // O texto já lido (para a aplicação, ao abrir, não ter de esperar pela próxima alteração).
  bridge.responder('texto-lido', () => (assinatura === null ? null : paragrafos));

  // ─── A faixa das etiquetas ───────────────────────────────────────────────
  // Com pelo menos uma etiqueta, reserva-se uma coluna à direita da área do
  // motor, como ele faz quando abre um painel: a folha chega-se à esquerda e as
  // etiquetas cabem ao lado dela, sem tapar a folha nem os comentários.
  let largura = 0;
  function aplicarFaixa() {
    const fw = moldura();
    const sdk = fw?.document.getElementById('editor_sdk');
    if (!sdk) return;
    const quer = largura ? `calc(100% - ${largura}px)` : '';
    if (sdk.style.width !== quer) {
      sdk.style.width = quer;
      // A barra de deslocamento é do motor e fica na ponta da área dele; com a
      // faixa, passa para a ponta da janela, depois das etiquetas.
      sdk.style.overflow = largura ? 'visible' : '';
      fw.editor?.Resize?.();
      desenhadoChave = '';
    }
    // O motor volta a pôr a barra no sítio dele a cada reajuste: confirma-se a cada quadro.
    const barra = fw.document.getElementById('id_panel_right');
    if (barra && largura) {
      const esquerda = `${sdk.clientWidth + largura - barra.offsetWidth}px`;
      if (barra.style.left !== esquerda) barra.style.left = esquerda;
    }
  }

  /** A largura útil da faixa: sem a barra de deslocamento, que passa para lá. */
  function larguraUtil() {
    const barra = moldura()?.document.getElementById('id_panel_right');
    return Math.max(0, largura - (barra?.offsetWidth ?? 0));
  }

  // ─── O motor ─────────────────────────────────────────────────────────────
  const moldura = () => document.querySelector('iframe[name="frameEditor"]')?.contentWindow ?? null;

  /** Os bocados de texto de um elemento de parágrafo (entra em ligações, campos, etc.). */
  function percorrer(fw, el, fn) {
    if (!el) return;
    if (el instanceof fw.AscWord.ParaRun) return fn(el);
    if (Array.isArray(el.Content)) for (const filho of el.Content) percorrer(fw, filho, fn);
  }

  /** O texto de um parágrafo e, para cada carácter, o bocado e a posição de onde veio. */
  function lerParagrafo(fw, para) {
    let texto = '';
    const mapa = [];
    for (const el of para.Content ?? []) {
      percorrer(fw, el, (run) => {
        (run.Content ?? []).forEach((item, pos) => {
          let ch = null;
          if (item.IsText?.()) ch = item.IsNBSP?.() ? ' ' : String.fromCodePoint(item.GetCodePoint());
          else if (item.IsSpace?.()) ch = ' ';
          else if (item.IsTab?.()) ch = '\t';
          else if (item.IsBreak?.()) ch = '\n';
          if (ch === null) return;
          for (let u = 0; u < ch.length; u++) mapa.push({ run, pos });
          texto += ch;
        });
      });
    }
    return { texto, mapa };
  }

  /** O texto de cada parágrafo e, por posição, o parágrafo do motor e o mapa dos caracteres. */
  let paragrafos = [];
  let paras = [];
  let mapas = [];
  /** Os intervalos com a sua posição no motor. */
  let ocorrencias = [];
  function lerDocumento(fw, doc) {
    const lista = doc.GetAllParagraphs({ OnlyMainDocument: true, All: true }) ?? [];
    paragrafos = [];
    paras = [];
    mapas = [];
    indiceDe.clear();
    lista.forEach((para, p) => {
      indiceDe.set(para.GetId?.(), p);
      const { texto, mapa } = lerParagrafo(fw, para);
      paragrafos.push(texto);
      paras.push(para);
      mapas.push(mapa);
    });
    montarOcorrencias();
  }

  /** Põe cada intervalo que a aplicação mandou no sítio do motor onde está o texto dele. */
  function montarOcorrencias() {
    ocorrencias = [];
    for (const [p, entrada] of porParagrafo) {
      const mapa = mapas[p];
      const para = paras[p];
      if (!mapa || !para) continue;
      for (const iv of entrada.intervalos ?? []) {
        const ini = mapa[iv.ini];
        const fim = mapa[iv.ini + iv.len - 1];
        // `fim`: depois da última letra (o fim de um intervalo no fim da linha cai na linha seguinte).
        // `letras`: onde está cada letra, para quando o intervalo se parte em várias linhas.
        if (ini && fim) {
          ocorrencias.push({
            id: iv.id,
            p,
            estilo: iv.estilo,
            dica: iv.dica ?? '',
            grupo: iv.grupo ?? null,
            texto: paragrafos[p].slice(iv.ini, iv.ini + iv.len),
            para,
            ini,
            letras: mapa.slice(iv.ini, iv.ini + iv.len),
            fim: { run: fim.run, pos: fim.pos + 1 },
          });
        }
      }
    }
  }

  /** Onde fica uma posição de texto na página (mm). */
  function ponto(para, { run, pos }) {
    const cp = para.GetPosByElement(run);
    if (!cp) return null;
    cp.Update(pos, cp.GetDepth() + 1);
    const xy = para.Get_XYByContentPos(cp);
    return xy && xy.Height > 0 ? { x: xy.X, y: xy.Y, h: xy.Height, p: xy.PageNum } : null;
  }

  // ─── A camada ────────────────────────────────────────────────────────────
  let camada = null;
  let dica = null;
  let caixas = [];
  let ligadoA = null;
  let rato = null;
  let activa = null;

  function garantirCamada(fw) {
    const vista = fw.document.getElementById('id_main_view');
    if (!vista) return null;
    if (camada && camada.parentElement === vista) return vista;
    camada = fw.document.createElement('div');
    camada.setAttribute('data-bridge', 'camada');
    camada.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4;overflow:hidden';
    vista.appendChild(camada);
    dica = fw.document.createElement('div');
    dica.style.cssText =
      'position:fixed;z-index:1000;display:none;max-width:320px;padding:6px 9px;border-radius:6px;' +
      'background:#1f2937;color:#fff;font:12px/1.4 system-ui,sans-serif;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.2)';
    fw.document.body.appendChild(dica);
    desenhadoChave = '';
    return vista;
  }

  function ligar(fw) {
    if (ligadoA === fw) return;
    ligadoA = fw;
    fw.addEventListener('mousemove', (e) => (rato = { x: e.clientX, y: e.clientY }), true);
    fw.addEventListener('mouseout', (e) => !e.relatedTarget && (rato = null), true);
  }

  /** O intervalo debaixo de um ponto (px da janela da moldura), ou nada. */
  function caixaEm(x, y) {
    if (!camada) return null;
    const r = camada.getBoundingClientRect();
    return caixas.find((c) => x - r.left >= c.x && x - r.left <= c.x + c.w && y - r.top >= c.y && y - r.top <= c.y + c.h) ?? null;
  }

  let assinatura = null;
  function quadro() {
    const fw = moldura();
    const wc = fw?.editor?.WordControl;
    const doc = wc?.m_oLogicDocument;
    const dd = wc?.m_oDrawingDocument;
    if (!fw || !doc || !dd?.ConvertCoordsToCursorWR || !fw.AscWord?.ParaRun) return;
    ligar(fw);
    // A disposição do editor pode refazer-se (outro documento, janela): a faixa volta a pôr-se.
    if (largura) aplicarFaixa();

    // 1. O documento mudou? (o histórico do motor mexe a cada alteração, e a cada anular)
    const h = doc.History;
    const agora = [h?.Index, h?.Points?.length, h?.Points?.[h.Index]?.Items?.length, doc.Content?.length].join('|');
    if (agora !== assinatura) {
      assinatura = agora;
      // O motor só trata as anotações dos parágrafos alterados quando tem tempo
      // livre (~1 s); pede-se já, pela mesma função dele, para o destaque seguir a escrita.
      try {
        doc.CustomTextAnnotator?.continueProcessing?.();
      } catch {
        // Sem isto, o destaque chega na mesma, só mais tarde.
      }
      lerDocumento(fw, doc);
      bridge.enviar('documento-mudou', { paragrafos });
    }

    const vista = garantirCamada(fw);
    if (!vista) return;

    // 2. Onde está cada intervalo agora (o texto corre, o scroll e o zoom mexem).
    const novas = [];
    for (const o of ocorrencias) {
      let a;
      let b;
      try {
        a = ponto(o.para, o.ini);
        b = ponto(o.para, o.fim);
      } catch {
        continue;
      }
      if (!a || !b) continue;
      const pa = dd.ConvertCoordsToCursorWR(a.x, a.y, a.p);
      const pb = dd.ConvertCoordsToCursorWR(b.x, b.y, b.p);
      const limites = doc.Get_PageLimits?.(a.p);
      const margem = limites ? dd.ConvertCoordsToCursorWR(limites.XLimit, a.y, a.p).X - vista.offsetLeft : null;
      const comum = { id: o.id, grupo: o.grupo, dica: o.dica, margem };
      const x = pa.X - vista.offsetLeft;
      const y = pa.Y - vista.offsetTop;
      const altura = dd.GetDotsPerMM(a.h);
      if (a.p === b.p && Math.abs(pa.Y - pb.Y) < 1) {
        novas.push({ ...comum, x, y, w: Math.max(2, pb.X - pa.X), h: altura });
      } else {
        // O fim não está na linha do início: ou acaba no fim da linha (o motor dá
        // o depois-da-última-letra já na seguinte), ou parte-se em várias linhas.
        // Mede-se letra a letra e fica um bocado por linha.
        const linhas = [];
        for (const letra of o.letras) {
          let l;
          try {
            l = ponto(o.para, letra);
          } catch {
            l = null;
          }
          if (!l) continue;
          const pl = dd.ConvertCoordsToCursorWR(l.x, l.y, l.p);
          const ultima = linhas[linhas.length - 1];
          if (ultima && ultima.p === l.p && Math.abs(ultima.y - pl.Y) < 1) {
            ultima.xs.push(pl.X);
          } else linhas.push({ p: l.p, y: pl.Y, h: dd.GetDotsPerMM(l.h), xs: [pl.X] });
        }
        // A largura de uma letra, para fechar o último bocado de cada linha.
        const maior = linhas.reduce((m, l) => (l.xs.length > m.xs.length ? l : m), linhas[0] ?? { xs: [] });
        const letra = maior.xs.length > 1 ? (maior.xs[maior.xs.length - 1] - maior.xs[0]) / (maior.xs.length - 1) : altura * 0.5;
        for (const l of linhas) {
          const x0 = Math.min(...l.xs);
          const x1 = Math.max(...l.xs) + letra;
          novas.push({ ...comum, x: x0 - vista.offsetLeft, y: l.y - vista.offsetTop, w: Math.max(2, x1 - x0), h: l.h });
        }
      }
    }

    // 3. As posições servem as etiquetas e a explicação ao passar o rato; o
    // fundo desenha-o o próprio motor (anotações, mais abaixo).
    caixas = novas;
    if (!anotador) ligarAnotador();

    // 4. O intervalo activo: debaixo do rato, ou com o cursor lá dentro.
    const sobRato = rato ? caixaEm(rato.x, rato.y) : null;
    const cursor = fw.document.getElementById('id_target_cursor');
    const rc = cursor && cursor.style.display !== 'none' ? cursor.getBoundingClientRect() : null;
    const sobCursor = rc && rc.height > 0 ? caixaEm(rc.left + 1, rc.top + rc.height / 2) : null;
    const alvo = sobRato ?? sobCursor;
    activa = alvo ? alvo.grupo : null;

    // 5. A faixa e as etiquetas, dentro do editor (por baixo dos menus e janelas dele).
    const precisa = etiquetas.length > 0 && caixas.length > 0;
    if (largura !== (precisa ? LARGURA_DA_FAIXA : 0)) {
      largura = precisa ? LARGURA_DA_FAIXA : 0;
      aplicarFaixa();
    }
    desenharEtiquetas(fw, vista);

    if (dica) {
      if (sobRato?.dica) {
        dica.textContent = sobRato.dica;
        dica.style.display = 'block';
        dica.style.left = `${Math.min(rato.x + 12, fw.innerWidth - 330)}px`;
        dica.style.top = `${rato.y + 16}px`;
      } else dica.style.display = 'none';
    }
  }

  // ─── O fundo nativo ──────────────────────────────────────────────────────
  // Os destaques desenham-se pelas anotações de texto do próprio motor (as dos
  // corretores): é ele que as desenha, presas ao texto, em tabelas, colunas,
  // zoom e scroll, sem tocar no documento. O motor avisa cada parágrafo que
  // muda (`onParagraphText`) e responde-se com os trechos (`AnnotateParagraph`).
  // Uma anotação por estilo, cada um com a sua cor, fixada pela tabela de cores
  // do próprio motor (`AscCommon.getUserColorById`).
  let anotador = null;
  /** O último texto de cada parágrafo que o motor mandou, e os estilos lá anotados. */
  const paragrafosDoMotor = new Map();

  function aplicarCores() {
    if (!anotador) return;
    const fw = moldura();
    for (const [estilo, [r, g, b]] of Object.entries(estilos)) {
      const cor = fw?.AscCommon?.getUserColorById?.(`${anotador.guid}AnnotationName:${PREFIXO}${estilo}`, null, false);
      if (cor) Object.assign(cor, { r, g, b });
    }
  }

  function ligarAnotador() {
    try {
      bridge.connector();
    } catch {
      return;
    }
    const c = window.editor.createConnector();
    const fw = moldura();
    pintarComoFundo(fw);
    semEspera(fw);
    anotador = c;
    aplicarCores();
    c.attachEvent('onParagraphText', (d) => {
      const antes = paragrafosDoMotor.get(d.paragraphId);
      paragrafosDoMotor.set(d.paragraphId, { ...d, estilos: antes?.estilos ?? new Set() });
      anotar(d.paragraphId);
    });
  }

  /**
   * As anotações desta bridge pintam-se como fundo, e não como o sublinhado dos
   * corretores, para não se confundirem com erros de ortografia. O motor entrega
   * cada trecho já medido, linha a linha (`drawCustomRange`: x, y, largura,
   * altura em mm); aqui só se troca o traço por um rectângulo translúcido, no
   * mesmo desenho do texto. Em memória, e só para as anotações desta bridge: as
   * dos outros ficam como o motor as desenha.
   */
  function pintarComoFundo(fw) {
    const G = fw?.AscCommon?.CGraphics?.prototype;
    if (!G || G.__fundoDaBridge) return;
    const original = G.drawCustomRange;
    G.drawCustomRange = function (id, rangeId, x, y, w, h, base) {
      if (String(id).indexOf(`AnnotationName:${PREFIXO}`) === -1 || !this.b_color1 || !this.rect || !this.df) {
        return original.apply(this, arguments);
      }
      const cor = fw.AscCommon.getUserColorById(id, null, false);
      this.b_color1(cor.r, cor.g, cor.b, OPACIDADE);
      this.rect(x, y, w, h);
      this.df();
    };
    G.__fundoDaBridge = true;
  }

  /**
   * O motor guarda cada parágrafo alterado 1 s antes de o mandar aos anotadores
   * (`onChangeParagraph` → `setTimeout(send, 1000)`), daí o destaque chegar
   * atrasado. Aqui manda-se logo, pela mesma função dele (`send`), com o mesmo
   * número de recálculo. Em memória; o código do motor fica intacto.
   */
  function semEspera(fw) {
    const em = fw?.editor?.getTextAnnotatorEventManager?.();
    if (!em || em.__semEsperaDaBridge || typeof em.onChangeParagraph !== 'function' || typeof em.send !== 'function') return;
    const original = em.onChangeParagraph;
    em.onChangeParagraph = function (para) {
      original.apply(this, arguments);
      const id = para?.GetId?.();
      if (id && this.waitPara?.[id]) {
        clearTimeout(this.waitPara[id]);
        this.waitPara[id] = null;
        this.send(para);
      }
    };
    em.__semEsperaDaBridge = true;
  }

  function anotar(paragraphId) {
    const d = paragrafosDoMotor.get(paragraphId);
    if (!d || !anotador) return;
    const porEstilo = new Map();
    const entrada = porParagrafo.get(indiceDe.get(paragraphId));
    // Só se o texto que a aplicação mediu é o que o motor tem agora; senão espera-se pelo seguinte.
    if (entrada && entrada.texto === d.text) {
      for (const iv of entrada.intervalos ?? []) {
        if (!estilos[iv.estilo]) continue;
        if (!porEstilo.has(iv.estilo)) porEstilo.set(iv.estilo, []);
        porEstilo.get(iv.estilo).push({ start: iv.ini, length: iv.len, id: `i${iv.ini}` });
      }
    }
    // Os estilos de agora, e os de antes (vazios, para apagar o que deixou de lá estar).
    for (const estilo of new Set([...porEstilo.keys(), ...d.estilos])) {
      anotador.executeMethod('AnnotateParagraph', [
        { type: 'highlightText', name: `${PREFIXO}${estilo}`, paragraphId: d.paragraphId, recalcId: d.recalcId, ranges: porEstilo.get(estilo) ?? [] },
      ]);
    }
    d.estilos = new Set(porEstilo.keys());
  }

  /** Os destaques mudaram: volta a anotar o que o motor já mandou. */
  function reanotar() {
    for (const id of paragrafosDoMotor.keys()) anotar(id);
  }

  // ─── As etiquetas ────────────────────────────────────────────────────────
  // Uma por `chave`, colada à margem direita da folha, à altura do primeiro
  // sítio onde aparece (`ancora`). Ao passar o rato (na etiqueta, ou num
  // intervalo do mesmo `grupo`, ou com o cursor lá), a ligação aos `ligacoes`.
  // Ao clicar, a aplicação recebe `etiqueta` { chave, x, y, direita }, em px da
  // página do editor.
  let pinosEl = null;
  let linhasEl = null;
  const elDe = new Map();
  let sobreEtiqueta = null;

  /** O estilo de cada tipo de bocado do texto de uma etiqueta. */
  const ESTILO_DA_PARTE = {
    forte: 'font-weight:500;overflow:hidden;text-overflow:ellipsis;min-width:0',
    codigo: 'font:10px ui-monospace,monospace;color:#71717a;overflow:hidden;text-overflow:ellipsis;min-width:0;flex-shrink:2',
    'codigo-forte': 'font:500 11px ui-monospace,monospace;color:#18181b;overflow:hidden;text-overflow:ellipsis;min-width:0;flex-shrink:2',
    aviso: 'font-size:10px;color:#dc2626;flex-shrink:0',
    suave: 'font-size:10px;color:#71717a;flex-shrink:0;font-variant-numeric:tabular-nums',
  };

  function criarEtiqueta(fw, chave) {
    const b = fw.document.createElement('button');
    b.type = 'button';
    b.style.cssText =
      'position:absolute;display:flex;align-items:center;gap:8px;white-space:nowrap;overflow:hidden;' +
      `height:${ALTURA}px;padding:0 8px;border-radius:6px;border:1px solid rgba(228,228,231,.8);` +
      'background:rgba(255,255,255,.92);box-shadow:0 1px 2px rgba(0,0,0,.05);cursor:pointer;pointer-events:auto;' +
      'font:12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;color:#18181b;transition:transform .15s,box-shadow .15s,border-color .15s';
    b.addEventListener('mouseenter', () => (sobreEtiqueta = chave));
    b.addEventListener('mouseleave', () => sobreEtiqueta === chave && (sobreEtiqueta = null));
    b.addEventListener('mousedown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const fr = document.querySelector('iframe[name="frameEditor"]')?.getBoundingClientRect();
      const r = b.getBoundingClientRect();
      bridge.enviar('etiqueta', {
        chave,
        x: (fr?.left ?? 0) + r.left,
        y: (fr?.top ?? 0) + r.bottom,
        direita: (fr?.left ?? 0) + r.right,
      });
    });
    pinosEl.appendChild(b);
    return b;
  }

  function desenharEtiquetas(fw, vista) {
    if (!pinosEl || pinosEl.ownerDocument !== fw.document) {
      pinosEl = fw.document.createElement('div');
      pinosEl.setAttribute('data-bridge', 'etiquetas');
      pinosEl.style.cssText = 'position:fixed;overflow:hidden;pointer-events:none;z-index:5';
      linhasEl = fw.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      linhasEl.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none';
      linhasEl.setAttribute('width', '1');
      linhasEl.setAttribute('height', '1');
      pinosEl.appendChild(linhasEl);
      fw.document.body.appendChild(pinosEl);
      elDe.clear();
    }
    // A área das etiquetas: a vista do documento e a faixa reservada à direita.
    const v = vista.getBoundingClientRect();
    const sdk = fw.document.getElementById('editor_sdk')?.getBoundingClientRect();
    const larguraTotal = (sdk && largura ? sdk.right + larguraUtil() : v.right) - v.left;

    // Onde fica cada intervalo: a primeira caixa (a âncora) e a última (a ligação).
    const primeira = new Map();
    const ultima = new Map();
    for (const c of caixas) {
      if (!primeira.has(c.id)) primeira.set(c.id, c);
      ultima.set(c.id, c);
    }
    const pinos = [];
    for (const e of etiquetas) {
      const base = primeira.get(e.ancora);
      if (!base) continue;
      pinos.push({
        ...e,
        left: (base.margem ?? v.width - 200) + 12,
        top: base.y + base.h / 2 - ALTURA / 2,
        pontos: (e.ligacoes ?? [])
          .map((id) => ultima.get(id))
          .filter(Boolean)
          .map((c) => ({ x: c.x + c.w, y: c.y + c.h / 2 })),
      });
    }
    pinos.sort((a, b) => a.top - b.top);
    for (let i = 1; i < pinos.length; i++) pinos[i].top = Math.max(pinos[i].top, pinos[i - 1].top + ALTURA + INTERVALO);
    const realcado = sobreEtiqueta ?? activa ?? aberta;

    const chave =
      `${v.left},${v.top},${v.height},${larguraTotal}|${realcado}|` +
      pinos.map((p) => `${p.chave},${Math.round(p.left)},${Math.round(p.top)},${p.pontos.map((o) => `${Math.round(o.x)}/${Math.round(o.y)}`).join(' ')}`).join(';') +
      `|${versao}`;
    if (chave === desenhadoChave) return;
    desenhadoChave = chave;

    pinosEl.style.left = `${v.left}px`;
    pinosEl.style.top = `${v.top}px`;
    pinosEl.style.width = `${larguraTotal}px`;
    pinosEl.style.height = `${v.height}px`;

    const vivos = new Set(pinos.map((p) => p.chave));
    for (const [k, el] of elDe) if (!vivos.has(k)) (el.remove(), elDe.delete(k));
    for (const p of pinos) {
      const el = elDe.get(p.chave) ?? elDe.set(p.chave, criarEtiqueta(fw, p.chave)).get(p.chave);
      const destaque = p.chave === realcado;
      el.style.left = `${p.left}px`;
      el.style.top = `${p.top}px`;
      el.style.maxWidth = `${Math.max(110, larguraTotal - p.left - 8)}px`;
      el.style.borderColor = destaque ? `rgba(${p.cor}, .6)` : 'rgba(228,228,231,.8)';
      el.style.boxShadow = destaque ? '0 2px 6px rgba(0,0,0,.08)' : '0 1px 2px rgba(0,0,0,.05)';
      el.style.transform = destaque ? 'translateX(2px)' : '';
      el.title = p.titulo ?? '';
      // O conteúdo só se refaz quando a aplicação o muda.
      const assin = `${p.cor}|${JSON.stringify(p.partes ?? [])}`;
      if (el.dataset.assin !== assin) {
        el.dataset.assin = assin;
        const ponto = fw.document.createElement('span');
        ponto.style.cssText = `width:8px;height:8px;border-radius:50%;flex-shrink:0;background:rgb(${p.cor})`;
        el.replaceChildren(
          ponto,
          ...(p.partes ?? [])
            .filter((parte) => parte.t)
            .map((parte) => {
              const s = fw.document.createElement('span');
              s.textContent = parte.t;
              s.style.cssText = ESTILO_DA_PARTE[parte.k] ?? ESTILO_DA_PARTE.forte;
              return s;
            }),
        );
      }
      el.style.visibility = p.top >= 0 && p.top + ALTURA <= v.height ? 'visible' : 'hidden';
    }

    // As ligações da etiqueta em destaque aos sítios dela.
    linhasEl.replaceChildren();
    const alvo = pinos.find((p) => p.chave === realcado);
    if (alvo) {
      for (const o of alvo.pontos) {
        if (o.y < 0 || o.y > v.height) continue;
        const ix = alvo.left;
        const iy = alvo.top + ALTURA / 2;
        const desvio = Math.max(Math.abs(ix - o.x) * 0.4, 40);
        const linha = fw.document.createElementNS('http://www.w3.org/2000/svg', 'path');
        linha.setAttribute('d', `M ${ix} ${iy} C ${ix - desvio} ${iy}, ${o.x + desvio} ${o.y}, ${o.x} ${o.y}`);
        linha.setAttribute('fill', 'none');
        linha.setAttribute('stroke-width', '1.8');
        linha.setAttribute('stroke-linecap', 'round');
        linha.setAttribute('stroke', `rgba(${alvo.cor}, 0.55)`);
        linhasEl.appendChild(linha);
      }
    }
  }

  let avisado = false;
  function ciclo() {
    try {
      quadro();
    } catch (erro) {
      // Um erro não pode parar o ciclo: no próximo quadro tenta-se outra vez.
      if (!avisado) console.warn('[bridge] destaques:', erro);
      avisado = true;
    }
    window.requestAnimationFrame(ciclo);
  }
  window.requestAnimationFrame(ciclo);
}
