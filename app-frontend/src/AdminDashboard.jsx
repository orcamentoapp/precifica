import { useState, useEffect, useRef } from "react";
import { apiRequest, clearToken, getSavedAccounts, switchToAccount, removeSavedAccount } from "./api";
import {
  Users,
  Activity,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  UserPlus,
  Percent,
  MoreVertical,
  X,
  Wallet,
  Gem,
  Clock,
  MailWarning,
  LayoutDashboard,
  KeyRound,
  User,
  ChevronDown,
  LogOut,
  ArrowLeftRight,
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
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${tones[tone]}`}
    >
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
// Quando `onClick` é passado, o card vira clicável (cursor de mão + destaque
// no hover) — usado pra abrir a lista de usuários por trás daquele número.
function StatCard({ icon: Icon, tone, label, value, hint, onClick }) {
  const toneClasses = {
    teal: "bg-teal-50 text-teal-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    indigo: "bg-indigo-50 text-indigo-700",
  };
  return (
    <div
      className={`bg-white border border-stone-200 rounded-2xl p-4 ${
        onClick ? "cursor-pointer hover:border-teal-300 hover:shadow-sm transition" : ""
      }`}
      title={hint}
      onClick={onClick}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${toneClasses[tone]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-xs text-stone-500 mb-1">{label}</div>
      <div className="text-xl font-bold text-stone-800">{value}</div>
    </div>
  );
}

// Gráfico de tendência (novos cadastros vs cancelamentos, dia a dia, no
// período selecionado) — SVG desenhado na mão (sem lib de gráfico), sempre
// recalculado a partir dos dados reais atuais que vêm de
// /dashboard-stats/trend. Cores fixas (validadas pra funcionar em claro e
// escuro): teal pra cadastros, rose pra cancelamentos — as mesmas usadas nos
// cards de cima, então a leitura já é familiar.
const TREND_COLORS = { newUsers: "#0d9488", cancelled: "#f43f5e" };
const TREND_W = 720;
const TREND_H = 220;
const TREND_PAD = { top: 16, right: 16, bottom: 26, left: 30 };

function niceMax(value) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function TrendChart({ series, loading }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const wrapRef = useRef(null);

  const n = series?.length || 0;
  const plotW = TREND_W - TREND_PAD.left - TREND_PAD.right;
  const plotH = TREND_H - TREND_PAD.top - TREND_PAD.bottom;
  const maxValue = niceMax(Math.max(1, ...(series || []).flatMap((d) => [d.new_users, d.cancelled])));

  function xAt(i) {
    return TREND_PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  }
  function yAt(v) {
    return TREND_PAD.top + plotH - (v / maxValue) * plotH;
  }

  function linePath(key) {
    if (!series) return "";
    return series.map((d, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(d[key]).toFixed(1)}`).join(" ");
  }

  function handleMove(e) {
    if (!wrapRef.current || n === 0) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    const i = Math.max(0, Math.min(n - 1, Math.round(fraction * (n - 1))));
    setHoverIndex(i);
  }

  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  const dateLabelEvery = Math.max(1, Math.ceil(n / 7));

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-stone-800">Cadastros e cancelamentos por dia</h3>
          <p className="text-xs text-stone-400">Tendência real do período selecionado, dia a dia.</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-stone-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TREND_COLORS.newUsers }} />
            Novos cadastros
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TREND_COLORS.cancelled }} />
            Cancelamentos
          </span>
        </div>
      </div>

      {loading || !series ? (
        <div className="text-sm text-stone-400 py-16 text-center">Carregando gráfico...</div>
      ) : n === 0 ? (
        <div className="text-sm text-stone-400 py-16 text-center">Sem dados nesse período.</div>
      ) : (
        <div
          ref={wrapRef}
          className="relative"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <svg viewBox={`0 0 ${TREND_W} ${TREND_H}`} className="w-full h-auto block" preserveAspectRatio="none">
            {gridLines.map((g) => {
              const y = TREND_PAD.top + plotH * (1 - g);
              return (
                <g key={g}>
                  <line
                    x1={TREND_PAD.left}
                    x2={TREND_W - TREND_PAD.right}
                    y1={y}
                    y2={y}
                    className="text-stone-200"
                    stroke="currentColor"
                    strokeWidth="1"
                  />
                  <text x={TREND_PAD.left - 6} y={y + 3} textAnchor="end" className="text-stone-400 text-[9px]" fill="currentColor">
                    {Math.round(maxValue * g)}
                  </text>
                </g>
              );
            })}

            {series.map(
              (d, i) =>
                i % dateLabelEvery === 0 && (
                  <text
                    key={i}
                    x={xAt(i)}
                    y={TREND_H - 6}
                    textAnchor="middle"
                    className="text-stone-400 text-[9px]"
                    fill="currentColor"
                  >
                    {new Date(d.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                  </text>
                )
            )}

            {hoverIndex != null && (
              <line
                x1={xAt(hoverIndex)}
                x2={xAt(hoverIndex)}
                y1={TREND_PAD.top}
                y2={TREND_PAD.top + plotH}
                className="text-stone-300"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            )}

            <path d={linePath("new_users")} fill="none" stroke={TREND_COLORS.newUsers} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d={linePath("cancelled")} fill="none" stroke={TREND_COLORS.cancelled} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

            {hoverIndex != null && (
              <>
                <circle cx={xAt(hoverIndex)} cy={yAt(series[hoverIndex].new_users)} r="3.5" fill={TREND_COLORS.newUsers} />
                <circle cx={xAt(hoverIndex)} cy={yAt(series[hoverIndex].cancelled)} r="3.5" fill={TREND_COLORS.cancelled} />
              </>
            )}
          </svg>

          {hoverIndex != null && (
            <div
              className="absolute bg-stone-800 text-white text-[11px] rounded-lg px-2.5 py-1.5 pointer-events-none shadow-lg -translate-x-1/2 -translate-y-full"
              style={{
                left: `${(xAt(hoverIndex) / TREND_W) * 100}%`,
                top: `${(Math.min(yAt(series[hoverIndex].new_users), yAt(series[hoverIndex].cancelled)) / TREND_H) * 100}%`,
              }}
            >
              <div className="font-semibold mb-0.5">
                {new Date(series[hoverIndex].day).toLocaleDateString("pt-BR")}
              </div>
              <div>Cadastros: {series[hoverIndex].new_users}</div>
              <div>Cancelamentos: {series[hoverIndex].cancelled}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Modal com a lista de usuários por trás de um dos números da Visão Geral
// (ex: quem exatamente está em "Assinaturas em risco"). Os campos extra por
// usuário variam de grupo pra grupo (data de cadastro, cancelamento, etc) —
// só mostra os que vierem preenchidos na resposta da API.
function GroupUsersModal({ data, loading, onClose }) {
  const users = data?.users || [];
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="font-bold text-stone-800">{data?.label || "Carregando..."}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-stone-500 mb-4">
          {loading ? "Carregando..." : `${users.length} ${users.length === 1 ? "conta" : "contas"}`}
        </p>
        <div className="flex-1 overflow-y-auto -mx-6 px-6 divide-y divide-stone-100">
          {loading ? (
            <div className="text-xs text-stone-400 py-10 text-center">Carregando...</div>
          ) : users.length === 0 ? (
            <div className="text-xs text-stone-400 py-10 text-center">Nenhuma conta nesse grupo agora.</div>
          ) : (
            users.map((u) => (
              <div key={u.id} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-stone-800 truncate">
                      {u.name || u.clinic_name || u.email}
                    </div>
                    <div className="text-xs text-stone-400 truncate">{u.email}</div>
                  </div>
                  {u.license_type && (
                    <StatusBadge tone={licenseTypeInfo(u.license_type).tone}>
                      {licenseTypeInfo(u.license_type).label}
                    </StatusBadge>
                  )}
                </div>
                {(u.created_at || u.cancelled_at || u.expires_at || u.trial_started_at || typeof u.converted === "boolean") && (
                  <div className="text-[11px] text-stone-400 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {u.created_at && <span>Cadastro: {formatDate(u.created_at)}</span>}
                    {u.trial_started_at && <span>Trial iniciado: {formatDate(u.trial_started_at)}</span>}
                    {u.cancelled_at && <span>Cancelou em: {formatDate(u.cancelled_at)}</span>}
                    {u.expires_at && <span>Validade: {formatDate(u.expires_at)}</span>}
                    {typeof u.converted === "boolean" && (
                      <span className={u.converted ? "text-teal-600 font-medium" : "text-stone-400"}>
                        {u.converted ? "Converteu pra pago" : "Ainda não converteu"}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
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
  // Vitalícia não tem data de validade nenhuma — "d restantes" não faz
  // sentido aqui (dava esse badge quebrado: "Ativa · d restantes", com o
  // número em branco).
  if (user.license_type === "lifetime") return <StatusBadge tone="teal">Ativa</StatusBadge>;
  const daysLeft = user.license_expires_at
    ? Math.ceil((new Date(user.license_expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null;
  if (user.license_status === "expired" || (daysLeft !== null && daysLeft < 0)) {
    return <StatusBadge tone="rose">Expirada</StatusBadge>;
  }
  // Cliente já cancelou (não vai renovar sozinha), mas ainda está dentro do
  // período já pago — continua com acesso até a validade.
  if (user.license_cancel_at_period_end) {
    return <StatusBadge tone="amber">Cancelada · {daysLeft}d restantes</StatusBadge>;
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
                if (!a.keepOpen) setOpen(false);
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

// Menu superior do painel admin — mesmo padrão visual do menu de abas do
// app do cliente (pílula com fundo deslizante no desktop, barra fixa
// embaixo no celular), só que com as 3 seções do admin em vez das telas do
// consultório.
const ADMIN_TABS = [
  { key: "overview", label: "Visão Geral", icon: LayoutDashboard },
  { key: "users", label: "Usuários", icon: Users },
  { key: "licenses", label: "Chaves de licença", icon: KeyRound },
];

function AdminTabNav({ tab, setTab, darkMode }) {
  const containerRef = useRef(null);
  const tabRefs = useRef({});
  const [pillStyle, setPillStyle] = useState(null);

  useEffect(() => {
    function updatePill() {
      const container = containerRef.current;
      const activeEl = tabRefs.current[tab];
      if (container && activeEl) {
        const containerRect = container.getBoundingClientRect();
        const activeRect = activeEl.getBoundingClientRect();
        setPillStyle({ left: activeRect.left - containerRect.left, width: activeRect.width });
      }
    }
    updatePill();
    window.addEventListener("resize", updatePill);
    return () => window.removeEventListener("resize", updatePill);
  }, [tab]);

  return (
    <>
      {/* Desktop / telas largas: menu em pílula no cabeçalho */}
      <nav
        ref={containerRef}
        className="hidden md:flex relative flex-wrap gap-1 rounded-full p-1"
        style={{ backgroundColor: darkMode ? "#3f3f46" : "#f5f5f4" }}
      >
        {pillStyle && (
          <div
            className="absolute top-1 bottom-1 rounded-full transition-all duration-300 ease-out"
            style={{
              left: `${pillStyle.left}px`,
              width: `${pillStyle.width}px`,
              backgroundColor: darkMode ? "#71717a" : "#292524",
            }}
          />
        )}
        {ADMIN_TABS.map((t) => (
          <button
            key={t.key}
            ref={(el) => (tabRefs.current[t.key] = el)}
            onClick={() => setTab(t.key)}
            className="relative z-10 px-4 py-1.5 rounded-full text-sm font-medium transition-colors duration-300"
            style={{ color: tab === t.key ? "#fafaf9" : darkMode ? "#a1a1aa" : "#78716c" }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Mobile: barra de navegação fixa na parte inferior, padrão de app nativo */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 flex items-stretch bg-white border-t border-stone-200 z-40"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          boxShadow: "0 -2px 8px rgba(0,0,0,0.06)",
        }}
      >
        {ADMIN_TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2"
              style={{ color: active ? "#0f766e" : "#a8a29e" }}
            >
              <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
              <span className="text-[11px] font-medium">{t.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

// Menu de conta do admin — mesmo botão-avatar redondo do app do cliente,
// mas só com o que faz sentido pro admin: alternar modo escuro e sair (sem
// upload de logo, configurações de clínica, central de ajuda etc — isso é
// tudo específico do app do consultório).
function AdminAccountMenu({ theme, onToggleTheme, onLogout, currentEmail }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Mesma lógica de "Trocar de conta" do app do cliente (ver OptionsMenu em
  // App.jsx) — só aparecem aqui contas que logaram com "Lembrar e-mail e
  // permitir troca rápida" marcado, o que vale tanto pra contas de
  // cliente quanto de admin (é a mesma tela de Login pras duas).
  const [savedAccounts, setSavedAccounts] = useState([]);
  const otherAccounts = savedAccounts.filter((a) => a.email !== currentEmail);

  function handleSwitchAccount(email) {
    if (switchToAccount(email)) {
      window.location.reload();
    }
  }

  function handleForgetAccount(email, e) {
    e.stopPropagation();
    removeSavedAccount(email);
    setSavedAccounts(getSavedAccounts());
  }

  useEffect(() => {
    if (open) setSavedAccounts(getSavedAccounts());
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Abrir opções"
        className="shrink-0 rounded-full flex items-center justify-center overflow-hidden transition hover:brightness-95"
        style={{
          width: "44px",
          height: "44px",
          backgroundColor: "rgba(0,0,0,0.08)",
          border: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        <User className="w-5 h-5 text-stone-400" />
      </button>
      {open && (
        <div className="fixed left-3 right-3 top-20 md:absolute md:left-auto md:right-0 md:top-auto md:mt-2 md:w-64 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden z-50 text-stone-800">
          <div className="px-4 py-3 border-b border-stone-100">
            <div className="text-sm font-semibold text-stone-800">Painel administrativo</div>
            {currentEmail && <div className="text-xs text-stone-400 truncate mt-0.5">{currentEmail}</div>}
          </div>

          {otherAccounts.length > 0 && (
            <div className="border-t border-stone-100 py-1.5">
              <div className="px-4 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                Trocar de conta
              </div>
              <div className="px-4 pb-1.5 text-[11px] text-stone-400 leading-snug">
                Só aparecem aqui contas com "Lembrar" marcado no login.
              </div>
              {otherAccounts.map((a) => (
                <button
                  key={a.email}
                  onClick={() => handleSwitchAccount(a.email)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-stone-50 transition group"
                >
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <ArrowLeftRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span className="truncate">{a.email}</span>
                  </span>
                  <span
                    onClick={(e) => handleForgetAccount(a.email, e)}
                    title="Esquecer essa conta"
                    className="shrink-0 text-stone-300 hover:text-rose-500 transition opacity-0 group-hover:opacity-100 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-stone-100">
            <span className="text-sm">Modo escuro</span>
            <button
              type="button"
              role="switch"
              aria-checked={theme === "dark"}
              onClick={onToggleTheme}
              className="relative w-11 h-6 rounded-full transition-colors shrink-0"
              style={{ backgroundColor: theme === "dark" ? "#0f766e" : "#d6d3d1" }}
            >
              <span
                className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
                style={{ transform: theme === "dark" ? "translateX(20px)" : "translateX(0)" }}
              />
            </button>
          </div>

          <button
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-stone-500 hover:bg-stone-50 hover:text-rose-600 transition border-t border-stone-100"
          >
            <LogOut className="w-3.5 h-3.5" /> Sair
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard({ onLogout, currentEmail }) {
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
  const [generateModal, setGenerateModal] = useState(null); // { type } | null — abre pra escrever a descrição opcional antes de gerar
  const [generateDescription, setGenerateDescription] = useState("");
  const [groupModal, setGroupModal] = useState(null); // { label, users } | null — lista de usuários por trás de um card da Visão Geral
  const [groupModalLoading, setGroupModalLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsDays, setStatsDays] = useState(30);
  const [trend, setTrend] = useState(null);
  const [trendLoading, setTrendLoading] = useState(true);

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

  async function loadTrend(days) {
    setTrendLoading(true);
    try {
      const data = await apiRequest(`/api/admin/dashboard-stats/trend?days=${days}`);
      setTrend(data.series);
    } catch (err) {
      setTrend(null);
    } finally {
      setTrendLoading(false);
    }
  }

  async function openGroupModal(group) {
    setGroupModalLoading(true);
    setGroupModal({ label: null, users: [] });
    try {
      const data = await apiRequest(`/api/admin/dashboard-stats/group?group=${group}&days=${statsDays}`);
      setGroupModal(data);
    } catch (err) {
      showToast("Erro: " + err.message);
      setGroupModal(null);
    } finally {
      setGroupModalLoading(false);
    }
  }

  useEffect(() => {
    loadStats(statsDays);
    loadTrend(statsDays);
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

  async function handleGenerateLicense(type, description) {
    try {
      const license = await apiRequest("/api/admin/licenses", {
        method: "POST",
        body: JSON.stringify({ type, description: description || undefined }),
      });
      setNewLicenseModal(license);
      setGenerateModal(null);
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

  function handleLogout() {
    clearToken();
    onLogout();
  }

  return (
    <div className="min-h-screen bg-stone-50 font-sans">
      <div style={{ paddingTop: "env(safe-area-inset-top, 0px)" }} className="bg-stone-50">
        <header
          style={{ position: "relative", zIndex: 30 }}
          className="bg-white border border-stone-200 rounded-2xl shadow-sm mx-2 mt-2 md:mx-6 md:mt-5 max-w-6xl md:mx-auto"
        >
          <div className="px-3 py-3 md:px-5 md:py-3.5 flex items-center justify-between gap-2 md:grid md:grid-cols-[1fr_auto_1fr] md:gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <img src="/icons/logo-header.png" alt="Precifica" className="w-9 h-9 shrink-0" />
              <div className="min-w-0">
                <div className="text-lg font-extrabold text-teal-700 leading-tight truncate">Precifica</div>
                <p className="text-xs text-stone-400 truncate">Painel administrativo</p>
              </div>
            </div>

            <AdminTabNav tab={tab} setTab={setTab} darkMode={theme === "dark"} />

            <div className="flex items-center gap-2 justify-end min-w-0">
              <AdminAccountMenu theme={theme} onToggleTheme={toggleTheme} onLogout={handleLogout} currentEmail={currentEmail} />
              <ChevronDown className="w-4 h-4 text-stone-400 shrink-0 hidden md:block" />
            </div>
          </div>
        </header>
      </div>

      <div className="max-w-6xl mx-auto px-5 py-6 pb-[calc(1.5rem+64px+env(safe-area-inset-bottom,0px))] md:pb-6">
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <button
            onClick={() => {
              setGenerateDescription("");
              setGenerateModal({ type: "monthly" });
            }}
            className="text-xs font-semibold bg-teal-700 text-white px-3 py-2 rounded-lg hover:bg-teal-800 transition"
          >
            + Chave mensal (30d)
          </button>
          <button
            onClick={() => {
              setGenerateDescription("");
              setGenerateModal({ type: "trial" });
            }}
            className="text-xs font-semibold bg-amber-600 text-white px-3 py-2 rounded-lg hover:bg-amber-700 transition"
          >
            + Chave trial (7d)
          </button>
          <button
            onClick={() => {
              setGenerateDescription("");
              setGenerateModal({ type: "annual" });
            }}
            className="text-xs font-semibold bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 transition"
          >
            + Chave anual (365d)
          </button>
          <button
            onClick={() => {
              setGenerateDescription("");
              setGenerateModal({ type: "lifetime" });
            }}
            title="Pra quem participou do desenvolvimento do sistema — acesso sem cobrança e sem data de vencimento"
            className="text-xs font-semibold bg-violet-600 text-white px-3 py-2 rounded-lg hover:bg-violet-700 transition"
          >
            + Chave vitalícia
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
                    hint="Todas as contas ativas cadastradas na plataforma, de qualquer tipo de licença. Clique pra ver a lista."
                    onClick={() => openGroupModal("totalUsers")}
                  />
                  <StatCard
                    icon={Activity}
                    tone="teal"
                    label="Assinantes pagos ativos"
                    value={stats.activePaidSubscribers}
                    hint="Licenças mensais ou anuais com status ativo agora, pagas de verdade por cartão via Stripe — não conta quem está em teste grátis nem licenças geradas manualmente no admin. Clique pra ver a lista."
                    onClick={() => openGroupModal("activePaid")}
                  />
                  <StatCard
                    icon={Percent}
                    tone="amber"
                    label="Em teste grátis agora"
                    value={stats.activeTrials}
                    hint="Contas dentro do período de 7 dias de teste, ainda não convertidas em assinatura paga. Clique pra ver a lista."
                    onClick={() => openGroupModal("activeTrial")}
                  />
                  <StatCard
                    icon={DollarSign}
                    tone="indigo"
                    label="MRR estimado"
                    value={money(stats.mrr)}
                    hint="Receita mensal recorrente estimada: soma do valor de todas as assinaturas mensais ativas pagas por cartão via Stripe, mais o valor anual dividido por 12 — licenças geradas manualmente no admin não entram nessa conta. Clique pra ver quem compõe esse valor."
                    onClick={() => openGroupModal("activePaid")}
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
                    hint={
                      stats.conversionRate == null
                        ? "Do total de contas que já passaram por um teste grátis, quantas viraram assinatura paga."
                        : "Do total de contas que já passaram por um teste grátis, quantas viraram assinatura paga. Clique pra ver a lista."
                    }
                    onClick={stats.conversionRate == null ? undefined : () => openGroupModal("trialConversion")}
                  />
                  <StatCard
                    icon={UserPlus}
                    tone="indigo"
                    label={`Novos cadastros (${stats.days}d)`}
                    value={stats.newUsersInPeriod}
                    hint="Quantas contas novas foram criadas no período selecionado, de qualquer tipo de licença. Clique pra ver a lista."
                    onClick={() => openGroupModal("newUsers")}
                  />
                  <StatCard
                    icon={TrendingDown}
                    tone="rose"
                    label={`Cancelamentos (${stats.days}d)`}
                    value={stats.cancelledInPeriod}
                    hint="Assinaturas que a pessoa pediu pra cancelar (não vai renovar) dentro do período selecionado. Clique pra ver a lista."
                    onClick={() => openGroupModal("cancelled")}
                  />
                  <StatCard
                    icon={AlertTriangle}
                    tone="amber"
                    label="Assinaturas em risco"
                    value={stats.atRiskSubscriptions}
                    hint="Assinaturas ativas que já foram marcadas pra não renovar automaticamente — ainda com acesso, mas vão parar de pagar em breve. Clique pra ver a lista."
                    onClick={() => openGroupModal("atRisk")}
                  />
                  <StatCard
                    icon={TrendingDown}
                    tone="rose"
                    label="Churn"
                    value={stats.churnRate == null ? "— (sem base ainda)" : `${stats.churnRate.toFixed(1)}%`}
                    hint="Aproximação: cancelamentos no período dividido pelos assinantes pagos ativos + esses cancelamentos. Quanto maior, maior a proporção de assinantes pagos se perdendo no período."
                  />
                  <StatCard
                    icon={Wallet}
                    tone="teal"
                    label="Ticket médio"
                    value={stats.avgTicket == null ? "—" : money(stats.avgTicket)}
                    hint="MRR dividido pelo número de assinantes pagos ativos — quanto cada assinante representa de receita mensal recorrente, em média (mistura mensal e anual)."
                  />
                  <StatCard
                    icon={Gem}
                    tone="indigo"
                    label="LTV estimado"
                    value={stats.estimatedLTV == null ? "— (precisa de churn > 0)" : money(stats.estimatedLTV)}
                    hint="Estimativa clássica de assinatura: ticket médio dividido pelo churn do período (em decimal). Quanto maior o churn, menor o LTV estimado — é só uma projeção, não um valor garantido."
                  />
                  <StatCard
                    icon={Clock}
                    tone="amber"
                    label="Tempo médio até cancelar"
                    value={
                      stats.avgDaysToCancel == null ? "— (sem cancelamentos ainda)" : `${Math.round(stats.avgDaysToCancel)} dias`
                    }
                    hint="Média, em todo o histórico (não só o período selecionado), do tempo entre a ativação da licença e o cancelamento."
                  />
                  <StatCard
                    icon={MailWarning}
                    tone="rose"
                    label="Nunca confirmaram e-mail"
                    value={stats.unconfirmedSignups}
                    hint="Contas cadastradas que nunca confirmaram o e-mail — ficam travadas sem conseguir usar o app. Estado atual, não depende do período selecionado. Clique pra ver a lista."
                    onClick={() => openGroupModal("unconfirmed")}
                  />
                </div>

                <TrendChart series={trend} loading={trendLoading} />

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
                            {user.license_description && (
                              <div className="text-[11px] text-stone-500 italic mt-0.5 max-w-[180px]" title={user.license_description}>
                                "{user.license_description}"
                              </div>
                            )}
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
                              // keepOpen: no primeiro clique (ainda não confirmado) o menu
                              // continua aberto pra mostrar "Confirmar exclusão?" — só fecha
                              // no clique de confirmação, que já executa a remoção.
                              keepOpen: confirmDeleteUser !== user.id,
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
                        {lic.description && (
                          <div className="text-[11px] text-stone-500 italic mt-0.5 max-w-[180px]" title={lic.description}>
                            "{lic.description}"
                          </div>
                        )}
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
                              keepOpen: confirmDeleteLicense !== lic.id,
                              onClick: () => handleDeleteLicense(lic),
                            },
                            {
                              label: confirmDeleteUser === lic.user_id ? "Confirmar exclusão?" : "Excluir conta",
                              danger: true,
                              hidden: !lic.user_id,
                              keepOpen: confirmDeleteUser !== lic.user_id,
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

      {generateModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={() => setGenerateModal(null)}
        >
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-stone-800 mb-1">
              Gerar chave {licenseTypeInfo(generateModal.type).label.toLowerCase()}
            </h2>
            <p className="text-xs text-stone-500 mb-4">
              Descrição opcional — pra lembrar depois pra quem foi essa chave e por qual motivo. Só aparece aqui no
              painel, o cliente nunca vê isso.
            </p>
            <textarea
              autoFocus
              value={generateDescription}
              onChange={(e) => setGenerateDescription(e.target.value)}
              placeholder='Ex: "Cortesia pro Dr. Fulano, indicação da Dra. Stephanie"'
              rows={3}
              className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 mb-4 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setGenerateModal(null)}
                className="text-xs font-medium text-stone-500 border border-stone-200 px-3 py-2 rounded-lg hover:bg-stone-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleGenerateLicense(generateModal.type, generateDescription)}
                className="text-xs font-semibold bg-teal-700 text-white px-3 py-2 rounded-lg hover:bg-teal-800"
              >
                Gerar chave
              </button>
            </div>
          </div>
        </div>
      )}

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

      {groupModal && (
        <GroupUsersModal data={groupModal} loading={groupModalLoading} onClose={() => setGroupModal(null)} />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-xs px-4 py-2 rounded-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
