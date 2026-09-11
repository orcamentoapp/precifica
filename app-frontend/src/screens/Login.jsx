import { useState } from "react";
import { apiRequest, setToken } from "../api";
import { screenStyle, cardStyle, inputStyle, buttonStyle, linkStyle, errorBoxStyle, labelStyle, showHideBtnStyle } from "../authStyles";
import AuthLogo from "../AuthLogo";

const REMEMBERED_EMAIL_KEY = "precifica_remembered_email";

export default function Login({ checkoutNotice, onDismissNotice, onLoggedIn, onGoRegister, onGoForgot, onGoBuy, onGoTrial, onNeedsVerification }) {
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(REMEMBERED_EMAIL_KEY) || "";
    } catch (e) {
      return "";
    }
  });
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => {
    try {
      return !!localStorage.getItem(REMEMBERED_EMAIL_KEY);
    } catch (e) {
      return false;
    }
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [resendKeyOpen, setResendKeyOpen] = useState(false);
  const [resendKeyEmail, setResendKeyEmail] = useState("");
  const [resendKeySending, setResendKeySending] = useState(false);
  const [resendKeyMsg, setResendKeyMsg] = useState("");

  async function handleResendLicenseKey(e) {
    e.preventDefault();
    setResendKeySending(true);
    setResendKeyMsg("");
    try {
      await apiRequest("/api/auth/resend-license-key", {
        method: "POST",
        body: JSON.stringify({ email: resendKeyEmail.trim() }),
        skipAuth: true,
      });
      setResendKeyMsg("Se esse e-mail tiver uma chave pendente, ela foi reenviada. Confira sua caixa de entrada.");
    } catch (err) {
      setResendKeyMsg(err.message || "Não foi possível reenviar agora.");
    } finally {
      setResendKeySending(false);
    }
  }

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
      // Guarda só o e-mail (nunca a senha) — salvar senha em texto puro no
      // navegador é um risco de segurança real, não é feito aqui mesmo
      // marcando essa caixinha.
      try {
        if (rememberMe) localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
        else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      } catch (e) {}
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
        <AuthLogo />
        <p style={{ fontSize: 12.5, color: "#a8a29e", margin: "2px 0 22px", fontStyle: "italic", textAlign: "center" }}>
          Precifique seus procedimentos com inteligência.
        </p>

        {(checkoutNotice === "sucesso" || checkoutNotice === "sucesso-trial") && (
          <div
            style={{
              background: "#f0fdfa",
              border: "1px solid #99f6e4",
              color: "#0f766e",
              fontSize: 13,
              padding: "12px 14px",
              borderRadius: 8,
              marginBottom: 16,
              lineHeight: 1.5,
              position: "relative",
            }}
          >
            <button
              type="button"
              onClick={onDismissNotice}
              aria-label="Fechar aviso"
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                background: "none",
                border: "none",
                color: "#0f766e",
                fontSize: 16,
                lineHeight: 1,
                cursor: "pointer",
                padding: 4,
              }}
            >
              ×
            </button>
            <div style={{ paddingRight: 18 }}>
              {checkoutNotice === "sucesso-trial" ? (
                <>
                  <strong>Conta criada.</strong> Confira seu e-mail — mandamos sua chave de ativação por lá (pode
                  levar alguns minutos, olhe também o spam). Com a chave em mãos, clique em "Já tem uma chave de
                  licença?" logo abaixo.
                </>
              ) : (
                <>
                  <strong>Pagamento confirmado.</strong> Confira seu e-mail — mandamos sua chave de ativação por lá
                  (pode levar alguns minutos, olhe também o spam). Com a chave em mãos, clique em "Já tem uma chave de
                  licença?" logo abaixo.
                </>
              )}
            </div>

            {resendKeyOpen ? (
              <form onSubmit={handleResendLicenseKey} style={{ marginTop: 10 }}>
                <input
                  type="email"
                  value={resendKeyEmail}
                  onChange={(e) => setResendKeyEmail(e.target.value)}
                  placeholder="Seu e-mail"
                  required
                  style={{ ...inputStyle, fontSize: 13, padding: "8px 10px", marginBottom: 6 }}
                />
                <button
                  type="submit"
                  disabled={resendKeySending}
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: "#fff",
                    background: "#0f766e",
                    border: "none",
                    borderRadius: 6,
                    padding: "7px 12px",
                    cursor: resendKeySending ? "default" : "pointer",
                  }}
                >
                  {resendKeySending ? "Enviando..." : "Reenviar chave"}
                </button>
                {resendKeyMsg && <p style={{ fontSize: 12, marginTop: 6 }}>{resendKeyMsg}</p>}
              </form>
            ) : (
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setResendKeyOpen(true)}
                  style={{ fontSize: 12.5, fontWeight: 600, color: "#0f766e", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}
                >
                  Não recebeu a chave? Reenviar e-mail
                </button>
              </div>
            )}
          </div>
        )}
        {checkoutNotice === "cancelado" && (
          <div
            style={{
              background: "#fafaf9",
              border: "1px solid #e7e5e4",
              color: "#78716c",
              fontSize: 13,
              padding: "12px 14px",
              borderRadius: 8,
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            O pagamento foi cancelado, sem problema — pode tentar de novo quando quiser.
          </div>
        )}

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

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#57534e", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ width: 14, height: 14, cursor: "pointer" }}
              />
              Lembrar e-mail
            </label>
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
        <button
          type="button"
          onClick={onGoTrial}
          style={{
            display: "block",
            width: "100%",
            marginTop: 16,
            padding: "12px 12px",
            fontSize: 14,
            fontWeight: 700,
            color: "#fff",
            background: "linear-gradient(135deg, #f97316, #ea580c)",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            textAlign: "center",
            boxShadow: "0 2px 8px rgba(234,88,12,0.35)",
          }}
        >
          Teste grátis por 7 dias
        </button>
      </div>
    </div>
  );
}
