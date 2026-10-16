// O botão da casa, na barra de acesso rápido do editor (ao lado de guardar,
// imprimir, desfazer e refazer): volta à aplicação anfitriã.
//
// O motor já deixa um espaço vazio para ele (`#slot-btn-dt-home`, o primeiro da
// barra), mas só o enche na versão de secretária. Aqui põe-se um botão com o
// mesmo desenho dos vizinhos. O clique vai à aplicação como `bridge:inicio`; é
// ela que decide se pode sair já ou se há alterações por guardar.

const ICONE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/></svg>';

export default function inicio(bridge) {
  const moldura = () => document.querySelector('iframe[name="frameEditor"]')?.contentDocument ?? null;

  function colocar() {
    const doc = moldura();
    const espaco = doc?.getElementById('slot-btn-dt-home');
    if (!doc || !espaco || espaco.querySelector('.sied-inicio')) return;

    const botao = doc.createElement('button');
    botao.type = 'button';
    // As classes dos botões vizinhos: o mesmo tamanho, realce e foco.
    botao.className = 'btn btn-header canfocused sied-inicio';
    botao.title = 'Voltar ao início';
    botao.setAttribute('aria-label', 'Voltar ao início');
    botao.innerHTML = ICONE;
    // O ícone leva a cor do texto do cabeçalho, que muda com o tema do editor.
    const cor = doc.defaultView.getComputedStyle(doc.getElementById('box-document-title') ?? doc.body).color;
    botao.style.cssText = `color:${cor};display:inline-flex;align-items:center;justify-content:center`;
    botao.addEventListener('click', () => bridge.enviar('inicio'));
    espaco.appendChild(botao);
  }

  // O cabeçalho desenha-se depois de o documento abrir e volta a desenhar-se ao
  // mudar de tema ou de tamanho: verifica-se de vez em quando que o botão lá está.
  setInterval(() => {
    try {
      colocar();
    } catch {
      // A moldura ainda não está pronta (ou mudou): na próxima volta.
    }
  }, 600);
}
