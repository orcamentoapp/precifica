import { useState } from "react";
import { screenStyle, cardStyle, inputStyle, buttonStyle, linkStyle, errorBoxStyle, labelStyle } from "../authStyles";

export default function Buy({ onBackToLogin }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/payments/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível iniciar o pagamento.");
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div style={screenStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#0f766e", letterSpacing: "-0.02em" }}>Precifica</div>
        <p style={{ fontSize: 12.5, color: "#a8a29e", margin: "2px 0 20px", fontStyle: "italic" }}>
          Precifique seus procedimentos com inteligência.
        </p>
        <p style={{ fontSize: 13, color: "#57534e", margin: "0 0 20px", lineHeight: 1.5 }}>
          Assinatura mensal. Pague com cartão ou boleto. Depois de confirmado o pagamento, você recebe sua chave
          de licença por e-mail em instantes.
        </p>

        {error && <div style={errorBoxStyle}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <label style={labelStyle}>Nome</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            autoFocus
            required
          />

          <label style={{ ...labelStyle, marginTop: 12 }}>E-mail</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} required />

          <button type="submit" disabled={submitting} style={buttonStyle}>
            {submitting ? "Preparando pagamento..." : "Assinar agora"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#78716c" }}>
          Já recebeu uma chave de licença?{" "}
          <button type="button" onClick={onBackToLogin} style={{ ...linkStyle, fontWeight: 600 }}>
            Ativar / entrar
          </button>
        </div>
      </div>
    </div>
  );
}
