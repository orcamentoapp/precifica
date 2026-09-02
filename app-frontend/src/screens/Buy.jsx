import { useState } from "react";
import { screenStyle, inputStyle, buttonStyle, linkStyle, errorBoxStyle, labelStyle } from "../authStyles";

const MONTHLY_PRICE = 99.9;
const ANNUAL_PRICE = 599.9;
const ANNUAL_MONTHLY_EQUIVALENT = (ANNUAL_PRICE / 12).toFixed(2).replace(".", ",");

function formatBRL(value) {
  return value.toFixed(2).replace(".", ",");
}

export default function Buy({ onBackToLogin }) {
  const [plan, setPlan] = useState("monthly"); // "monthly" | "annual"
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(""); // "" | "subscribe" | "trial"
  const [error, setError] = useState("");

  async function startCheckout(mode) {
    // mode: "subscribe" (cartão, recorrente, Stripe) | "trial" (cartão, 7 dias grátis, Stripe)
    //     | "pix_boleto" (pagamento único, Mercado Pago)
    if (!email.trim()) {
      setError("Preencha o e-mail antes de continuar.");
      return;
    }
    setError("");
    setSubmitting(mode);
    try {
      const endpoint = mode === "pix_boleto" ? "/api/payments/mercadopago/checkout" : "/api/payments/stripe/checkout";
      const body =
        mode === "pix_boleto" ? { email: email.trim(), plan } : { email: email.trim(), plan, trial: mode === "trial" };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível iniciar o pagamento.");
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err.message);
      setSubmitting("");
    }
  }

  return (
    <div style={screenStyle}>
      <div className="bg-white border border-stone-200 rounded-2xl p-7 w-full" style={{ maxWidth: 460 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#0f766e", letterSpacing: "-0.02em" }}>Precifica</div>
        <p style={{ fontSize: 12.5, color: "#a8a29e", margin: "2px 0 20px", fontStyle: "italic" }}>
          Precifique seus procedimentos com inteligência.
        </p>

        {error && <div style={errorBoxStyle}>{error}</div>}

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

        <label style={labelStyle}>E-mail</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} autoFocus />

        <button type="button" disabled={!!submitting} onClick={() => startCheckout("subscribe")} style={buttonStyle}>
          {submitting === "subscribe" ? "Preparando pagamento..." : "Assinar agora (cartão)"}
        </button>

        <button
          type="button"
          disabled={!!submitting}
          onClick={() => startCheckout("pix_boleto")}
          className="w-full mt-2.5 text-sm font-medium text-stone-700 border border-stone-200 rounded-lg py-2.5 hover:bg-stone-50 transition disabled:opacity-50"
        >
          {submitting === "pix_boleto" ? "Preparando..." : "Pagar com Pix ou Boleto"}
        </button>
        <p className="text-[11px] text-stone-400 text-center mt-1.5 leading-relaxed">
          Pagamento único — libera {plan === "annual" ? "365" : "30"} dias de acesso. Não renova sozinho: quando
          acabar, é só pagar de novo.
        </p>

        <button
          type="button"
          disabled={!!submitting}
          onClick={() => startCheckout("trial")}
          className="w-full mt-2.5 text-sm font-medium text-teal-700 border border-teal-200 rounded-lg py-2.5 hover:bg-teal-50 transition disabled:opacity-50"
        >
          {submitting === "trial" ? "Preparando..." : "Testar grátis por 7 dias"}
        </button>
        <p className="text-[11px] text-stone-400 text-center mt-2 leading-relaxed">
          Pedimos o cartão pra iniciar o teste, mas você só é cobrado depois dos 7 dias — cancele antes disso e não
          paga nada.
        </p>

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
