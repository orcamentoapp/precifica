import { useEffect, useState } from "react";
import { apiRequest } from "../api";
import AuthLogo from "../AuthLogo";

// Tela minúscula que só existe pra abrir numa aba/popup SEPARADA, disparada
// pelo botão "Renovar assinatura" dentro do app (já logado) — o objetivo é
// nunca precisar deslogar a pessoa nem tirar ela da tela onde estava só pra
// pagar de novo. O Stripe manda a pessoa de volta pra cá (nessa aba nova)
// depois do pagamento; essa tela confirma o pagamento direto na API do
// Stripe (mesma rota /confirm-checkout que a compra normal já usa) e se
// fecha sozinha — a aba principal, enquanto isso, está de olho em quando
// essa aba fecha (window.closed) pra atualizar os dados da assinatura dela.
export default function RenewalConfirm() {
  const [status, setStatus] = useState("confirming"); // "confirming" | "done" | "error"

  useEffect(() => {
    async function confirm() {
      try {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get("session_id");
        if (!sessionId) {
          setStatus("error");
          return;
        }
        await apiRequest("/api/payments/stripe/confirm-checkout", {
          method: "POST",
          body: JSON.stringify({ sessionId }),
          skipAuth: true,
        });
        setStatus("done");
      } catch (err) {
        setStatus("error");
      } finally {
        // Tenta fechar sozinha depois de um instante — só funciona se essa
        // aba foi aberta via window.open() por script (é sempre o caso
        // aqui). Se o navegador não deixar, a pessoa fecha manualmente; o
        // texto na tela já orienta isso.
        setTimeout(() => window.close(), 2500);
      }
    }
    confirm();
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        textAlign: "center",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <AuthLogo />
      {status === "confirming" && <p style={{ color: "#78716c", fontSize: 14 }}>Confirmando seu pagamento...</p>}
      {status === "done" && (
        <p style={{ color: "#0f766e", fontSize: 14, fontWeight: 600 }}>
          Pagamento confirmado! Você já pode fechar esta aba.
        </p>
      )}
      {status === "error" && (
        <p style={{ color: "#57534e", fontSize: 14 }}>
          Não deu pra confirmar automaticamente, mas se o pagamento passou, sua assinatura já deve aparecer
          atualizada. Pode fechar esta aba e conferir na tela principal.
        </p>
      )}
    </div>
  );
}
