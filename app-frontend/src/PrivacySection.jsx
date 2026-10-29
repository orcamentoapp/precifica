// Seção "Privacidade e segurança" em Configurações (LGPD + segurança):
// - trocar a senha (derruba as sessões dos outros aparelhos);
// - baixar todos os meus dados (portabilidade/acesso — LGPD art. 18);
// - excluir minha conta (eliminação — LGPD art. 18; também cancela a
//   assinatura no Stripe pra não continuar cobrando);
// - links pros Termos de Uso e Política de Privacidade.
import { useState } from "react";
import { Lock, Download, Trash2, FileText } from "lucide-react";
import { apiRequest, getToken, setToken, clearToken, getSavedAccounts, saveAccount, removeSavedAccount } from "./api";

const inputClass =
  "w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 bg-white";

export default function PrivacySection({ Section, email }) {
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwMsg, setPwMsg] = useState(null);
  const [pwBusy, setPwBusy] = useState(false);

  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState("");

  const [delOpen, setDelOpen] = useState(false);
  const [delPassword, setDelPassword] = useState("");
  const [delConfirm, setDelConfirm] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState("");

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwBusy(true);
    setPwMsg(null);
    try {
      const data = await apiRequest("/api/auth/change-password", { method: "POST", body: JSON.stringify(pw) });
      // Token novo pra ESTE aparelho continuar logado (os outros caem).
      if (data && data.token) {
        setToken(data.token);
        if (email && getSavedAccounts().some((a) => a.email === email)) saveAccount(email, data.token);
      }
      setPw({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPwMsg({ ok: true, text: "Senha trocada. Os outros aparelhos conectados nessa conta foram desconectados." });
    } catch (err) {
      setPwMsg({ ok: false, text: err.message });
    } finally {
      setPwBusy(false);
    }
  }

  async function handleExport() {
    setExportBusy(true);
    setExportMsg("");
    try {
      const res = await fetch("/api/auth/export", { headers: { Authorization: "Bearer " + getToken() } });
      if (!res.ok) throw new Error("Não foi possível gerar o arquivo agora.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `precifica-meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setExportMsg("Arquivo baixado.");
    } catch (err) {
      setExportMsg(err.message);
    } finally {
      setExportBusy(false);
    }
  }

  async function handleDelete(e) {
    e.preventDefault();
    if (delConfirm.trim().toUpperCase() !== "EXCLUIR") {
      setDelError('Digite EXCLUIR pra confirmar.');
      return;
    }
    setDelBusy(true);
    setDelError("");
    try {
      await apiRequest("/api/auth/delete-account", { method: "POST", body: JSON.stringify({ password: delPassword }) });
      if (email) removeSavedAccount(email);
      clearToken();
      window.location.href = "/?conta=excluida";
    } catch (err) {
      setDelError(err.message);
      setDelBusy(false);
    }
  }

  return (
    <Section id="sub-privacidade" icon={<Lock className="w-4 h-4 text-teal-700" />} title="Privacidade e segurança">
      <div className="space-y-3">
        {/* Trocar senha */}
        <div>
          <button
            type="button"
            onClick={() => setPwOpen((v) => !v)}
            className="w-full text-xs font-medium text-stone-700 border border-stone-200 rounded-lg py-2 hover:bg-stone-50 transition"
          >
            Trocar senha
          </button>
          {pwOpen && (
            <form onSubmit={handleChangePassword} className="mt-2 space-y-2">
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Senha atual"
                className={inputClass}
                value={pw.currentPassword}
                onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
                required
              />
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Nova senha (mínimo 8 caracteres)"
                minLength={8}
                className={inputClass}
                value={pw.newPassword}
                onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
                required
              />
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Confirme a nova senha"
                minLength={8}
                className={inputClass}
                value={pw.confirmPassword}
                onChange={(e) => setPw({ ...pw, confirmPassword: e.target.value })}
                required
              />
              {pwMsg && <p className={`text-xs ${pwMsg.ok ? "text-teal-700" : "text-rose-600"}`}>{pwMsg.text}</p>}
              <button
                type="submit"
                disabled={pwBusy}
                className="w-full text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg py-2 transition disabled:opacity-50"
              >
                {pwBusy ? "Salvando..." : "Salvar nova senha"}
              </button>
            </form>
          )}
        </div>

        {/* Exportar dados */}
        <div>
          <button
            type="button"
            onClick={handleExport}
            disabled={exportBusy}
            className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-stone-700 border border-stone-200 rounded-lg py-2 hover:bg-stone-50 transition disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" /> {exportBusy ? "Gerando arquivo..." : "Baixar todos os meus dados"}
          </button>
          <p className="text-[11px] text-stone-400 mt-1 leading-relaxed">
            Um arquivo com tudo que o Precifica guarda da sua conta: perfil, procedimentos, materiais, pacientes e
            orçamentos.
          </p>
          {exportMsg && <p className="text-xs text-stone-500 mt-1">{exportMsg}</p>}
        </div>

        {/* Termos */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <a href="/termos.html" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-teal-700 hover:underline">
            <FileText className="w-3.5 h-3.5" /> Termos de Uso
          </a>
          <a href="/privacidade.html" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-teal-700 hover:underline">
            <FileText className="w-3.5 h-3.5" /> Política de Privacidade
          </a>
        </div>

        {/* Excluir conta */}
        <div className="pt-2">
          {!delOpen ? (
            <button
              type="button"
              onClick={() => setDelOpen(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-rose-600 border border-rose-200 rounded-lg py-2 hover:bg-rose-50 transition"
            >
              <Trash2 className="w-3.5 h-3.5" /> Excluir minha conta
            </button>
          ) : (
            <form onSubmit={handleDelete} className="border border-rose-200 bg-rose-50/50 rounded-xl p-3 space-y-2">
              <p className="text-xs text-rose-700 leading-relaxed">
                <strong>Isso não tem volta.</strong> Sua conta e todos os seus dados (procedimentos, materiais,
                pacientes, orçamentos) serão apagados, e a assinatura será cancelada na hora, sem novas cobranças. Se
                quiser guardar uma cópia, baixe seus dados antes.
              </p>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Sua senha"
                className={inputClass}
                value={delPassword}
                onChange={(e) => setDelPassword(e.target.value)}
                required
              />
              <input
                type="text"
                placeholder='Digite EXCLUIR pra confirmar'
                className={inputClass}
                value={delConfirm}
                onChange={(e) => setDelConfirm(e.target.value)}
                required
              />
              {delError && <p className="text-xs text-rose-600">{delError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDelOpen(false);
                    setDelError("");
                  }}
                  className="flex-1 text-xs font-medium text-stone-600 border border-stone-200 rounded-lg py-2 hover:bg-white transition"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={delBusy}
                  className="flex-1 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg py-2 transition disabled:opacity-50"
                >
                  {delBusy ? "Excluindo..." : "Excluir definitivamente"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </Section>
  );
}
