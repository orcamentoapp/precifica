const TOKEN_KEY = "precifica_token";
const ACCOUNTS_KEY = "precifica_accounts";
export const REMEMBERED_EMAIL_KEY = "precifica_remembered_email";
const REQUEST_TIMEOUT_MS = 20000; // 20s — evita ficar girando pra sempre se o servidor travar
const MAX_SAVED_ACCOUNTS = 5; // só precisa de 2 pro "trocar de conta", mas deixa uma folga

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// Lista de contas que já fizeram login NESSE navegador com a caixinha
// "Lembrar" marcada, guardada pra dar pra trocar de conta com um clique
// (sem digitar e-mail/senha de novo) — só entra aqui quem marcou "Lembrar"
// no login (ver Login.jsx); quem não marcou nunca aparece na lista de troca,
// de propósito (computador compartilhado etc). Guarda o próprio token de
// sessão de cada uma (mesmo JWT de 30 dias usado no login normal) — trocar
// de conta é só apontar o token ativo pra ele. "Sair" NÃO mexe nessa lista
// (só limpa a conta ativa), então continua dando pra voltar depois; só um
// "remover" explícito (ou desmarcar "Lembrar" num login futuro) tira uma
// conta da lista.
export function getSavedAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

export function saveAccount(email, token) {
  if (!email || !token) return;
  try {
    const list = getSavedAccounts().filter((a) => a.email !== email);
    list.unshift({ email, token });
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list.slice(0, MAX_SAVED_ACCOUNTS)));
  } catch (e) {}
}

export function removeSavedAccount(email) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(getSavedAccounts().filter((a) => a.email !== email)));
  } catch (e) {}
}

// Troca a conta ativa pro token já salvo daquele e-mail — devolve true se
// achou e trocou, false se essa conta não está mais salva (nesse caso quem
// chamou decide o que fazer, ex: mandar pra tela de login). Se o token salvo
// já tiver expirado (JWT de 30 dias), a troca "funciona" aqui (token vira o
// ativo), mas a próxima checagem de sessão vai perceber e mandar pro login
// normalmente — como qualquer sessão expirada.
export function switchToAccount(email) {
  const found = getSavedAccounts().find((a) => a.email === email);
  if (!found) return false;
  setToken(found.token);
  return true;
}

export async function apiRequest(path, options = {}) {
  const { skipAuth, ...rest } = options;
  const headers = Object.assign({ "Content-Type": "application/json" }, rest.headers || {});
  if (!skipAuth) {
    const token = getToken();
    if (token) headers["Authorization"] = "Bearer " + token;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(path, { ...rest, headers, signal: controller.signal });
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error("O servidor demorou demais pra responder. Tente novamente em instantes.");
    }
    throw new Error("Não foi possível conectar ao servidor. Verifique sua internet.");
  } finally {
    clearTimeout(timeoutId);
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // resposta sem corpo (ex: 204)
  }

  if (!res.ok) {
    const err = new Error((data && data.error) || `Erro ${res.status}`);
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}
