import { useState } from "react";
import { apiRequest, setToken } from "../api";
import { screenStyle, cardStyle, inputStyle, buttonStyle, linkStyle, errorBoxStyle, labelStyle } from "../authStyles";

export default function VerifyEmail({ email, onVerified, onBackToLogin }) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [resendMsg, setResendMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await apiRequest("/api/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ email, code: code.trim() }),
        skipAuth: true,
      });
      setToken(data.token);
      onVerified(data.user, data.license);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setResendMsg("");
    setError("");
    try {
      await apiRequest("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email }),
        skipAuth: true,
      });
      setResendMsg("Código reenviado. Confira sua caixa de entrada.");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={screenStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0f766e" }}>Confirme seu e-mail</div>
        <p style={{ fontSize: 13, color: "#78716c", margin: "6px 0 10px" }}>
          Enviamos um código de 6 dígitos pra <strong>{email}</strong>.
        </p>
        <p style={{ fontSize: 12, color: "#a8a29e", margin: "0 0 20px", lineHeight: 1.4 }}>
          Não achou na caixa de entrada? Dá uma olhada na pasta de <strong>spam</strong> ou lixo eletrônico —
          às vezes o e-mail cai lá.
        </p>

        {error && <div style={errorBoxStyle}>{error}</div>}
        {resendMsg && (
          <div style={{ ...errorBoxStyle, background: "#f0fdfa", border: "1px solid #99f6e4", color: "#0f766e" }}>
            {resendMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label style={labelStyle}>Código de confirmação</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="000000"
            style={{
              ...inputStyle,
              fontFamily: "'Courier New', monospace",
              letterSpacing: 4,
              textAlign: "center",
              fontSize: 20,
            }}
            maxLength={6}
            autoFocus
            required
          />

          <button type="submit" disabled={submitting} style={buttonStyle}>
            {submitting ? "Confirmando..." : "Confirmar"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "#78716c" }}>
          Não recebeu?{" "}
          <button type="button" onClick={handleResend} style={{ ...linkStyle, fontWeight: 600 }}>
            Reenviar código
          </button>
        </div>
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <button type="button" onClick={onBackToLogin} style={linkStyle}>
            Voltar pro login
          </button>
        </div>
      </div>
    </div>
  );
}
