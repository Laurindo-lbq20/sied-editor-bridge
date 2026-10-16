// A bridge: corre na página do editor, ao lado do motor,
// sem mexer no código dele. Serve para mudar ou acrescentar coisas ao editor.
//
// Este ficheiro é o núcleo: o canal com a aplicação anfitriã e com o motor. Cada
// funcionalidade é um módulo nesta pasta, registado em MODULOS no fim.
//
// Regra: um módulo só fala com o motor por mensagens que ele já troca e pela
// interface oficial de embutir (`document:*`). Nunca importa código do motor.

const origemDoAnfitriao = window.parent !== window ? new URLSearchParams(location.search).get('embedOrigin') : null;

const doAnfitriao = new Map();
const doMotor = new Map();

function juntar(mapa, tipo, fn) {
  if (!mapa.has(tipo)) mapa.set(tipo, new Set());
  mapa.get(tipo).add(fn);
}

/** O que os módulos recebem. */
const bridge = {
  /** Manda à aplicação anfitriã uma mensagem `bridge:<nome>`. */
  enviar(nome, payload = {}) {
    window.parent.postMessage({ type: `bridge:${nome}`, payload }, origemDoAnfitriao);
  },
  /** Mensagens da aplicação anfitriã para o motor (`document:save`, ...), vistas de passagem. */
  aoReceberDoAnfitriao(tipo, fn) {
    juntar(doAnfitriao, tipo, fn);
  },
  /** Mensagens da moldura interna do motor (`frameEditor`) para a página do editor. */
  aoReceberDoMotor(tipo, fn) {
    juntar(doMotor, tipo, fn);
  },
  /**
   * Responde a um pedido da aplicação anfitriã (`bridge:<nome>`, com `id`). `fn` recebe o
   * payload e devolve o resultado (ou uma Promise); um erro volta como erro.
   */
  responder(nome, fn) {
    juntar(doAnfitriao, `bridge:${nome}`, async (payload, mensagem) => {
      const resposta = { type: 'bridge:resposta', id: mensagem.id };
      try {
        resposta.resultado = await fn(payload);
      } catch (erro) {
        resposta.erro = erro instanceof Error ? erro.message : String(erro);
      }
      window.parent.postMessage(resposta, origemDoAnfitriao);
    });
  },
  /**
   * A API de automação oficial do motor (`createConnector`), para ler e
   * escrever no documento. Um por documento aberto: abrir outro cria outro editor.
   */
  connector() {
    // Um connector criado antes de o documento estar carregado nunca responde:
    // só se cria com o documento já dentro do motor.
    if (!window.editor?.createConnector || !documentoCarregado()) throw new Error('O documento ainda não está aberto.');
    if (connectorDe.editor !== window.editor || !connectorDe.connector) {
      connectorDe.editor = window.editor;
      connectorDe.connector = window.editor.createConnector();
    }
    return connectorDe.connector;
  },
  /**
   * Corre uma função da API do documento (`Api`) no motor e devolve o
   * resultado. `semRecalcular`: para o que só lê (não redesenha nada).
   */
  comando(fn, dados, semRecalcular = false) {
    const c = bridge.connector();
    return new Promise((resolver, rejeitar) => {
      const espera = setTimeout(() => falhou(rejeitar), ESPERA_MS);
      // `Asc.scope` é a via oficial para passar dados à função, que corre no motor.
      window.Asc.scope = dados ?? {};
      c.callCommand(
        fn,
        (resultado) => {
          clearTimeout(espera);
          resolver(resultado);
        },
        semRecalcular || undefined,
      );
    });
  },
  /** Chama um método do motor (`executeMethod`, ex.: 'PasteText'). */
  metodo(nome, argumentos = []) {
    const c = bridge.connector();
    return new Promise((resolver, rejeitar) => {
      const espera = setTimeout(() => falhou(rejeitar), ESPERA_MS);
      c.executeMethod(nome, argumentos, (resultado) => {
        clearTimeout(espera);
        resolver(resultado);
      });
    });
  },
};

const connectorDe = { editor: null, connector: null };
/** Quanto se espera por uma resposta do motor. */
const ESPERA_MS = 8000;

/** O documento já está no motor (o motor interno da moldura tem-no aberto)? */
function documentoCarregado() {
  try {
    const motor = document.querySelector('iframe[name="frameEditor"]')?.contentWindow?.editor;
    return !!motor?.WordControl?.m_oLogicDocument && motor.isDocumentLoadComplete !== false;
  } catch {
    return false;
  }
}

/** Sem resposta: o connector deita-se fora, e o próximo pedido cria outro. */
function falhou(rejeitar) {
  connectorDe.connector = null;
  rejeitar(new Error('O editor não respondeu.'));
}

function arrancar(modulos) {
  // Fora da aplicação anfitriã (o editor aberto sozinho), a bridge não faz nada.
  if (!origemDoAnfitriao) return;

  window.addEventListener('message', (evento) => {
    const dados = evento.data;
    if (!dados || typeof dados !== 'object' || typeof dados.type !== 'string') return;

    if (evento.source === window.parent && evento.origin === origemDoAnfitriao) {
      doAnfitriao.get(dados.type)?.forEach((fn) => fn(dados.payload ?? {}, dados));
      return;
    }
    if (dados.type === 'bridge:resposta') return;

    // A mesma verificação que o motor faz: só a sua própria moldura.
    const moldura = document.querySelector('iframe[name="frameEditor"]');
    if (evento.origin !== location.origin || !moldura || evento.source !== moldura.contentWindow) return;
    doMotor.get(dados.type)?.forEach((fn) => fn(dados));
  });

  for (const modulo of modulos) {
    try {
      modulo(bridge);
    } catch (erro) {
      // Um módulo partido não pode parar o editor nem os outros módulos.
      console.error('[bridge]', erro);
    }
  }
}

// ─── Módulos ────────────────────────────────────────────────────────────────
import guardar from './guardar.js';
import edicao from './edicao.js';
import texto from './texto.js';
import destaques from './destaques.js';
import teclado from './teclado.js';
import menus from './menus.js';
import inicio from './inicio.js';
import sobre from './sobre.js';
import painelLateral from './painelLateral.js';

const MODULOS = [guardar, edicao, texto, destaques, teclado, menus, inicio, sobre, painelLateral];

arrancar(MODULOS);
