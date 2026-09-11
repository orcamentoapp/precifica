import { useState, useEffect, Suspense, lazy } from "react";
import { getToken, clearToken, apiRequest } from "./api";
import Login from "./screens/Login";
import Register from "./screens/Register";
import Buy from "./screens/Buy";
import TrialSignup from "./screens/TrialSignup";
import VerifyEmail from "./screens/VerifyEmail";
import ForgotPassword from "./screens/ForgotPassword";
import ResetPassword from "./screens/ResetPassword";
import RenewalConfirm from "./screens/RenewalConfirm";
import LicenseBlocked from "./screens/LicenseBlocked";
// Carregado sob demanda — só quem é admin (uma pessoa só, o Marcelo) chega
// nessa tela; não faz sentido todo cliente baixar o código do painel admin
// junto do pacote principal do site.
const AdminDashboard = lazy(() => import("./AdminDashboard"));
import TrialBanner from "./TrialBanner";
import RenewalWarningBanner from "./RenewalWarningBanner";
import { AccountContext } from "./AccountContext";

const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // revalida a sessão/licença a cada 6 horas

// Cada tela de "antes de logar" ganha uma URL de verdade — dá pra
// compartilhar/favoritar um link direto (ex: "assine aqui:
// precifica.verterelabs.com/assinar" num anúncio), e o botão
// voltar/avançar do navegador passa a funcionar entre essas telas.
// Só as 4 que fazem sentido como "página de destino" própria — Verificar
// e-mail/Redefinir senha/Bloqueado são sempre alcançadas NO MEIO de um
// fluxo (dependem de um e-mail pendente em memória), não como link avulso.
const AUTH_SCREEN_TO_PATH = {
  login: "/login",
  register: "/ativar-licenca",
  forgot: "/esqueci-senha",
  buy: "/assinar",
  trial: "/teste-gratis",
};
const PATH_TO_AUTH_SCREEN = Object.fromEntries(Object.entries(AUTH_SCREEN_TO_PATH).map(([s, p]) => [p, s]));

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

// Lê ?checkout=sucesso ou ?checkout=cancelado da URL (o Stripe manda de
// volta pra cá depois do pagamento) — usado só pra mostrar um aviso
// certeiro na tela de login, já que quem acabou de pagar ainda não tem
// conta nenhuma (a chave de licença só chega por e-mail). Quando veio do
// teste grátis, o link tem "&plano=trial" junto — nesse caso não teve
// pagamento nenhum ainda (só o cartão foi coletado), então o aviso não
// pode dizer "pagamento confirmado".
// Lê ?goBuy=1 da URL — usado pelo botão "Renovar assinatura" (depois de
// cancelar o teste/assinatura), que desloga e manda pra cá pra abrir a
// tela de compra direto, sem passar pela tela de login primeiro.
function readGoBuyFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("goBuy") === "1";
  } catch (e) {
    return false;
  }
}

function readCheckoutStatusFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("checkout"); // "sucesso" | "cancelado" | null
    if (status === "sucesso" && params.get("plano") === "trial") return "sucesso-trial";
    return status;
  } catch (e) {
    return null;
  }
}

// Lê ?session_id=... da URL (o Stripe substitui {CHECKOUT_SESSION_ID} nesse
// parâmetro do success_url) — usado pra confirmar a compra direto na API do
// Stripe assim que a pessoa volta pro app, sem depender de nenhum webhook
// ter disparado ainda.
function readSessionIdFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("session_id");
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
  const [checkoutNotice, setCheckoutNotice] = useState(null); // "sucesso" | "cancelado" | null

  function decideScreenFromSession(user, license) {
    setCheckoutNotice(null);
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

  // Troca de tela por ação do usuário (clicar em "Ativar licença", "Voltar
  // pro login", etc.) — sempre limpa o aviso de checkout junto, pra ele não
  // ficar "grudado" na tela de login pra sempre. Diferente do setScreen bruto
  // usado dentro de checkSession(), que é só roteamento inicial (às vezes
  // precisa MANTER o aviso que acabou de setar). Também atualiza a URL pra
  // bater com a tela nova, quando ela tem uma rota própria (login, ativar
  // licença, esqueci senha, assinar) — assim o link na barra de endereço
  // sempre reflete onde a pessoa está, e o botão voltar do navegador funciona.
  function goToScreen(next) {
    setCheckoutNotice(null);
    setScreen(next);
    const path = AUTH_SCREEN_TO_PATH[next];
    if (path && window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
  }

  async function checkSession() {
    // "/renovacao-confirmada" é aberta numa aba/popup SEPARADA (pelo botão
    // "Renovar assinatura" dentro do app, já logado) — não é uma tela do
    // fluxo normal de login, então é checada ANTES de tudo o resto, mesmo
    // que exista um token válido guardado (a aba principal continua exatamente
    // onde estava; essa aba nova só confirma o pagamento e se fecha sozinha).
    if (window.location.pathname === "/renovacao-confirmada") {
      setScreen("renewal-confirm");
      return;
    }

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
      } else if (readGoBuyFromUrl()) {
        window.history.replaceState({}, "", window.location.pathname);
        setScreen("buy");
      } else {
        const checkoutStatus = readCheckoutStatusFromUrl();
        if (checkoutStatus) {
          setCheckoutNotice(checkoutStatus);
          const sessionId = readSessionIdFromUrl();
          window.history.replaceState({}, "", window.location.pathname);
          if (sessionId) {
            // Melhor esforço: não trava a tela de login por causa disso —
            // se falhar, o webhook (se algum dia estiver configurado
            // certo) ainda pode criar a licença por trás.
            apiRequest("/api/payments/stripe/confirm-checkout", {
              method: "POST",
              body: JSON.stringify({ sessionId }),
              skipAuth: true,
            }).catch(() => {});
          }
        }
        // Nenhum parâmetro especial — usa a rota da URL se for uma das
        // conhecidas (ex: alguém chegou direto em /assinar por um link de
        // anúncio), senão cai no login por padrão.
        setScreen(PATH_TO_AUTH_SCREEN[window.location.pathname] || "login");
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

  // Sincroniza com o botão voltar/avançar do navegador, entre as telas de
  // autenticação (login, ativar licença, esqueci senha, assinar) — só
  // importa enquanto ninguém logou ainda; depois de "app"/"admin", quem
  // cuida da navegação por URL é o App.jsx (as abas do sistema).
  useEffect(() => {
    function handlePopState() {
      if (getToken()) return;
      const mapped = PATH_TO_AUTH_SCREEN[window.location.pathname];
      if (mapped) {
        // Só atualiza o estado — NÃO chama goToScreen aqui, porque
        // goToScreen empurra uma entrada NOVA no histórico, e isso já é
        // uma reação ao usuário navegando pelo histórico (voltar/avançar).
        setCheckoutNotice(null);
        setScreen(mapped);
      }
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (screen !== "app" && screen !== "admin") return;
    const interval = setInterval(checkSession, RECHECK_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  if (screen === "renewal-confirm") {
    return <RenewalConfirm />;
  }

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
        checkoutNotice={checkoutNotice}
        onDismissNotice={() => setCheckoutNotice(null)}
        onLoggedIn={decideScreenFromSession}
        onGoRegister={() => goToScreen("register")}
        onGoForgot={() => goToScreen("forgot")}
        onGoBuy={() => goToScreen("buy")}
        onGoTrial={() => goToScreen("trial")}
        onNeedsVerification={(email) => {
          setPendingEmail(email);
          goToScreen("verify");
        }}
      />
    );
  }

  if (screen === "buy") {
    return <Buy onBackToLogin={() => goToScreen("login")} />;
  }

  if (screen === "trial") {
    return <TrialSignup onBackToLogin={() => goToScreen("login")} />;
  }

  if (screen === "register") {
    return (
      <Register
        initialLicenseCode={prefillLicenseCode}
        lockedEmail={lockedEmail}
        onRegistered={(email) => {
          setPendingEmail(email);
          goToScreen("verify");
        }}
        onBackToLogin={() => goToScreen("login")}
      />
    );
  }

  if (screen === "verify") {
    return <VerifyEmail email={pendingEmail} onVerified={decideScreenFromSession} onBackToLogin={() => goToScreen("login")} />;
  }

  if (screen === "forgot") {
    return (
      <ForgotPassword
        onCodeSent={(email) => {
          setPendingEmail(email);
          goToScreen("reset");
        }}
        onBackToLogin={() => goToScreen("login")}
      />
    );
  }

  if (screen === "reset") {
    return <ResetPassword email={pendingEmail} onReset={() => goToScreen("login")} onBackToLogin={() => goToScreen("login")} />;
  }

  if (screen === "blocked") {
    return <LicenseBlocked reason={licenseReason} onLogout={() => goToScreen("login")} />;
  }

  if (screen === "admin") {
    return (
      <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#78716c" }}>Carregando...</div>}>
        <AdminDashboard
          onLogout={() => {
            clearToken();
            goToScreen("login");
          }}
        />
      </Suspense>
    );
  }

  // screen === "app"
  return (
    <AccountContext.Provider
      value={{
        user: session?.user,
        license: session?.license,
        refreshSession: async () => {
          try {
            const data = await apiRequest("/api/auth/me");
            setSession({ user: data.user, license: data.license });
            return data.license;
          } catch (err) {
            return null;
          }
        },
        onLogout: () => {
          clearToken();
          goToScreen("login");
        },
      }}
    >
      {session?.license?.type === "trial" && <TrialBanner daysLeft={session.license.daysLeft} />}
      {session?.license &&
        session.license.type !== "trial" &&
        !session.license.hasStripeSubscription &&
        typeof session.license.daysLeft === "number" &&
        session.license.daysLeft <= 7 && (
          <RenewalWarningBanner daysLeft={session.license.daysLeft} plan={session.license.type} />
        )}
      {children}
    </AccountContext.Provider>
  );
}
