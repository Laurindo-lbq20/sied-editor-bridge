// Texto do documento, por parágrafo: o que a ortografia e a IA precisam.
//
// `bridge:paragrafos`: os parágrafos do documento, pela ordem (o número de
// cada um é a posição nesta lista).
// `bridge:selecionar`: selecciona no documento a n-ésima ocorrência de um
// texto dentro de um parágrafo ({ paragrafo, texto, ocorrencia }).
// `bridge:trocar`: troca essa ocorrência por outro texto ({ ..., por }); com
// `por` vazio, apaga-a. Devolve false se o texto já não estiver lá.

/** Selecciona a ocorrência. Corre dentro do motor: só vê `Api` e `Asc.scope`. */
function selecionarOcorrencia() {
  var s = Asc.scope;
  var paragrafos = Api.GetDocument().GetAllParagraphs();
  var p = paragrafos[s.paragrafo];
  if (!p) return false;
  var achados = p.Search(s.texto, true) || [];
  var alvo = achados[s.ocorrencia || 0];
  if (!alvo) return false;
  if (s.apagar) {
    alvo.Delete();
    return true;
  }
  alvo.Select();
  return true;
}

export default function texto(bridge) {
  bridge.responder('paragrafos', () =>
    bridge.comando(
      function () {
        return Api.GetDocument()
          .GetAllParagraphs()
          .map(function (p) {
            return p.GetText().replace(/\r?\n$/, '');
          });
      },
      undefined,
      true,
    ),
  );

  bridge.responder('selecionar', ({ paragrafo, texto: t, ocorrencia = 0 }) =>
    bridge.comando(selecionarOcorrencia, { paragrafo, texto: t, ocorrencia }),
  );

  bridge.responder('trocar', async ({ paragrafo, texto: t, ocorrencia = 0, por = '' }) => {
    if (!por) return bridge.comando(selecionarOcorrencia, { paragrafo, texto: t, ocorrencia, apagar: true });
    // Seleccionar e colar por cima: o texto novo fica com a formatação do que estava.
    const achou = await bridge.comando(selecionarOcorrencia, { paragrafo, texto: t, ocorrencia });
    if (!achou) return false;
    await bridge.metodo('PasteText', [por]);
    return true;
  });
}
