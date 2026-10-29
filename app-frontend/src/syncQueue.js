// Fila de salvamento do app — TODA gravação de dado do cliente (configurações,
// procedimentos, materiais, pacientes, orçamentos) passa por aqui.
//
// Por que existe: antes, cada salvamento era "dispara e esquece" — se a
// internet caísse, o servidor reiniciasse ou a sessão expirasse, o erro era
// engolido em silêncio e a pessoa achava que tinha salvado (e perdia tudo
// no F5). Agora:
// - as gravações rodam UMA DE CADA VEZ, na ordem em que aconteceram;
// - se falhar por rede/servidor, tenta de novo sozinha (2s, 5s, 10s, 20s,
//   30s...) até conseguir, sem perder nada;
// - várias edições seguidas do MESMO dado viram uma gravação só (a mais
//   recente);
// - o app mostra um aviso visível enquanto existir algo não salvo
//   (SaveStatusBanner no App.jsx) e o navegador pergunta antes de fechar a
//   aba com alterações pendentes;
// - cada gravação leva o token de QUEM fez a alteração — se a pessoa trocar
//   de conta com algo pendente, o pendente vai pra conta certa.
import { getToken } from "./api";

const RETRY_DELAYS_MS = [2000, 5000, 10000, 20000, 30000];

const order = []; // ids na ordem
const items = new Map(); // id -> { run, token, gen, resolvers: [] }
let processing = false;
let paused = false; // conflito/sessão: para tudo até a pessoa decidir
let retryIndex = 0;
let state = { status: "idle", message: "" };
const listeners = new Set();

function setState(status, message = "", extra = {}) {
  state = { status, message, pending: items.size, ...extra };
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch (e) {}
  });
}

export function getSyncState() {
  return state;
}

export function subscribeSync(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function hasPendingChanges() {
  return items.size > 0;
}

// id: identifica O QUE está sendo salvo (ex: "kv:settings",
// "budget:abc123") — uma gravação nova com o mesmo id substitui a pendente.
// run(token): faz a requisição; deve lançar erro (com .status) se falhar.
export function enqueue(id, run) {
  const token = getToken();
  return new Promise((resolve, reject) => {
    const existing = items.get(id);
    if (existing) {
      existing.run = run;
      existing.token = token;
      existing.gen += 1;
      existing.resolvers.push({ resolve, reject });
    } else {
      items.set(id, { run, token, gen: 0, resolvers: [{ resolve, reject }] });
      order.push(id);
    }
    if (!paused) setState("saving");
    kick();
  });
}

// Remove da fila tudo que começa com esse prefixo (menos o que já está
// sendo enviado agora) — usado por "Limpar histórico": não adianta enviar
// orçamentos que vão ser apagados logo em seguida.
export function dropPending(prefix) {
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    if (id.startsWith(prefix) && !(processing && i === 0)) {
      const item = items.get(id);
      items.delete(id);
      order.splice(i, 1);
      item.resolvers.forEach((r) => r.resolve(null));
    }
  }
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function kick() {
  if (processing || paused) return;
  processing = true;
  try {
    while (order.length && !paused) {
      const id = order[0];
      const item = items.get(id);
      const genAtStart = item.gen;
      try {
        await item.run(item.token);
        retryIndex = 0;
        if (item.gen === genAtStart) {
          order.shift();
          items.delete(id);
          item.resolvers.forEach((r) => r.resolve(true));
        }
        // se mudou durante o envio, o loop roda de novo com a versão nova
      } catch (err) {
        const status = err && err.status;
        if (status === 409) {
          paused = true;
          setState("conflict", "Esses dados foram alterados em outro aparelho ou aba.", { conflictId: id });
          return;
        }
        if (status === 401) {
          paused = true;
          setState("auth", "Sua sessão expirou. Entre de novo pra continuar salvando.");
          return;
        }
        if (status === 403 && err.data && err.data.blocked) {
          paused = true;
          setState("auth", "Essa conta foi bloqueada.");
          return;
        }
        if (status === 402) {
          paused = true;
          setState("license", "Sua assinatura não está ativa — as alterações não estão sendo salvas.");
          return;
        }
        if (status === 400 || status === 413) {
          // Erro que não se resolve tentando de novo (dado grande demais,
          // formato inválido) — descarta ESSA gravação, avisa, e segue com
          // as próximas.
          order.shift();
          items.delete(id);
          item.resolvers.forEach((r) => r.reject(err));
          setState(
            "error",
            status === 413
              ? "Não foi possível salvar: o conteúdo ficou grande demais (se for a logo, tente uma imagem menor)."
              : `Não foi possível salvar: ${err.message || "erro desconhecido"}`
          );
          await wait(4000);
          continue;
        }
        // Rede, servidor fora do ar, 429, 5xx: tenta de novo, sem desistir.
        const delay = RETRY_DELAYS_MS[Math.min(retryIndex, RETRY_DELAYS_MS.length - 1)];
        retryIndex += 1;
        setState("retrying", "Sem conexão com o servidor — suas alterações ainda NÃO foram salvas. Tentando de novo...");
        await wait(delay);
      }
    }
  } finally {
    processing = false;
  }
  if (!paused && order.length === 0) setState("saved");
}

// Depois de um conflito, a pessoa escolhe:
// - "mine": manter o que está na tela dela (grava por cima do outro aparelho);
// - "reload": descartar o pendente e recarregar a versão salva.
let conflictResolver = null;
export function setConflictResolver(fn) {
  conflictResolver = fn;
}

export function resolveConflict(choice) {
  if (choice === "reload") {
    order.length = 0;
    items.clear();
    window.location.reload();
    return;
  }
  if (choice === "mine" && conflictResolver) {
    conflictResolver(state.conflictId);
  }
  paused = false;
  setState("saving");
  kick();
}

// Retoma depois de logar de novo (sessão expirada) ou renovar.
export function resumeSync() {
  if (!paused) return;
  paused = false;
  setState(order.length ? "saving" : "saved");
  kick();
}

// Aviso do navegador ao fechar a aba com algo ainda não salvo.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (items.size > 0) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}
