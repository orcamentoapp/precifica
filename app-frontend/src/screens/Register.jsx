import { useState } from "react";
import { apiRequest } from "../api";
import { screenStyle, cardStyle, inputStyle, buttonStyle, linkStyle, errorBoxStyle, labelStyle } from "../authStyles";
import LicenseCodeInput from "../LicenseCodeInput";

export default function Register({ onRegistered, onBackToLogin, initialLicenseCode, lockedEmail }) {
  const [licenseGroups, setLicenseGroups] = useState(initialLicenseCode || ["", "", "", ""]);
  const [email, setEmail] = useState(lockedEmail || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const licenseCode = licenseGroups.join("-");
    if (licenseGroups.some((g) => g.length !== 4)) {
      setError("Preencha a chave de licença completa (4 blocos de 4 caracteres)");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não conferem");
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          licenseCode,
          email: email.trim(),
          password,
          confirmPassword,
        }),
        skipAuth: true,
      });
      onRegistered(email.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={screenStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0f766e" }}>Ativar licença</div>
        <p style={{ fontSize: 12.5, color: "#a8a29e", margin: "4px 0 20px" }}>
          Digite a chave que você recebeu e crie sua senha de acesso.
        </p>

        {initialLicenseCode && (
          <div
            style={{
              background: "#f0fdfa",
              border: "1px solid #99f6e4",
              color: "#0f766e",
              fontSize: 12.5,
              padding: "8px 12px",
              borderRadius: 8,
              marginBottom: 16,
              lineHeight: 1.4,
            }}
          >
            Chave preenchida automaticamente a partir do link do e-mail.
            {lockedEmail && " O e-mail abaixo também já veio preenchido — é o mesmo que recebeu a chave."}
          </div>
        )}

        {error && <div style={errorBoxStyle}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <label style={labelStyle}>Chave de licença</label>
          <LicenseCodeInput value={licenseGroups} onChange={setLicenseGroups} />
          <p style={{ fontSize: 11, color: "#a8a29e", margin: "5px 0 0" }}>
            Pode colar a chave inteira em qualquer um dos campos.
          </p>

          <label style={{ ...labelStyle, marginTop: 14 }}>E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => !lockedEmail && setEmail(e.target.value)}
            readOnly={Boolean(lockedEmail)}
            style={{
              ...inputStyle,
              ...(lockedEmail ? { background: "#f5f5f4", color: "#57534e", cursor: "not-allowed" } : {}),
            }}
            required
          />
          {lockedEmail && (
            <p style={{ fontSize: 11, color: "#a8a29e", margin: "5px 0 0" }}>
              Esse é o e-mail que recebeu a chave, por isso não pode ser alterado aqui. Comprou com outro e-mail?
              Entre em contato com o suporte.
            </p>
          )}

          <label style={{ ...labelStyle, marginTop: 12 }}>Senha</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            minLength={6}
            required
          />

          <label style={{ ...labelStyle, marginTop: 12 }}>Confirmar senha</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={inputStyle}
            minLength={6}
            required
          />

          <button type="submit" disabled={submitting} style={buttonStyle}>
            {submitting ? "Criando conta..." : "Criar conta"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#78716c" }}>
          Já tem conta?{" "}
          <button type="button" onClick={onBackToLogin} style={{ ...linkStyle, fontWeight: 600 }}>
            Entrar
          </button>
        </div>
      </div>
    </div>
  );
}
