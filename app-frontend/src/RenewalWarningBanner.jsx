import { useState } from "react";
import { apiRequest } from "./api";

const BANNER_HEIGHT = 40;
// altura total = altura do banner + o espaço reservado pra status bar (notch/relógio)
const TOTAL_HEIGHT = `calc(${BANNER_HEIGHT}px + env(safe-area-inset-top, 0px))`;

// Aviso de licença perto de vencer, com botão "Renovar agora". Só faz
// sentido pra licenças que NÃO renovam sozinhas: assinatura por cartão
// (Stripe) já cobra automaticamente, e conta trial já tem o próprio banner
// vermelho (TrialBanner) — quem decide isso é o AuthGate, que só monta esse
// componente quando nenhum dos dois casos se aplica.
export default function RenewalWarningBanner({ daysLeft, plan }) {
  const [renewing, setRenewing] = useState(false);
  const [error, setError] = useState("");
  const days = Number(daysLeft);

  const label =
    days <= 0
      ? "Sua licença vence hoje"
      : `Sua licença vence em ${days} ${days === 1 ? "dia" : "dias"}`;

  async function handleRenewNow() {
    setRenewing(true);
    setError("");
    try {
      const data = await apiRequest("/api/payments/mercadopago/renew-checkout", {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError("Não foi possível iniciar o pagamento agora.");
      setRenewing(false);
    }
  }

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          minHeight: TOTAL_HEIGHT,
          paddingTop: "env(safe-area-inset-top, 0px)",
          zIndex: 9999,
          background: "#d97706",
          color: "#fff",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            flexWrap: "wrap",
            padding: "8px 12px",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.01em",
          }}
        >
          <span>{label}</span>
          <button
            onClick={handleRenewNow}
            disabled={renewing}
            style={{
              background: "#fff",
              color: "#92400e",
              border: "none",
              borderRadius: 999,
              padding: "4px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: renewing ? "default" : "pointer",
              opacity: renewing ? 0.7 : 1,
            }}
          >
            {renewing ? "Abrindo pagamento..." : "Renovar agora"}
          </button>
        </div>
        {error && (
          <div style={{ textAlign: "center", fontSize: 11, paddingBottom: 6 }}>{error}</div>
        )}
      </div>
      {/* espaçador pra empurrar o conteúdo do app pra baixo do banner fixo */}
      <div style={{ height: TOTAL_HEIGHT }} />
    </>
  );
}
