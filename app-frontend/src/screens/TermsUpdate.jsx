import { useState } from "react";
import { apiRequest } from "../api";
import { screenStyle, cardStyle, buttonStyle, linkStyle, errorBoxStyle } from "../authStyles";
import AuthLogo from "../AuthLogo";
import TermsCheckbox from "../TermsCheckbox";

// Mostrada uma vez pra quem criou a conta antes dos Termos de Uso e da
// Política de Privacidade existirem (ou quando eles mudam — ver
// TERMS_VERSION em src/utils/terms.js no backend). O aceite fica gravado
// com data no banco.
export default function TermsUpdate({ onAccepted, onLogout }) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleContinue() {
    if (!accepted) {
      setError("Marque a caixinha pra continuar.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await apiRequest("/api/auth/accept-terms", { method: "POST" });
      onAccepted(data.user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div style={screenStyle}>
      <div style={cardStyle}>
        <AuthLogo />
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#292524", margin: "8px 0 8px" }}>Termos de Uso e Privacidade</h2>
        <p style={{ fontSize: 13, color: "#57534e", lineHeight: 1.55, margin: "0 0 14px" }}>
          Publicamos os Termos de Uso e a Política de Privacidade do Precifica, explicando como seus dados e os dados
          dos seus pacientes são guardados e protegidos. Pra continuar usando, leia e aceite.
        </p>
        {error && <div style={errorBoxStyle}>{error}</div>}
        <TermsCheckbox checked={accepted} onChange={setAccepted} />
        <button type="button" onClick={handleContinue} disabled={busy} style={buttonStyle}>
          {busy ? "Salvando..." : "Continuar"}
        </button>
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button type="button" onClick={onLogout} style={linkStyle}>
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
