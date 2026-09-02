import { useState, useEffect } from "react";
import { getToken, clearToken, apiRequest } from "./api";
import Login from "./screens/Login";
import Register from "./screens/Register";
import Buy from "./screens/Buy";
import VerifyEmail from "./screens/VerifyEmail";
import ForgotPassword from "./screens/ForgotPassword";
import ResetPassword from "./screens/ResetPassword";
import LicenseBlocked from "./screens/LicenseBlocked";
import AdminDashboard from "./AdminDashboard";
import TrialBanner from "./TrialBanner";
import { AccountContext } from "./AccountContext";

const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // revalida a sessão/licença a cada 6 horas

// Lê ?ativar=XXXXXXXXXXXXXXXX da URL (o link que vai no e-mail de compra) e
// devolve os 4 blocos de 4 caracteres, prontos pro campo de chave de licença.
function readLicenseCodeFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("ativar");
    if (!raw) return null;
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (cleaned.length !== 16) return null;
    return [cleaned.slice(0, 4), cleaned.slice(4, 8), cleaned.slice(8, 12), cleaned.slice(12, 16)];
  } catch (e) {
    return null;
  }
}

// Lê ?email=... da URL (o e-mail de quem comprou, incluído no mesmo link
// do e-mail de compra) — usado pra pré-preencher e travar o campo de e-mail
// na tela de ativação, já que é esse o e-mail que tem direito à chave.
function readEmailFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("email");
    if (!raw) return null;
    return decodeURIComponent(raw).trim();
  } catch (e) {
    return null;
  }
}

export default function AuthGate({ children }) {
  // checking | login | buy | register | verify | forgot | reset | app | admin | blocked
  const [screen, setScreen] = useState("checking");
  const [pendingEmail, setPendingEmail] = useState("");
  const [licenseReason, setLicenseReason] = useState(null);
  const [session, setSession] = useState(null); // { user, license }
  const [prefillLicenseCode, setPrefillLicenseCode] = useState(null);
  const [lockedEmail, setLockedEmail] = useState(null);

  function decideScreenFromSession(user, license) {
    setSession({ user, license });
    if (user.role === "admin") {
      setScreen("admin");
    } else if (license && license.valid) {
      setScreen("app");
    } else {
      setLicenseReason(license ? license.reason : "no_license");
      setScreen("blocked");
    }
  }

  async function checkSession() {
    const token = getToken();
    if (!token) {
      const urlCode = readLicenseCodeFromUrl();
      if (urlCode) {
        setPrefillLicenseCode(urlCode);
        setLockedEmail(readEmailFromUrl());
        // limpa o parâmetro da URL sem recarregar a página, pra não ficar
        // exposto na barra de endereço nem reaparecer se a pessoa atualizar
        window.history.replaceState({}, "", window.location.pathname);
        setScreen("register");
      } else {
        setScreen("login");
      }
      return;
    }
    try {
      const data = await apiRequest("/api/auth/me");
      decideScreenFromSession(data.user, data.license);
    } catch (err) {
      clearToken();
      setScreen("login");
    }
  }

  useEffect(() => {
    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (screen !== "app" && screen !== "admin") return;
    const interval = setInterval(checkSession, RECHECK_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  if (screen === "checking") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#78716c",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          fontSize: 14,
        }}
      >
        Carregando...
      </div>
    );
  }

  if (screen === "login") {
    return (
      <Login
        onLoggedIn={decideScreenFromSession}
        onGoRegister={() => setScreen("register")}
        onGoForgot={() => setScreen("forgot")}
        onGoBuy={() => setScreen("buy")}
        onNeedsVerification={(email) => {
          setPendingEmail(email);
          setScreen("verify");
        }}
      />
    );
  }

  if (screen === "buy") {
    return <Buy onBackToLogin={() => setScreen("login")} />;
  }

  if (screen === "register") {
    return (
      <Register
        initialLicenseCode={prefillLicenseCode}
        lockedEmail={lockedEmail}
        onRegistered={(email) => {
          setPendingEmail(email);
          setScreen("verify");
        }}
        onBackToLogin={() => setScreen("login")}
      />
    );
  }

  if (screen === "verify") {
    return <VerifyEmail email={pendingEmail} onVerified={decideScreenFromSession} onBackToLogin={() => setScreen("login")} />;
  }

  if (screen === "forgot") {
    return (
      <ForgotPassword
        onCodeSent={(email) => {
          setPendingEmail(email);
          setScreen("reset");
        }}
        onBackToLogin={() => setScreen("login")}
      />
    );
  }

  if (screen === "reset") {
    return <ResetPassword email={pendingEmail} onReset={() => setScreen("login")} onBackToLogin={() => setScreen("login")} />;
  }

  if (screen === "blocked") {
    return <LicenseBlocked reason={licenseReason} onLogout={() => setScreen("login")} />;
  }

  if (screen === "admin") {
    return (
      <AdminDashboard
        onLogout={() => {
          clearToken();
          setScreen("login");
        }}
      />
    );
  }

  // screen === "app"
  return (
    <AccountContext.Provider
      value={{
        user: session?.user,
        license: session?.license,
        onLogout: () => {
          clearToken();
          setScreen("login");
        },
      }}
    >
      {session?.license?.type === "trial" && <TrialBanner daysLeft={session.license.daysLeft} />}
      {children}
    </AccountContext.Provider>
  );
}
