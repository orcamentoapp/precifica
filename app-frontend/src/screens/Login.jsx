import { useState } from "react";
import { apiRequest, setToken } from "../api";
import { screenStyle, cardStyle, inputStyle, buttonStyle, linkStyle, errorBoxStyle, labelStyle, showHideBtnStyle } from "../authStyles";

export default function Login({ onLoggedIn, onGoRegister, onGoForgot, onGoBuy, onNeedsVerification }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
        skipAuth: true,
      });
      setToken(data.token);
      onLoggedIn(data.user, data.license);
    } catch (err) {
      if (err.data && err.data.needsVerification) {
        onNeedsVerification(err.data.email || email.trim());
        return;
      }
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={screenStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#0f766e", letterSpacing: "-0.02em" }}>Precifica</div>
        <p style={{ fontSize: 12.5, color: "#a8a29e", margin: "2px 0 22px", fontStyle: "italic" }}>
          Precifique seus procedimentos com inteligência.
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

          <label style={{ ...labelStyle, marginTop: 12 }}>Senha</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...inputStyle, paddingRight: 64 }}
              required
            />
            <button type="button" onClick={() => setShowPassword((v) => !v)} style={showHideBtnStyle}>
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
          </div>

          <div style={{ textAlign: "right", marginTop: 8 }}>
            <button type="button" onClick={onGoForgot} style={linkStyle}>
              Esqueceu a senha?
            </button>
          </div>

          <button type="submit" disabled={submitting} style={buttonStyle}>
            {submitting ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#78716c" }}>
          Já tem uma chave de licença?{" "}
          <button type="button" onClick={onGoRegister} style={{ ...linkStyle, fontWeight: 600 }}>
            Ativar licença
          </button>
        </div>
        <div style={{ textAlign: "center", marginTop: 8, fontSize: 13, color: "#78716c" }}>
          Ainda não é assinante?{" "}
          <button type="button" onClick={onGoBuy} style={{ ...linkStyle, fontWeight: 600 }}>
            Assinar agora
          </button>
        </div>
      </div>
    </div>
  );
}
