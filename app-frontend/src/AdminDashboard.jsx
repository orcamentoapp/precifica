import { useState, useEffect } from "react";
import { apiRequest, clearToken } from "./api";

function StatusBadge({ children, tone }) {
  const tones = {
    teal: "bg-teal-50 text-teal-700 border-teal-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    stone: "bg-stone-100 text-stone-500 border-stone-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${tones[tone]}`}>
      {children}
    </span>
  );
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString("pt-BR") : "—";
}

// Rótulo + cor de cada tipo de licença, usado tanto na aba Usuários quanto na aba Chaves.
function licenseTypeInfo(type) {
  if (type === "trial") return { label: "TRIAL", tone: "amber", badge: "Trial · 7d" };
  if (type === "annual") return { label: "ANUAL", tone: "indigo", badge: "Anual · 365d" };
  return { label: "MENSAL", tone: "teal", badge: "Mensal · 30d" };
}

function licenseBadge(user) {
  if (!user.license_code) return <StatusBadge tone="stone">Sem licença</StatusBadge>;
  if (user.status === "blocked") return <StatusBadge tone="rose">Conta bloqueada</StatusBadge>;
  if (user.license_status === "revoked") return <StatusBadge tone="rose">Revogada</StatusBadge>;
  const daysLeft = user.license_expires_at
    ? Math.ceil((new Date(user.license_expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null;
  if (user.license_status === "expired" || (daysLeft !== null && daysLeft < 0)) {
    return <StatusBadge tone="rose">Expirada</StatusBadge>;
  }
  if (daysLeft !== null && daysLeft <= 5) return <StatusBadge tone="amber">Expira em {daysLeft}d</StatusBadge>;
  return <StatusBadge tone="teal">Ativa · {daysLeft}d restantes</StatusBadge>;
}

// De onde a licença veio e qual forma de pagamento (quando aplicável).
// Licenças criadas depois da coluna `source` existir já vêm com o valor
// certo direto do banco; pra licenças mais antigas (source == null), infere
// pelos campos que já existiam antes: se tem stripe_subscription_id, veio do
// Stripe; senão, se tem buyer_email, veio de uma compra (só sobra o Mercado
// Pago, já que o Stripe sempre grava o subscription_id também); sem nenhum
// dos dois, foi gerada manualmente no painel admin.
function licenseOriginInfo(lic) {
  const source = lic.source || (lic.stripe_subscription_id ? "stripe" : lic.buyer_email ? "mercadopago" : "admin");
  if (source === "stripe") {
    return { label: "Compra", detail: "Cartão (assinatura Stripe)", tone: "indigo" };
  }
  if (source === "mercadopago") {
    return { label: "Compra", detail: "Pix / Boleto / Cartão avulso", tone: "teal" };
  }
  return { label: "Painel admin", detail: "Gerada manualmente", tone: "stone" };
}

export default function AdminDashboard({ onLogout }) {
  const [tab, setTab] = useState("users"); // users | licenses
  const [users, setUsers] = useState([]);
  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newLicenseModal, setNewLicenseModal] = useState(null); // { code, expires... } | null
  const [renewModal, setRenewModal] = useState(null); // licenseId | null
  const [toast, setToast] = useState("");

  async function loadUsers() {
    try {
      const data = await apiRequest("/api/admin/users");
      setUsers(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadLicenses() {
    try {
      const data = await apiRequest("/api/admin/licenses");
      setLicenses(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadAll() {
    setLoading(true);
    setError("");
    await Promise.all([loadUsers(), loadLicenses()]);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  async function handleGenerateLicense(type) {
    try {
      const license = await apiRequest("/api/admin/licenses", {
        method: "POST",
        body: JSON.stringify({ type }),
      });
      setNewLicenseModal(license);
      loadLicenses();
    } catch (err) {
      showToast("Erro: " + err.message);
    }
  }

  async function handleRenew(licenseId, days) {
    try {
      await apiRequest(`/api/admin/licenses/${licenseId}/renew`, {
        method: "POST",
        body: JSON.stringify({ days }),
      });
      showToast(`Licença renovada (+${days} dias).`);
      setRenewModal(null);
      loadAll();
    } catch (err) {
      showToast("Erro: " + err.message);
    }
  }

  async function handleRevoke(licenseId) {
    try {
      await apiRequest(`/api/admin/licenses/${licenseId}/revoke`, { method: "POST" });
      showToast("Licença revogada.");
      loadAll();
    } catch (err) {
      showToast("Erro: " + err.message);
    }
  }

  async function handleToggleUserStatus(user) {
    const newStatus = user.status === "blocked" ? "active" : "blocked";
    try {
      await apiRequest(`/api/admin/users/${user.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: newStatus }),
      });
      showToast(newStatus === "blocked" ? "Usuário bloqueado." : "Usuário reativado.");
      loadAll();
    } catch (err) {
      showToast("Erro: " + err.message);
    }
  }

  const [confirmDeleteUser, setConfirmDeleteUser] = useState(null);
  async function handleDeleteUser(user) {
    if (confirmDeleteUser !== user.id) {
      setConfirmDeleteUser(user.id);
      setTimeout(() => setConfirmDeleteUser((v) => (v === user.id ? null : v)), 3000);
      return;
    }
    try {
      await apiRequest(`/api/admin/users/${user.id}`, { method: "DELETE" });
      showToast("Usuário removido.");
      setConfirmDeleteUser(null);
      loadAll();
    } catch (err) {
      showToast("Erro: " + err.message);
    }
  }

  const [confirmDeleteLicense, setConfirmDeleteLicense] = useState(null);
  async function handleDeleteLicense(license) {
    if (confirmDeleteLicense !== license.id) {
      setConfirmDeleteLicense(license.id);
      setTimeout(() => setConfirmDeleteLicense((v) => (v === license.id ? null : v)), 3000);
      return;
    }
    try {
      await apiRequest(`/api/admin/licenses/${license.id}`, { method: "DELETE" });
      showToast("Chave removida.");
      setConfirmDeleteLicense(null);
      loadLicenses();
    } catch (err) {
      showToast("Erro: " + err.message);
    }
  }

  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      showToast("Código copiado.");
    } catch (e) {
      showToast("Não foi possível copiar automaticamente.");
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 font-sans">
      <div className="max-w-5xl mx-auto px-5 py-8">
        <header className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div>
            <div className="text-lg font-extrabold text-teal-700">Precifica</div>
            <p className="text-xs text-stone-400 mt-0.5">Painel administrativo</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleGenerateLicense("monthly")}
              className="text-xs font-semibold bg-teal-700 text-white px-3 py-2 rounded-lg hover:bg-teal-800 transition"
            >
              + Chave mensal (30d)
            </button>
            <button
              onClick={() => handleGenerateLicense("trial")}
              className="text-xs font-semibold bg-amber-600 text-white px-3 py-2 rounded-lg hover:bg-amber-700 transition"
            >
              + Chave trial (7d)
            </button>
            <button
              onClick={() => handleGenerateLicense("annual")}
              className="text-xs font-semibold bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 transition"
            >
              + Chave anual (365d)
            </button>
            <button
              onClick={() => {
                clearToken();
                onLogout();
              }}
              className="text-xs font-medium text-stone-500 border border-stone-200 px-3 py-2 rounded-lg hover:bg-stone-100 transition"
            >
              Sair
            </button>
          </div>
        </header>

        <div className="flex items-center gap-1.5 mb-5">
          <button
            onClick={() => setTab("users")}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
              tab === "users" ? "border-teal-400 bg-teal-50 text-teal-800" : "border-stone-200 text-stone-500"
            }`}
          >
            Usuários
          </button>
          <button
            onClick={() => setTab("licenses")}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
              tab === "licenses" ? "border-teal-400 bg-teal-50 text-teal-800" : "border-stone-200 text-stone-500"
            }`}
          >
            Chaves de licença
          </button>
        </div>

        {error && <div className="text-sm text-rose-600 mb-4">{error}</div>}

        {loading ? (
          <div className="text-sm text-stone-400 py-16 text-center">Carregando...</div>
        ) : tab === "users" ? (
          <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-stone-400 border-b border-stone-100">
                    <th className="px-5 py-2 font-medium">E-mail</th>
                    <th className="px-3 py-2 font-medium">Nome / Clínica</th>
                    <th className="px-3 py-2 font-medium">Cliente desde</th>
                    <th className="px-3 py-2 font-medium">Conta</th>
                    <th className="px-3 py-2 font-medium">Licença</th>
                    <th className="px-3 py-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-stone-400">
                        Nenhum usuário cadastrado ainda.
                      </td>
                    </tr>
                  )}
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="px-5 py-3">
                        <div className="font-medium text-stone-800">{user.email}</div>
                        {!user.email_verified && (
                          <div className="text-xs text-amber-600 mt-0.5">E-mail não confirmado</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-stone-600">
                        {user.name || "—"}
                        {user.clinic_name && <div className="text-xs text-stone-400">{user.clinic_name}</div>}
                      </td>
                      <td className="px-3 py-3 text-stone-500 text-xs">{formatDate(user.created_at)}</td>
                      <td className="px-3 py-3">
                        {user.status === "blocked" ? (
                          <StatusBadge tone="rose">Bloqueada</StatusBadge>
                        ) : (
                          <StatusBadge tone="teal">Ativa</StatusBadge>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {user.license_code && (
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className="font-mono text-xs bg-stone-100 rounded px-1.5 py-0.5 inline-block">
                              {user.license_code}
                            </div>
                            <span
                              className={`text-[10px] font-semibold ${
                                licenseTypeInfo(user.license_type).tone === "amber"
                                  ? "text-amber-600"
                                  : licenseTypeInfo(user.license_type).tone === "indigo"
                                  ? "text-indigo-600"
                                  : "text-teal-600"
                              }`}
                            >
                              {licenseTypeInfo(user.license_type).label}
                            </span>
                          </div>
                        )}
                        <div>{licenseBadge(user)}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {user.license_id && (
                            <>
                              <button
                                onClick={() => setRenewModal(user.license_id)}
                                className="text-xs font-medium border border-stone-200 px-2 py-1 rounded-lg hover:bg-stone-50"
                              >
                                Renovar
                              </button>
                              <button
                                onClick={() => handleRevoke(user.license_id)}
                                className="text-xs font-medium border border-stone-200 px-2 py-1 rounded-lg hover:bg-stone-50"
                              >
                                Revogar
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleToggleUserStatus(user)}
                            className="text-xs font-medium border border-stone-200 px-2 py-1 rounded-lg hover:bg-stone-50"
                          >
                            {user.status === "blocked" ? "Reativar" : "Bloquear"}
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user)}
                            className={`text-xs font-medium border px-2 py-1 rounded-lg ${
                              confirmDeleteUser === user.id
                                ? "border-rose-600 text-rose-600"
                                : "border-stone-200 text-rose-500 hover:bg-stone-50"
                            }`}
                          >
                            {confirmDeleteUser === user.id ? "Confirmar?" : "Remover"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-stone-400 border-b border-stone-100">
                    <th className="px-5 py-2 font-medium">Código</th>
                    <th className="px-3 py-2 font-medium">Tipo</th>
                    <th className="px-3 py-2 font-medium">Dono</th>
                    <th className="px-3 py-2 font-medium">Origem</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Validade</th>
                    <th className="px-3 py-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {licenses.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-10 text-center text-stone-400">
                        Nenhuma chave gerada ainda. Clique em "+ Chave mensal" ou "+ Chave trial".
                      </td>
                    </tr>
                  )}
                  {licenses.map((lic) => (
                    <tr key={lic.id}>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => copyCode(lic.code)}
                          className="font-mono text-xs bg-stone-100 rounded px-1.5 py-0.5 hover:bg-stone-200"
                          title="Clique pra copiar"
                        >
                          {lic.code}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge tone={licenseTypeInfo(lic.type).tone}>{licenseTypeInfo(lic.type).badge}</StatusBadge>
                      </td>
                      <td className="px-3 py-3 text-stone-600">{lic.user_email || "— (ainda não usada)"}</td>
                      <td className="px-3 py-3">
                        <div className="text-xs font-medium text-stone-700">{licenseOriginInfo(lic).label}</div>
                        <div className="text-[11px] text-stone-400">{licenseOriginInfo(lic).detail}</div>
                      </td>
                      <td className="px-3 py-3">
                        {lic.status === "unused" && <StatusBadge tone="stone">Não usada</StatusBadge>}
                        {lic.status === "active" && <StatusBadge tone="teal">Ativa</StatusBadge>}
                        {lic.status === "expired" && <StatusBadge tone="rose">Expirada</StatusBadge>}
                        {lic.status === "revoked" && <StatusBadge tone="rose">Revogada</StatusBadge>}
                      </td>
                      <td className="px-3 py-3 text-stone-500 text-xs">
                        {lic.expires_at ? new Date(lic.expires_at).toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {lic.status !== "unused" && lic.user_id && (
                            <>
                              <button
                                onClick={() => setRenewModal(lic.id)}
                                className="text-xs font-medium border border-stone-200 px-2 py-1 rounded-lg hover:bg-stone-50"
                              >
                                Renovar
                              </button>
                              <button
                                onClick={() => handleRevoke(lic.id)}
                                className="text-xs font-medium border border-stone-200 px-2 py-1 rounded-lg hover:bg-stone-50"
                              >
                                Revogar
                              </button>
                            </>
                          )}
                          {!lic.user_id && (
                            <button
                              onClick={() => handleDeleteLicense(lic)}
                              className={`text-xs font-medium border px-2 py-1 rounded-lg ${
                                confirmDeleteLicense === lic.id
                                  ? "border-rose-600 text-rose-600"
                                  : "border-stone-200 text-rose-500 hover:bg-stone-50"
                              }`}
                            >
                              {confirmDeleteLicense === lic.id ? "Confirmar?" : "Remover"}
                            </button>
                          )}
                          {lic.user_id && (
                            <button
                              onClick={() => handleDeleteUser({ id: lic.user_id })}
                              className={`text-xs font-medium border px-2 py-1 rounded-lg ${
                                confirmDeleteUser === lic.user_id
                                  ? "border-rose-600 text-rose-600"
                                  : "border-stone-200 text-rose-500 hover:bg-stone-50"
                              }`}
                              title="Exclui a conta do usuário dono dessa chave"
                            >
                              {confirmDeleteUser === lic.user_id ? "Confirmar?" : "Excluir conta"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {newLicenseModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={() => setNewLicenseModal(null)}
        >
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-stone-800 mb-1">Chave gerada</h2>
            <p className="text-xs text-stone-500 mb-3">
              Copie essa chave e envie pro cliente. Ele vai usar pra criar a conta dele.
            </p>
            <div className="font-mono text-sm bg-stone-100 rounded-lg px-3 py-2.5 text-center mb-4">
              {newLicenseModal.code}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => copyCode(newLicenseModal.code)}
                className="text-xs font-medium border border-stone-200 px-3 py-2 rounded-lg hover:bg-stone-50"
              >
                Copiar código
              </button>
              <button
                onClick={() => setNewLicenseModal(null)}
                className="text-xs font-semibold bg-teal-700 text-white px-3 py-2 rounded-lg hover:bg-teal-800"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {renewModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setRenewModal(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-stone-800 mb-1">Renovar licença</h2>
            <p className="text-xs text-stone-500 mb-4">Quantos dias você quer adicionar a partir de hoje?</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button
                onClick={() => handleRenew(renewModal, 30)}
                className="text-sm font-semibold border border-teal-200 text-teal-700 rounded-xl py-3 hover:bg-teal-50 transition"
              >
                +30 dias
              </button>
              <button
                onClick={() => handleRenew(renewModal, 365)}
                className="text-sm font-semibold border border-indigo-200 text-indigo-700 rounded-xl py-3 hover:bg-indigo-50 transition"
              >
                +365 dias
              </button>
            </div>
            <button
              onClick={() => setRenewModal(null)}
              className="w-full text-xs font-medium text-stone-500 py-2 hover:text-stone-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-xs px-4 py-2 rounded-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
