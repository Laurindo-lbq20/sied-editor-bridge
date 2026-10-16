// Um painel da aplicação anfitriã na barra lateral nativa do editor (a das
// lupas, comentários, títulos e «Acerca»): um botão novo nessa barra, e o
// painel no sítio do painel lateral.
//
// O painel em si é da aplicação: esta bridge só põe o botão, abre o painel
// lateral do motor para ter o espaço (o documento desloca-se como com os outros
// painéis) e diz à aplicação onde ele está (`bridge:lateral` { x, y, w, h }, em
// pixels do editor), para o desenhar por cima. A largura é a do próprio painel
// nativo.
//
// Mensagens:
//   aplicação → bridge   `painel-lateral` { aberto, titulo }  abrir ou fechar (e o nome do botão)
//   bridge → aplicação   `painel-lateral-alternar`            clicaram no botão
//   bridge → aplicação   `painel-lateral-fechou`              outro painel do motor tomou o lugar
//   bridge → aplicação   `lateral` { x, y, w, h }             onde está o painel lateral

const ID = 'left-btn-painel-lateral';
/** O painel nativo que se abre só para dar o espaço (o dos títulos). */
const ID_DO_EMPRESTADO = 'left-btn-navigation';
/** Depois de abrir, quanto se espera até o painel nativo ter largura. */
const ESPERA_DE_ABERTURA_MS = 1500;

const ICONE = (cor) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/></svg>`;

export default function painelLateral(bridge) {
  let aberto = false;
  /** O nome do botão, dado pela aplicação: sem ele, não há botão. */
  let titulo = null;
  /** O painel nativo foi aberto por nós (e fecha-se connosco). */
  let abriuEmprestado = false;
  let abertoEm = 0;
  let ultima = '';
  let quadro = 0;

  const doc = () => document.querySelector('iframe[name="frameEditor"]')?.contentDocument ?? null;
  /**
   * O espaço do painel lateral: o do menu da esquerda menos a coluna de botões
   * (a largura é a do motor, que se arrasta pelo separador dele).
   */
  function espaco(d) {
    const menu = d.getElementById('left-menu')?.getBoundingClientRect();
    const botoes = d.querySelector('.tool-menu-btns')?.getBoundingClientRect();
    if (!menu || !botoes) return null;
    return { left: botoes.right, top: menu.top, width: Math.max(0, menu.right - botoes.right), height: menu.height };
  }

  /** O texto do botão tem a cor do tema do editor (claro ou escuro). */
  const cor = (d) => (d.body.classList.contains('theme-type-dark') ? '#d4d4d4' : '#444');

  function garantirBotao(d) {
    let botao = d.getElementById(ID);
    if (!botao && !titulo) return null;
    if (!botao) {
      const barra = d.querySelector('.tool-menu-btns');
      if (!barra) return null;
      botao = d.createElement('button');
      botao.id = ID;
      botao.type = 'button';
      // As classes dos botões vizinhos: o mesmo tamanho, realce e foco.
      botao.className = 'btn btn-category canfocused';
      botao.setAttribute('aria-pressed', 'false');
      botao.style.cssText = 'display:flex;align-items:center;justify-content:center';
      botao.addEventListener('click', () => bridge.enviar('painel-lateral-alternar'));
      // Depois dos títulos, antes do «Acerca».
      const antes = d.getElementById('left-btn-thumbnails') ?? d.getElementById('left-btn-support') ?? d.getElementById('left-btn-about');
      barra.insertBefore(botao, antes);
      // Clicar noutro botão da barra tira este painel do lugar.
      barra.addEventListener(
        'click',
        (e) => {
          // Só cliques de pessoas: o que fazemos ao painel dos títulos também passa aqui.
          if (!e.isTrusted) return;
          const outro = e.target.closest?.('.btn-category');
          if (outro && outro.id !== ID && aberto) parar(false);
        },
        true,
      );
    }
    const c = cor(d);
    if (botao.dataset.cor !== c) {
      botao.dataset.cor = c;
      botao.innerHTML = ICONE(c);
    }
    botao.title = titulo ?? '';
    botao.setAttribute('aria-label', titulo ?? '');
    botao.classList.toggle('active', aberto);
    botao.setAttribute('aria-pressed', String(aberto));
    return botao;
  }

  function abrir() {
    const d = doc();
    if (!d || aberto) return;
    aberto = true;
    abertoEm = Date.now();
    ultima = '';
    // Sem painel lateral aberto, abre-se o dos títulos para haver espaço.
    if ((espaco(d)?.width ?? 0) < 20) {
      const emprestado = d.getElementById(ID_DO_EMPRESTADO);
      if (emprestado) {
        emprestado.click();
        abriuEmprestado = true;
      }
    }
    // O botão dos títulos fica aceso por baixo do nosso: apaga-se o aspecto, sem mexer no estado dele.
    apagarEmprestado(d);
    garantirBotao(d);
    seguir();
  }

  function apagarEmprestado(d) {
    if (!abriuEmprestado) return;
    const e = d.getElementById(ID_DO_EMPRESTADO);
    e?.classList.remove('active');
    e?.setAttribute('aria-pressed', 'false');
  }

  /**
   * Fecha. `fecharEspaco`: o painel nativo que abrimos para o espaço fecha-se
   * também; quando foi outro botão que tomou o lugar, esse painel já é dele.
   */
  function parar(fecharEspaco) {
    if (!aberto) return;
    aberto = false;
    cancelAnimationFrame(quadro);
    const d = doc();
    if (d) {
      if (fecharEspaco && abriuEmprestado) d.getElementById(ID_DO_EMPRESTADO)?.click();
      garantirBotao(d);
    }
    abriuEmprestado = false;
    if (!fecharEspaco) bridge.enviar('painel-lateral-fechou');
  }

  /** Enquanto aberto, diz à aplicação onde está o painel lateral (e repara se fechou). */
  function seguir() {
    cancelAnimationFrame(quadro);
    const passo = () => {
      if (!aberto) return;
      try {
        const d = doc();
        const r = d && espaco(d);
        if (r) {
          // A moldura do motor pode não estar colada ao canto da página do editor.
          const m = document.querySelector('iframe[name="frameEditor"]').getBoundingClientRect();
          const caixa = { x: Math.round(m.left + r.left), y: Math.round(m.top + r.top), w: Math.round(r.width), h: Math.round(r.height) };
          if (caixa.w < 20) {
            // Fechado por outra via (o botão dos títulos, por exemplo): o painel não tem onde estar.
            if (Date.now() - abertoEm > ESPERA_DE_ABERTURA_MS) return parar(false);
          } else {
            const chave = JSON.stringify(caixa);
            if (chave !== ultima) {
              ultima = chave;
              bridge.enviar('lateral', caixa);
            }
          }
        }
      } catch {
        // A moldura mudou a meio: na próxima volta.
      }
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
  }

  bridge.responder('painel-lateral', ({ aberto: querAberto, titulo: nome }) => {
    if (typeof nome === 'string' && nome) titulo = nome;
    const d = doc();
    if (d) garantirBotao(d);
    if (querAberto) abrir();
    else parar(true);
    return true;
  });

  // O botão desenha-se depois de o documento abrir: verifica-se de vez em quando que lá está.
  setInterval(() => {
    try {
      const d = doc();
      if (d) garantirBotao(d);
    } catch {
      // A moldura ainda não está pronta (ou mudou): na próxima volta.
    }
  }, 600);
}
