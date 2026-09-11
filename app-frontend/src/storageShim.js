// O App.jsx foi feito originalmente pra rodar como artifact do Claude.ai,
// que fornece um `window.storage` próprio (assíncrono, por usuário) — por
// isso ele chama window.storage.get/set em vez de bater direto na API.
//
// Esse arquivo implementa esse mesmo `window.storage`, mas agora salvando
// de verdade no banco (rota /api/app-data), vinculado à CONTA logada — não
// mais no localStorage do navegador. Isso faz os dados (procedimentos,
// taxas, histórico de orçamentos) acompanharem o cliente em qualquer
// computador/celular, e serem apagados de vez quando a conta é excluída.
//
// MIGRAÇÃO AUTOMÁTICA: contas que já tinham dados salvos no localStorage
// (de antes dessa mudança) têm esses dados importados pro banco na primeira
// vez que o app carrega depois do login — sem perder nada, sem passo manual.
import { apiRequest } from "./api";

function legacyLocalKey(key, shared) {
  return `svc:${shared ? "shared" : "user"}:${key}`;
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

      const result = await apiRequest(`/api/app-data/${key}`);
      if (result && result.value != null) {
        return { key, value: result.value, shared: false };
      }

      // Sem dado no banco ainda: verifica se sobrou algo do localStorage de
      // antes dessa mudança e, se tiver, importa pro banco agora mesmo.
      try {
        const legacyRaw = localStorage.getItem(legacyLocalKey(key, false));
        if (legacyRaw !== null) {
          await apiRequest(`/api/app-data/${key}`, {
            method: "PUT",
            body: JSON.stringify({ value: legacyRaw }),
          });
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

      try {
        await apiRequest(`/api/app-data/${key}`, {
          method: "PUT",
          body: JSON.stringify({ value }),
        });
        return { key, value, shared: false };
      } catch (e) {
        return null;
      }
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
