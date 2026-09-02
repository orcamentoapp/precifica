import { useState } from "react";
import { apiRequest } from "../api";
import { screenStyle, cardStyle, inputStyle, buttonStyle, linkStyle, errorBoxStyle, labelStyle } from "../authStyles";

export default function ResetPassword({ email, onReset, onBackToLogin }) {
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("As senhas não conferem");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email, code: code.trim(), newPassword, confirmPassword }),
        skipAuth: true,
      });
      onReset();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={screenStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0f766e" }}>Redefinir senha</div>
        <p style={{ fontSize: 13, color: "#78716c", margin: "6px 0 6px" }}>
          Digite o código enviado pra <strong>{email}</strong> e sua nova senha.
        </p>
        <p style={{ fontSize: 12, color: "#a8a29e", margin: "0 0 20px", lineHeight: 1.4 }}>
          Não achou o e-mail? Confira também a pasta de <strong>spam</strong>.
        </p>

        {error && <div style={errorBoxStyle}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <label style={labelStyle}>Código</label>
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

          <label style={{ ...labelStyle, marginTop: 12 }}>Nova senha</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={inputStyle}
            minLength={6}
            required
          />

          <label style={{ ...labelStyle, marginTop: 12 }}>Confirmar nova senha</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={inputStyle}
            minLength={6}
            required
          />

          <button type="submit" disabled={submitting} style={buttonStyle}>
            {submitting ? "Salvando..." : "Redefinir senha"}
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
