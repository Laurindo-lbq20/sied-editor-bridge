// Guardar nativo (botão e Ctrl+S) grava o documento na aplicação anfitriã.
//
// O motor exporta o ficheiro e a moldura entrega-o à página numa mensagem
// 'onlyoffice-file-stream', que o motor, embutido, deita fora. Este módulo vê
// essa mensagem e avisa a aplicação (`bridge:guardar`). Ela grava pela
// interface oficial (`document:save`), que é quem marca o documento como
// guardado.
//
// As gravações pedidas pela aplicação também produzem um ficheiro: contam-se os
// `document:save` que passam e esses ficheiros não geram aviso.

export default function guardar(bridge) {
  let gravacoesDoAnfitriao = 0;

  bridge.aoReceberDoAnfitriao('document:save', () => {
    gravacoesDoAnfitriao += 1;
  });

  bridge.aoReceberDoMotor('onlyoffice-file-stream', (dados) => {
    if (gravacoesDoAnfitriao > 0) {
      gravacoesDoAnfitriao -= 1;
      return;
    }
    // "Transferir como" PDF e afins não são gravar o documento.
    const formato = String(dados.fileType || dados.fileName?.split('.').pop() || '').toLowerCase();
    if (formato && formato !== 'docx') return;
    bridge.enviar('guardar');
  });
}
