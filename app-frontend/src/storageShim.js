// O App.jsx foi feito originalmente pra rodar como artifact do Claude.ai,
// que fornece um `window.storage` próprio (assíncrono, por usuário) — por
// isso ele chama window.storage.get/set em vez de bater direto na API.
//
// Esse arquivo implementa esse mesmo `window.storage`, salvando de verdade
// no banco (rota /api/app-data), vinculado à CONTA logada.
//
// PROTEÇÕES (revisão de 29/10/2026):
// - get() agora LANÇA ERRO quando a leitura falha (antes devolvia null, e o
//   App achava que era conta nova e salvava os valores padrão POR CIMA dos
//   dados reais). Além disso, uma chave cuja leitura falhou fica TRAVADA
//   pra gravação até ser lida com sucesso — segunda camada contra o mesmo
//   problema.
// - set() passa pela fila de salvamento (syncQueue.js): tenta de novo
//   sozinho se a rede cair, e mostra aviso enquanto houver algo não salvo.
// - Cada chave guarda a `version` lida do servidor; ao salvar, manda de
//   volta. Se outro aparelho/aba salvou no meio tempo, o servidor responde
//   409 e o app pergunta o que fazer, em vez de apagar o que o outro salvou.
//
// MIGRAÇÃO AUTOMÁTICA (antiga): contas que tinham dados no localStorage (de
// antes dos dados irem pro banco) têm esses dados importados na primeira
// leitura.
import { apiRequest } from "./api";
import { enqueue, setConflictResolver, dropPending } from "./syncQueue";

function legacyLocalKey(key, shared) {
  return `svc:${shared ? "shared" : "user"}:${key}`;
}

const versions = {}; // key -> version lida/gravada por último
const failedLoads = new Set(); // chaves cuja leitura falhou nesta sessão
const forceOverwrite = new Set(); // chaves em que a pessoa escolheu "manter as minhas"

setConflictResolver((conflictId) => {
  if (conflictId && conflictId.startsWith("kv:")) forceOverwrite.add(conflictId.slice(3));
});

async function putValue(key, value, token) {
  const body = { value };
  if (!forceOverwrite.has(key)) body.baseVersion = versions[key] || 0;
  const result = await apiRequest(`/api/app-data/${key}`, {
    method: "PUT",
    body: JSON.stringify(body),
    token,
  });
  forceOverwrite.delete(key);
  if (result && typeof result.version === "number") versions[key] = result.version;
  return result;
}

if (!window.storage) {
  window.storage = {
    async get(key, shared = false) {
      // "shared" nunca é usado pelo App.jsx hoje — mantém o comportamento
      // antigo (localStorage) só por segurança, caso algum dia passe a ser.
      if (shared) {
        try {
          const raw = localStorage.getItem(legacyLocalKey(key, shared));
          return raw === null ? null : { key, value: raw, shared };
        } catch (e) {
          return null;
        }
      }

      let result;
      try {
        result = await apiRequest(`/api/app-data/${key}`);
      } catch (err) {
        failedLoads.add(key);
        throw err;
      }
      failedLoads.delete(key);
      versions[key] = (result && result.version) || 0;
      if (result && result.value != null) {
        return { key, value: result.value, shared: false };
      }

      // Sem dado no banco ainda: verifica se sobrou algo do localStorage de
      // antes dessa mudança e, se tiver, importa pro banco agora mesmo.
      try {
        const legacyRaw = localStorage.getItem(legacyLocalKey(key, false));
        if (legacyRaw !== null) {
          await putValue(key, legacyRaw);
          localStorage.removeItem(legacyLocalKey(key, false));
          return { key, value: legacyRaw, shared: false };
        }
      } catch (e) {}

      return null;
    },

    async set(key, value, shared = false) {
      if (shared) {
        try {
          localStorage.setItem(legacyLocalKey(key, shared), value);
          return { key, value, shared };
        } catch (e) {
          return null;
        }
      }
      if (failedLoads.has(key)) {
        // Nunca grava por cima de um dado que não conseguimos ler — poderia
        // ser exatamente o que apagaria os dados reais do cliente.
        throw new Error(`Gravação de "${key}" bloqueada: a leitura desse dado falhou nesta sessão.`);
      }
      await enqueue(`kv:${key}`, (token) => putValue(key, value, token));
      return { key, value, shared: false };
    },

    async delete(key, shared = false) {
      // Não usado pelo App.jsx hoje. Mantido só pra não quebrar a
      // assinatura original do window.storage.
      try {
        localStorage.removeItem(legacyLocalKey(key, shared));
        return { key, deleted: true, shared };
      } catch (e) {
        return null;
      }
    },

    async list(prefix = "", shared = false) {
      // Não usado pelo App.jsx hoje.
      return { keys: [], prefix, shared };
    },
  };
}

// ---------- Orçamentos (tabela própria, 1 linha por orçamento) ----------
// Ver src/routes/budgets.js no backend.
export const budgetsApi = {
  async list() {
    const result = await apiRequest("/api/budgets");
    return Array.isArray(result && result.budgets) ? result.budgets : [];
  },
  save(entry) {
    if (!entry || !entry.id) return Promise.resolve(null);
    return enqueue(`budget:${entry.id}`, (token) =>
      apiRequest(`/api/budgets/${encodeURIComponent(entry.id)}`, {
        method: "PUT",
        body: JSON.stringify({ data: entry }),
        token,
      })
    );
  },
  remove(id) {
    return enqueue(`budget:${id}`, (token) =>
      apiRequest(`/api/budgets/${encodeURIComponent(id)}`, { method: "DELETE", token })
    );
  },
  clear() {
    dropPending("budget:");
    return enqueue("budgets:clear", (token) => apiRequest("/api/budgets", { method: "DELETE", token }));
  },
};
