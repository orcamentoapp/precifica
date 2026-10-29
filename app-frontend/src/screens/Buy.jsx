import { useState, useEffect } from "react";
import { screenStyle, inputStyle, buttonStyle, linkStyle, errorBoxStyle } from "../authStyles";
import AuthLogo from "../AuthLogo";
import TermsCheckbox from "../TermsCheckbox";

// Só usado enquanto o preço de verdade ainda não chegou do servidor (ver
// useEffect mais abaixo) — pra tela não ficar em branco por um instante.
// Depois de carregar, o preço mostrado é sempre o que vem de
// GET /api/payments/pricing, que é a MESMA fonte que decide quanto o Stripe
// cobra de verdade (painel admin → Configurações → Preços, com variável de
// ambiente do Railway como respaldo) — nunca mais devia dessincronizar.
const FALLBACK_PRICING = { monthlyPrice: 39.9, annualPrice: 358.8, founder: null };

function formatBRL(value) {
  return value.toFixed(2).replace(".", ",");
}

// Só planos aqui — mensal e anual, sem teste grátis. O teste tem o próprio
// fluxo à parte (TrialSignup.jsx), acessado direto da tela de login, porque
// só pode ser usado uma vez e a jornada dele é mais simples (não precisa
// escolher plano, só e-mail).
export default function Buy({ onBackToLogin }) {
  // Plano anual reativado em 29/10/2026 (estratégia de preço: mensal cheio
  // + anual com desconto + oferta de fundador no mensal, quando ligada).
  // Já entra no anual quando NÃO tem oferta de fundador (melhor negócio
  // pros dois lados); com fundador no ar, entra no mensal.
  const [plan, setPlan] = useState("annual"); // "monthly" | "annual"
  const [email, setEmail] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pricing, setPricing] = useState(FALLBACK_PRICING);

  // Busca o preço de verdade assim que a tela abre — se o admin tiver
  // mudado pelo painel (ou a variável do Railway), aparece certinho sem
  // precisar publicar um novo build do site. Se a busca falhar por
  // qualquer motivo (servidor fora do ar, etc.), fica no valor de reserva
  // acima em vez de travar a tela.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/payments/pricing")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data && typeof data.monthlyPrice === "number") {
          setPricing({ monthlyPrice: data.monthlyPrice, annualPrice: data.annualPrice, founder: data.founder || null });
          if (data.founder) setPlan("monthly");
        }
      })
      .catch(() => {
        // Mantém o valor de reserva — não é motivo pra travar a tela de compra.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const annualSavingsPct = Math.round((1 - pricing.annualPrice / (pricing.monthlyPrice * 12)) * 100);

  async function handleSubmit() {
    if (!plan) {
      setError("Escolha um plano (mensal ou anual) antes de continuar.");
      return;
    }
    if (!email.trim()) {
      setError("Preencha o e-mail antes de continuar.");
      return;
    }
    if (!acceptedTerms) {
      setError("Pra continuar, aceite os Termos de Uso e a Política de Privacidade.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/payments/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), plan, trial: false, acceptedTerms }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível iniciar o pagamento.");
      if (window.precificaTrack) window.precificaTrack("InitiateCheckout", { plano: plan === "annual" ? "anual" : "mensal" });
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

        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#57534e", marginBottom: 8 }}>1. Plano</div>
        {/* Fase de lançamento (oferta de fundador no ar): só o mensal de
            fundador — o anual sairia pelo mesmo valor por mês, com menos
            flexibilidade. Sem a oferta: mensal cheio + anual com desconto. */}
        <div className={pricing.founder ? "mb-5" : "grid grid-cols-2 gap-3 mb-5"}>
          <button
            type="button"
            onClick={() => setPlan("monthly")}
            className={`relative w-full text-left rounded-xl border p-3.5 transition ${
              plan === "monthly" ? "border-teal-500 bg-teal-50" : "border-stone-200 hover:bg-stone-50"
            }`}
          >
            {pricing.founder && (
              <span className="absolute -top-2 right-2 text-[10px] font-bold bg-orange-600 text-white px-2 py-0.5 rounded-full">
                FUNDADOR
              </span>
            )}
            <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Mensal</div>
            {pricing.founder ? (
              <>
                <div className="text-lg font-bold text-stone-800 mt-1">R$ {formatBRL(pricing.founder.price)}</div>
                <div className="text-[11px] text-stone-500 leading-snug">
                  por mês, pra sempre · restam {pricing.founder.remaining} vagas · preço normal R$ {formatBRL(pricing.monthlyPrice)}
                </div>
              </>
            ) : (
              <>
                <div className="text-lg font-bold text-stone-800 mt-1">R$ {formatBRL(pricing.monthlyPrice)}</div>
                <div className="text-xs text-stone-400">por mês</div>
              </>
            )}
          </button>
          {!pricing.founder && (
          <button
            type="button"
            onClick={() => setPlan("annual")}
            className={`relative text-left rounded-xl border p-3.5 transition ${
              plan === "annual" ? "border-teal-500 bg-teal-50" : "border-stone-200 hover:bg-stone-50"
            }`}
          >
            {annualSavingsPct > 0 && (
              <span className="absolute -top-2 right-2 text-[10px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded-full">
                -{annualSavingsPct}%
              </span>
            )}
            <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Anual</div>
            <div className="text-lg font-bold text-stone-800 mt-1">R$ {formatBRL(pricing.annualPrice / 12)}</div>
            <div className="text-[11px] text-stone-500 leading-snug">
              por mês · R$ {formatBRL(pricing.annualPrice)} cobrado 1x por ano
            </div>
          </button>
          )}
        </div>
        {plan === "monthly" && pricing.founder && (
          <p style={{ fontSize: 12, color: "#57534e", margin: "-10px 0 16px", lineHeight: 1.5 }}>
            Preço de fundador: você paga R$ {formatBRL(pricing.founder.price)}/mês enquanto mantiver a assinatura ativa,
            mesmo quando o preço subir pra todo mundo.
          </p>
        )}

        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#57534e", marginBottom: 8 }}>2. Seu e-mail</div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ ...inputStyle, marginBottom: 14 }}
          autoFocus
        />
        <TermsCheckbox checked={acceptedTerms} onChange={setAcceptedTerms} />

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
