const TOKEN_KEY = "precifica_token";
const REQUEST_TIMEOUT_MS = 20000; // 20s — evita ficar girando pra sempre se o servidor travar

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
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
