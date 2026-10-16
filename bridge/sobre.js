// O painel «Acerca» do editor, em português e com o nome do SIED, no lugar do
// texto em inglês e dos contactos do ONLYOFFICE.
//
// Não é só desenho: este painel é a funcionalidade que a licença AGPL-3.0 exige
// (secção 5d) e que o aviso do ONLYOFFICE manda manter (secção 7b). Por isso o
// que ele mostra tem de continuar a trazer:
//   1. o aviso de direitos de autor (Ascensio System SIA, editores originais);
//   2. que não há garantia;
//   3. que o programa se pode passar a outros sob esta licença;
//   4. como ver a licença;
//   5. que é uma versão modificada, não oficial (secção 7c);
//   6. o acesso ao código-fonte da versão modificada (secção 13).
// Se mexeres neste texto, confirma que os seis continuam lá.
//
// Depois de pôr o nosso painel, o do motor fica escondido (não apagado).

/**
 * Onde está o código das alterações do SIED (esta bridge, com a licença AGPL-3.0).
 * A secção 13 da AGPL obriga a oferecê-lo a quem usa o editor pela rede: preencher
 * antes de publicar. Vazio, a linha não aparece. Manter o repositório actualizado:
 * o que está em produção tem de coincidir com o que está lá.
 */
const URL_DO_CODIGO_DO_SIED = 'https://github.com/Laurindo-lbq20/sied-editor-bridge';
/** O motor, tal como o SIED o recebeu. */
const URL_DO_CODIGO_DO_MOTOR = 'https://github.com/ranuts/document';

const ID = 'sied-sobre';

export default function sobre() {
  const moldura = () => document.querySelector('iframe[name="frameEditor"]')?.contentDocument ?? null;

  function ligacao(doc, texto, href) {
    const a = doc.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    // O estilo do editor tira o aspecto de ligação: sublinhado para se ver que se clica.
    a.style.cssText = 'text-decoration:underline;font:inherit;color:inherit';
    a.textContent = texto;
    return a;
  }

  function linha(doc, ...partes) {
    const p = doc.createElement('p');
    p.style.cssText = 'margin:0 0 10px';
    for (const parte of partes) p.append(parte);
    return p;
  }

  function colocar() {
    const doc = moldura();
    const painel = doc?.getElementById('about-menu-panel');
    // O motor só enche o painel quando se abre pela primeira vez.
    if (!doc || !painel || painel.children.length === 0 || doc.getElementById(ID)) return;

    // A versão vem do próprio motor, para não ficar desactualizada numa actualização.
    const versao = painel.textContent.match(/\d+\.\d+\.\d+\.\d+(?:\.\d+)?/)?.[0];

    // Esconde o painel do motor sem o apagar.
    if (!doc.getElementById(`${ID}-estilo`)) {
      const estilo = doc.createElement('style');
      estilo.id = `${ID}-estilo`;
      estilo.textContent = `#about-menu-panel > :not(#${ID}) { display: none !important; }`;
      doc.head.appendChild(estilo);
    }

    const caixa = doc.createElement('div');
    caixa.id = ID;
    caixa.style.cssText = 'max-width:640px;margin:0 auto;padding:24px;font-size:12px;line-height:1.6;user-select:text';

    const titulo = doc.createElement('div');
    titulo.textContent = versao ? `Editor do SIED · motor ${versao}` : 'Editor do SIED';
    titulo.style.cssText = 'font-size:15px;font-weight:600;margin-bottom:10px';
    caixa.appendChild(titulo);

    // Curto, como nos outros programas, mas com os seis pontos do aviso.
    const pequeno = 'font-size:12px;opacity:.8;margin:0 0 6px';
    const p1 = linha(doc, 'Versão modificada pelo SIED (desde outubro de 2026) dos editores ONLYOFFICE, não oficial. © 2010-2024 Ascensio System SIA. ONLYOFFICE é uma marca da Ascensio System SIA.');
    const p2 = linha(
      doc,
      'Software livre sob a GNU AGPL v3, sem qualquer garantia. ',
      ligacao(doc, 'Licença', '/LICENSE'),
      ' · ',
      ligacao(doc, 'Avisos', '/NOTICE'),
      ' · Código-fonte: ',
      ...(URL_DO_CODIGO_DO_SIED ? [ligacao(doc, 'SIED', URL_DO_CODIGO_DO_SIED), ' · '] : []),
      ligacao(doc, 'motor', URL_DO_CODIGO_DO_MOTOR),
    );
    p1.style.cssText = pequeno;
    p2.style.cssText = pequeno;
    caixa.append(p1, p2);

    painel.appendChild(caixa);
  }

  setInterval(() => {
    try {
      colocar();
    } catch {
      // A moldura ainda não está pronta (ou mudou): na próxima volta.
    }
  }, 600);
}
