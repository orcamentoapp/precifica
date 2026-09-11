import { useState, useEffect } from "react";
import { apiRequest, clearToken } from "./api";
import {
  Sun,
  Moon,
  Users,
  Activity,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  UserPlus,
  Percent,
  MoreVertical,
} from "lucide-react";

function StatusBadge({ children, tone }) {
  const tones = {
    teal: "bg-teal-50 text-teal-700 border-teal-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    stone: "bg-stone-100 text-stone-500 border-stone-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
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

function money(value) {
  return `R$ ${(Number(value) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Card de métrica da Visão Geral — ícone colorido + rótulo + valor. As
// cores (teal/amber/rose/indigo) já têm override de modo escuro pronto no
// index.css (mesmo usado no resto do app), então esse card funciona nos
// dois temas sem precisar de nenhuma classe condicional extra.
function StatCard({ icon: Icon, tone, label, value, hint }) {
  const toneClasses = {
    teal: "bg-teal-50 text-teal-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    indigo: "bg-indigo-50 text-indigo-700",
  };
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-4" title={hint}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${toneClasses[tone]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-xs text-stone-500 mb-1">{label}</div>
      <div className="text-xl font-bold text-stone-800">{value}</div>
    </div>
  );
}

// Rótulo + cor de cada tipo de licença, usado tanto na aba Usuários quanto na aba Chaves.
function licenseTypeInfo(type) {
  if (type === "trial") return { label: "TRIAL", tone: "amber", badge: "Trial · 7d" };
  if (type === "annual") return { label: "ANUAL", tone: "indigo", badge: "Anual · 365d" };
  if (type === "lifetime") return { label: "VITALÍCIA", tone: "violet", badge: "Vitalícia" };
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
  return { label: "Admin", detail: "Gerada manualmente", tone: "stone" };
}

// Mesma lógica de origem, só que a partir das colunas prefixadas "license_"
// que a rota GET /users devolve (em vez das colunas cruas de GET /licenses).
function userLicenseOriginInfo(user) {
  return licenseOriginInfo({
    source: user.license_source,
    stripe_subscription_id: user.license_stripe_subscription_id,
    buyer_email: user.license_buyer_email,
  });
}

// Botão único de ações por linha — clica e abre um menuzinho com as ações
// daquela linha, em vez de vários botões espalhados ocupando espaço.
// "actions" é uma lista de { label, onClick, danger, hidden }.
function RowActionsMenu({ actions }) {
  const [open, setOpen] = useState(false);
  const visible = actions.filter((a) => !a.hidden);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside() {
      setOpen(false);
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [open]);

  if (visible.length === 0) return null;

  return (
    <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Ações"
        className="w-7 h-7 inline-flex items-center justify-center rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-50 transition"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-white border border-stone-200 rounded-lg shadow-lg z-20 py-1 text-left">
          {visible.map((a, i) => (
            <button
              key={i}
              onClick={() => {
                setOpen(false);
                a.onClick();
              }}
              className={`w-full text-left text-xs font-medium px-3 py-2 hover:bg-stone-50 transition ${
                a.danger ? "text-rose-600" : "text-stone-700"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Popup com a chave de licença de verdade + botão de copiar — a chave fica
// escondida na tabela por padrão (só o tipo/status aparecem ali), e só
// abre aqui quando o admin clica no badge do tipo (ex: "Mensal").
function LicenseKeyModal({ code, onClose }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {}
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-xs w-full" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-bold text-stone-800 mb-3 text-sm">Chave de licença</h2>
        <div className="font-mono text-sm bg-stone-100 rounded-lg px-3 py-2.5 text-center mb-4 break-all">{code}</div>
        <div className="flex justify-end gap-2">
          <button
            onClick={handleCopy}
            className="text-xs font-medium border border-stone-200 px-3 py-2 rounded-lg hover:bg-stone-50"
          >
            {copied ? "Copiado ✓" : "Copiar"}
          </button>
          <button
            onClick={onClose}
            className="text-xs font-semibold bg-teal-700 text-white px-3 py-2 rounded-lg hover:bg-teal-800"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// Só assinatura Stripe ativa e NÃO marcada pra cancelar tem "próxima
// cobrança" de verdade (ela renova sozinha) — pros outros casos (trial,
// licença manual do admin, assinatura já cancelada), a data que existe é só
// validade/expiração, não uma cobrança que vai acontecer. Mesmo critério já
// usado em "Gerenciar Assinatura" dentro do app do cliente.
function nextBillingDate(user) {
  const isActiveStripe =
    user.license_stripe_subscription_id && user.license_status === "active" && !user.license_cancel_at_period_end;
  return isActiveStripe ? user.license_expires_at : null;
}

export default function AdminDashboard({ onLogout }) {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("admin_theme") || "dark";
    } catch (e) {
      return "dark";
    }
  });
  const [tab, setTab] = useState("overview"); // overview | users | licenses
  const [users, setUsers] = useState([]);
  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newLicenseModal, setNewLicenseModal] = useState(null); // { code, expires... } | null
  const [renewModal, setRenewModal] = useState(null); // licenseId | null
  const [keyModalCode, setKeyModalCode] = useState(null); // código da licença sendo exibido no popup, ou null
  const [toast, setToast] = useState("");
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsDays, setStatsDays] = useState(30);

  function toggleTheme() {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("admin_theme", next);
      } catch (e) {}
      return next;
    });
  }

  // A classe "dark" precisa ficar num ancestral de verdade dos elementos que
  // ela estiliza (ex: `.dark .bg-stone-50 { ... }` no index.css só funciona
  // se `.bg-stone-50` estiver DENTRO de um elemento com `.dark`, nunca no
  // mesmo elemento) — por isso vai no <html>, igual o app principal já faz,
  // em vez de ficar direto na div de fora que também tinha as classes de cor.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    return () => document.documentElement.classList.remove("dark");
  }, [theme]);

  async function loadStats(days) {
    setStatsLoading(true);
    try {
      const data = await apiRequest(`/api/admin/dashboard-stats?days=${days}`);
      setStats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setStatsLoading(false);
    }
  }

  useEffect(() => {
    loadStats(statsDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsDays]);

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
      <div className="max-w-6xl mx-auto px-5 py-8">
        <header className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-2.5">
            <img src="/icons/logo-header.png" alt="Precifica" className="w-9 h-9 shrink-0" />
            <div>
              <div className="text-lg font-extrabold text-teal-700 leading-tight">Precifica</div>
              <p className="text-xs text-stone-400">Painel administrativo</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "Modo claro" : "Modo escuro"}
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-100 transition"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
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
              onClick={() => handleGenerateLicense("lifetime")}
              title="Pra quem participou do desenvolvimento do sistema — acesso sem cobrança e sem data de vencimento"
              className="text-xs font-semibold bg-violet-600 text-white px-3 py-2 rounded-lg hover:bg-violet-700 transition"
            >
              + Chave vitalícia
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
            onClick={() => setTab("overview")}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
              tab === "overview" ? "border-teal-400 bg-teal-50 text-teal-800" : "border-stone-200 text-stone-500"
            }`}
          >
            Visão Geral
          </button>
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

        {tab === "overview" ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-stone-500">
                O painel executivo do Precifica: assinantes, receita e conversão em uma única visão.
              </p>
              <select
                value={statsDays}
                onChange={(e) => setStatsDays(Number(e.target.value))}
                className="text-xs font-medium border border-stone-200 rounded-lg px-3 py-2 bg-white text-stone-700"
              >
                <option value={7}>Últimos 7 dias</option>
                <option value={30}>Últimos 30 dias</option>
                <option value={90}>Últimos 90 dias</option>
              </select>
            </div>

            {statsLoading || !stats ? (
              <div className="text-sm text-stone-400 py-16 text-center">Carregando métricas...</div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <StatCard
                    icon={Users}
                    tone="indigo"
                    label="Usuários totais"
                    value={stats.totalUsers}
                    hint="Todas as contas ativas cadastradas na plataforma, de qualquer tipo de licença."
                  />
                  <StatCard
                    icon={Activity}
                    tone="teal"
                    label="Assinantes pagos ativos"
                    value={stats.activePaidSubscribers}
                    hint="Licenças mensais ou anuais com status ativo agora — não inclui quem está em teste grátis."
                  />
                  <StatCard
                    icon={Percent}
                    tone="amber"
                    label="Em teste grátis agora"
                    value={stats.activeTrials}
                    hint="Contas dentro do período de 7 dias de teste, ainda não convertidas em assinatura paga."
                  />
                  <StatCard
                    icon={DollarSign}
                    tone="indigo"
                    label="MRR estimado"
                    value={money(stats.mrr)}
                    hint="Receita mensal recorrente estimada: soma do valor de todas as assinaturas mensais ativas, mais o valor anual dividido por 12."
                  />
                  <StatCard
                    icon={DollarSign}
                    tone="teal"
                    label={`Receita recebida (${stats.days}d)`}
                    value={stats.revenueInPeriod == null ? "—" : money(stats.revenueInPeriod)}
                    hint="Valor efetivamente cobrado no período selecionado, direto da API do Stripe (pagamentos de verdade, não estimativa)."
                  />
                  <StatCard
                    icon={TrendingUp}
                    tone="teal"
                    label="Conversão trial → pago"
                    value={stats.conversionRate == null ? "— (sem trials ainda)" : `${stats.conversionRate.toFixed(0)}%`}
                    hint="Do total de contas que já passaram por um teste grátis, quantas viraram assinatura paga."
                  />
                  <StatCard
                    icon={UserPlus}
                    tone="indigo"
                    label={`Novos cadastros (${stats.days}d)`}
                    value={stats.newUsersInPeriod}
                    hint="Quantas contas novas foram criadas no período selecionado, de qualquer tipo de licença."
                  />
                  <StatCard
                    icon={TrendingDown}
                    tone="rose"
                    label={`Cancelamentos (${stats.days}d)`}
                    value={stats.cancelledInPeriod}
                    hint="Assinaturas que a pessoa pediu pra cancelar (não vai renovar) dentro do período selecionado."
                  />
                  <StatCard
                    icon={AlertTriangle}
                    tone="amber"
                    label="Assinaturas em risco"
                    value={stats.atRiskSubscriptions}
                    hint="Assinaturas ativas que já foram marcadas pra não renovar automaticamente — ainda com acesso, mas vão parar de pagar em breve."
                  />
                </div>

                <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-stone-100">
                    <h3 className="text-sm font-semibold text-stone-800">Cadastros recentes</h3>
                    <p className="text-xs text-stone-400">Últimos registros de conta na plataforma.</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-stone-400 border-b border-stone-100">
                          <th className="px-5 py-2 font-medium">E-mail</th>
                          <th className="px-3 py-2 font-medium">Licença</th>
                          <th className="px-3 py-2 font-medium">Cadastrado em</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-50">
                        {stats.recentSignups.length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-5 py-8 text-center text-stone-400">
                              Nenhum cadastro ainda.
                            </td>
                          </tr>
                        )}
                        {stats.recentSignups.map((u) => (
                          <tr key={u.id}>
                            <td className="px-5 py-2.5 text-stone-700">{u.email}</td>
                            <td className="px-3 py-2.5">
                              {u.license_type ? (
                                <StatusBadge tone={licenseTypeInfo(u.license_type).tone}>
                                  {licenseTypeInfo(u.license_type).badge}
                                </StatusBadge>
                              ) : (
                                <StatusBadge tone="stone">Sem licença</StatusBadge>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-stone-500 text-xs">{formatDate(u.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : loading ? (
          <div className="text-sm text-stone-400 py-16 text-center">Carregando...</div>
        ) : tab === "users" ? (
          <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-stone-400 border-b border-stone-100">
                    <th className="px-5 py-2 font-medium">E-mail</th>
                    <th className="px-3 py-2 font-medium">Origem</th>
                    <th className="px-3 py-2 font-medium">Nome / Clínica</th>
                    <th className="px-3 py-2 font-medium">Cliente desde</th>
                    <th className="px-3 py-2 font-medium">Licença</th>
                    <th className="px-3 py-2 font-medium">Próxima cobrança</th>
                    <th className="px-3 py-2 font-medium">Validade</th>
                    <th className="px-3 py-2 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-5 py-10 text-center text-stone-400">
                        Nenhum usuário ativo no momento.
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
                      <td className="px-3 py-3">
                        {user.license_id ? (
                          <>
                            <div className="text-xs font-medium text-stone-700">{userLicenseOriginInfo(user).label}</div>
                            <div className="text-[11px] text-stone-400">{userLicenseOriginInfo(user).detail}</div>
                          </>
                        ) : (
                          <span className="text-stone-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-stone-600">
                        {user.settings_clinic_name || user.clinic_name || user.name || "—"}
                      </td>
                      <td className="px-3 py-3 text-stone-500 text-xs">{formatDate(user.created_at)}</td>
                      <td className="px-3 py-3">
                        {user.license_code && (
                          <button
                            onClick={() => setKeyModalCode(user.license_code)}
                            title="Clique pra ver a chave de licença"
                            className="mb-1 inline-block"
                          >
                            <StatusBadge tone={licenseTypeInfo(user.license_type).tone}>
                              {licenseTypeInfo(user.license_type).badge}
                            </StatusBadge>
                          </button>
                        )}
                        <div>{licenseBadge(user)}</div>
                      </td>
                      <td className="px-3 py-3 text-stone-500 text-xs">
                        {nextBillingDate(user) ? formatDate(nextBillingDate(user)) : "—"}
                      </td>
                      <td className="px-3 py-3 text-stone-500 text-xs">
                        {user.license_expires_at ? formatDate(user.license_expires_at) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <RowActionsMenu
                          actions={[
                            {
                              label: "Renovar",
                              hidden: !user.license_id || user.license_type === "lifetime",
                              onClick: () => setRenewModal(user.license_id),
                            },
                            {
                              label: "Revogar",
                              hidden: !user.license_id,
                              onClick: () => handleRevoke(user.license_id),
                            },
                            {
                              label: user.status === "blocked" ? "Reativar" : "Bloquear",
                              onClick: () => handleToggleUserStatus(user),
                            },
                            {
                              label: confirmDeleteUser === user.id ? "Confirmar exclusão?" : "Remover",
                              danger: true,
                              onClick: () => handleDeleteUser(user),
                            },
                          ]}
                        />
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
                    <th className="px-3 py-2 font-medium text-right">Ações</th>
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
                      <td className="px-3 py-3 text-stone-600">
                        {lic.user_email ||
                          (lic.buyer_email ? `${lic.buyer_email} (ainda não usada)` : "— (ainda não usada)")}
                      </td>
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
                      <td className="px-3 py-3 text-right">
                        <RowActionsMenu
                          actions={[
                            {
                              label: "Renovar",
                              hidden: !(lic.status !== "unused" && lic.user_id) || lic.type === "lifetime",
                              onClick: () => setRenewModal(lic.id),
                            },
                            {
                              label: "Revogar",
                              hidden: !(lic.status !== "unused" && lic.user_id),
                              onClick: () => handleRevoke(lic.id),
                            },
                            {
                              label: confirmDeleteLicense === lic.id ? "Confirmar exclusão?" : "Remover chave",
                              danger: true,
                              hidden: !!lic.user_id,
                              onClick: () => handleDeleteLicense(lic),
                            },
                            {
                              label: confirmDeleteUser === lic.user_id ? "Confirmar exclusão?" : "Excluir conta",
                              danger: true,
                              hidden: !lic.user_id,
                              onClick: () => handleDeleteUser({ id: lic.user_id }),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {keyModalCode && <LicenseKeyModal code={keyModalCode} onClose={() => setKeyModalCode(null)} />}

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
