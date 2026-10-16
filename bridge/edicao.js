// Ler e escrever texto no documento, para a aplicação anfitriã.
//
// `bridge:inserir-texto`: põe o texto no sítio do cursor, como escrever.
// `bridge:ler-texto`: devolve o texto do documento, um parágrafo por linha.
// `bridge:substituir-textos`: troca textos no documento inteiro
// ({ trocas: [{ de, para }] }); `para` vazio apaga.
// `bridge:substituir-ultimo`: troca a última ocorrência de um texto; o cursor
// fica a seguir ao texto novo, onde estava.
// `bridge:substituir-antes-do-cursor`: troca o que acabou de ser escrito antes
// do cursor ({ anterior, por }). Devolve false se esse texto já não estiver lá.

/** Um sinal invisível, colado no cursor para marcar onde ele está. */
const SINAL = '⁣';

/** Selecciona a última ocorrência de um texto. Corre dentro do motor. */
function selecionarUltima() {
  var r = Api.GetDocument().Search(Asc.scope.alvo, true);
  if (!r || !r.length) return false;
  r[r.length - 1].Select();
  return true;
}

export default function edicao(bridge) {
  bridge.responder('inserir-texto', async ({ texto }) => {
    if (typeof texto !== 'string' || !texto) throw new Error('Nada para inserir.');
    await bridge.metodo('PasteText', [texto]);
    return true;
  });

  bridge.responder('ler-texto', () =>
    bridge.comando(
      function () {
        return Api.GetDocument()
          .GetAllParagraphs()
          .map(function (p) {
            return p.GetText();
          })
          .join('\n');
      },
      undefined,
      true,
    ),
  );

  bridge.responder('substituir-textos', ({ trocas }) => {
    if (!Array.isArray(trocas) || !trocas.length) return true;
    return bridge.comando(
      function () {
        var documento = Api.GetDocument();
        Asc.scope.trocas.forEach(function (t) {
          documento.SearchAndReplace({ searchString: t.de, replaceString: t.para, matchCase: true });
        });
        return true;
      },
      { trocas },
    );
  });

  bridge.responder('substituir-ultimo', async ({ de, para }) => {
    if (typeof de !== 'string' || !de || typeof para !== 'string') throw new Error('Falta o texto a trocar.');
    // Seleccionar e colar por cima: o cursor fica a seguir ao texto novo, onde já estava.
    const achou = await bridge.comando(selecionarUltima, { alvo: de });
    if (!achou) return false;
    await bridge.metodo('PasteText', [para]);
    return true;
  });

  bridge.responder('substituir-antes-do-cursor', async ({ anterior = '', por }) => {
    if (typeof por !== 'string') throw new Error('Falta o texto novo.');
    // O sinal marca o fim do que foi escrito: procura-se `anterior` + sinal,
    // selecciona-se e cola-se o texto novo por cima.
    await bridge.metodo('PasteText', [SINAL]);
    const achou = await bridge.comando(selecionarUltima, { alvo: `${anterior}${SINAL}` });
    if (achou) {
      await bridge.metodo('PasteText', [por]);
      return true;
    }
    // Sem o que foi escrito (mexeu-se no texto entretanto): só se tira o sinal.
    await bridge.comando(
      function () {
        var r = Api.GetDocument().Search(Asc.scope.sinal, true);
        if (r && r.length) r[0].Delete();
      },
      { sinal: SINAL },
    );
    return false;
  });
}
