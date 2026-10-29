import { useState } from "react";
import { apiRequest, clearToken, getToken } from "../api";
import { screenStyle, cardStyle, buttonStyle, linkStyle, errorBoxStyle } from "../authStyles";
import AuthLogo from "../AuthLogo";

// Tela mostrada quando a licença não está válida (vencida, revogada...).
//
// Antes só dizia "entre em contato" e tinha o botão "Sair" — quem tinha o
// cartão recusado, ou cancelou e quis voltar, não tinha como pagar sozinho
// (o botão de renovar fica dentro do app, que a pessoa não consegue abrir).
// Agora dá pra: renovar na hora (checkout do Stripe nessa mesma aba),
// trocar o cartão (portal do Stripe, quando o problema é cartão recusado) e
// baixar os próprios dados (LGPD — os dados são da pessoa, mesmo vencida).
const REASON_MESSAGES = {
  expired: "Sua assinatura venceu. Renove pra voltar a usar o Precifica — seus dados continuam todos guardados.",
  revoked: "O acesso dessa licença foi revogado. Se acha que é um engano, fale com o suporte: suporte@verterelabs.com",
  inactive: "Sua licença ainda não está ativa.",
  no_license: "Não encontramos nenhuma assinatura ativa na sua conta.",
};

export default function LicenseBlocked({ reason, license, email, onLogout }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const canRenew = reason !== "revoked";
  const hasCard = !!(license && license.hasStripeSubscription);

  async function handleRenew() {
    setBusy("renew");
    setError("");
    try {
      const data = await apiRequest("/api/payments/stripe/renew-checkout", {
        method: "POST",
        body: JSON.stringify({ plan: "monthly" }),
      });
      if (data && data.reactivated) {
        window.location.reload();
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err.message);
      setBusy("");
    }
  }

  async function handlePortal() {
    setBusy("portal");
    setError("");
    try {
      const data = await apiRequest("/api/payments/stripe/portal", { method: "POST" });
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setBusy("");
    }
  }

  async function handleExport() {
    setBusy("export");
    setError("");
    try {
      const res = await fetch("/api/auth/export", { headers: { Authorization: "Bearer " + getToken() } });
      if (!res.ok) throw new Error("Não foi possível gerar o arquivo agora.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `precifica-meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div style={screenStyle}>
      <div style={cardStyle}>
        <AuthLogo />
        <p style={{ fontSize: 13, color: "#57534e", margin: "10px 0 20px", lineHeight: 1.5 }}>
          {REASON_MESSAGES[reason] || "Sua licença precisa de atenção."}
        </p>
        {email && <p style={{ fontSize: 12, color: "#a8a29e", margin: "-12px 0 18px" }}>Conta: {email}</p>}
        {error && <div style={errorBoxStyle}>{error}</div>}

        {canRenew && (
          <button type="button" onClick={handleRenew} disabled={!!busy} style={buttonStyle}>
            {busy === "renew" ? "Abrindo pagamento..." : "Renovar assinatura agora"}
          </button>
        )}
        {canRenew && hasCard && (
          <button
            type="button"
            onClick={handlePortal}
            disabled={!!busy}
            style={{ ...buttonStyle, background: "#fff", color: "#0f766e", border: "1px solid #99f6e4", marginTop: 10 }}
          >
            {busy === "portal" ? "Abrindo..." : "Trocar cartão / ver faturas"}
          </button>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, fontSize: 13 }}>
          <button type="button" onClick={handleExport} disabled={!!busy} style={linkStyle}>
            {busy === "export" ? "Gerando..." : "Baixar meus dados"}
          </button>
          <button
            type="button"
            onClick={() => {
              clearToken();
              onLogout();
            }}
            style={linkStyle}
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
