// Verificação em duas etapas da conta de ADMIN (aba "Configurações" do
// painel). Com ela ligada, entrar no admin exige a senha E um código de 6
// dígitos do app autenticador do celular (Google Authenticator, Microsoft
// Authenticator, Authy...). Mesmo que alguém descubra a senha, não entra.
//
// Perdeu o celular? Ver HANDOFF/README: variável ADMIN_RESET_2FA_EMAIL no
// Railway desliga a verificação dessa conta no próximo deploy.
import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { apiRequest } from "./api";

const inputClass =
  "w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 bg-white";

export default function AdminSecurityCard({ showToast }) {
  const [enabled, setEnabled] = useState(null); // null = carregando
  const [setup, setSetup] = useState(null); // { qrDataUrl, secret }
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [disableOpen, setDisableOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest("/api/auth/me")
      .then((d) => setEnabled(!!(d && d.user && d.user.twoFactorEnabled)))
      .catch(() => setEnabled(false));
  }, []);

  async function startSetup() {
    setBusy(true);
    setError("");
    try {
      const data = await apiRequest("/api/auth/2fa/setup", { method: "POST" });
      setSetup(data);
      setCode("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/auth/2fa/enable", { method: "POST", body: JSON.stringify({ code }) });
      setEnabled(true);
      setSetup(null);
      setCode("");
      showToast && showToast("Verificação em duas etapas ligada.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDisable(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/auth/2fa/disable", { method: "POST", body: JSON.stringify({ password, code }) });
      setEnabled(false);
      setDisableOpen(false);
      setPassword("");
      setCode("");
      showToast && showToast("Verificação em duas etapas desligada.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 mt-4">
      <h2 className="text-sm font-semibold text-stone-700 mb-1 inline-flex items-center gap-1.5">
        {enabled ? <ShieldCheck className="w-4 h-4 text-teal-700" /> : <ShieldAlert className="w-4 h-4 text-amber-600" />}
        Verificação em duas etapas
      </h2>
      {enabled === null ? (
        <div className="text-xs text-stone-400 py-4">Carregando...</div>
      ) : enabled ? (
        <>
          <p className="text-xs text-teal-700 mb-3 leading-relaxed">
            Ligada. Pra entrar no painel admin é preciso a senha e o código do app autenticador.
          </p>
          {error && <div className="text-xs text-rose-600 mb-2">{error}</div>}
          {!disableOpen ? (
            <button
              type="button"
              onClick={() => {
                setDisableOpen(true);
                setError("");
              }}
              className="text-xs font-medium text-rose-600 hover:underline"
            >
              Desligar
            </button>
          ) : (
            <form onSubmit={confirmDisable} className="space-y-2">
              <input
                type="password"
                placeholder="Sua senha"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="Código do app (6 dígitos)"
                className={inputClass}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg py-2 transition disabled:opacity-50"
              >
                {busy ? "Desligando..." : "Confirmar e desligar"}
              </button>
            </form>
          )}
        </>
      ) : !setup ? (
        <>
          <p className="text-xs text-amber-700 mb-3 leading-relaxed">
            <strong>Recomendado:</strong> a conta de admin controla todas as licenças e clientes. Ligue a verificação
            em duas etapas pra que só a senha não baste pra entrar.
          </p>
          {error && <div className="text-xs text-rose-600 mb-2">{error}</div>}
          <button
            type="button"
            onClick={startSetup}
            disabled={busy}
            className="w-full text-sm font-semibold bg-teal-700 text-white rounded-lg py-2.5 hover:bg-teal-800 transition disabled:opacity-50"
          >
            {busy ? "Preparando..." : "Ligar verificação em duas etapas"}
          </button>
        </>
      ) : (
        <form onSubmit={confirmEnable}>
          <ol className="text-xs text-stone-600 leading-relaxed list-decimal pl-4 mb-3 space-y-1">
            <li>Instale um app autenticador no celular (Google Authenticator, Microsoft Authenticator ou Authy).</li>
            <li>No app, toque em "+" e escaneie o QR code abaixo.</li>
            <li>Digite o código de 6 dígitos que aparecer no app.</li>
          </ol>
          <div className="flex justify-center mb-2">
            <img src={setup.qrDataUrl} alt="QR code da verificação em duas etapas" width={180} height={180} />
          </div>
          <p className="text-[11px] text-stone-400 text-center mb-3 break-all">
            Sem câmera? Digite esta chave no app: <span className="font-mono text-stone-600">{setup.secret}</span>
          </p>
          {error && <div className="text-xs text-rose-600 mb-2">{error}</div>}
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="Código de 6 dígitos"
            className={inputClass + " text-center tracking-[0.4em] mb-3"}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
          />
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="w-full text-sm font-semibold bg-teal-700 text-white rounded-lg py-2.5 hover:bg-teal-800 transition disabled:opacity-50"
          >
            {busy ? "Confirmando..." : "Confirmar e ligar"}
          </button>
          <button type="button" onClick={() => setSetup(null)} className="w-full text-xs text-stone-500 mt-2 hover:underline">
            Cancelar
          </button>
        </form>
      )}
    </div>
  );
}
