import { useState } from "react";
import { apiRequest } from "../api";
import { screenStyle, cardStyle, inputStyle, buttonStyle, linkStyle, errorBoxStyle, labelStyle } from "../authStyles";

export default function ForgotPassword({ onCodeSent, onBackToLogin }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await apiRequest("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
        skipAuth: true,
      });
      onCodeSent(email.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={screenStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0f766e" }}>Esqueceu a senha?</div>
        <p style={{ fontSize: 13, color: "#78716c", margin: "6px 0 20px" }}>
          Digite seu e-mail que enviamos um código pra redefinir a senha.
        </p>

        {error && <div style={errorBoxStyle}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <label style={labelStyle}>E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            autoFocus
            required
          />

          <button type="submit" disabled={submitting} style={buttonStyle}>
            {submitting ? "Enviando..." : "Enviar código"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button type="button" onClick={onBackToLogin} style={linkStyle}>
            Voltar pro login
          </button>
        </div>
      </div>
    </div>
  );
}
