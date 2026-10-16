// O teclado do documento, para a aplicação anfitriã.
//
//   aplicação → bridge  `teclado` { observar, capturar: [teclas] }
//   bridge → aplicação  `tecla` { key, capturada, cursor: { x, y, h } | null }
//   bridge → aplicação  `cursor-do-documento` { cursor }  onde ficou o cursor depois da tecla
//   bridge → aplicação  `clique-no-documento`
//
// Com `observar`, cada tecla escrita no documento é avisada à aplicação (antes
// de o motor a processar; o cursor segue-se em `cursor-do-documento`). As teclas em
// `capturar` não chegam ao documento: a aplicação fica com elas (por exemplo,
// para escolher numa lista que desenhou junto do cursor). `cursor` está em
// pixels da página do editor.

export default function teclado(bridge) {
  let observar = false;
  let capturar = new Set();
  let ligadoA = null;

  bridge.responder('teclado', ({ observar: o = false, capturar: c = [] }) => {
    observar = Boolean(o);
    capturar = new Set(Array.isArray(c) ? c : []);
    return true;
  });

  const moldura = () => document.querySelector('iframe[name="frameEditor"]')?.contentWindow ?? null;

  /** Onde está o cursor do motor, em pixels da página do editor. */
  function cursorDoMotor(fw) {
    const alvo = fw.document.getElementById('id_target_cursor')?.getBoundingClientRect();
    if (!alvo) return null;
    const m = document.querySelector('iframe[name="frameEditor"]').getBoundingClientRect();
    return { x: Math.round(m.left + alvo.left), y: Math.round(m.top + alvo.top), h: Math.round(alvo.height) };
  }

  function aoTeclar(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const fw = moldura();
    if (!fw) return;
    if (capturar.has(e.key)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      bridge.enviar('tecla', { key: e.key, capturada: true, cursor: cursorDoMotor(fw) });
      return;
    }
    if (!observar) return;
    // Avisa-se logo (antes de o motor mudar o texto) e, depois de ele escrever a
    // tecla, diz-se onde ficou o cursor.
    bridge.enviar('tecla', { key: e.key, capturada: false, cursor: null });
    fw.requestAnimationFrame(() => fw.requestAnimationFrame(() => bridge.enviar('cursor-do-documento', { cursor: cursorDoMotor(fw) })));
  }

  // A moldura do motor pode ser recriada (abrir outro documento): liga-se de novo.
  setInterval(() => {
    const fw = moldura();
    if (!fw?.document || ligadoA === fw.document) return;
    ligadoA = fw.document;
    // Na captura, antes do motor: assim as teclas capturadas não chegam ao documento.
    fw.addEventListener('keydown', aoTeclar, true);
    fw.document.addEventListener('mousedown', () => observar && bridge.enviar('clique-no-documento'), true);
  }, 500);
}
