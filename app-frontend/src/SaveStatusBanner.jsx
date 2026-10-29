// Aviso fixo no topo da tela quando alguma alteração AINDA NÃO FOI SALVA
// (ver syncQueue.js). Fica invisível no dia a dia — só aparece quando tem
// problema: sem conexão (tentando de novo sozinho), erro, conflito com
// outro aparelho/aba, sessão expirada ou assinatura inativa.
import { useEffect, useState } from "react";
import { getSyncState, subscribeSync, resolveConflict } from "./syncQueue";

const VISIBLE = new Set(["retrying", "error", "conflict", "auth", "license"]);

export default function SaveStatusBanner() {
  const [state, setState] = useState(getSyncState());
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let prev = getSyncState().status;
    let timer = null;
    const unsub = subscribeSync((s) => {
      setState(s);
      // Depois de um problema resolvido, mostra "Tudo salvo" por 3s pra
      // pessoa ter certeza de que nada se perdeu.
      if (s.status === "saved" && VISIBLE.has(prev)) {
        setJustSaved(true);
        clearTimeout(timer);
        timer = setTimeout(() => setJustSaved(false), 3000);
      }
      prev = s.status;
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  if (justSaved && state.status === "saved") {
    return (
      <div style={wrap("#0f766e")} role="status">
        ✓ Tudo salvo.
      </div>
    );
  }
  if (!VISIBLE.has(state.status)) return null;

  const color = state.status === "retrying" ? "#b45309" : "#b91c1c";
  return (
    <div style={wrap(color)} role="alert">
      <span>{state.message}</span>
      {state.status === "conflict" && (
        <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btn} onClick={() => resolveConflict("reload")}>
            Recarregar (usar a versão salva)
          </button>
          <button style={btnGhost} onClick={() => resolveConflict("mine")}>
            Manter as alterações desta tela
          </button>
        </span>
      )}
      {(state.status === "auth" || state.status === "license") && (
        <button style={btn} onClick={() => window.location.reload()}>
          {state.status === "auth" ? "Entrar de novo" : "Ver assinatura"}
        </button>
      )}
    </div>
  );
}

function wrap(bg) {
  return {
    position: "fixed",
    top: "env(safe-area-inset-top, 0px)",
    left: 0,
    right: 0,
    zIndex: 10000,
    background: bg,
    color: "#fff",
    fontSize: 13,
    lineHeight: 1.4,
    padding: "10px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    flexWrap: "wrap",
    textAlign: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
  };
}

const btn = {
  background: "#fff",
  color: "#1c1917",
  border: "none",
  borderRadius: 6,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const btnGhost = {
  ...btn,
  background: "transparent",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.7)",
};
