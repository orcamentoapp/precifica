import { useState, useEffect } from "react";
import { screenStyle, inputStyle, buttonStyle, linkStyle, errorBoxStyle } from "../authStyles";
import AuthLogo from "../AuthLogo";
import TermsCheckbox from "../TermsCheckbox";

// Fluxo separado do "Assinar agora" (Buy.jsx) — o teste grátis só pode ser
// usado uma vez por pessoa, então não faz sentido misturar com a escolha de
// plano mensal/anual ali (o teste sempre vira mensal depois dos 7 dias, sem
// escolha nenhuma). Só pede o e-mail e deixa bem claro o que vai acontecer.
export default function TrialSignup({ onBackToLogin }) {
  const [email, setEmail] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // Valor que vai ser cobrado DEPOIS do teste (transparência: a pessoa vê
  // antes de cadastrar o cartão) — com preço de fundador, se estiver no ar.
  const [afterTrial, setAfterTrial] = useState(null); // { price, founder: bool, remaining }
  useEffect(() => {
    fetch("/api/payments/pricing")
      .then((r) => r.json())
      .then((d) => {
        if (!d || typeof d.monthlyPrice !== "number") return;
        setAfterTrial(
          d.founder
            ? { price: d.founder.price, regular: d.monthlyPrice, founder: true, remaining: d.founder.remaining }
            : { price: d.monthlyPrice, founder: false }
        );
      })
      .catch(() => {});
  }, []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
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
        body: JSON.stringify({ email: email.trim(), plan: "monthly", trial: true, acceptedTerms }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível iniciar o teste grátis.");
      if (window.precificaTrack) window.precificaTrack("InitiateCheckout", { plano: "teste_gratis" });
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div style={screenStyle}>
      <div className="bg-white border border-stone-200 rounded-2xl p-7 w-full" style={{ maxWidth: 440 }}>
        <AuthLogo />
        <p style={{ fontSize: 12.5, color: "#a8a29e", margin: "2px 0 20px", fontStyle: "italic", textAlign: "center" }}>
          Precifique seus procedimentos com inteligência.
        </p>

        <div className="text-center mb-5">
          <span className="inline-block text-[10px] font-bold bg-teal-600 text-white px-2.5 py-1 rounded-full mb-2">
            7 DIAS GRÁTIS
          </span>
          <h2 className="text-lg font-bold text-stone-800">Teste grátis por 7 dias</h2>
        </div>

        {error && <div style={errorBoxStyle}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: "#57534e", display: "block", marginBottom: 8 }}>
            Seu e-mail
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ ...inputStyle, marginBottom: 16 }}
            autoFocus
            required
          />

          <div className="bg-teal-50 border border-teal-100 rounded-xl p-3.5 mb-5">
            <p className="text-xs text-stone-600 leading-relaxed">
              Teste o Precifica por 7 dias grátis. Tenha acesso ilimitado a todas as ferramentas agora mesmo. Cancele
              a qualquer momento antes do fim do teste e nada será cobrado.
              <br />
              <br />
              <strong>Nota:</strong> é necessário cadastrar um cartão válido para ativar o período de testes. O
              teste grátis vale uma vez por cartão.
              {afterTrial && (
                <>
                  <br />
                  <br />
                  <strong>Depois do teste:</strong> R$ {afterTrial.price.toFixed(2).replace(".", ",")}/mês
                  {afterTrial.founder ? (
                    <>
                      {" "}— <strong>preço de fundador</strong>, travado pra sempre enquanto você mantiver a assinatura
                      (o preço normal é R$ {afterTrial.regular.toFixed(2).replace(".", ",")}). Restam{" "}
                      {afterTrial.remaining} vagas.
                    </>
                  ) : (
                    "."
                  )}
                </>
              )}
            </p>
          </div>

          <TermsCheckbox checked={acceptedTerms} onChange={setAcceptedTerms} />
          <button type="submit" disabled={submitting} style={buttonStyle}>
            {submitting ? "Preparando..." : "Testar grátis por 7 dias"}
          </button>
        </form>

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
