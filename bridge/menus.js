// As acções da aplicação nos menus do próprio editor, pela via oficial do motor
// (connector `addToolbarMenuItem` e `addContextMenuItem`): um separador na
// barra, com o mesmo desenho dos outros, e itens no menu do botão direito.
//
// A aplicação manda o que pôr (`bridge:menus` { barra, contexto }):
//   barra:    { id, texto, itens: [{ id, text, hint, icone, separator, lockInViewMode, items }] }
//   contexto: [{ id, text, items }]
// `icone` é o nome de um ficheiro em bridge/icones (sem `.svg`). Cada clique
// volta à aplicação como `bridge:menu` { id }.
//
// Uma ligação própria ao motor, criada uma vez: os cliques chegam pela ligação
// que registou os itens, e a partilhada pode ser trocada se deixar de responder.

export default function menus(bridge) {
  let barra = null;
  let contexto = [];
  let ligacao = null;
  let barraPosta = null;

  bridge.responder('menus', ({ barra: b = null, contexto: c = [] }) => {
    barra = b;
    contexto = Array.isArray(c) ? c : [];
    registar();
    return true;
  });

  const icone = (nome) => new URL(`/bridge/icones/${nome}.svg`, location.href).href;

  /** Os itens no formato do motor: ícones em endereço completo, e o clique para a aplicação. */
  function converter(item) {
    const { icone: nome, items, ...resto } = item;
    const pronto = { ...resto };
    if (nome) pronto.icons = icone(nome);
    if (Array.isArray(items) && items.length) pronto.items = items.map(converter);
    else pronto.onClick = () => bridge.enviar('menu', { id: item.id });
    return pronto;
  }

  function registar() {
    if (!ligacao) {
      try {
        // Garante que o documento já está no motor (um connector criado antes nunca responde).
        bridge.connector();
        ligacao = window.editor.createConnector();
        // O menu do botão direito pede-se de cada vez que abre.
        ligacao.attachEvent('onContextMenuShow', () => {
          if (contexto.length) ligacao.addContextMenuItem(contexto.map(converter));
        });
      } catch {
        ligacao = null;
        setTimeout(registar, 700);
        return;
      }
    }
    // A barra põe-se uma vez por desenho; voltar a pô-la igual duplicava os botões.
    const assinatura = JSON.stringify(barra);
    if (barra && assinatura !== barraPosta) {
      barraPosta = assinatura;
      ligacao.addToolbarMenuItem({ tabs: [{ id: barra.id, text: barra.texto, items: barra.itens.map(converter) }] });
    }
  }
}
