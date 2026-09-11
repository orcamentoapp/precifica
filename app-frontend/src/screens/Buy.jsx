import { useState } from "react";
import { screenStyle, inputStyle, buttonStyle, linkStyle, errorBoxStyle } from "../authStyles";
import AuthLogo from "../AuthLogo";

const MONTHLY_PRICE = 99.9;
const ANNUAL_PRICE = 599.9;
const ANNUAL_MONTHLY_EQUIVALENT = (ANNUAL_PRICE / 12).toFixed(2).replace(".", ",");

function formatBRL(value) {
  return value.toFixed(2).replace(".", ",");
}

// Só planos aqui — mensal e anual, sem teste grátis. O teste tem o próprio
// fluxo à parte (TrialSignup.jsx), acessado direto da tela de login, porque
// só pode ser usado uma vez e a jornada dele é mais simples (não precisa
// escolher plano, só e-mail).
export default function Buy({ onBackToLogin }) {
  const [plan, setPlan] = useState(null); // null | "monthly" | "annual" — nada selecionado até o usuário clicar
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!plan) {
      setError("Escolha um plano (mensal ou anual) antes de continuar.");
      return;
    }
    if (!email.trim()) {
      setError("Preencha o e-mail antes de continuar.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/payments/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), plan, trial: false }),
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
      <div className="bg-white border border-stone-200 rounded-2xl p-7 w-full" style={{ maxWidth: 460 }}>
        <AuthLogo />
        <p style={{ fontSize: 12.5, color: "#a8a29e", margin: "2px 0 20px", fontStyle: "italic", textAlign: "center" }}>
          Precifique seus procedimentos com inteligência.
        </p>

        {error && <div style={errorBoxStyle}>{error}</div>}

        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#57534e", marginBottom: 8 }}>1. Escolha o plano</div>
        <div className="grid grid-cols-2 gap-3 mb-5">
          <button
            type="button"
            onClick={() => setPlan("monthly")}
            className={`text-left rounded-xl border p-3.5 transition ${
              plan === "monthly" ? "border-teal-500 bg-teal-50" : "border-stone-200 hover:bg-stone-50"
            }`}
          >
            <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Mensal</div>
            <div className="text-lg font-bold text-stone-800 mt-1">R$ {formatBRL(MONTHLY_PRICE)}</div>
            <div className="text-xs text-stone-400">por mês</div>
          </button>
          <button
            type="button"
            onClick={() => setPlan("annual")}
            className={`relative text-left rounded-xl border p-3.5 transition ${
              plan === "annual" ? "border-teal-500 bg-teal-50" : "border-stone-200 hover:bg-stone-50"
            }`}
          >
            <span className="absolute -top-2 right-2 text-[10px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded-full">
              ECONOMIZE 50%
            </span>
            <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Anual</div>
            <div className="text-lg font-bold text-stone-800 mt-1">R$ {formatBRL(ANNUAL_PRICE)}</div>
            <div className="text-xs text-stone-400">por ano · equivale a R$ {ANNUAL_MONTHLY_EQUIVALENT}/mês</div>
          </button>
        </div>

        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#57534e", marginBottom: 8 }}>2. Seu e-mail</div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ ...inputStyle, marginBottom: 20 }}
          autoFocus
        />

        <button type="button" disabled={submitting} onClick={handleSubmit} style={buttonStyle}>
          {submitting ? "Preparando..." : "Assinar agora (cartão)"}
        </button>

        <div style={{ textAlign: "center", marginTop: 18, fontSize: 13, color: "#78716c" }}>
          Já recebeu uma chave de licença?{" "}
          <button type="button" onClick={onBackToLogin} style={{ ...linkStyle, fontWeight: 600 }}>
            Ativar / entrar
          </button>
        </div>
      </div>
    </div>
  );
}
