import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from "react";
import { Plus, Stethoscope, User, ChevronRight, ChevronUp, ChevronDown, Search, Percent, CreditCard, Landmark, Banknote, X, Loader2, Undo2, Redo2, Star, Save, Check, Download, Upload, FileText, Image as ImageIcon, Printer, MessageCircle, Clock, CheckCircle2, XCircle, CircleDollarSign, Settings, LogOut, Calculator, ClipboardList, Menu, Pencil, Columns3, GripVertical, ArrowUpDown, Trash2, LayoutDashboard, Users } from "lucide-react";
import { apiRequest, clearToken } from "./api";
import Chart from "chart.js/auto";
import html2canvas from "html2canvas";
import { useAccount } from "./AccountContext";
import { useInstallPrompt, isRunningInstalled, isIOS } from "./pwaInstall";

const BRAZIL_UF_LIST = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

const DEFAULT_INSTALLMENT_FEES = [
  { n: 1, fee: 3.5 },
  { n: 2, fee: 4.5 },
  { n: 3, fee: 5.5 },
  { n: 4, fee: 6.5 },
  { n: 5, fee: 7.5 },
  { n: 6, fee: 8.5 },
  { n: 7, fee: 9.5 },
  { n: 8, fee: 10.5 },
];

const DEFAULT_PROCEDURE_COLUMN_WIDTHS = {
  name: 230,
  cost: 100,
  additionalCost: 130,
  valorBase: 100,
  marginPercent: 130,
  suggestedBase: 170,
  durationMinutes: 110,
  sessions: 90,
  totalCost: 110,
  profit: 110,
};

// Mapeia cada aba pra um caminho de URL de verdade (e vice-versa), pra dar
// pra compartilhar/favoritar um link direto pra uma seção específica, e pro
// botão voltar/avançar do navegador funcionar entre elas.
const TAB_TO_PATH = {
  dashboard: "/dashboard",
  simulation: "/orcamento",
  procedures: "/procedimentos",
  history: "/historico",
  patients: "/pacientes",
  perfil: "/perfil",
  "profile-settings": "/configuracoes",
  calculadora: "/calculadora",
};
const PATH_TO_TAB = Object.fromEntries(Object.entries(TAB_TO_PATH).map(([tab, path]) => [path, tab]));

// Raiz do domínio ("/") também abre o Dashboard — é o fallback de
// tabFromPath() logo abaixo (qualquer rota não reconhecida cai no
// Dashboard), então não precisa de uma entrada própria aqui.
function tabFromPath(pathname) {
  return PATH_TO_TAB[pathname] || "dashboard";
}

const DEFAULT_SETTINGS = {
  clinicName: "Nome",
  logoDataUrl: "",
  clinicLogoDataUrl: "", // logo do consultório/clínica (marca) — diferente de logoDataUrl, que é a foto de perfil da pessoa
  specialty: "", // aparece embaixo do nome no orçamento exportado (ex: "Ortodontia", "Odontologia Geral")
  instagramHandle: "", // aparece no rodapé do orçamento exportado, junto do telefone
  orgLabel: "Consultório",
  professionalRegistration: "",
  address: "",
  phone: "",
  quoteValidityMonths: 3,
  // Cor de destaque escolhida pela pessoa — usada tanto no realce das abas
  // do próprio app quanto nas partes coloridas do orçamento exportado
  // (cabeçalho, tabela, total, rodapé). Já existia, mas até agora não tinha
  // nenhum seletor de cor na tela pra mudar ela.
  headerColor: "#005580",
  secondaryColor: "#71CFFE",
  taxProvisionPercent: 15,
  taxRegime: "liberal", // "liberal" (pessoa física, Carnê-Leão) | "cnpj" (Simples Nacional / Lucro Presumido)
  darkMode: false,
  procedureCategories: [], // categorias criadas manualmente (podem existir vazias, sem nenhum procedimento ainda)
  procedureColumnWidths: {}, // largura (px) de cada coluna da tabela de Procedimentos, ajustada pelo usuário — mescla com DEFAULT_PROCEDURE_COLUMN_WIDTHS pras que ele ainda não mexeu
  pixFeePercent: 0,
  cardPresets: [
    {
      id: "default",
      name: "Maquininha padrão",
      debitFeePercent: 1.99,
      installmentFees: DEFAULT_INSTALLMENT_FEES.map((r) => ({ ...r })),
    },
  ],
  activePresetId: "default",
  boletoInstallmentFees: [
    { n: 1, fee: 2.5 },
    { n: 2, fee: 2.5 },
    { n: 3, fee: 2.5 },
  ],
  convenioDiscountPercent: 30,
  customFees: [],
  laborCalc: { fixedCosts: 0, desiredIncome: 0, productiveHours: 0 },
  aboutText: "",
  contactText: "",
  feePayer: "client",
  feePayerCreditThreshold: 0,
};

// Acréscimo aplicado ao valor cobrado, conforme o "nível" (poder aquisitivo) do paciente,
// definido pelo usuário na hora do orçamento. Nível 0 = padrão, sem acréscimo.
const CLIENT_LEVEL_MARKUP = { 0: 0, 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 };
const MUSTARD_YELLOW = "#D4A017";

function getActivePreset(settings) {
  const presets = settings.cardPresets || [];
  return (
    presets.find((p) => p.id === settings.activePresetId) ||
    presets[0] || { id: "default", name: "Maquininha padrão", debitFeePercent: 0, installmentFees: [] }
  );
}


function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============ Modelo novo do orçamento exportado ============
// Validado antes com o Marcelo como protótipo separado (fora do código,
// só HTML/CSS) — essa é a versão de produção da mesma coisa: gera o HTML
// de verdade com os dados reais do orçamento, pra depois:
//  (a) ser capturado em canvas (html2canvas) e virar PNG/PDF, do mesmo
//      jeito que o desenho manual em canvas fazia antes — só troca COMO
//      o canvas nasce, o resto do pipeline de exportação (PNG/PDF/Print)
//      continua exatamente igual;
//  (b) ser aberto direto numa aba nova, sem nenhum orçamento de verdade,
//      só pra pré-visualizar o modelo com dados de exemplo (botão
//      "Visualizar modelo de orçamento" em Configurações).

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function hexToHslTuple(hex) {
  const clean = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#0f6e56";
  const r = parseInt(clean.slice(1, 3), 16) / 255;
  const g = parseInt(clean.slice(3, 5), 16) / 255;
  const b = parseInt(clean.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h;
  let s;
  const l = (max + min) / 2;
  if (max === min) {
    h = 0;
    s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}
function hslCss(h, s, l) {
  return `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`;
}

// A cor escolhida pela pessoa vira a base ("brand"); as variações (mais
// escura pra texto/títulos, bem clara pra fundos suaves, rodapé) são
// calculadas a partir dela, sempre no mesmo tom — assim qualquer cor
// escolhida já sai com contraste legível, sem pedir 4 cores na mão.
function budgetTemplateColorVars(accentHex) {
  const [h, s] = hexToHslTuple(accentHex);
  return {
    brand: hslCss(h, Math.max(s, 35), 32),
    brandDark: hslCss(h, Math.max(s, 35), 22),
    brandSoft: hslCss(h, Math.min(s, 45), 94),
    footerBg: hslCss(h, Math.max(s * 0.5, 20), 20),
    footerText: hslCss(h, 20, 88),
    footerSub: hslCss(h, 15, 72),
    footerIcon: hslCss(h, 30, 62),
  };
}

const BUDGET_TEMPLATE_FONTS_LINK =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">';

function budgetTemplateCSS(vars) {
  return `
  * { box-sizing: border-box; }
  .bt-page {
    width: 780px;
    background: #fbfaf7;
    font-family: 'Inter', sans-serif;
    color: #1c2b27;
    border-radius: 4px;
    overflow: hidden;
    position: relative;
  }
  .bt-blob { position: absolute; top: -60px; right: -80px; width: 320px; height: 320px; background: radial-gradient(circle at 30% 30%, ${vars.brandSoft}, transparent 70%); border-radius: 50%; pointer-events: none; }
  .bt-header { padding: 40px 48px 28px; display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; position: relative; }
  .bt-brand-row { display: flex; align-items: center; gap: 16px; }
  .bt-logo-mark { width: 56px; height: 56px; border-radius: 50%; background: ${vars.brandSoft}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; border: 1px solid #dde7e3; }
  .bt-logo-mark img { width: 100%; height: 100%; object-fit: cover; }
  .bt-logo-mark svg { width: 30px; height: 30px; color: ${vars.brand}; }
  .bt-clinic-name { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 600; letter-spacing: 0.01em; color: ${vars.brandDark}; line-height: 1.25; }
  .bt-clinic-specialty { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #5c6b67; margin-top: 2px; }
  .bt-clinic-cro { font-size: 11px; color: #5c6b67; margin-top: 4px; }
  .bt-hero { padding: 8px 48px 32px; display: grid; grid-template-columns: 1.5fr 1fr; gap: 24px; position: relative; }
  .bt-hero-label { font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: ${vars.brand}; font-weight: 600; display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .bt-hero-label::after { content: ""; flex: 1; height: 1px; background: #dde7e3; }
  .bt-hero h1 { font-family: 'Fraunces', serif; font-size: 34px; font-weight: 500; margin: 0 0 10px; color: #1c2b27; }
  .bt-hero p { font-size: 14px; color: #5c6b67; line-height: 1.6; margin: 0; max-width: 340px; }
  .bt-meta-col { display: flex; flex-direction: column; gap: 16px; border-left: 1px solid #dde7e3; padding-left: 24px; }
  .bt-meta-item { display: flex; align-items: center; gap: 12px; }
  .bt-meta-icon { width: 34px; height: 34px; border-radius: 50%; background: ${vars.brandSoft}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: ${vars.brand}; }
  .bt-meta-icon svg { width: 16px; height: 16px; }
  .bt-meta-label { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #5c6b67; }
  .bt-meta-value { font-size: 14px; font-weight: 600; color: #1c2b27; }
  .bt-meta-sub { font-size: 11px; color: #5c6b67; }
  .bt-table-wrap { margin: 0 48px; border: 1px solid #dde7e3; border-radius: 10px; overflow: hidden; }
  .bt-table { width: 100%; border-collapse: collapse; }
  .bt-table thead tr { background: ${vars.brandSoft}; }
  .bt-table th { text-align: left; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: ${vars.brandDark}; padding: 12px 18px; font-weight: 600; }
  .bt-table th:last-child, .bt-table td:last-child { text-align: right; }
  .bt-table th:first-child, .bt-table td:first-child { width: 60px; text-align: center; }
  .bt-table td { padding: 16px 18px; border-top: 1px solid #dde7e3; font-size: 14px; }
  .bt-proc-name { font-weight: 600; color: #1c2b27; }
  .bt-proc-value { font-family: 'Fraunces', serif; font-weight: 500; font-size: 15px; }
  .bt-total-bar { margin: 24px 48px 0; background: ${vars.brandSoft}; border-radius: 10px; padding: 18px 24px; display: flex; align-items: center; justify-content: space-between; }
  .bt-total-label { font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: ${vars.brandDark}; font-weight: 600; }
  .bt-total-value { font-family: 'Fraunces', serif; font-size: 28px; font-weight: 600; color: ${vars.brandDark}; }
  .bt-info-row { margin: 32px 48px 0; display: grid; grid-template-columns: 1fr 1.4fr; gap: 24px; }
  .bt-info-block { display: flex; gap: 14px; }
  .bt-info-title { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #5c6b67; margin-bottom: 6px; font-weight: 600; }
  .bt-info-block ul { margin: 0; padding-left: 16px; font-size: 12.5px; color: #5c6b67; line-height: 1.7; }
  .bt-payment-line { font-size: 14px; color: #1c2b27; line-height: 1.6; }
  .bt-closing { text-align: center; margin: 40px 48px 0; padding-top: 20px; border-top: 1px solid #dde7e3; }
  .bt-closing-title { font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: ${vars.brandDark}; font-weight: 600; margin-bottom: 4px; }
  .bt-closing-sub { font-size: 13px; color: #5c6b67; }
  .bt-footer { margin-top: 32px; background: ${vars.footerBg}; color: ${vars.footerText}; padding: 22px 48px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; font-size: 12px; }
  .bt-footer-item { display: flex; align-items: flex-start; gap: 8px; }
  .bt-footer-item svg { width: 14px; height: 14px; margin-top: 2px; flex-shrink: 0; color: ${vars.footerIcon}; }
  .bt-footer-name { color: #fff; font-weight: 600; font-family: 'Fraunces', serif; }
  .bt-footer-sub { color: ${vars.footerSub}; font-size: 11px; margin-top: 2px; }
  `;
}

const BT_ICON_TOOTH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3c-2.5 0-4.5 1.6-4.5 4 0 1 .3 1.7.6 2.6.5 1.4.9 3 .9 6.4 0 1.3.4 2 1 2s1-.9 1-2.5c0-1.3.4-2 1-2s1 .7 1 2c0 1.6.4 2.5 1 2.5s1-.7 1-2c0-3.4.4-5 .9-6.4.3-.9.6-1.6.6-2.6 0-2.4-2-4-4.5-4z"/></svg>';
const BT_ICON_CALENDAR =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
const BT_ICON_CLOCK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>';
const BT_ICON_CARD =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20"/></svg>';
const BT_ICON_NOTE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12h6M9 16h6M9 8h6"/><rect x="5" y="3" width="14" height="18" rx="2"/></svg>';
const BT_ICON_PIN =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
const BT_ICON_PHONE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 2.9a2 2 0 0 1-.4 2.1L8 10a16 16 0 0 0 6 6l1.3-1.4a2 2 0 0 1 2.1-.4c.9.4 1.9.6 2.9.7a2 2 0 0 1 1.7 2.1z"/></svg>';
const BT_ICON_INSTAGRAM =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>';

// Monta o HTML do orçamento em si (a "página"), pronto tanto pra injetar
// numa aba de pré-visualização quanto num container escondido pra
// capturar em canvas na exportação de verdade.
function buildBudgetTemplateBodyHTML({
  settings,
  patientName,
  procedures, // [{ name, value }]
  total,
  paymentLine,
  dateLabel,
  validityLabel,
  validityMonthsLabel,
}) {
  const orgKind = settings.orgLabel || "Consultório";
  const logoInner = settings.clinicLogoDataUrl
    ? `<img src="${escapeHtml(settings.clinicLogoDataUrl)}" alt="Logo" />`
    : BT_ICON_TOOTH;
  const rows = (procedures && procedures.length > 0 ? procedures : [{ name: "Procedimento", value: 0 }])
    .map(
      (p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><div class="bt-proc-name">${escapeHtml(p.name || "Sem nome")}</div></td>
        <td class="bt-proc-value">${escapeHtml(money(p.value || 0))}</td>
      </tr>`
    )
    .join("");
  const firstName = (patientName || "").trim().split(" ")[0] || "";
  const address = settings.address ? `${escapeHtml(settings.address)}` : "";
  const cro = settings.professionalRegistration ? escapeHtml(settings.professionalRegistration) : "";

  return `
  <div class="bt-page">
    <div class="bt-blob"></div>
    <div class="bt-header">
      <div class="bt-brand-row">
        <div class="bt-logo-mark">${logoInner}</div>
        <div>
          <div class="bt-clinic-name">${escapeHtml(settings.clinicName || "Nome")}</div>
          ${settings.specialty ? `<div class="bt-clinic-specialty">${escapeHtml(settings.specialty)}</div>` : ""}
          ${cro ? `<div class="bt-clinic-cro">${cro}</div>` : ""}
        </div>
      </div>
    </div>

    <div class="bt-hero">
      <div>
        <div class="bt-hero-label">Plano de tratamento</div>
        <h1>${firstName ? `Olá, ${escapeHtml(firstName)}!` : "Seu plano de tratamento"}</h1>
        <p>Preparamos seu plano de tratamento com todo o cuidado, pensando na sua saúde, conforto e bem-estar.</p>
      </div>
      <div class="bt-meta-col">
        <div class="bt-meta-item">
          <div class="bt-meta-icon">${BT_ICON_CALENDAR}</div>
          <div>
            <div class="bt-meta-label">Data do plano</div>
            <div class="bt-meta-value">${escapeHtml(dateLabel)}</div>
          </div>
        </div>
        <div class="bt-meta-item">
          <div class="bt-meta-icon">${BT_ICON_CLOCK}</div>
          <div>
            <div class="bt-meta-label">Validade do plano</div>
            <div class="bt-meta-value">${escapeHtml(validityLabel)}</div>
            <div class="bt-meta-sub">(${escapeHtml(validityMonthsLabel)})</div>
          </div>
        </div>
      </div>
    </div>

    <div class="bt-table-wrap">
      <table class="bt-table">
        <thead><tr><th>Item</th><th>Procedimento</th><th>Valor</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="bt-total-bar">
      <span class="bt-total-label">Valor total do plano de tratamento</span>
      <span class="bt-total-value">${escapeHtml(money(total))}</span>
    </div>

    <div class="bt-info-row">
      <div class="bt-info-block">
        <div class="bt-meta-icon">${BT_ICON_CARD}</div>
        <div>
          <div class="bt-info-title">Forma de pagamento</div>
          <div class="bt-payment-line">${escapeHtml(paymentLine || "A combinar")}</div>
        </div>
      </div>
      <div class="bt-info-block">
        <div class="bt-meta-icon">${BT_ICON_NOTE}</div>
        <div>
          <div class="bt-info-title">Informações importantes</div>
          <ul>
            <li>Este plano de tratamento é válido pelo prazo indicado.</li>
            <li>Os procedimentos descritos foram definidos com base na avaliação clínica realizada.</li>
            <li>Em caso de dúvidas, estamos à disposição para esclarecimentos.</li>
          </ul>
        </div>
      </div>
    </div>

    <div class="bt-closing">
      <div class="bt-closing-title">Cuidar do seu sorriso é sempre um prazer</div>
      <div class="bt-closing-sub">Conte conosco para realizar o seu tratamento com segurança, qualidade e atenção em cada etapa.</div>
    </div>

    <div class="bt-footer">
      <div class="bt-footer-item">
        ${BT_ICON_PIN}
        <div>${address || "Endereço não informado"}</div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div class="bt-footer-item">${BT_ICON_PHONE}<div>${escapeHtml(settings.phone || "—")}</div></div>
        ${
          settings.instagramHandle
            ? `<div class="bt-footer-item">${BT_ICON_INSTAGRAM}<div>@${escapeHtml(settings.instagramHandle)}</div></div>`
            : ""
        }
      </div>
      <div class="bt-footer-item" style="justify-content: flex-end; text-align: right; flex-direction: column; align-items: flex-end;">
        <div class="bt-footer-name">${escapeHtml(settings.clinicName || "Nome")}</div>
        <div class="bt-footer-sub">${cro ? cro + " · " : ""}${escapeHtml(orgKind)}</div>
      </div>
    </div>
  </div>`;
}

// Injeta as fontes do modelo (Fraunces/Inter) uma vez só — usado tanto na
// exportação de verdade quanto na pré-visualização em aba nova.
function ensureBudgetTemplateFontsLoaded() {
  if (document.getElementById("budget-template-fonts")) return;
  const div = document.createElement("div");
  div.id = "budget-template-fonts";
  div.style.display = "none";
  div.innerHTML = BUDGET_TEMPLATE_FONTS_LINK;
  document.head.appendChild(div);
}

// Desenha o modelo novo (HTML/CSS de verdade) escondido fora da tela, espera
// as fontes carregarem, e captura tudo num canvas — o mesmo tipo de objeto
// que o desenho manual em canvas produzia antes, então o resto do pipeline
// de exportação (handleExportPNG/PDF/Print, canvasToPDFBlob) não precisa
// mudar nada, só passa a receber um canvas "melhor".
async function renderBudgetTemplateToCanvas(data) {
  ensureBudgetTemplateFontsLoaded();

  const styleEl = document.createElement("style");
  styleEl.textContent = budgetTemplateCSS(budgetTemplateColorVars(data.settings.headerColor));
  document.head.appendChild(styleEl);

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-99999px";
  container.style.top = "0";
  container.innerHTML = buildBudgetTemplateBodyHTML(data);
  document.body.appendChild(container);

  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    // pequena espera extra pra imagem da logo (se houver) terminar de decodificar
    await new Promise((r) => setTimeout(r, 60));
    const canvas = await html2canvas(container.querySelector(".bt-page"), {
      scale: 2,
      backgroundColor: "#fbfaf7",
      useCORS: true,
    });
    return canvas;
  } finally {
    document.body.removeChild(container);
    document.head.removeChild(styleEl);
  }
}

// Abre o modelo de orçamento numa aba nova, com dados de EXEMPLO — usado
// pelo botão "Visualizar modelo de orçamento" em Configurações, pra
// conferir o resultado (logo, cor, especialidade, redes sociais) sem
// precisar simular um orçamento de verdade toda vez que mexe nas
// configurações. Não usa html2canvas (não precisa virar imagem/PDF aqui,
// só mostrar na tela) — abre o HTML/CSS puro numa aba, do jeito que o
// protótipo original também fazia.
function previewBudgetTemplate(settings) {
  const validityMonths = settings.quoteValidityMonths || 3;
  const validityDate = new Date();
  validityDate.setMonth(validityDate.getMonth() + validityMonths);

  const sampleData = {
    settings,
    patientName: "Maria",
    procedures: [
      { name: "Limpeza e profilaxia", value: 180 },
      { name: "Prótese Móvel", value: 1300 },
    ],
    total: 1480,
    paymentLine: "3x de R$ 493,33 no cartão",
    dateLabel: new Date().toLocaleDateString("pt-BR"),
    validityLabel: validityDate.toLocaleDateString("pt-BR"),
    validityMonthsLabel: `${validityMonths} ${validityMonths === 1 ? "mês" : "meses"}`,
  };

  const css = budgetTemplateCSS(budgetTemplateColorVars(settings.headerColor));
  const body = buildBudgetTemplateBodyHTML(sampleData);
  const fullHtml = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Modelo de orçamento — pré-visualização</title>${BUDGET_TEMPLATE_FONTS_LINK}<style>body{margin:0;background:#eef1ef;padding:32px 16px;display:flex;justify-content:center;font-family:sans-serif;}${css}</style></head><body>${body}</body></html>`;

  const blob = new Blob([fullHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function computeHourlyCost(laborCalc) {
  const fixedCosts = Number(laborCalc?.fixedCosts) || 0;
  const desiredIncome = Number(laborCalc?.desiredIncome) || 0;
  const productiveHours = Number(laborCalc?.productiveHours) || 0;
  if (productiveHours <= 0) return 0;
  return (fixedCosts + desiredIncome) / productiveHours;
}

const DEFAULT_PROCEDURES = [
  ["Prótese", [
    ["Prótese Total", 1000, 1800],
    ["Prótese Flexível", 1300, 1800],
    ["PPR", 1400, 2000],
    ["Prótese Móvel", 1000, 1300],
    ["Protocolo cartão ou à vista", 12000, 12000],
    ["Protocolo no boleto", 25000, 25000],
    ["Over Denture", 5000, 7000],
    ["Coroa ArtGlass", 900, 1400],
    ["Coroa Porcelana", 1800, 2300],
    ["Coroa Metalo-Cerâmica", 1800, 2300],
    ["Cirurgia Implante", 1500, 2000],
    ["Coroa sobre Implante", 1800, 2300],
  ]],
  ["Clínico", [
    ["Raspagem", 150, 200],
    ["Restauração 1 face", 120, 200],
    ["Restauração 2 faces", 150, 200],
    ["Restauração 3 faces", 150, 250],
    ["Exodontia simples", 100, 150],
    ["Exodontia Siso", 350, 450],
    ["Exodontia Decíduo", 120, 250],
    ["Placa de Bruxismo", 400, 700],
  ]],
  ["Endodontia", [
    ["Canal Incisivo", 350, 400],
    ["Canal Pré Molar", 450, 600],
    ["Canal Molar", 600, 800],
    ["Canal Decíduo", 350, 450],
  ]],
  ["Estética", [
    ["Clareamento Caseiro", 900, 1000],
    ["Clareamento Consultório", 900, 1000],
    ["Lente de Contato (resina)", 250, 350],
    ["Lente de Contato Estratificada (resina)", 350, 450],
    ["Faceta (resina)", 250, 450],
    ["Lente de Contato (porcelana)", 1000, 1200],
  ]],
  ["Ortodontia", [
    ["Montagem de aparelho convencional", 150, 250],
    ["Contenção Hawley", 550, 600],
    ["Contenção Estética", 650, 700],
  ]],
].flatMap(([category, items]) =>
  items.map(([name, valorMinimo, valorBase]) => ({
    id: uid(),
    name,
    category,
    cost: 0,
    additionalCost: 0,
    durationMinutes: 30,
    sessions: 1,
    laborCost: 0,
    marginPercent: 40,
    valorMinimo,
    valorBase,
  }))
);

function groupByCategory(procedures, extraCategories = []) {
  const map = new Map();
  extraCategories.forEach((cat) => {
    if (cat && !map.has(cat)) map.set(cat, []);
  });
  procedures.forEach((p) => {
    const cat = p.category || "Sem categoria";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(p);
  });
  return Array.from(map.entries());
}

function money(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function normalizeText(str) {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function pct(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return `${v.toFixed(2).replace(".", ",")}%`;
}

function formatPhoneBR(value) {
  const digits = (value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (digits.length <= 10) {
    // fixo: (xx) xxxx-xxxx
    const part1 = rest.slice(0, 4);
    const part2 = rest.slice(4);
    return `(${ddd}) ${part1}${part2 ? "-" + part2 : ""}`;
  }
  // celular: (xx) xxxxx-xxxx
  const part1 = rest.slice(0, 5);
  const part2 = rest.slice(5);
  return `(${ddd}) ${part1}${part2 ? "-" + part2 : ""}`;
}

function formatValidityText(months) {
  const m = Number(months) || 3;
  return `Orçamento válido por ${m} ${m === 1 ? "mês" : "meses"}`;
}

function buildPaymentMethods(settings) {
  const preset = getActivePreset(settings);
  const methods = [];
  methods.push({ key: "pix", label: "PIX / Dinheiro à vista", feePercent: Number(settings.pixFeePercent) || 0 });
  methods.push({ key: "debito", label: "Cartão de Débito", feePercent: Number(preset.debitFeePercent) || 0 });
  [...(preset.installmentFees || [])]
    .sort((a, b) => a.n - b.n)
    .forEach((row) => {
      const label = row.n === 1 ? "Crédito à vista (1x)" : `Crédito ${row.n}x`;
      methods.push({ key: `credito${row.n}`, label, feePercent: Number(row.fee) || 0, installments: row.n });
    });
  [...(settings.boletoInstallmentFees || [])]
    .sort((a, b) => a.n - b.n)
    .forEach((row) => {
      const label = row.n === 1 ? "Boleto à vista (1x)" : `Boleto ${row.n}x`;
      methods.push({ key: `boleto${row.n}`, label, feePercent: Number(row.fee) || 0, installments: row.n });
    });
  methods.push({ key: "convenio", label: "Convênio / Plano", feePercent: Number(settings.convenioDiscountPercent) || 0 });
  (settings.customFees || []).forEach((cf) => {
    methods.push({ key: `custom_${cf.id}`, label: cf.name || "Taxa personalizada", feePercent: Number(cf.percent) || 0 });
  });
  return methods;
}

function resolveFeePayerForMethod(m, settings) {
  const baseFeePayer = settings.feePayer === "clinic" ? "clinic" : "client";
  if (baseFeePayer !== "clinic") return baseFeePayer;
  const threshold = Number(settings.feePayerCreditThreshold) || 0;
  if (threshold > 0 && m.key && m.key.startsWith("credito") && m.installments > threshold) {
    return "client";
  }
  return baseFeePayer;
}

// ---------- Custo de procedimento a partir de materiais usados ----------
// Portado da calculadora de custos que o Marcelo já usava separada (HTML
// isolado) — mesma lógica de cálculo, só que agora lendo do catálogo de
// materiais do próprio Precifica (`materialsCatalog`) em vez de um arquivo
// à parte, pra alimentar o "Custo" do procedimento automaticamente.
function normUnit(u) {
  u = (u || "").toString().trim().toLowerCase();
  if (u.endsWith("s")) u = u.slice(0, -1);
  return u;
}

// Acha o item do catálogo que corresponde a um material usado — por NOME
// e MARCA (não só nome). Se houver mais de um material com o mesmo nome no
// catálogo (marcas diferentes, preços diferentes — ex: "Babador Branco"
// da AllPrime e da Hospflex), só casa quando a marca bate também; se só
// existir UMA opção com esse nome, casa mesmo que a marca do uso esteja
// vazia ou diferente (não força o usuário a preencher marca à toa quando
// não há ambiguidade nenhuma).
function findCatalogItem(catalog, materialName, brand) {
  const nameKey = (materialName || "").trim().toLowerCase();
  if (!nameKey) return null;
  const sameName = (catalog || []).filter((c) => (c.name || "").trim().toLowerCase() === nameKey);
  if (sameName.length === 0) return null;
  if (sameName.length === 1) return sameName[0];
  const brandKey = (brand || "").trim().toLowerCase();
  return sameName.find((c) => (c.brand || "").trim().toLowerCase() === brandKey) || null;
}

// Calcula o custo de UM uso de material (ex: "2 g de Resina X" numa
// restauração). Retorna { ok:false, reason } quando falta preço no
// catálogo, quantidade usada, ou a unidade não bate com a do catálogo —
// nesses casos o uso simplesmente não entra na soma (não trava o cálculo
// do procedimento inteiro).
function calcMaterialUsageCost(catalog, usage) {
  const item = findCatalogItem(catalog, usage.material, usage.brand);
  const qty = parseFloat((usage.qty || "").toString().replace(",", "."));
  if (!item) return { ok: false, reason: "sem preço cadastrado no catálogo" };
  if (isNaN(qty) || qty <= 0) return { ok: false, reason: "sem quantidade usada" };
  const packQty = parseFloat((item.packageQty || "").toString().replace(",", "."));
  const packPrice = parseFloat((item.packagePrice || "").toString().replace(",", "."));
  if (isNaN(packQty) || packQty <= 0 || isNaN(packPrice)) return { ok: false, reason: "preço incompleto no catálogo" };
  if (normUnit(usage.unit) !== normUnit(item.packageUnit)) {
    return { ok: false, reason: `unidade diferente do catálogo (${item.packageUnit || "?"})` };
  }
  return { ok: true, value: (qty / packQty) * packPrice };
}

// Soma o custo de todos os materiais usados num procedimento.
function calcMaterialsCost(catalog, materials) {
  let total = 0;
  let complete = 0;
  let incomplete = 0;
  (materials || []).forEach((m) => {
    if (!m.material || !m.material.trim()) return;
    const r = calcMaterialUsageCost(catalog, m);
    if (r.ok) {
      total += r.value;
      complete++;
    } else {
      incomplete++;
    }
  });
  return { total, complete, incomplete, hasAny: complete + incomplete > 0 };
}

// Marcas já cadastradas no catálogo pra ESSE material específico (não
// todas as marcas do catálogo) — usado pra sugerir a marca certa assim que
// a pessoa escolhe o material, já que normalmente o mesmo material só tem
// uma ou duas marcas de verdade cadastradas.
function brandSuggestionsFor(catalog, materialName) {
  const key = normalizeText((materialName || "").trim());
  if (!key) return [];
  const brands = (catalog || [])
    .filter((c) => normalizeText(c.name || "") === key)
    .map((c) => c.brand)
    .filter(Boolean);
  return Array.from(new Set(brands));
}

function calcProcedure(proc, settings, materialsCatalog) {
  const hasMaterials = Array.isArray(proc.materials) && proc.materials.length > 0;
  const materialsCost = hasMaterials ? calcMaterialsCost(materialsCatalog, proc.materials) : null;
  const directCost = hasMaterials ? materialsCost.total : Number(proc.cost) || 0;
  const additionalCost = Number(proc.additionalCost) || 0;
  const durationMinutes = Number(proc.durationMinutes) || 0;
  const sessions = Math.max(1, Number(proc.sessions) || 1);
  const hourlyCost = computeHourlyCost(settings.laborCalc || DEFAULT_SETTINGS.laborCalc);
  const laborCost = ((durationMinutes * sessions) / 60) * hourlyCost;
  const totalCost = directCost + additionalCost + laborCost;
  const margin = Number(proc.marginPercent) || 0;
  const suggestedBase = Math.round(margin < 100 ? totalCost / (1 - margin / 100) : totalCost);
  const listPrice = Number(proc.valorBase) > 0 ? Number(proc.valorBase) : suggestedBase;
  // Sem custo cadastrado ainda, usa o valor de tabela como base pra "cobrar mantendo margem"
  const adjustmentBasis = totalCost > 0 ? suggestedBase : listPrice;
  const taxPct = Number(settings.taxProvisionPercent) || 0;
  const methods = buildPaymentMethods(settings);

  const rows = methods.map((m) => {
    const rowFeePayer = resolveFeePayerForMethod(m, settings);
    const adjustedPrice =
      rowFeePayer === "clinic" ? adjustmentBasis : m.feePercent < 100 ? adjustmentBasis / (1 - m.feePercent / 100) : null;
    const feeAmountFixed = (listPrice * m.feePercent) / 100;
    const taxAmountFixed = (listPrice * taxPct) / 100;
    const netFixed = listPrice - feeAmountFixed - taxAmountFixed;
    const profitFixed = netFixed - totalCost;
    const realMarginFixed = netFixed !== 0 ? (profitFixed / netFixed) * 100 : null;

    let realProfit = null;
    let realMarginPercent = null;
    let feeAmount = null;
    let taxAmount = null;
    if (adjustedPrice != null) {
      feeAmount = (adjustedPrice * m.feePercent) / 100;
      taxAmount = (adjustedPrice * taxPct) / 100;
      const netReceived = adjustedPrice - feeAmount - taxAmount;
      realProfit = netReceived - totalCost;
      realMarginPercent = netReceived !== 0 ? (realProfit / netReceived) * 100 : null;
    }

    return { ...m, adjustedPrice, netFixed, profitFixed, realMarginFixed, realProfit, realMarginPercent, feeAmount, taxAmount };
  });

  return { totalCost, directCost, additionalCost, laborCost, margin, suggestedBase, listPrice, taxPct, rows, materialsCost };
}

function calcBudget(procList, settings, clientLevelPercent = 0, materialsCatalog) {
  const taxPct = Number(settings.taxProvisionPercent) || 0;
  const methods = buildPaymentMethods(settings);
  const hourlyCost = computeHourlyCost(settings.laborCalc || DEFAULT_SETTINGS.laborCalc);

  let sumCost = 0;
  let sumDirectCost = 0;
  let sumLaborCost = 0;
  let sumBasis = 0;
  let sumListPrice = 0;

  procList.forEach((proc) => {
    const hasMaterials = Array.isArray(proc.materials) && proc.materials.length > 0;
    const directCost = hasMaterials ? calcMaterialsCost(materialsCatalog, proc.materials).total : Number(proc.cost) || 0;
    const additionalCost = Number(proc.additionalCost) || 0;
    const durationMinutes = Number(proc.durationMinutes) || 0;
    const sessions = Math.max(1, Number(proc.sessions) || 1);
    const laborCost = ((durationMinutes * sessions) / 60) * hourlyCost;
    const totalCost = directCost + additionalCost + laborCost;
    const margin = Number(proc.marginPercent) || 0;
    const suggestedBase = Math.round(margin < 100 ? totalCost / (1 - margin / 100) : totalCost);
    const listPrice = Number(proc.valorBase) > 0 ? Number(proc.valorBase) : suggestedBase;
    const basis = totalCost > 0 ? suggestedBase : listPrice;
    sumCost += totalCost;
    sumDirectCost += directCost + additionalCost;
    sumLaborCost += laborCost;
    sumBasis += basis;
    sumListPrice += listPrice;
  });

  const markupMult = 1 + (Number(clientLevelPercent) || 0) / 100;
  sumBasis *= markupMult;
  sumListPrice *= markupMult;

  const rows = methods.map((m) => {
    const rowFeePayer = resolveFeePayerForMethod(m, settings);
    const adjustedPrice =
      rowFeePayer === "clinic" ? sumBasis : m.feePercent < 100 ? sumBasis / (1 - m.feePercent / 100) : null;
    const feeAmountFixed = (sumListPrice * m.feePercent) / 100;
    const taxAmountFixed = (sumListPrice * taxPct) / 100;
    const netFixed = sumListPrice - feeAmountFixed - taxAmountFixed;
    const profitFixed = netFixed - sumCost;
    const realMarginFixed = netFixed !== 0 ? (profitFixed / netFixed) * 100 : null;

    let realProfit = null;
    let realMarginPercent = null;
    let feeAmount = null;
    let taxAmount = null;
    if (adjustedPrice != null) {
      feeAmount = (adjustedPrice * m.feePercent) / 100;
      taxAmount = (adjustedPrice * taxPct) / 100;
      const netReceived = adjustedPrice - feeAmount - taxAmount;
      realProfit = netReceived - sumCost;
      realMarginPercent = netReceived !== 0 ? (realProfit / netReceived) * 100 : null;
    }

    return { ...m, adjustedPrice, netFixed, profitFixed, realMarginFixed, realProfit, realMarginPercent, feeAmount, taxAmount };
  });

  return {
    totalCost: sumCost,
    directCost: sumDirectCost,
    laborCost: sumLaborCost,
    listPrice: sumListPrice,
    taxPct,
    rows,
    clientLevelPercent: Number(clientLevelPercent) || 0,
  };
}




function FeeField({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2.5">
      <label className="text-sm text-stone-600">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20 text-sm font-mono border border-stone-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-teal-400 text-right"
        />
        <span className="text-sm text-stone-400">%</span>
      </div>
    </div>
  );
}

function sortItems(items, calcs, sortConfig) {
  if (!sortConfig || !sortConfig.key) return items;
  const { key, direction } = sortConfig;
  const dir = direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    let av, bv;
    if (key === "name") {
      av = (a.name || "").toLowerCase();
      bv = (b.name || "").toLowerCase();
    } else if (key === "suggestedBase") {
      av = calcs[a.id]?.suggestedBase || 0;
      bv = calcs[b.id]?.suggestedBase || 0;
    } else if (key === "totalCost") {
      av = calcs[a.id]?.totalCost || 0;
      bv = calcs[b.id]?.totalCost || 0;
    } else if (key === "profit") {
      av = (calcs[a.id]?.listPrice || 0) - (calcs[a.id]?.totalCost || 0);
      bv = (calcs[b.id]?.listPrice || 0) - (calcs[b.id]?.totalCost || 0);
    } else if (key === "laborCost") {
      av = calcs[a.id]?.laborCost || 0;
      bv = calcs[b.id]?.laborCost || 0;
    } else {
      av = Number(a[key]) || 0;
      bv = Number(b[key]) || 0;
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

function SortableHeader({ label, sortKey, sortConfig, onSort, align = "right", title, headerProps, width, onResize, onResizeCommit }) {
  const active = sortConfig?.key === sortKey;

  function startResize(e) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = width || 100;
    function onMove(ev) {
      // Só atualiza o estado "ao vivo" (visual) do pai — nenhuma chamada de
      // rede acontece aqui, isso é só reposicionar a borda enquanto arrasta.
      onResize(Math.max(90, startWidth + (ev.clientX - startX)));
    }
    function onUp(ev) {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      // Só persiste (chamada de rede) uma vez, ao soltar o mouse.
      onResizeCommit(Math.max(90, startWidth + (ev.clientX - startX)));
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <th
      className={`px-3 py-2 font-medium relative select-none ${align === "right" ? "text-right" : "text-left"}`}
      style={{ width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
      title={title}
      {...headerProps}
    >
      <button
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-stone-600 transition group max-w-full ${active ? "text-teal-700" : ""}`}
      >
        <span className="truncate">{label}</span>
        {active ? (
          sortConfig.direction === "asc" ? (
            <ChevronUp className="w-3 h-3 shrink-0" />
          ) : (
            <ChevronDown className="w-3 h-3 shrink-0" />
          )
        ) : (
          <ChevronDown className="w-3 h-3 opacity-0 group-hover:opacity-100 shrink-0" />
        )}
      </button>
      {onResize && (
        <div
          onMouseDown={startResize}
          title="Arraste para redimensionar"
          className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-teal-300/60"
        />
      )}
    </th>
  );
}

function ProcedureTable({
  procedures = [],
  calcs,
  settings,
  selectedId,
  onSelect,
  onUpdate,
  onDelete,
  onDuplicate,
  onEditProcedure,
  onRenameCategory,
  onDeleteCategory,
  onEqualizeMargins,
  columnWidths: columnWidthsProp,
  onResizeColumn,
}) {
  const categories = settings.procedureCategories || [];
  // Mescla com o padrão, mas ignora qualquer largura salva menor que o
  // mínimo permitido no redimensionamento (90px) — protege contra um valor
  // corrompido/errado ter ficado salvo de uma tentativa anterior, em vez de
  // reproduzir a mesma coluna minúscula pra sempre.
  function mergeColumnWidths(saved) {
    const merged = { ...DEFAULT_PROCEDURE_COLUMN_WIDTHS };
    Object.entries(saved || {}).forEach(([key, value]) => {
      if (typeof value === "number" && value >= 90) merged[key] = value;
    });
    return merged;
  }
  const mergedColumnWidths = mergeColumnWidths(columnWidthsProp);

  // Largura mínima calculada, pra CADA coluna, a partir do maior conteúdo
  // real que existe ali agora (número ou texto) — assim nenhuma coluna
  // corta valor nenhum com "..." nem deixa número escondido dentro do
  // campo, e ao mesmo tempo a tabela não fica com colunas maiores do que
  // precisa. Estimativa de ~8,6px por caractere (fonte usada nas células,
  // tanto a monoespaçada dos números quanto a normal do nome) + um respiro
  // fixo pra padding/ícone de ordenar/alça de redimensionar.
  const CHAR_WIDTH = 8.6;
  const CHROME = 48; // padding da célula + ícone de ordenar + alça de resize
  function widthFor(text, extra = 0) {
    return Math.ceil(String(text ?? "").length * CHAR_WIDTH) + CHROME + extra;
  }
  const COLUMN_LABELS = {
    name: "Procedimento",
    cost: "Custo",
    additionalCost: "Custo adicional",
    valorBase: "Valor",
    marginPercent: "% Lucro",
    suggestedBase: "Preço Final",
    durationMinutes: "Duração",
    sessions: "Sessões",
    totalCost: "Custo Total",
    profit: "Lucro",
  };
  const safeMinWidths = useMemo(() => {
    const widest = {}; // maior texto de CONTEÚDO (sem o cabeçalho ainda) por coluna
    Object.keys(COLUMN_LABELS).forEach((key) => {
      widest[key] = "";
    });
    procedures.forEach((p) => {
      const c = calcs[p.id];
      const costText = Array.isArray(p.materials) && p.materials.length > 0 ? money(c ? c.directCost : 0) : String(p.cost ?? "");
      const candidates = {
        name: p.name || "",
        cost: costText,
        additionalCost: String(p.additionalCost ?? ""),
        valorBase: String(p.valorBase ?? ""),
        marginPercent: String(p.marginPercent ?? ""),
        suggestedBase: c ? money(c.suggestedBase) : "",
        durationMinutes: String(p.durationMinutes ?? ""),
        sessions: String(p.sessions ?? ""),
        totalCost: c ? money(c.totalCost) : "",
        profit: c ? money(c.listPrice - c.totalCost) : "",
      };
      Object.entries(candidates).forEach(([key, text]) => {
        if (text.length > widest[key].length) widest[key] = text;
      });
    });
    const result = {};
    Object.keys(COLUMN_LABELS).forEach((key) => {
      const extra = key === "marginPercent" ? 22 : 0; // espaço extra pro "%" ao lado do número
      const contentWidth = widthFor(widest[key], extra);
      const headerWidth = widthFor(COLUMN_LABELS[key]);
      result[key] = Math.max(contentWidth, headerWidth);
    });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [procedures, calcs]);
  // Largura "ao vivo" de cada coluna — é o que efetivamente é desenhado na
  // tela. Fica num só lugar (aqui) em vez de espalhada por cada
  // SortableHeader, porque a largura TOTAL da tabela (usada no estilo do
  // <table>, mais abaixo) precisa somar exatamente esses mesmos números,
  // sempre em sincronia, inclusive durante o arraste de redimensionar.
  const [columnWidths, setColumnWidths] = useState(mergedColumnWidths);
  useEffect(() => {
    setColumnWidths(mergeColumnWidths(columnWidthsProp));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(columnWidthsProp || {})]);

  function liveResizeColumn(key, width) {
    setColumnWidths((prev) => ({ ...prev, [key]: width }));
  }

  const tableTotalWidth = Object.entries(columnWidths).reduce(
    (sum, [key, w]) => sum + Math.max(Number(w) || 0, safeMinWidths[key] || 0),
    0
  );
  const effectiveColumnWidths = Object.fromEntries(
    Object.keys(COLUMN_LABELS).map((key) => [key, Math.max(columnWidths[key], safeMinWidths[key] || 0)])
  );

  const [collapsed, setCollapsed] = useState(() => {
    const initial = {};
    groupByCategory(procedures, categories).forEach(([cat]) => {
      initial[cat] = true;
    });
    return initial;
  });
  const [query, setQuery] = useState("");
  const [sortConfig, setSortConfig] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [categoryMenu, setCategoryMenu] = useState(null); // { x, y, cat }
  const [marginHeaderMenu, setMarginHeaderMenu] = useState(null); // { x, y }
  const [renamingCategory, setRenamingCategory] = useState(null); // nome original sendo renomeado
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState(null);

  // Infra de "toque e segure" pra abrir o mesmo menu de contexto no celular
  // (onContextMenu não dispara em toque; refs ficam aqui em vez de dentro do
  // .map(), porque hooks não podem ser chamados por item de uma lista).
  const longPressTimerRef = useRef(null);
  const longPressMovedRef = useRef(false);
  const suppressClickRef = useRef(false);

  function longPressHandlers(onLongPress) {
    return {
      onTouchStart: (e) => {
        longPressMovedRef.current = false;
        const touch = e.touches[0];
        const point = { clientX: touch.clientX, clientY: touch.clientY };
        longPressTimerRef.current = setTimeout(() => {
          if (!longPressMovedRef.current) {
            suppressClickRef.current = true;
            onLongPress(point);
          }
        }, 500);
      },
      onTouchMove: () => {
        longPressMovedRef.current = true;
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      },
      onTouchEnd: () => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      },
    };
  }

  function consumeSuppressedClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return true;
    }
    return false;
  }

  function openContextMenu(point, procId) {
    point.preventDefault?.();
    const menuWidth = 240;
    const menuHeight = 160;
    const x = Math.min(point.clientX, Math.max(8, window.innerWidth - menuWidth - 8));
    const y = Math.min(point.clientY, Math.max(8, window.innerHeight - menuHeight - 8));
    setContextMenu({ x, y, procId });
  }

  function openCategoryMenu(point, cat) {
    point.preventDefault?.();
    if (cat === "Sem categoria") return; // categoria "coringa", não é editável/removível
    const menuWidth = 170;
    const menuHeight = 84;
    const x = Math.min(point.clientX, Math.max(8, window.innerWidth - menuWidth - 8));
    const y = Math.min(point.clientY, Math.max(8, window.innerHeight - menuHeight - 8));
    setCategoryMenu({ x, y, cat });
  }

  function openMarginHeaderMenu(point) {
    point.preventDefault?.();
    const menuWidth = 160;
    const menuHeight = 52;
    const x = Math.min(point.clientX, Math.max(8, window.innerWidth - menuWidth - 8));
    const y = Math.min(point.clientY, Math.max(8, window.innerHeight - menuHeight - 8));
    setMarginHeaderMenu({ x, y });
  }

  function toggleCategory(cat) {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  function toggleSort(key) {
    setSortConfig((prev) => {
      if (prev?.key === key) return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      return { key, direction: "asc" };
    });
  }

  const q = normalizeText(query.trim());
  const filtered = q ? procedures.filter((p) => normalizeText(p.name).includes(q)) : procedures;
  const groups = groupByCategory(filtered, q ? [] : categories);
  const renderGroups = groups.map(([cat, items]) => ({
    cat,
    items: sortItems(items, calcs, sortConfig),
    isCollapsed: !q && !!collapsed[cat],
  }));

  useEffect(() => {
    function handleKeyDown(e) {
      const active = document.activeElement;
      const isInputFocused = active && active.tagName === "INPUT";

      if (e.key === "Enter") {
        if (isInputFocused) active.blur();
        return;
      }

      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      if (isInputFocused) return;
      if (!selectedId) return;

      const visibleIds = [];
      renderGroups.forEach((g) => {
        if (g.isCollapsed) return;
        g.items.forEach((p) => visibleIds.push(p.id));
      });
      const idx = visibleIds.indexOf(selectedId);
      if (idx === -1) return;

      e.preventDefault();
      const nextIdx = e.key === "ArrowDown" ? Math.min(idx + 1, visibleIds.length - 1) : Math.max(idx - 1, 0);
      onSelect(visibleIds[nextIdx]);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div
      className="bg-white border border-stone-200 rounded-2xl overflow-hidden mx-auto"
      style={{ width: "fit-content", maxWidth: "100%" }}
    >
      <div className="flex items-center gap-2 px-5 py-3 border-b border-stone-200">
        <Search className="w-4 h-4 text-stone-400 shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar procedimento..."
          className="flex-1 text-sm outline-none bg-transparent placeholder:text-stone-400"
        />
        {query && (
          <button onClick={() => setQuery("")} className="text-stone-300 hover:text-stone-600 shrink-0">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="text-sm table-fixed" style={{ width: `${tableTotalWidth}px` }}>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-stone-400 border-b border-stone-100">
              <SortableHeader
                label="Procedimento"
                sortKey="name"
                sortConfig={sortConfig}
                onSort={toggleSort}
                align="left"
                title="Nome do procedimento"
                width={effectiveColumnWidths.name}
                onResize={(w) => liveResizeColumn("name", w)}
                onResizeCommit={(w) => onResizeColumn("name", w)}
              />
              <SortableHeader
                label="Custo"
                sortKey="cost"
                sortConfig={sortConfig}
                onSort={toggleSort}
                title="Custo de materiais clínicos — não inclui tempo em cadeira nem custo adicional, só materiais"
                width={effectiveColumnWidths.cost}
                onResize={(w) => liveResizeColumn("cost", w)}
                onResizeCommit={(w) => onResizeColumn("cost", w)}
              />
              <SortableHeader
                label="Custo adicional"
                sortKey="additionalCost"
                sortConfig={sortConfig}
                onSort={toggleSort}
                title="Custo de terceirização (outro dentista) ou material de laboratório (ex: valor do laboratório de prótese) — somado ao custo total"
                width={effectiveColumnWidths.additionalCost}
                onResize={(w) => liveResizeColumn("additionalCost", w)}
                onResizeCommit={(w) => onResizeColumn("additionalCost", w)}
              />
              <SortableHeader
                label="Valor"
                sortKey="valorBase"
                sortConfig={sortConfig}
                onSort={toggleSort}
                title="Valor cobrado do paciente por esse procedimento"
                width={effectiveColumnWidths.valorBase}
                onResize={(w) => liveResizeColumn("valorBase", w)}
                onResizeCommit={(w) => onResizeColumn("valorBase", w)}
              />
              <SortableHeader
                label="% Lucro"
                sortKey="marginPercent"
                sortConfig={sortConfig}
                onSort={toggleSort}
                title="Margem de lucro alvo sobre o custo total (materiais + custo adicional + tempo em cadeira). Clique direito (ou toque e segure) pra igualar a margem de todos de uma vez"
                width={effectiveColumnWidths.marginPercent}
                onResize={(w) => liveResizeColumn("marginPercent", w)}
                onResizeCommit={(w) => onResizeColumn("marginPercent", w)}
                headerProps={{
                  onContextMenu: (e) => openMarginHeaderMenu(e),
                  ...longPressHandlers((point) => openMarginHeaderMenu(point)),
                }}
              />
              <SortableHeader
                label="Preço Final"
                sortKey="suggestedBase"
                sortConfig={sortConfig}
                onSort={toggleSort}
                title="Preço mínimo pra bater a margem de lucro definida, calculado a partir do custo total"
                width={effectiveColumnWidths.suggestedBase}
                onResize={(w) => liveResizeColumn("suggestedBase", w)}
                onResizeCommit={(w) => onResizeColumn("suggestedBase", w)}
              />
              <SortableHeader
                label="Duração"
                sortKey="durationMinutes"
                sortConfig={sortConfig}
                onSort={toggleSort}
                title="Tempo estimado de cadeira por sessão, em minutos — multiplicado pelo número de Sessões pra calcular o custo total de tempo. Passe o mouse sobre o campo de duração pra ver esse custo já calculado"
                width={effectiveColumnWidths.durationMinutes}
                onResize={(w) => liveResizeColumn("durationMinutes", w)}
                onResizeCommit={(w) => onResizeColumn("durationMinutes", w)}
              />
              <SortableHeader
                label="Sessões"
                sortKey="sessions"
                sortConfig={sortConfig}
                onSort={toggleSort}
                title="Número de sessões/consultas necessárias pra concluir o procedimento — multiplica o tempo de cadeira (Duração × Sessões) no cálculo de custo"
                width={effectiveColumnWidths.sessions}
                onResize={(w) => liveResizeColumn("sessions", w)}
                onResizeCommit={(w) => onResizeColumn("sessions", w)}
              />
              <SortableHeader
                label="Custo Total"
                sortKey="totalCost"
                sortConfig={sortConfig}
                onSort={toggleSort}
                title="Soma do custo de materiais + custo adicional (terceirização/laboratório) + custo do tempo em cadeira (mão de obra)"
                width={effectiveColumnWidths.totalCost}
                onResize={(w) => liveResizeColumn("totalCost", w)}
                onResizeCommit={(w) => onResizeColumn("totalCost", w)}
              />
              <SortableHeader
                label="Lucro"
                sortKey="profit"
                sortConfig={sortConfig}
                onSort={toggleSort}
                title="Valor cobrado menos o custo total — lucro bruto, antes de taxas de pagamento e impostos"
                width={effectiveColumnWidths.profit}
                onResize={(w) => liveResizeColumn("profit", w)}
                onResizeCommit={(w) => onResizeColumn("profit", w)}
              />
            </tr>
          </thead>
          {renderGroups.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={10} className="px-5 py-8 text-center text-sm text-stone-400">
                  Nenhum procedimento encontrado para "{query}"
                </td>
              </tr>
            </tbody>
          )}
          {renderGroups.map(({ cat, items, isCollapsed }) => (
            <tbody key={cat} className="divide-y divide-stone-50">
              <tr
                className="bg-stone-50 cursor-pointer hover:bg-stone-100"
                onClick={() => {
                  if (consumeSuppressedClick()) return;
                  toggleCategory(cat);
                }}
                onContextMenu={(e) => openCategoryMenu(e, cat)}
                {...longPressHandlers((point) => openCategoryMenu(point, cat))}
              >
                <td colSpan={10} className="px-5 py-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isCollapsed ? "" : "rotate-90"}`} />
                    {cat}
                    <span className="normal-case font-normal text-stone-300">({items.length})</span>
                  </div>
                </td>
              </tr>
              {!isCollapsed &&
                items.map((p) => {
                  const calc = calcs[p.id];
                  const isSelected = selectedId === p.id;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => {
                        if (consumeSuppressedClick()) return;
                        onSelect(p.id);
                      }}
                      onContextMenu={(e) => {
                        openContextMenu(e, p.id);
                        onSelect(p.id);
                      }}
                      {...longPressHandlers((point) => {
                        openContextMenu(point, p.id);
                        onSelect(p.id);
                      })}
                      className={`cursor-pointer border-l-2 ${
                        isSelected ? "bg-teal-50 border-teal-600" : "border-transparent hover:bg-stone-50"
                      }`}
                    >
                      <td className="px-5 py-1.5">
                        <input
                          value={p.name}
                          onChange={(e) => onUpdate(p.id, { name: e.target.value })}
                          className="w-full text-sm font-medium bg-stone-100/70 border border-stone-200 hover:border-teal-300 hover:bg-stone-50 focus:bg-white focus:border-teal-400 rounded-lg px-2.5 py-1 outline-none transition"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        {Array.isArray(p.materials) && p.materials.length > 0 ? (
                          <div
                            className="w-full text-sm font-mono text-right text-stone-500 bg-stone-100 rounded-full px-2.5 py-1"
                            title="Calculado a partir dos materiais usados — edite em “Editar” no menu de contexto"
                          >
                            {money(calc ? calc.directCost : 0)}
                          </div>
                        ) : (
                          <input
                            type="number"
                            value={p.cost}
                            onChange={(e) => onUpdate(p.id, { cost: e.target.value })}
                            className="w-full min-w-0 text-sm font-mono text-right bg-stone-100/70 border border-stone-200 hover:border-teal-300 hover:bg-stone-50 focus:bg-white focus:border-teal-400 rounded-full px-2.5 py-1 outline-none transition"
                          />
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          value={p.additionalCost ?? 0}
                          onChange={(e) => onUpdate(p.id, { additionalCost: e.target.value })}
                          title="Terceirização (outro dentista) ou laboratório (ex: prótese)"
                          className="w-full min-w-0 text-sm font-mono text-right bg-stone-100/70 border border-stone-200 hover:border-teal-300 hover:bg-stone-50 focus:bg-white focus:border-teal-400 rounded-full px-2.5 py-1 outline-none transition"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          value={p.valorBase}
                          onChange={(e) => onUpdate(p.id, { valorBase: e.target.value })}
                          className="w-full min-w-0 text-sm font-mono font-semibold text-teal-800 text-right bg-teal-50 border border-teal-100 hover:border-teal-300 hover:bg-teal-50 focus:bg-white focus:border-teal-400 rounded-full px-2.5 py-1 outline-none transition"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center justify-end gap-1 min-w-0">
                          <input
                            type="number"
                            value={p.marginPercent}
                            onChange={(e) => onUpdate(p.id, { marginPercent: e.target.value })}
                            className="w-full min-w-0 text-sm font-mono text-right bg-stone-100/70 border border-stone-200 hover:border-teal-300 hover:bg-stone-50 focus:bg-white focus:border-teal-400 rounded-full px-2.5 py-1 outline-none transition"
                          />
                          <span className="text-stone-400 shrink-0">%</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono font-semibold text-amber-700 overflow-hidden">
                        <div className="truncate">{calc ? money(calc.suggestedBase) : "—"}</div>
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          value={p.durationMinutes}
                          onChange={(e) => onUpdate(p.id, { durationMinutes: e.target.value })}
                          title={`Custo do tempo em cadeira (já multiplicado pelas sessões): ${money(calc ? calc.laborCost : 0)}`}
                          className="w-full min-w-0 text-sm font-mono text-right bg-stone-100/70 border border-stone-200 hover:border-teal-300 hover:bg-stone-50 focus:bg-white focus:border-teal-400 rounded-full px-2.5 py-1 outline-none transition"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          value={p.sessions ?? 1}
                          min={1}
                          onChange={(e) => onUpdate(p.id, { sessions: e.target.value })}
                          className="w-full min-w-0 text-sm font-mono text-right bg-stone-100/70 border border-stone-200 hover:border-teal-300 hover:bg-stone-50 focus:bg-white focus:border-teal-400 rounded-full px-2.5 py-1 outline-none transition"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right overflow-hidden">
                        <div
                          className="font-mono text-sm font-semibold text-rose-600 truncate"
                          title={
                            calc
                              ? `Materiais${calc.materialsCost ? "" : " (manual)"}: ${money(calc.directCost)}\nCusto adicional: ${money(
                                  calc.additionalCost
                                )}\nMão de obra (${p.durationMinutes || 0} min × ${p.sessions || 1}): ${money(
                                  calc.laborCost
                                )}\n───────────\nCusto Total: ${money(calc.totalCost)}`
                              : "Custo de materiais + custo adicional (terceirização/laboratório) + custo do tempo em cadeira (mão de obra)"
                          }
                        >
                          {money(calc ? calc.totalCost : 0)}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-right overflow-hidden">
                        <div
                          className="font-mono text-sm font-semibold text-emerald-600 truncate"
                          title={
                            calc
                              ? `Valor cobrado: ${money(calc.listPrice)}\nCusto total: ${money(
                                  calc.totalCost
                                )}\n───────────\nLucro: ${money(calc.listPrice - calc.totalCost)}`
                              : "Valor cobrado menos o custo total — lucro bruto, antes de taxas de pagamento e impostos"
                          }
                        >
                          {money(calc ? calc.listPrice - calc.totalCost : 0)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          ))}
        </table>
      </div>

      {contextMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu(null);
          }}
        >
          <div
            className="absolute bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden py-1 w-60"
            style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                onEditProcedure(contextMenu.procId);
                setContextMenu(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition inline-flex items-center gap-2"
            >
              <Pencil className="w-3.5 h-3.5 text-stone-400" /> Editar
            </button>
            {(() => {
              const contextProc = procedures.find((p) => p.id === contextMenu.procId);
              const contextCalc = calcs[contextMenu.procId];
              if (!contextProc || !contextCalc) return null;
              const totalCost = contextCalc.totalCost || 0;
              const valorBase = Number(contextProc.valorBase) || 0;
              if (!(totalCost > 0 && valorBase > 0)) return null;
              const requiredMargin = 100 * (1 - totalCost / valorBase);
              const alreadyMatches = Math.abs(requiredMargin - (Number(contextProc.marginPercent) || 0)) < 0.01;
              if (alreadyMatches) return null;
              return (
                <button
                  onClick={() => {
                    onUpdate(contextMenu.procId, { marginPercent: Number(requiredMargin.toFixed(2)) });
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition"
                >
                  Igualar margem ao valor ({pct(requiredMargin)})
                </button>
              );
            })()}
            <button
              onClick={() => {
                onDuplicate(contextMenu.procId);
                setContextMenu(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition"
            >
              Duplicar
            </button>
            <button
              onClick={() => {
                onDelete(contextMenu.procId);
                setContextMenu(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 transition"
            >
              Excluir
            </button>
          </div>
        </div>
      )}

      {categoryMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setCategoryMenu(null);
            setConfirmDeleteCategory(null);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setCategoryMenu(null);
            setConfirmDeleteCategory(null);
          }}
        >
          <div
            className="absolute bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden py-1 w-40"
            style={{ top: `${categoryMenu.y}px`, left: `${categoryMenu.x}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setRenamingCategory(categoryMenu.cat);
                setRenameValue(categoryMenu.cat);
                setCategoryMenu(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition inline-flex items-center gap-2"
            >
              <Pencil className="w-3.5 h-3.5 text-stone-400" /> Editar
            </button>
            {confirmDeleteCategory === categoryMenu.cat ? (
              <button
                onClick={() => {
                  onDeleteCategory(categoryMenu.cat);
                  setCategoryMenu(null);
                  setConfirmDeleteCategory(null);
                }}
                className="w-full text-left px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 transition"
              >
                Confirmar exclusão?
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDeleteCategory(categoryMenu.cat);
                }}
                className="w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 transition"
              >
                Excluir
              </button>
            )}
          </div>
        </div>
      )}

      {marginHeaderMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setMarginHeaderMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMarginHeaderMenu(null);
          }}
        >
          <div
            className="absolute bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden py-1 w-48"
            style={{ top: `${marginHeaderMenu.y}px`, left: `${marginHeaderMenu.x}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                onEqualizeMargins(filtered.map((p) => p.id));
                setMarginHeaderMenu(null);
              }}
              title="Ajusta a margem de todo procedimento visível pra bater exatamente com o valor cobrado"
              className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition"
            >
              Igualar tudo
            </button>
          </div>
        </div>
      )}

      {renamingCategory && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setRenamingCategory(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-xs w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-stone-800 mb-3 text-sm">Renomear categoria</h3>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameValue.trim()) {
                  onRenameCategory(renamingCategory, renameValue.trim());
                  setRenamingCategory(null);
                }
              }}
              className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setRenamingCategory(null)}
                className="text-xs font-medium text-stone-500 border border-stone-200 rounded-lg px-3 py-2 hover:bg-stone-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (!renameValue.trim()) return;
                  onRenameCategory(renamingCategory, renameValue.trim());
                  setRenamingCategory(null);
                }}
                disabled={!renameValue.trim()}
                className="text-xs font-semibold bg-teal-700 text-white rounded-lg px-3 py-2 hover:bg-teal-800 disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Formulário de edição de um procedimento, num layout vertical — pensado
// pra funcionar bem no celular, onde editar campo por campo numa tabela
// larga é ruim. Cada campo já salva em tempo real (mesmo onUpdate da
// tabela), então esse modal não tem botão de salvar — só de fechar.
// Lista de materiais usados num procedimento — reaproveitada tanto no modal
// de editar procedimento quanto na seção da Calculadora (linha expandida).
// `onChange` recebe o array de materiais já atualizado, quem chama decide
// onde salvar (sempre acaba em proc.materials, através do onUpdate de cada
// tela).
/* ============ Arrastar para reordenar (portado quase 1:1 da calculadora
   avulsa original do Marcelo) ============
   Duas variantes, iguais ao original:
   - attachFloatDrag: o item descola da lista (position:fixed), segue o
     cursor, e um vão (placeholder) abre espaço indicando onde vai encaixar.
     Usada nos cartões de procedimento e materiais (elementos <div>).
   - attachRowDrag: mais simples, sem descolar — a própria linha troca de
     posição direto na lista conforme o cursor passa. Usada nas linhas
     <tr> da tabela de materiais dentro de um procedimento (não dá pra usar
     position:fixed numa <tr> sem quebrar o layout da tabela).
   As duas mexem no DOM diretamente (fora do ciclo do React) enquanto
   arrasta, e só chamam onReorder (que atualiza o estado de verdade) uma
   vez, ao soltar — por isso não usam useState a cada pixel movido. */
function attachFloatDrag(handleEl, opts) {
  if (!handleEl || handleEl._floatDragAttached) return;
  handleEl._floatDragAttached = true;
  const THRESHOLD = 6;
  let startX = 0, startY = 0, dragging = false, moveEl = null, containerEl = null, placeholder = null;
  let offsetX = 0, offsetY = 0, origStyle = null;

  function beginDrag() {
    dragging = true;
    moveEl = handleEl.closest(opts.moveSelector);
    containerEl = moveEl.parentElement;
    const rect = moveEl.getBoundingClientRect();
    offsetX = startX - rect.left;
    offsetY = startY - rect.top;

    origStyle = {
      position: moveEl.style.position, left: moveEl.style.left, top: moveEl.style.top,
      width: moveEl.style.width, zIndex: moveEl.style.zIndex, pointerEvents: moveEl.style.pointerEvents,
    };

    placeholder = document.createElement("div");
    placeholder.style.height = rect.height + "px";
    placeholder.style.border = "2px dashed #5eead4";
    placeholder.style.borderRadius = "12px";
    placeholder.style.margin = window.getComputedStyle(moveEl).margin;
    containerEl.insertBefore(placeholder, moveEl.nextSibling);

    moveEl.style.position = "fixed";
    moveEl.style.left = rect.left + "px";
    moveEl.style.top = rect.top + "px";
    moveEl.style.width = rect.width + "px";
    moveEl.style.zIndex = "999";
    moveEl.style.pointerEvents = "none";
    moveEl.style.opacity = "0.85";
    moveEl.style.boxShadow = "0 12px 28px -8px rgba(0,0,0,0.35)";
  }

  function onMove(e) {
    if (!dragging) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < THRESHOLD) return;
      beginDrag();
    }
    moveEl.style.left = e.clientX - offsetX + "px";
    moveEl.style.top = e.clientY - offsetY + "px";

    const siblings = Array.from(containerEl.children).filter(
      (c) => (c.matches(opts.itemSelector) || c === placeholder) && c !== moveEl && c.style.display !== "none"
    );
    const y = e.clientY;
    let target = null, before = true;
    for (const sib of siblings) {
      const rect2 = sib.getBoundingClientRect();
      const mid = rect2.top + rect2.height / 2;
      if (y < mid) { target = sib; before = true; break; }
      target = sib; before = false;
    }
    if (target && target !== placeholder) {
      if (before) containerEl.insertBefore(placeholder, target);
      else containerEl.insertBefore(placeholder, target.nextSibling);
    } else if (!target) {
      containerEl.appendChild(placeholder);
    }
  }

  function onUp() {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    if (dragging) {
      moveEl.style.position = origStyle.position;
      moveEl.style.left = origStyle.left;
      moveEl.style.top = origStyle.top;
      moveEl.style.width = origStyle.width;
      moveEl.style.zIndex = origStyle.zIndex;
      moveEl.style.pointerEvents = origStyle.pointerEvents;
      moveEl.style.opacity = "";
      moveEl.style.boxShadow = "";
      containerEl.insertBefore(moveEl, placeholder);
      placeholder.remove();
      const newOrder = Array.from(containerEl.children)
        .filter((c) => c.matches(opts.itemSelector))
        .map((n) => n.getAttribute(opts.keyAttr));
      opts.onReorder(newOrder);
    }
    dragging = false;
    placeholder = null;
  }

  handleEl.addEventListener("pointerdown", (e) => {
    if (opts.disabled && opts.disabled()) return;
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    dragging = false;
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  });
}

function attachRowDrag(handleEl, opts) {
  if (!handleEl || handleEl._rowDragAttached) return;
  handleEl._rowDragAttached = true;
  const THRESHOLD = 6;
  let startX = 0, startY = 0, dragging = false, moveEl = null, containerEl = null;

  function onMove(e) {
    if (!dragging) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < THRESHOLD) return;
      dragging = true;
      moveEl = handleEl.closest(opts.moveSelector);
      containerEl = moveEl.parentElement;
      moveEl.style.outline = "2px dashed #5eead4";
    }
    const siblings = Array.from(containerEl.children).filter(
      (c) => c.matches(opts.itemSelector) && c !== moveEl && c.style.display !== "none"
    );
    const y = e.clientY;
    let target = null, before = true;
    for (const sib of siblings) {
      const rect = sib.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (y < mid) { target = sib; before = true; break; }
      target = sib; before = false;
    }
    if (target) {
      if (before) containerEl.insertBefore(moveEl, target);
      else containerEl.insertBefore(moveEl, target.nextSibling);
    }
  }

  function onUp() {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    if (dragging) {
      moveEl.style.outline = "";
      const newOrder = Array.from(containerEl.children)
        .filter((c) => c.matches(opts.itemSelector))
        .map((n) => n.getAttribute(opts.keyAttr));
      opts.onReorder(newOrder);
    }
    dragging = false;
  }

  handleEl.addEventListener("pointerdown", (e) => {
    if (opts.disabled && opts.disabled()) return;
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    dragging = false;
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  });
}

function MaterialUsageEditor({ materials, materialsCatalog, onChange, datalistId = "materialsCatalogNames" }) {
  const list = materials || [];
  const result = calcMaterialsCost(materialsCatalog, list);

  function updateRow(idx, patch) {
    onChange(list.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }
  function addRow() {
    onChange([...list, { id: uid(), material: "", brand: "", qty: "", unit: "" }]);
  }
  function removeRow(idx) {
    onChange(list.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-stone-500">Materiais usados</label>
        <button onClick={addRow} className="text-xs font-medium text-teal-700 hover:text-teal-900 inline-flex items-center gap-1">
          <Plus className="w-3 h-3" /> Adicionar
        </button>
      </div>
      {list.length === 0 ? (
        <p className="text-[11px] text-stone-400 leading-relaxed">
          Opcional — se você cadastrar os materiais usados aqui (com preço deles no catálogo), o Custo passa a ser
          calculado sozinho a partir disso, em vez de digitado à mão.
        </p>
      ) : (
        <div className="space-y-2">
          {list.map((m, idx) => {
            const r = calcMaterialUsageCost(materialsCatalog, m);
            return (
              <div key={m.id || idx} className="bg-stone-50 border border-stone-200 rounded-lg p-2">
                <div className="flex gap-1.5 mb-1.5">
                  <input
                    list={datalistId}
                    value={m.material}
                    onChange={(e) => updateRow(idx, { material: e.target.value })}
                    placeholder="Nome do material"
                    className="flex-1 min-w-0 text-xs border border-stone-200 rounded-md px-2 py-1.5 outline-none focus:border-teal-400 bg-white"
                  />
                  <button
                    onClick={() => removeRow(idx)}
                    className="text-stone-300 hover:text-rose-600 shrink-0 px-1"
                    title="Remover material"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <input
                    list={`${datalistId}-brand-${idx}`}
                    value={m.brand}
                    onChange={(e) => updateRow(idx, { brand: e.target.value })}
                    placeholder="Marca"
                    className="min-w-0 text-xs border border-stone-200 rounded-md px-2 py-1.5 outline-none focus:border-teal-400 bg-white"
                  />
                  <input
                    value={m.qty}
                    onChange={(e) => updateRow(idx, { qty: e.target.value })}
                    placeholder="Qtd."
                    className="min-w-0 text-xs border border-stone-200 rounded-md px-2 py-1.5 outline-none focus:border-teal-400 bg-white"
                  />
                  <input
                    value={m.unit}
                    onChange={(e) => updateRow(idx, { unit: e.target.value })}
                    placeholder="Unidade"
                    className="min-w-0 text-xs border border-stone-200 rounded-md px-2 py-1.5 outline-none focus:border-teal-400 bg-white"
                  />
                </div>
                <datalist id={`${datalistId}-brand-${idx}`}>
                  {brandSuggestionsFor(materialsCatalog, m.material).map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
                {m.material && m.material.trim() && (
                  <div className={`text-[11px] mt-1 ${r.ok ? "text-teal-700" : "text-amber-600"}`}>
                    {r.ok ? `= ${money(r.value)}` : r.reason}
                  </div>
                )}
              </div>
            );
          })}
          <datalist id={datalistId}>
            {(materialsCatalog || []).map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          <div className="flex items-center justify-between pt-1 text-xs">
            <span className="text-stone-500">Total dos materiais</span>
            <span className="font-mono font-semibold text-stone-700">{money(result.total)}</span>
          </div>
          {result.incomplete > 0 && (
            <p className="text-[11px] text-amber-600 mt-1">
              {result.incomplete} material{result.incomplete > 1 ? "is" : ""} sem custo calculado — confira o
              nome/unidade no catálogo.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Tabela de materiais usados dentro de um procedimento, com arrastar pra
// reordenar — usada só dentro da seção Custos/Materiais (o modal de editar
// procedimento no celular continua usando o MaterialUsageEditor de cima,
// mais compacto). Replica a tabela da calculadora avulsa original.
function MaterialUsageTable({ materials, materialsCatalog, onChange, onReorder, datalistId }) {
  const list = materials || [];

  function updateRow(idx, patch) {
    onChange(list.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }
  function removeRow(idx) {
    onChange(list.filter((_, i) => i !== idx));
  }
  function addRow() {
    onChange([...list, { id: uid(), material: "", brand: "", qty: "", unit: "" }]);
  }

  function attachDragHandle(el) {
    if (!el) return;
    attachFloatDrag(el, {
      moveSelector: ".material-usage-row",
      itemSelector: ".material-usage-row",
      keyAttr: "data-mat-id",
      onReorder,
    });
  }

  return (
    <div>
      <div className="hidden sm:grid grid-cols-[20px_1.3fr_1fr_0.7fr_0.7fr_0.8fr_24px] gap-1.5 text-[11px] text-stone-400 px-1 mb-1">
        <span />
        <span>Material</span>
        <span>Marca</span>
        <span>Qtd. usada</span>
        <span>Unidade</span>
        <span>Custo</span>
        <span />
      </div>
      <div className="divide-y divide-stone-100 border-t border-stone-100">
        {list.length === 0 && <p className="text-xs text-stone-400 italic py-3">Nenhum material adicionado ainda.</p>}
        {list.map((m, idx) => {
          const r = calcMaterialUsageCost(materialsCatalog, m);
          return (
            <div
              key={m.id || idx}
              data-mat-id={m.id}
              className="material-usage-row grid grid-cols-2 sm:grid-cols-[20px_1.3fr_1fr_0.7fr_0.7fr_0.8fr_24px] gap-1.5 items-center py-1.5"
            >
              <span
                ref={attachDragHandle}
                title="Arrastar para reordenar"
                className="hidden sm:flex items-center justify-center text-stone-300 hover:text-stone-500 cursor-grab active:cursor-grabbing"
              >
                <GripVertical className="w-3.5 h-3.5" />
              </span>
              <input
                list={datalistId}
                value={m.material}
                onChange={(e) => updateRow(idx, { material: e.target.value })}
                placeholder="Material"
                className="col-span-2 sm:col-span-1 min-w-0 text-xs border border-transparent hover:border-stone-200 focus:border-teal-400 rounded-md px-2 py-1.5 outline-none bg-transparent focus:bg-white"
              />
              <input
                list={`${datalistId}-brand-${idx}`}
                value={m.brand}
                onChange={(e) => updateRow(idx, { brand: e.target.value })}
                placeholder="Marca"
                className="min-w-0 text-xs border border-transparent hover:border-stone-200 focus:border-teal-400 rounded-md px-2 py-1.5 outline-none bg-transparent focus:bg-white"
              />
              <datalist id={`${datalistId}-brand-${idx}`}>
                {brandSuggestionsFor(materialsCatalog, m.material).map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              <input
                value={m.qty}
                onChange={(e) => updateRow(idx, { qty: e.target.value })}
                placeholder="Qtd."
                className="min-w-0 text-xs border border-transparent hover:border-stone-200 focus:border-teal-400 rounded-md px-2 py-1.5 outline-none bg-transparent focus:bg-white"
              />
              <input
                value={m.unit}
                onChange={(e) => updateRow(idx, { unit: e.target.value })}
                placeholder="Unid."
                className="min-w-0 text-xs border border-transparent hover:border-stone-200 focus:border-teal-400 rounded-md px-2 py-1.5 outline-none bg-transparent focus:bg-white"
              />
              <div className={`text-xs font-mono text-right sm:text-left px-2 ${r.ok ? "text-teal-700" : "text-amber-600"}`}>
                {r.ok ? money(r.value) : "—"}
              </div>
              <button onClick={() => removeRow(idx)} title="Remover material" className="text-stone-300 hover:text-rose-600 justify-self-center">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      <button
        onClick={addRow}
        className="w-full mt-2 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-teal-700 border border-dashed border-teal-300 rounded-lg py-1.5 hover:bg-teal-50 transition"
      >
        <Plus className="w-3.5 h-3.5" /> Adicionar material
      </button>
      <datalist id={datalistId}>
        {(materialsCatalog || []).map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
    </div>
  );
}

function ProcedureEditModal({ proc, categories, onUpdate, onClose, onAddCategory, materialsCatalog, onAddCatalogItem }) {
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryValue, setNewCategoryValue] = useState("");

  if (!proc) return null;

  const allCategories = Array.from(new Set([...(categories || []), proc.category].filter(Boolean)));
  const materials = proc.materials || [];
  const hasMaterials = materials.length > 0;
  const materialsResult = hasMaterials ? calcMaterialsCost(materialsCatalog, materials) : null;

  function handleCategorySelect(value) {
    if (value === "__new__") {
      setAddingCategory(true);
      return;
    }
    onUpdate(proc.id, { category: value === "__none__" ? "" : value });
  }

  function confirmNewCategory() {
    const name = newCategoryValue.trim();
    if (!name) return;
    onAddCategory(name);
    onUpdate(proc.id, { category: name });
    setAddingCategory(false);
    setNewCategoryValue("");
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 max-w-sm w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-stone-800 text-sm">Editar procedimento</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">Nome</label>
            <input
              value={proc.name}
              onChange={(e) => onUpdate(proc.id, { name: e.target.value })}
              className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
            />
          </div>

          <div>
            <label className="text-xs text-stone-500 block mb-1">Categoria</label>
            {addingCategory ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={newCategoryValue}
                  onChange={(e) => setNewCategoryValue(e.target.value)}
                  placeholder="Nome da nova categoria"
                  onKeyDown={(e) => e.key === "Enter" && confirmNewCategory()}
                  className="flex-1 text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
                />
                <button
                  onClick={confirmNewCategory}
                  className="text-xs font-semibold bg-teal-700 text-white rounded-lg px-3 hover:bg-teal-800"
                >
                  OK
                </button>
              </div>
            ) : (
              <select
                value={proc.category || "__none__"}
                onChange={(e) => handleCategorySelect(e.target.value)}
                className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 bg-white"
              >
                <option value="__none__">Sem categoria</option>
                {allCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="__new__">+ Nova categoria...</option>
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-500 block mb-1">Custo (R$)</label>
              {hasMaterials ? (
                <div
                  className="w-full text-sm border border-stone-200 bg-stone-50 text-stone-500 rounded-lg px-3 py-2"
                  title="Calculado automaticamente a partir dos materiais usados, logo abaixo"
                >
                  {money(materialsResult.total)}
                </div>
              ) : (
                <input
                  type="number"
                  value={proc.cost}
                  onChange={(e) => onUpdate(proc.id, { cost: e.target.value })}
                  className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
                />
              )}
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Custo adicional (R$)</label>
              <input
                type="number"
                value={proc.additionalCost ?? 0}
                onChange={(e) => onUpdate(proc.id, { additionalCost: e.target.value })}
                title="Terceirização (outro dentista) ou laboratório (ex: prótese)"
                className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
              />
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Valor (R$)</label>
              <input
                type="number"
                value={proc.valorBase}
                onChange={(e) => onUpdate(proc.id, { valorBase: e.target.value })}
                className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
              />
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Margem alvo (%)</label>
              <input
                type="number"
                value={proc.marginPercent}
                onChange={(e) => onUpdate(proc.id, { marginPercent: e.target.value })}
                className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
              />
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Duração (min)</label>
              <input
                type="number"
                value={proc.durationMinutes}
                onChange={(e) => onUpdate(proc.id, { durationMinutes: e.target.value })}
                className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
              />
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Sessões</label>
              <input
                type="number"
                min={1}
                value={proc.sessions ?? 1}
                onChange={(e) => onUpdate(proc.id, { sessions: e.target.value })}
                className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
              />
            </div>
          </div>

          <div className="border-t border-stone-100 pt-3">
            <MaterialUsageEditor
              materials={materials}
              materialsCatalog={materialsCatalog}
              onChange={(next) => onUpdate(proc.id, { materials: next })}
              datalistId="materialsCatalogNamesModal"
            />
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-5 text-sm font-semibold bg-teal-700 text-white rounded-lg py-2.5 hover:bg-teal-800 transition"
        >
          Concluído
        </button>
      </div>
    </div>
  );
}

// Catálogo de materiais — preço reutilizável por embalagem (ex: "Resina X,
// tubo de 4g, R$ 38,00"), pra cada procedimento só precisar informar QUANTO
// usou (e a conta do custo já sai sozinha). Substitui a calculadora avulsa
// que o Marcelo já usava separada — agora fica alimentando o Custo dos
// procedimentos de verdade, em vez de um número que precisava copiar à mão.
function CalculadoraSection({
  procedures,
  settings,
  materialsCatalog,
  onUpdateProcedure,
  onDeleteProcedure,
  onAddProcedure,
  onReorderMaterials,
  onAddCategory,
  onDeleteCategory,
  onAddCatalogItem,
  onUpdateCatalogItem,
  onDeleteCatalogItem,
  onExport,
  onImportFile,
  onDeleteAllProcedures,
  importFeedback,
  fileInputRef,
  onBack,
}) {
  const categories = Array.from(
    new Set([...(settings.procedureCategories || []), ...procedures.map((p) => p.category).filter(Boolean)])
  );

  const [mode, setMode] = useState("procedimentos"); // "procedimentos" | "materiais"
  const [activeCategory, setActiveCategory] = useState(categories[0] || "");
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState(null);
  const [procSearch, setProcSearch] = useState("");
  const [newProcName, setNewProcName] = useState("");
  const [expandedProcId, setExpandedProcId] = useState(null);
  const [confirmDeleteProcId, setConfirmDeleteProcId] = useState(null);
  const [materiaisSearch, setMateriaisSearch] = useState("");
  const [materiaisSortBy, setMateriaisSortBy] = useState("nome"); // "nome" | "marca"
  const [confirmDeleteMaterialId, setConfirmDeleteMaterialId] = useState(null);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [confirmDeleteAllProcs, setConfirmDeleteAllProcs] = useState(false);
  const [procContextMenu, setProcContextMenu] = useState(null); // { x, y, procId }
  const [renamingProcId, setRenamingProcId] = useState(null);
  const [renameProcValue, setRenameProcValue] = useState("");

  function openProcContextMenu(e, procId) {
    e.preventDefault();
    const menuWidth = 180;
    const menuHeight = 90;
    const x = Math.min(e.clientX, Math.max(8, window.innerWidth - menuWidth - 8));
    const y = Math.min(e.clientY, Math.max(8, window.innerHeight - menuHeight - 8));
    setProcContextMenu({ x, y, procId });
  }

  function startRenamingProc(proc) {
    setRenamingProcId(proc.id);
    setRenameProcValue(proc.name);
  }

  function saveRenamingProc() {
    const name = renameProcValue.trim();
    if (name && renamingProcId) onUpdateProcedure(renamingProcId, { name });
    setRenamingProcId(null);
  }

  if (!activeCategory && categories.length > 0) setActiveCategory(categories[0]);

  const q = normalizeText(procSearch.trim());
  const categoryProcs = procedures
    .filter((p) => (p.category || "") === activeCategory)
    .filter((p) => !q || normalizeText(p.name).includes(q));

  function handleCreateCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    onAddCategory(name);
    setActiveCategory(name);
    setNewCategoryName("");
    setAddingCategory(false);
  }

  function handleDeleteCategoryClick(cat) {
    onDeleteCategory(cat);
    if (activeCategory === cat) {
      const remaining = categories.filter((c) => c !== cat);
      setActiveCategory(remaining[0] || "");
    }
    setConfirmDeleteCategory(null);
  }

  function handleCreateProcedure() {
    const name = newProcName.trim();
    if (!name || !activeCategory) return;
    onAddProcedure(activeCategory, name);
    setNewProcName("");
  }

  // Lista os procedimentos que usam ESSE item específico do catálogo
  // (nome + marca) — não só o nome. Resolve cada uso pela mesma lógica de
  // findCatalogItem (bate a marca quando há mais de uma opção com o mesmo
  // nome), senão "Babador Branco" contaria os usos de todas as marcas
  // juntos em cada linha, mesmo quando só uma marca é usada de verdade.
  function usosDoMaterial(catalogItem) {
    if (!catalogItem || !catalogItem.name) return [];
    const usos = [];
    procedures.forEach((p) => {
      (p.materials || []).forEach((m) => {
        if (!m.material) return;
        const resolved = findCatalogItem(materialsCatalog, m.material, m.brand);
        if (resolved && resolved.id === catalogItem.id) {
          usos.push({ category: p.category || "Sem categoria", procName: p.name });
        }
      });
    });
    return usos;
  }

  const materiaisFiltered = (materialsCatalog || [])
    .filter((c) => {
      if (!materiaisSearch.trim()) return true;
      const key = normalizeText(materiaisSearch.trim());
      return normalizeText(c.name || "").includes(key) || normalizeText(c.brand || "").includes(key);
    })
    .slice()
    .sort((a, b) => {
      const field = materiaisSortBy === "marca" ? "brand" : "name";
      return (a[field] || "").localeCompare(b[field] || "", "pt-BR");
    });

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <button onClick={onBack} className="text-xs font-medium text-stone-500 hover:text-stone-700 inline-flex items-center gap-1">
        <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Voltar pra Procedimentos
      </button>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-stone-700 inline-flex items-center gap-2">
          <Calculator className="w-4 h-4 text-teal-700" /> Custos / Materiais
        </h2>
        <div className="relative">
          <button
            onClick={() => {
              setFileMenuOpen((v) => !v);
              setConfirmDeleteAllProcs(false);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border border-stone-200 text-stone-600 hover:bg-stone-100 transition"
          >
            Arquivo <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {fileMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-stone-200 rounded-xl shadow-lg py-1 z-50 overflow-hidden">
              <button
                onClick={() => {
                  onExport();
                  setFileMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5 text-stone-400" /> Exportar
              </button>
              <button
                onClick={() => {
                  fileInputRef.current?.click();
                  setFileMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-2"
              >
                <Upload className="w-3.5 h-3.5 text-stone-400" /> Importar
              </button>
              <div className="my-1 border-t border-stone-100" />
              {confirmDeleteAllProcs ? (
                <button
                  onClick={() => {
                    onDeleteAllProcedures();
                    setConfirmDeleteAllProcs(false);
                    setFileMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-rose-700 bg-rose-50 hover:bg-rose-100 flex items-center gap-2 font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Confirmar: apagar tudo
                </button>
              ) : (
                <button
                  onClick={() => setConfirmDeleteAllProcs(true)}
                  className="w-full text-left px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" /> Apagar todos os procedimentos
                </button>
              )}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="application/json" onChange={onImportFile} className="hidden" />
        </div>
      </div>

      {importFeedback && (
        <p className={`text-xs leading-relaxed ${importFeedback.type === "sucesso" ? "text-teal-700" : "text-rose-600"}`}>
          {importFeedback.text}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setMode("procedimentos")}
          className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
            mode === "procedimentos" ? "bg-teal-700 text-white" : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-50"
          }`}
        >
          Procedimentos <span className="opacity-70">{procedures.length}</span>
        </button>
        <button
          onClick={() => setMode("materiais")}
          className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
            mode === "materiais" ? "bg-teal-700 text-white" : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-50"
          }`}
        >
          Materiais <span className="opacity-70">{(materialsCatalog || []).length}</span>
        </button>
      </div>

      {mode === "procedimentos" ? (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {categories.map((cat) => {
              const active = activeCategory === cat;
              return (
                <div
                  key={cat}
                  className={`inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full text-sm font-medium border transition ${
                    active ? "bg-teal-700 text-white border-teal-700" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  <button onClick={() => setActiveCategory(cat)} className="inline-flex items-center gap-1.5">
                    {cat}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? "bg-white/20" : "bg-stone-100 text-stone-500"}`}>
                      {procedures.filter((p) => p.category === cat).length}
                    </span>
                  </button>
                  {confirmDeleteCategory === cat ? (
                    <button
                      onClick={() => handleDeleteCategoryClick(cat)}
                      title="Confirmar exclusão"
                      className={active ? "text-white" : "text-rose-600"}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteCategory(cat)}
                      title="Remover categoria"
                      className={active ? "text-white/70 hover:text-white" : "text-stone-300 hover:text-rose-600"}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
            {addingCategory ? (
              <div className="inline-flex items-center gap-1 pl-2">
                <input
                  autoFocus
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateCategory()}
                  placeholder="Nome da categoria"
                  className="text-sm border border-stone-200 rounded-lg px-2 py-1 outline-none focus:border-teal-400"
                />
                <button onClick={handleCreateCategory} className="text-xs font-semibold text-teal-700">
                  OK
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingCategory(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium text-teal-700 border border-dashed border-teal-300 hover:bg-teal-50 transition"
              >
                + Categoria
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-stone-400 shrink-0" />
            <input
              value={procSearch}
              onChange={(e) => setProcSearch(e.target.value)}
              placeholder="Pesquisar procedimento..."
              className="flex-1 text-sm outline-none bg-transparent placeholder:text-stone-400"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              value={newProcName}
              onChange={(e) => setNewProcName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateProcedure()}
              placeholder="Nome do novo procedimento"
              disabled={!activeCategory}
              className="flex-1 text-sm border border-stone-200 rounded-xl px-3 py-2 outline-none focus:border-teal-400 disabled:bg-stone-50"
            />
            <button
              onClick={handleCreateProcedure}
              disabled={!activeCategory || !newProcName.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 transition disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Procedimento
            </button>
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100 overflow-hidden">
            {categoryProcs.length === 0 && (
              <p className="text-sm text-stone-400 italic px-4 py-6 text-center">
                {activeCategory ? "Nenhum procedimento nessa categoria ainda." : "Crie uma categoria pra começar."}
              </p>
            )}
            {categoryProcs.map((p) => {
              const result = calcMaterialsCost(materialsCatalog, p.materials);
              const isExpanded = expandedProcId === p.id;
              return (
                <div key={p.id} data-proc-id={p.id} className="procedure-card">
                  <div
                    className="flex items-center gap-2 px-4 py-3"
                    onContextMenu={(e) => openProcContextMenu(e, p.id)}
                  >
                    <span
                      ref={(el) => {
                        if (!el) return;
                        attachFloatDrag(el, {
                          moveSelector: ".procedure-card",
                          itemSelector: ".procedure-card",
                          keyAttr: "data-proc-id",
                          onReorder: (newOrder) => reorderProceduresInCategory(activeCategory, newOrder),
                          disabled: () => !!procSearch.trim(),
                        });
                      }}
                      title={procSearch.trim() ? "Limpe a pesquisa para reordenar" : "Arrastar para reordenar"}
                      className={`shrink-0 ${procSearch.trim() ? "text-stone-200" : "text-stone-300 hover:text-stone-500 cursor-grab active:cursor-grabbing"}`}
                    >
                      <GripVertical className="w-4 h-4" />
                    </span>
                    {renamingProcId === p.id ? (
                      <input
                        autoFocus
                        value={renameProcValue}
                        onChange={(e) => setRenameProcValue(e.target.value)}
                        onBlur={saveRenamingProc}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRenamingProc();
                          if (e.key === "Escape") setRenamingProcId(null);
                        }}
                        className="flex-1 min-w-0 text-sm font-semibold text-stone-800 border border-teal-400 rounded-lg px-2 py-1 outline-none"
                      />
                    ) : (
                      <button
                        onClick={() => setExpandedProcId(isExpanded ? null : p.id)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="text-sm font-semibold text-stone-800 truncate">{p.name}</div>
                        <div className="text-xs text-stone-400">
                          {(p.materials || []).length} materiais{"  "}
                          <span className="font-mono text-teal-700 font-medium">{money(result.total)}</span>
                        </div>
                      </button>
                    )}
                    {confirmDeleteProcId === p.id ? (
                      <button onClick={() => { onDeleteProcedure(p.id); setConfirmDeleteProcId(null); }} title="Confirmar exclusão" className="text-rose-600 shrink-0">
                        <Check className="w-4 h-4" />
                      </button>
                    ) : (
                      <button onClick={() => setConfirmDeleteProcId(p.id)} title="Remover procedimento" className="text-stone-300 hover:text-rose-600 shrink-0">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => setExpandedProcId(isExpanded ? null : p.id)} className="text-stone-400 shrink-0">
                      <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-4 bg-stone-50">
                      <MaterialUsageTable
                        materials={p.materials}
                        materialsCatalog={materialsCatalog}
                        onChange={(next) => onUpdateProcedure(p.id, { materials: next })}
                        onReorder={(newOrder) => onReorderMaterials(p.id, newOrder)}
                        datalistId={`materialsCatalogNames-calc-${p.id}`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {procContextMenu && (
            <div
              className="fixed inset-0 z-40"
              onClick={() => setProcContextMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setProcContextMenu(null);
              }}
            >
              <div
                className="absolute bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden py-1 w-44"
                style={{ top: `${procContextMenu.y}px`, left: `${procContextMenu.x}px` }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    const proc = procedures.find((p) => p.id === procContextMenu.procId);
                    if (proc) startRenamingProc(proc);
                    setProcContextMenu(null);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition inline-flex items-center gap-2"
                >
                  <Pencil className="w-3.5 h-3.5 text-stone-400" /> Editar
                </button>
                <button
                  onClick={() => {
                    setConfirmDeleteProcId(procContextMenu.procId);
                    setProcContextMenu(null);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 transition inline-flex items-center gap-2"
                >
                  <X className="w-3.5 h-3.5" /> Excluir
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-3 py-2 flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-stone-400 shrink-0" />
              <input
                value={materiaisSearch}
                onChange={(e) => setMateriaisSearch(e.target.value)}
                placeholder="Pesquisar material ou marca..."
                className="flex-1 text-sm outline-none bg-transparent placeholder:text-stone-400"
              />
            </div>
            <button
              onClick={() => setMateriaisSortBy((s) => (s === "nome" ? "marca" : "nome"))}
              title="Alternar ordenação"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 text-sm text-stone-600 hover:bg-stone-50"
            >
              <ArrowUpDown className="w-3.5 h-3.5" /> {materiaisSortBy === "nome" ? "Nome" : "Marca"}
            </button>
          </div>

          <button
            onClick={onAddCatalogItem}
            className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg py-2.5 transition"
          >
            <Plus className="w-4 h-4" /> Adicionar material ao catálogo
          </button>

          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs border-collapse min-w-[720px]">
              <thead>
                <tr className="text-[11px] text-stone-400">
                  <th className="text-left font-medium px-2 py-1.5">Material</th>
                  <th className="text-left font-medium px-2 py-1.5">Marca</th>
                  <th className="text-left font-medium px-2 py-1.5">Qtd. embalagem</th>
                  <th className="text-left font-medium px-2 py-1.5">Unidade</th>
                  <th className="text-left font-medium px-2 py-1.5">Valor (R$)</th>
                  <th className="text-left font-medium px-2 py-1.5">Custo/un</th>
                  <th className="text-center font-medium px-2 py-1.5">Uso</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {materiaisFiltered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-xs text-stone-400 italic py-4 text-center">
                      Nenhum material cadastrado ainda.
                    </td>
                  </tr>
                )}
                {materiaisFiltered.map((c) => {
                  const packQty = parseFloat((c.packageQty || "").toString().replace(",", "."));
                  const packPrice = parseFloat((c.packagePrice || "").toString().replace(",", "."));
                  const unitCost = !isNaN(packQty) && packQty > 0 && !isNaN(packPrice) ? packPrice / packQty : null;
                  const usos = usosDoMaterial(c);
                  return (
                    <tr key={c.id} className="border-t border-stone-100">
                      <td className="p-1">
                        <input
                          value={c.name}
                          onChange={(e) => onUpdateCatalogItem(c.id, { name: e.target.value })}
                          placeholder="Ex: Resina Forma A2B"
                          className="w-full min-w-[140px] text-xs border border-stone-200 rounded-md px-2 py-1.5 outline-none focus:border-teal-400 bg-white"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          value={c.brand}
                          onChange={(e) => onUpdateCatalogItem(c.id, { brand: e.target.value })}
                          placeholder="Marca"
                          className="w-full min-w-[100px] text-xs border border-stone-200 rounded-md px-2 py-1.5 outline-none focus:border-teal-400 bg-white"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          value={c.packageQty}
                          onChange={(e) => onUpdateCatalogItem(c.id, { packageQty: e.target.value })}
                          placeholder="Qtd."
                          className="w-full min-w-[70px] text-xs border border-stone-200 rounded-md px-2 py-1.5 outline-none focus:border-teal-400 bg-white"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          value={c.packageUnit}
                          onChange={(e) => onUpdateCatalogItem(c.id, { packageUnit: e.target.value })}
                          placeholder="g, ml, un..."
                          className="w-full min-w-[70px] text-xs border border-stone-200 rounded-md px-2 py-1.5 outline-none focus:border-teal-400 bg-white"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          value={c.packagePrice}
                          onChange={(e) => onUpdateCatalogItem(c.id, { packagePrice: e.target.value })}
                          placeholder="R$"
                          className="w-full min-w-[80px] text-xs border border-stone-200 rounded-md px-2 py-1.5 outline-none focus:border-teal-400 bg-white"
                        />
                      </td>
                      <td className="p-1 px-2 font-mono text-stone-600 whitespace-nowrap">
                        {unitCost !== null ? money(unitCost) : "—"}
                      </td>
                      <td
                        className="p-1 px-2 text-center"
                        title={
                          usos.length > 0
                            ? "Usado em:\n" + usos.map((u) => `${u.category} › ${u.procName}`).join("\n")
                            : "Não usado em nenhum procedimento ainda"
                        }
                      >
                        {usos.length > 0 ? (
                          <span className="underline decoration-dotted decoration-stone-300 cursor-help text-stone-600">
                            {usos.length}
                          </span>
                        ) : (
                          <span className="text-stone-300">0</span>
                        )}
                      </td>
                      <td className="p-1 px-2">
                        {confirmDeleteMaterialId === c.id ? (
                          <button
                            onClick={() => {
                              onDeleteCatalogItem(c.id);
                              setConfirmDeleteMaterialId(null);
                            }}
                            title="Confirmar exclusão"
                            className="text-rose-600 hover:text-rose-800"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteMaterialId(c.id)}
                            title="Remover"
                            className="text-stone-300 hover:text-rose-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function PaymentTable({ calc, taxRegime }) {
  const taxLabel =
    taxRegime === "cnpj"
      ? `Alíquota efetiva (CNPJ) aplicada: ${pct(calc.taxPct)} — estimativa, pode mudar mês a mês`
      : `Provisão de imposto (Carnê-Leão) aplicada: ${pct(calc.taxPct)} — estimativa, pois o IRPF é progressivo`;
  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-dashed border-stone-300">
        <div className="text-xs font-semibold uppercase tracking-wide text-stone-400">Simulação por forma de pagamento</div>
        <div className="text-xs text-stone-400 mt-0.5">{taxLabel}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-stone-400 border-b border-stone-100">
              <th className="px-5 py-2 font-medium">Forma de pagamento</th>
              <th className="px-3 py-2 font-medium text-right">Taxa</th>
              <th className="px-3 py-2 font-medium text-right">Cobrar p/ manter margem</th>
              <th className="px-3 py-2 font-medium text-right">No preço de tabela → líquido</th>
              <th className="px-3 py-2 font-medium text-right">Lucro</th>
              <th className="px-5 py-2 font-medium text-right">Margem real</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-50">
            {calc.rows.map((r) => (
              <tr key={r.key} className="hover:bg-stone-50">
                <td className="px-5 py-2.5 font-medium text-stone-800">{r.label}</td>
                <td className="px-3 py-2.5 text-right font-mono text-stone-500">{pct(r.feePercent)}</td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold text-teal-800">
                  {r.adjustedPrice != null ? money(r.adjustedPrice) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-stone-700">{money(r.netFixed)}</td>
                <td className={`px-3 py-2.5 text-right font-mono ${r.profitFixed < 0 ? "text-rose-700" : "text-stone-700"}`}>
                  {money(r.profitFixed)}
                </td>
                <td
                  className={`px-5 py-2.5 text-right font-mono font-medium ${
                    r.realMarginFixed !== null && r.realMarginFixed < 0 ? "text-rose-700" : "text-amber-700"
                  }`}
                >
                  {r.realMarginFixed !== null ? pct(r.realMarginFixed) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 text-xs text-stone-400 border-t border-stone-100 leading-relaxed">
        "Cobrar p/ manter margem" é o valor a cobrar nessa forma de pagamento para que, depois da taxa e do imposto, sobre o mesmo lucro do
        preço base sugerido. "No preço de tabela" mostra o que sobra se você cobrar sempre o mesmo valor, independente da forma de pagamento.
      </div>
    </div>
  );
}

function PaymentSimulationPanel({ selectedProc, calc, taxRegime }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 hover:bg-stone-50 transition"
      >
        <div className="flex items-center gap-1.5">
          <ChevronRight className={`w-3.5 h-3.5 text-stone-400 transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="text-sm font-semibold text-stone-700">Simulação por forma de pagamento</span>
          {selectedProc && <span className="text-xs text-stone-400">— {selectedProc.name || "Sem nome"}</span>}
        </div>
        {!selectedProc && <span className="text-xs text-stone-400">Selecione um procedimento na tabela</span>}
      </button>
      {open && (
        <div className="border-t border-stone-100">
          {selectedProc ? (
            <PaymentTable calc={calc} taxRegime={taxRegime} />
          ) : (
            <div className="px-5 py-8 text-center text-sm text-stone-400">
              Clique na setinha ao lado de um procedimento pra ver a simulação aqui.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProcedureCombobox({ procedures, value, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selectedProc = procedures.find((p) => p.id === value) || null;
  const q = normalizeText(query.trim());
  const filtered = q ? procedures.filter((p) => normalizeText(p.name).includes(q)) : procedures;
  const groups = groupByCategory(filtered);

  function selectProc(p) {
    onChange(p.id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={open ? query : selectedProc?.name || ""}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          placeholder="Buscar procedimento..."
          className="w-full text-sm border border-stone-200 rounded-lg pl-9 pr-3 py-2 outline-none focus:border-teal-400 bg-white"
        />
      </div>
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-stone-200 rounded-lg shadow-lg">
          {groups.length === 0 && (
            <div className="px-3 py-4 text-sm text-stone-400 text-center">Nenhum procedimento encontrado</div>
          )}
          {groups.map(([cat, items]) => (
            <div key={cat}>
              <div className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-stone-400 bg-stone-50 sticky top-0">
                {cat}
              </div>
              {items.map((p) => (
                <button
                  key={p.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectProc(p);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-teal-50 transition ${
                    value === p.id ? "bg-teal-50 text-teal-900 font-medium" : "text-stone-700"
                  }`}
                >
                  {p.name || "Sem nome"}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InlineStarPicker({ level, onChange }) {
  return (
    <div className="flex items-center gap-1" title="Nível do paciente">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n === level ? 0 : n)}
          title={`Nível ${n} — +${CLIENT_LEVEL_MARKUP[n]}%`}
          className="p-0.5"
        >
          <Star
            className="w-4 h-4 transition"
            style={
              n <= level
                ? { color: MUSTARD_YELLOW, fill: MUSTARD_YELLOW, filter: `drop-shadow(0 0 3px ${MUSTARD_YELLOW}99)` }
                : { color: "#d6d3d1" }
            }
          />
        </button>
      ))}
    </div>
  );
}

function useAnimatedNumber(target, duration = 700) {
  const [display, setDisplay] = useState(target == null ? null : target);
  const [pulseKey, setPulseKey] = useState(0);
  const displayRef = useRef(target == null ? null : target);
  const targetRef = useRef(target);
  const rafRef = useRef(null);

  useEffect(() => {
    if (target == null) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      targetRef.current = null;
      displayRef.current = null;
      setDisplay(null);
      return;
    }
    if (targetRef.current === target) return;
    targetRef.current = target;

    const from = displayRef.current == null ? target : displayRef.current;
    const diff = target - from;
    if (Math.abs(diff) < 0.005) {
      displayRef.current = target;
      setDisplay(target);
      return;
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    let start = null;
    function step(ts) {
      if (start === null) start = ts;
      const elapsed = ts - start;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = from + diff * eased;
      displayRef.current = value;
      setDisplay(value);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setPulseKey((k) => k + 1);
      }
    }
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return [display, pulseKey];
}



function SimulationPanel({
  procedures,
  settings,
  materialsCatalog,
  items,
  setItems,
  category,
  setCategory,
  installments,
  setInstallments,
  clientLevel,
  setClientLevel,
  patientName,
  setPatientName,
  patientPhone,
  setPatientPhone,
  patientEmail,
  setPatientEmail,
  downPayment,
  setDownPayment,
  currentEntryId,
  setCurrentEntryId,
  onSaveBudget,
  patients,
}) {
  const [patientMode, setPatientMode] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const saveMenuRef = useRef(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef(null);

  useEffect(() => {
    if (!saveMenuOpen) return;
    function handleClickOutside(e) {
      if (saveMenuRef.current && !saveMenuRef.current.contains(e.target)) {
        setSaveMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [saveMenuOpen]);

  useEffect(() => {
    if (!exportMenuOpen) return;
    function handleClickOutside(e) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [exportMenuOpen]);

  const budgetProcs = items
    .map((it) => {
      if (it.custom) {
        return {
          id: it.instanceId,
          instanceId: it.instanceId,
          custom: true,
          name: it.name || "Item avulso",
          category: "Avulso",
          cost: Number(it.cost) || 0,
          durationMinutes: 0,
          sessions: 1,
          marginPercent: 0,
          valorBase: Number(it.valorBase) || 0,
        };
      }
      const proc = procedures.find((p) => p.id === it.procId);
      return proc ? { ...proc, instanceId: it.instanceId } : null;
    })
    .filter(Boolean);
  const clientMarkupPercent = CLIENT_LEVEL_MARKUP[clientLevel] || 0;
  const markupMult = 1 + clientMarkupPercent / 100;
  const calc = budgetProcs.length > 0 ? calcBudget(budgetProcs, settings, clientMarkupPercent, materialsCatalog) : null;
  const subtotal = budgetProcs.reduce((s, p) => s + (Number(p.valorBase) || 0) * markupMult, 0);

  const activePreset = getActivePreset(settings);
  const creditOptions = [...(activePreset.installmentFees || [])].sort((a, b) => a.n - b.n);
  const boletoOptions = [...(settings.boletoInstallmentFees || [])].sort((a, b) => a.n - b.n);

  const categoryOptions = [
    { key: "pix", label: "PIX / Dinheiro à vista" },
    { key: "debito", label: "Cartão de Débito" },
    { key: "credito", label: "Cartão de Crédito" },
    { key: "boleto", label: "Boleto Bancário" },
    { key: "convenio", label: "Convênio / Plano" },
    ...(settings.customFees || []).map((cf) => ({ key: `custom_${cf.id}`, label: cf.name || "Taxa personalizada" })),
  ];

  const methodKey =
    category === "credito" ? `credito${installments}` : category === "boleto" ? `boleto${installments}` : category;
  const row = calc ? calc.rows.find((r) => r.key === methodKey) : null;
  const hasInstallments = (category === "credito" || category === "boleto") && installments > 1;
  const minDownPayment = category === "boleto" ? (calc ? calc.totalCost : 0) : 0;
  const rawDownPayment = Number(downPayment) || 0;
  const boletoEntradaMet = category !== "boleto" || rawDownPayment >= minDownPayment;
  const safeDownPayment = hasInstallments ? Number(downPayment) || 0 : 0;
  const remainingAfterDownPayment =
    hasInstallments && row?.adjustedPrice != null ? Math.max(0, row.adjustedPrice - safeDownPayment) : null;
  const perInstallment = remainingAfterDownPayment != null ? remainingAfterDownPayment / installments : null;
  const [animatedPrice, pricePulseKey] = useAnimatedNumber(row?.adjustedPrice != null ? row.adjustedPrice : null);
  const [animatedPerInstallment, installmentPulseKey] = useAnimatedNumber(perInstallment);
  const atVistaKey = category === "credito" ? "credito1" : category === "boleto" ? "boleto1" : null;
  const atVistaRow = atVistaKey && calc ? calc.rows.find((r) => r.key === atVistaKey) : null;
  const isInterestFree =
    hasInstallments &&
    row?.adjustedPrice != null &&
    atVistaRow?.adjustedPrice != null &&
    Math.abs(row.adjustedPrice - atVistaRow.adjustedPrice) < 0.01;
  const showMachineName = category === "credito" || category === "debito";

  useEffect(() => {
    const applicable = category === "credito" || category === "boleto";
    if (!applicable) {
      if (downPayment) setDownPayment(0);
      return;
    }
    if (category === "boleto" && hasInstallments && (Number(downPayment) || 0) < minDownPayment) {
      setDownPayment(Math.round(minDownPayment * 100) / 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, hasInstallments, minDownPayment]);

  function handleCategoryChange(key) {
    setCategory(key);
    setInstallments(1);
    setDownPayment(0);
  }

  function addItem(procId) {
    if (!procId) return;
    setItems([...items, { instanceId: uid(), procId }]);
  }

  const [customItemModal, setCustomItemModal] = useState(null); // null | { instanceId?, name, cost, valorBase }

  function addCustomItem({ name, cost, valorBase }) {
    setItems([...items, { instanceId: uid(), custom: true, name, cost, valorBase }]);
  }

  function updateCustomItem(instanceId, { name, cost, valorBase }) {
    setItems(items.map((it) => (it.instanceId === instanceId ? { ...it, name, cost, valorBase } : it)));
  }

  function removeItem(instanceId) {
    setItems(items.filter((it) => it.instanceId !== instanceId));
  }

  function handleClear() {
    setItems([]);
    setCategory("");
    setInstallments(1);
    setClientLevel(0);
    setPatientName("");
    setPatientPhone("");
    setPatientEmail("");
    setDownPayment(0);
    setCurrentEntryId(null);
  }

  function handleSaveBudget(mode) {
    if (budgetProcs.length === 0 || !boletoEntradaMet) return;
    const useNewId = mode === "new" || !currentEntryId;
    const entry = {
      id: useNewId ? uid() : currentEntryId,
      savedAt: new Date().toISOString(),
      patientName: (patientName || "").trim(),
      patientPhone: (patientPhone || "").trim(),
      patientEmail: (patientEmail || "").trim(),
      procedures: budgetProcs.map((p) =>
        p.custom
          ? { custom: true, name: p.name || "Item avulso", cost: p.cost, valorBase: p.valorBase, category: "Avulso" }
          : { procId: p.id, name: p.name || "Sem nome", category: p.category || "" }
      ),
      category,
      installments,
      clientLevel,
      downPayment: safeDownPayment > 0 ? safeDownPayment : 0,
      methodLabel: row ? row.label + (showMachineName ? ` · ${activePreset.name}` : "") : null,
      price: row && row.adjustedPrice != null ? row.adjustedPrice : subtotal,
      status: "aberto",
    };
    onSaveBudget(entry);
    setCurrentEntryId(entry.id);
    setSaveFeedback(useNewId ? "new" : "update");
    setTimeout(() => setSaveFeedback(false), 1800);
  }

  function autoSaveOnExport() {
    if (budgetProcs.length === 0 || !boletoEntradaMet) return;
    handleSaveBudget(currentEntryId ? "update" : "new");
  }

  // Junta os dados reais deste orçamento (procedimentos, valores, forma de
  // pagamento, validade) e desenha no modelo novo (HTML/CSS). A função
  // antiga (buildExportCanvas, logo abaixo) continua existindo — não é mais
  // chamada em lugar nenhum, mas fica de reserva caso algo dê errado com o
  // motor novo e o Marcelo precise voltar rápido pro anterior.
  async function buildExportCanvasFromTemplate() {
    if (!row) return null;

    const dateLabel = new Date().toLocaleDateString("pt-BR");
    const validityMonths = settings.quoteValidityMonths || 3;
    const validityDate = new Date();
    validityDate.setMonth(validityDate.getMonth() + validityMonths);
    const validityLabel = validityDate.toLocaleDateString("pt-BR");
    const validityMonthsLabel = `${validityMonths} ${validityMonths === 1 ? "mês" : "meses"}`;

    const procedures = budgetProcs.map((p) => ({ name: p.name, value: (Number(p.valorBase) || 0) * markupMult }));
    const total = row.adjustedPrice != null ? row.adjustedPrice : subtotal;

    let paymentLine = row.label + (showMachineName ? ` · ${activePreset.name}` : "");
    if (perInstallment) {
      paymentLine += ` — ${installments}x de ${money(perInstallment)}${isInterestFree ? " sem juros" : ""}`;
    }
    if (safeDownPayment > 0) {
      paymentLine += ` (entrada de ${money(safeDownPayment)})`;
    }

    return renderBudgetTemplateToCanvas({
      settings,
      patientName,
      procedures,
      total,
      paymentLine,
      dateLabel,
      validityLabel,
      validityMonthsLabel,
    });
  }

  function buildExportCanvas() {
    if (!row) return null;

    const scratch = document.createElement("canvas").getContext("2d");
    function measure(font, text) {
      scratch.font = font;
      return scratch.measureText(text).width;
    }
    function truncate(font, text, maxWidth) {
      scratch.font = font;
      if (scratch.measureText(text).width <= maxWidth) return text;
      let t = text;
      while (t.length > 1 && scratch.measureText(t + "…").width > maxWidth) {
        t = t.slice(0, -1);
      }
      return t + "…";
    }

    const width = 900;
    const scale = 2;
    const marginY = 40;
    const cardPaddingX = 50;
    const cardPaddingTop = 40;
    const cardPaddingBottom = 36;
    const cardW = width - 80;
    const contentWidth = cardW - cardPaddingX * 2;
    const procRowH = 28;

    const dateLabel = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const methodText = row.label + (showMachineName ? ` · ${activePreset.name}` : "");
    const installmentText = perInstallment
      ? `${installments}x de ${money(perInstallment)}${isInterestFree ? "  sem juros" : ""}`
      : "";
    const pillTextWidth = installmentText ? measure("bold 22px 'Courier New', monospace", installmentText) : 0;
    const orgLabel = settings.orgLabel || "Consultório";
    const footerCro = settings.professionalRegistration ? settings.professionalRegistration : "";
    const footerNameLine = settings.clinicName
      ? `${orgLabel} - ${settings.clinicName}${footerCro ? "  ·  " + footerCro : ""}`
      : "";
    const footerPhoneLine = settings.phone ? `Telefone - ${settings.phone}` : "";
    const footerAddressLine = settings.address ? `Endereço - ${settings.address}` : "";
    const validityLine = formatValidityText(settings.quoteValidityMonths);

    // ---- altura total (mesmos incrementos usados no desenho abaixo) ----
    let h = cardPaddingTop;
    h += 26 + 10;
    h += 24 + 20;
    h += 1 + 18;
    h += 20 + 6;
    h += budgetProcs.length * procRowH;
    h += 12;
    h += 1 + 16;
    h += 30 + 34;
    h += 26 + 12;
    h += 60 + 10;
    if (safeDownPayment > 0) h += 26;
    if (perInstallment) h += 10 + 44 + 8 + 22;
    h += 30;
    h += 1 + 20;
    if (footerNameLine) h += 20;
    if (footerPhoneLine) h += 18;
    if (footerAddressLine) h += 18;
    h += 14;
    h += 18;
    h += cardPaddingBottom;

    const cardH = h;
    const height = cardH + marginY * 2;

    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);

    // Fundo
    ctx.fillStyle = "#fafaf9";
    ctx.fillRect(0, 0, width, height);
    const cardX = 40;
    const cardY = marginY;
    const radius = 24;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(cardX + radius, cardY);
    ctx.arcTo(cardX + cardW, cardY, cardX + cardW, cardY + cardH, radius);
    ctx.arcTo(cardX + cardW, cardY + cardH, cardX, cardY + cardH, radius);
    ctx.arcTo(cardX, cardY + cardH, cardX, cardY, radius);
    ctx.arcTo(cardX, cardY, cardX + cardW, cardY, radius);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#e7e5e4";
    ctx.lineWidth = 1;
    ctx.stroke();

    const leftX = cardX + cardPaddingX;
    const rightX = cardX + cardW - cardPaddingX;
    const centerX = cardX + cardW / 2;
    let y = cardY + cardPaddingTop;

    function hLine(yPos) {
      ctx.strokeStyle = "#e7e5e4";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(leftX, yPos);
      ctx.lineTo(rightX, yPos);
      ctx.stroke();
    }

    // Cabeçalho: nome da clínica (esq.) + data (dir.)
    ctx.textAlign = "left";
    ctx.fillStyle = "#292524";
    ctx.font = "bold 20px system-ui, sans-serif";
    ctx.fillText(truncate("bold 20px system-ui, sans-serif", settings.clinicName || "Orçamento", contentWidth * 0.6), leftX, y + 16);
    ctx.textAlign = "right";
    ctx.fillStyle = "#a8a29e";
    ctx.font = "500 13px system-ui, sans-serif";
    ctx.fillText(dateLabel, rightX, y + 14);
    y += 26 + 10;

    // Paciente
    ctx.textAlign = "left";
    ctx.fillStyle = "#57534e";
    ctx.font = "600 16px system-ui, sans-serif";
    ctx.fillText(`Paciente: ${patientName ? patientName : "Não informado"}`, leftX, y + 14);
    y += 24 + 20;

    hLine(y);
    y += 1 + 18;

    // Lista de procedimentos
    ctx.textAlign = "left";
    ctx.fillStyle = "#a8a29e";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillText("PROCEDIMENTOS", leftX, y + 10);
    y += 20 + 6;

    budgetProcs.forEach((p) => {
      const value = (Number(p.valorBase) || 0) * markupMult;
      ctx.textAlign = "left";
      ctx.fillStyle = "#292524";
      ctx.font = "500 14px system-ui, sans-serif";
      ctx.fillText(truncate("500 14px system-ui, sans-serif", p.name || "Sem nome", contentWidth - 140), leftX, y + 18);
      ctx.textAlign = "right";
      ctx.fillStyle = "#44403c";
      ctx.font = "500 14px 'Courier New', monospace";
      ctx.fillText(money(value), rightX, y + 18);
      y += procRowH;
    });
    y += 12;

    hLine(y);
    y += 1 + 16;

    // Subtotal
    ctx.textAlign = "left";
    ctx.fillStyle = "#292524";
    ctx.font = "bold 16px system-ui, sans-serif";
    ctx.fillText("Subtotal", leftX, y + 18);
    ctx.textAlign = "right";
    ctx.font = "bold 16px 'Courier New', monospace";
    ctx.fillText(money(subtotal), rightX, y + 18);
    y += 30 + 34;

    // Forma de pagamento + valor total
    ctx.textAlign = "center";
    ctx.fillStyle = "#0f766e";
    ctx.font = "600 18px system-ui, sans-serif";
    ctx.fillText(methodText, centerX, y + 18);
    y += 26 + 12;

    const priceText = row.adjustedPrice != null ? money(row.adjustedPrice) : "—";
    ctx.textAlign = "center";
    ctx.fillStyle = "#115e59";
    ctx.font = "bold 48px 'Courier New', monospace";
    ctx.fillText(priceText, centerX, y + 40);
    y += 60 + 10;

    if (safeDownPayment > 0) {
      ctx.fillStyle = "#78716c";
      ctx.font = "500 15px system-ui, sans-serif";
      ctx.fillText(`Entrada de ${money(safeDownPayment)} + o restante abaixo`, centerX, y + 14);
      y += 26;
    }

    if (perInstallment) {
      y += 10;
      const pillPaddingX = 26;
      const pillW = pillTextWidth + pillPaddingX * 2;
      const pillH = 44;
      const pillX = centerX - pillW / 2;
      const pillY = y;
      ctx.fillStyle = "#f0fdfa";
      ctx.beginPath();
      ctx.moveTo(pillX + pillH / 2, pillY);
      ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + pillH, pillH / 2);
      ctx.arcTo(pillX + pillW, pillY + pillH, pillX, pillY + pillH, pillH / 2);
      ctx.arcTo(pillX, pillY + pillH, pillX, pillY, pillH / 2);
      ctx.arcTo(pillX, pillY, pillX + pillW, pillY, pillH / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#115e59";
      ctx.font = "bold 22px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText(installmentText, centerX, pillY + 29);
      y += pillH + 8;

      ctx.fillStyle = "#a8a29e";
      ctx.font = "500 13px system-ui, sans-serif";
      ctx.fillText(`Total parcelado: ${money(perInstallment * installments)}`, centerX, y + 14);
      y += 22;
    }

    // Rodapé: dados profissionais + validade do orçamento
    y += 30;
    hLine(y);
    y += 1 + 20;

    ctx.textAlign = "center";
    if (footerNameLine) {
      ctx.fillStyle = "#57534e";
      ctx.font = "600 13px system-ui, sans-serif";
      ctx.fillText(footerNameLine, centerX, y + 12);
      y += 20;
    }
    if (footerPhoneLine) {
      ctx.fillStyle = "#78716c";
      ctx.font = "500 12px system-ui, sans-serif";
      ctx.fillText(footerPhoneLine, centerX, y + 11);
      y += 18;
    }
    if (footerAddressLine) {
      ctx.fillStyle = "#78716c";
      ctx.font = "500 12px system-ui, sans-serif";
      ctx.fillText(footerAddressLine, centerX, y + 11);
      y += 18;
    }
    y += 14;
    ctx.fillStyle = "#a8a29e";
    ctx.font = "500 11px system-ui, sans-serif";
    ctx.fillText(validityLine, centerX, y + 10);

    return canvas;
  }

  function canvasToPDFBlob(canvas) {
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    // a página usa o tamanho lógico (sem o fator de nitidez), a imagem em si
    // continua em alta resolução e é escalada pra caber na página
    const pageWidth = imgWidth / 2;
    const pageHeight = imgHeight / 2;
    const ctx = canvas.getContext("2d");
    const rgba = ctx.getImageData(0, 0, imgWidth, imgHeight).data;
    const rgb = new Uint8Array(imgWidth * imgHeight * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgb[j] = rgba[i];
      rgb[j + 1] = rgba[i + 1];
      rgb[j + 2] = rgba[i + 2];
    }

    const encoder = new TextEncoder();
    const parts = [];
    const offsets = [];
    let offset = 0;

    function pushText(str) {
      const bytes = encoder.encode(str);
      parts.push(bytes);
      offset += bytes.length;
    }
    function pushBytes(bytes) {
      parts.push(bytes);
      offset += bytes.length;
    }
    function startObj(num) {
      offsets[num] = offset;
      pushText(`${num} 0 obj\n`);
    }
    function endObj() {
      pushText("endobj\n");
    }

    pushText("%PDF-1.4\n");

    startObj(1);
    pushText("<< /Type /Catalog /Pages 2 0 R >>\n");
    endObj();

    startObj(2);
    pushText("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n");
    endObj();

    startObj(3);
    pushText(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\n`
    );
    endObj();

    const contentStr = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`;
    const contentBytes = encoder.encode(contentStr);
    startObj(4);
    pushText(`<< /Length ${contentBytes.length} >>\nstream\n`);
    pushBytes(contentBytes);
    pushText(`\nendstream\n`);
    endObj();

    startObj(5);
    pushText(
      `<< /Type /XObject /Subtype /Image /Width ${imgWidth} /Height ${imgHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${rgb.length} >>\nstream\n`
    );
    pushBytes(rgb);
    pushText(`\nendstream\n`);
    endObj();

    const xrefOffset = offset;
    const objCount = 6;
    pushText(`xref\n0 ${objCount}\n0000000000 65535 f \n`);
    for (let i = 1; i < objCount; i++) {
      pushText(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    }
    pushText(`trailer\n<< /Size ${objCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

    return new Blob(parts, { type: "application/pdf" });
  }

  async function handleExportPNG() {
    const canvas = await buildExportCanvasFromTemplate();
    if (!canvas) return;
    autoSaveOnExport();
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "orcamento-paciente.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 1800);
  }

  async function handleExportPDF() {
    const canvas = await buildExportCanvasFromTemplate();
    if (!canvas) return;
    autoSaveOnExport();
    const blob = canvasToPDFBlob(canvas);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "orcamento-paciente.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 1800);
  }

  // Nota: como o navegador abre uma aba nova aqui (target="_blank"), e essa
  // função agora é assíncrona (espera o html2canvas terminar antes de ter o
  // canvas pra imprimir), existe uma chance pequena de algum navegador mais
  // restritivo bloquear a aba por não considerar mais "clique direto do
  // usuário" depois da espera — não tem como testar isso sem abrir de
  // verdade num navegador real. Se acontecer, o jeito de resolver é abrir a
  // aba (window.open) ANTES do await, com uma tela de carregando, e só
  // trocar o conteúdo dela depois que o canvas ficar pronto.
  async function handlePrint() {
    const canvas = await buildExportCanvasFromTemplate();
    if (!canvas) return;
    autoSaveOnExport();
    const blob = canvasToPDFBlob(canvas);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  function buildShareText() {
    const lines = [];
    const greeting = patientName ? `Olá, ${patientName}!` : "Olá!";
    lines.push(`${greeting} Segue o orçamento${settings.clinicName ? ` de ${settings.clinicName}` : ""}:`);
    lines.push("");
    lines.push(
      new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    );
    lines.push("");
    lines.push("Procedimentos:");
    budgetProcs.forEach((p) => {
      const value = (Number(p.valorBase) || 0) * markupMult;
      lines.push(`- ${p.name || "Sem nome"}: ${money(value)}`);
    });
    lines.push(`Subtotal: ${money(subtotal)}`);
    lines.push("");
    if (row) {
      lines.push(`Forma de pagamento: ${row.label}${showMachineName ? ` · ${activePreset.name}` : ""}`);
      lines.push(`Total: ${money(row.adjustedPrice != null ? row.adjustedPrice : subtotal)}`);
    }
    if (safeDownPayment > 0) {
      lines.push(`Entrada: ${money(safeDownPayment)}`);
    }
    if (perInstallment) {
      lines.push(`${installments}x de ${money(perInstallment)}${isInterestFree ? " (sem juros)" : ""}`);
    }
    const orgLabel = settings.orgLabel || "Consultório";
    const footerCro = settings.professionalRegistration || "";
    const footerNameLine = settings.clinicName
      ? `${orgLabel} - ${settings.clinicName}${footerCro ? "  ·  " + footerCro : ""}`
      : "";
    const footerPhoneLine = settings.phone ? `Telefone - ${settings.phone}` : "";
    const footerAddressLine = settings.address ? `Endereço - ${settings.address}` : "";
    lines.push("");
    if (footerNameLine) lines.push(footerNameLine);
    if (footerPhoneLine) lines.push(footerPhoneLine);
    if (footerAddressLine) lines.push(footerAddressLine);
    lines.push("");
    lines.push(formatValidityText(settings.quoteValidityMonths));
    return lines.join("\n");
  }

  async function handleShareWhatsApp() {
    const canvas = await buildExportCanvasFromTemplate();
    if (!canvas) return;
    autoSaveOnExport();
    const shareText = buildShareText();

    if (navigator.share && navigator.canShare) {
      try {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        if (blob) {
          const file = new File([blob], "orcamento-paciente.png", { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: "Orçamento", text: shareText });
            return;
          }
        }
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }

    const link = document.createElement("a");
    link.href = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    link.target = "_blank";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div
      className={patientMode ? "fixed inset-0 z-50 bg-stone-50 overflow-y-auto" : undefined}
      style={patientMode ? { paddingTop: "env(safe-area-inset-top, 0px)" } : undefined}
    >
      <div className={patientMode ? "max-w-3xl mx-auto p-5 sm:p-8 space-y-5" : "space-y-5"}>
      <div className="bg-white border border-stone-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <div className="text-sm font-semibold text-stone-700">Orçamento</div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {budgetProcs.length > 0 && (
              <div className="relative" ref={saveMenuRef}>
                <button
                  onClick={() => setSaveMenuOpen((v) => !v)}
                  disabled={!boletoEntradaMet}
                  title={!boletoEntradaMet ? `Preencha a entrada mínima de ${money(minDownPayment)} pra salvar` : undefined}
                  className={`inline-flex items-center gap-1 text-xs font-medium transition ${
                    !boletoEntradaMet
                      ? "text-stone-300 cursor-not-allowed"
                      : saveFeedback
                      ? "text-teal-600"
                      : "text-stone-400 hover:text-teal-700"
                  }`}
                >
                  {saveFeedback ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> {saveFeedback === "update" ? "Atualizado!" : "Salvo!"}
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" /> Salvar
                      <ChevronDown className="w-3 h-3" />
                    </>
                  )}
                </button>
                {saveMenuOpen && boletoEntradaMet && (
                  <div className="absolute left-0 mt-2 w-48 bg-white border border-stone-200 rounded-xl shadow-lg py-1 z-50 overflow-hidden">
                    <button
                      onClick={() => {
                        setSaveMenuOpen(false);
                        handleSaveBudget("new");
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50 flex items-center gap-2"
                    >
                      <Save className="w-3.5 h-3.5 text-stone-400" /> Salvar como novo
                    </button>
                    {currentEntryId && (
                      <button
                        onClick={() => {
                          setSaveMenuOpen(false);
                          handleSaveBudget("update");
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50 flex items-center gap-2"
                      >
                        <Check className="w-3.5 h-3.5 text-stone-400" /> Atualizar orçamento
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {row && boletoEntradaMet && (
              <div className="relative" ref={exportMenuRef}>
                <button
                  onClick={() => setExportMenuOpen((v) => !v)}
                  className={`inline-flex items-center gap-1 text-xs font-medium transition ${
                    copyFeedback ? "text-teal-600" : "text-stone-400 hover:text-teal-700"
                  }`}
                >
                  {copyFeedback ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Exportado!
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" /> Exportar
                      <ChevronDown className="w-3 h-3" />
                    </>
                  )}
                </button>
                {exportMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-stone-200 rounded-xl shadow-lg py-1 z-50 overflow-hidden">
                    <button
                      onClick={() => {
                        setExportMenuOpen(false);
                        handleShareWhatsApp();
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50 flex items-center gap-2"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-stone-400" /> Compartilhar no WhatsApp
                    </button>
                    <button
                      onClick={() => {
                        setExportMenuOpen(false);
                        handleExportPDF();
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50 flex items-center gap-2"
                    >
                      <FileText className="w-3.5 h-3.5 text-stone-400" /> Exportar PDF
                    </button>
                    <button
                      onClick={() => {
                        setExportMenuOpen(false);
                        handleExportPNG();
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50 flex items-center gap-2"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-stone-400" /> Exportar PNG
                    </button>
                    <button
                      onClick={() => {
                        setExportMenuOpen(false);
                        handlePrint();
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50 flex items-center gap-2"
                    >
                      <Printer className="w-3.5 h-3.5 text-stone-400" /> Imprimir
                    </button>
                  </div>
                )}
              </div>
            )}
            {!patientMode && <InlineStarPicker level={clientLevel} onChange={setClientLevel} />}
            {patientMode ? (
              <button
                type="button"
                onClick={() => setPatientMode(false)}
                title="Fechar apresentação"
                className="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center hover:bg-rose-700 transition shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setPatientMode(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-teal-200 text-teal-700 hover:bg-teal-50 transition shrink-0"
              >
                Apresentação
              </button>
            )}
            {(items.length > 0 || category || clientLevel > 0 || patientName || patientPhone || patientEmail) && (
              <button
                onClick={handleClear}
                className="text-xs font-medium text-stone-400 hover:text-rose-600 transition"
              >
                Limpar
              </button>
            )}
          </div>
        </div>
        <div className="mb-3">
          <label className="text-xs text-stone-500 block mb-1.5">Nome do paciente</label>
          <input
            type="text"
            list="patientsDatalist"
            value={patientName}
            onChange={(e) => {
              const val = e.target.value;
              setPatientName(val);
              const match = (patients || []).find((p) => p.name === val);
              if (match) {
                if (!patientPhone && match.phone) setPatientPhone(match.phone);
                if (!patientEmail && match.email) setPatientEmail(match.email);
              }
            }}
            placeholder="Nome do paciente"
            className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 bg-white"
          />
          <datalist id="patientsDatalist">
            {(patients || []).map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-stone-500 block mb-1.5">Contato (celular)</label>
            <input
              type="text"
              inputMode="tel"
              value={patientPhone}
              onChange={(e) => setPatientPhone(formatPhoneBR(e.target.value))}
              placeholder="(00) 00000-0000"
              className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 bg-white"
            />
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1.5">Email (opcional)</label>
            <input
              type="email"
              value={patientEmail}
              onChange={(e) => setPatientEmail(e.target.value)}
              placeholder="paciente@email.com"
              className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 bg-white"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <ProcedureCombobox procedures={procedures} value="" onChange={addItem} />
          </div>
          <button
            type="button"
            onClick={() => setCustomItemModal({ name: "", cost: "", valorBase: "" })}
            title="Adicionar item avulso (custo adicional, serviço terceirizado, etc — algo que não está na lista de procedimentos)"
            className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full border border-stone-200 text-stone-600 hover:bg-stone-100 transition"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {budgetProcs.length > 0 ? (
          <div className="mt-4 border border-stone-200 rounded-xl divide-y divide-stone-100 overflow-hidden">
            {(() => {
              const nameCounts = {};
              return budgetProcs.map((p) => {
                nameCounts[p.id] = (nameCounts[p.id] || 0) + 1;
                const occurrence = nameCounts[p.id];
                const displayName = occurrence > 1 ? `${p.name || "Sem nome"} (${occurrence})` : p.name || "Sem nome";
                return (
                  <div key={p.instanceId} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <div
                      className={`min-w-0 flex items-baseline gap-2 ${p.custom ? "cursor-pointer hover:underline" : ""}`}
                      onClick={() =>
                        p.custom &&
                        setCustomItemModal({ instanceId: p.instanceId, name: p.name, cost: p.cost, valorBase: p.valorBase })
                      }
                      title={p.custom ? "Clique para editar este item avulso" : undefined}
                    >
                      <span className="text-sm font-medium text-stone-800 truncate">{displayName}</span>
                      {p.category && <span className="text-xs text-stone-400 shrink-0">{p.category}</span>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-sm text-stone-600">{money((Number(p.valorBase) || 0) * markupMult)}</span>
                      <button
                        onClick={() => removeItem(p.instanceId)}
                        title="Remover"
                        className="text-stone-300 hover:text-rose-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              });
            })()}
            <div className="flex items-center justify-between px-4 py-3 bg-teal-50 border-t border-teal-100">
              <span className="text-sm font-semibold text-teal-800">Subtotal</span>
              <span className="font-mono text-lg font-bold text-teal-800">{money(subtotal)}</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-stone-400 mt-3">Adicione um ou mais procedimentos pra montar o orçamento.</p>
        )}
      </div>

      {budgetProcs.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-stone-600 block mb-1.5">Forma de pagamento</label>
              <select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 bg-white"
              >
                <option value="">Selecione...</option>
                {categoryOptions.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            {(category === "credito" || category === "boleto") && (
              <div>
                <label className="text-sm text-stone-600 block mb-1.5">
                  Entrada (R$){category === "boleto" && <span className="text-rose-500"> — obrigatória</span>}
                </label>
                <input
                  type="number"
                  min={category === "boleto" ? minDownPayment : 0}
                  step="0.01"
                  value={downPayment || ""}
                  onChange={(e) => setDownPayment(e.target.value === "" ? 0 : Number(e.target.value))}
                  onBlur={() => {
                    const v = Number(downPayment) || 0;
                    if (category === "boleto" && v < minDownPayment) {
                      setDownPayment(Math.round(minDownPayment * 100) / 100);
                    } else if (v < 0) {
                      setDownPayment(0);
                    }
                  }}
                  placeholder={category === "credito" ? "Opcional, deixe em branco pra não ter entrada" : `Mínimo ${money(minDownPayment)}`}
                  className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 bg-white"
                />
                {category === "boleto" ? (
                  <p className="text-xs text-stone-400 mt-1.5 leading-relaxed">
                    Mínimo {money(minDownPayment)} (custo total do procedimento, pra cobrir o material caso o paciente não
                    pague as parcelas restantes).
                    {!boletoEntradaMet && (
                      <span className="text-amber-600 font-medium">
                        {" "}
                        Preencha o valor mínimo pra liberar as opções de parcelamento e o valor total.
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-xs text-stone-400 mt-1.5 leading-relaxed">
                    Opcional. Ao escolher as parcelas abaixo, o restante é dividido entre elas.
                  </p>
                )}
              </div>
            )}
            {(category === "credito" || category === "boleto") && boletoEntradaMet && (
              <div className="sm:col-span-2">
                <label className="text-sm text-stone-600 block mb-1.5">Parcelas</label>
                <select
                  value={installments}
                  onChange={(e) => setInstallments(Number(e.target.value))}
                  className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 bg-white"
                >
                  {(category === "credito" ? creditOptions : boletoOptions).map((opt) => {
                    const optRow = calc ? calc.rows.find((r) => r.key === `${category}${opt.n}`) : null;
                    const optPerInstallment = optRow?.adjustedPrice != null ? optRow.adjustedPrice / opt.n : null;
                    const optIsInterestFree =
                      opt.n > 1 &&
                      optRow?.adjustedPrice != null &&
                      atVistaRow?.adjustedPrice != null &&
                      Math.abs(optRow.adjustedPrice - atVistaRow.adjustedPrice) < 0.01;
                    return (
                      <option key={opt.n} value={opt.n}>
                        {opt.n === 1 ? "À vista (1x)" : `${opt.n}x`}
                        {optPerInstallment != null && ` de ${money(optPerInstallment)}`}
                        {optIsInterestFree ? " — sem juros" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {row && boletoEntradaMet ? (
        <div className="bg-white border border-stone-200 rounded-2xl">
          <div className="px-6 sm:px-8 pt-10 pb-9 flex flex-col md:flex-row items-center md:items-start gap-8">
            {!patientMode && (
              <div className="w-56 shrink-0 text-left">
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs text-stone-400 whitespace-nowrap">Custo total</span>
                    <span className="font-mono text-sm font-semibold text-rose-600">{money(calc.directCost)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs text-stone-400 whitespace-nowrap">Horas Clínicas</span>
                    <span className="font-mono text-sm font-semibold text-rose-600">{money(calc.laborCost)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs text-stone-400 whitespace-nowrap">Taxa</span>
                    <span className="font-mono text-sm font-semibold text-rose-600 text-right">
                      {pct(row.feePercent)}
                      {row.feeAmount != null && ` / ${money(row.feeAmount)}`}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs text-stone-400 whitespace-nowrap">Imposto</span>
                    <span className="font-mono text-sm font-semibold text-rose-600 text-right">
                      {pct(calc.taxPct)}
                      {row.taxAmount != null && ` / ${money(row.taxAmount)}`}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-t border-stone-100 pt-2.5">
                    <span className="text-xs text-stone-500 font-medium whitespace-nowrap">Total dos custos</span>
                    <span className="font-mono text-sm font-semibold text-rose-700">
                      {money(calc.totalCost + (row.feeAmount || 0) + (row.taxAmount || 0))}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs text-stone-400 whitespace-nowrap">Nível do paciente</span>
                    <span className="font-mono text-sm font-semibold text-stone-700">
                      {calc.clientLevelPercent > 0 ? `+${pct(calc.clientLevelPercent)}` : "Padrão"}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-t border-stone-100 pt-2.5">
                    <span className="text-xs text-stone-400 whitespace-nowrap">Lucro</span>
                    <span
                      className={`font-mono text-sm font-semibold text-right ${
                        row.realProfit != null && row.realProfit < 0 ? "text-rose-600" : "text-emerald-600"
                      }`}
                    >
                      {row.realMarginPercent != null ? pct(row.realMarginPercent) : "—"}
                      {row.realProfit != null && ` / ${money(row.realProfit)}`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-stone-800 tracking-tight">
                {budgetProcs.length === 1 ? budgetProcs[0].name : `${budgetProcs.length} procedimentos`}
              </div>
              <div className="text-lg sm:text-xl font-semibold text-teal-700 mt-1.5">
                {row.label}
                {showMachineName && <span className="text-stone-400 font-medium"> · {activePreset.name}</span>}
              </div>
              <div
                key={pricePulseKey}
                className={`text-6xl sm:text-7xl font-bold tracking-tight text-teal-800 font-mono mt-5 mb-1 ${
                  pricePulseKey > 0 ? "animate-price-pulse" : ""
                }`}
              >
                {animatedPrice != null ? money(animatedPrice) : "—"}
              </div>
              {safeDownPayment > 0 && (
                <div className="text-sm sm:text-base text-stone-500 -mt-1 mb-1">
                  Entrada de <span className="font-semibold text-stone-700">{money(safeDownPayment)}</span> + o restante
                  abaixo
                </div>
              )}
              {perInstallment && (
                <div className="inline-flex items-baseline gap-2 bg-teal-50 rounded-2xl px-6 py-3 mt-5">
                  <span className="text-3xl sm:text-4xl font-bold text-teal-800 font-mono">{installments}x</span>
                  <span className="text-base sm:text-lg text-stone-500">de</span>
                  <span
                    key={installmentPulseKey}
                    className={`text-3xl sm:text-4xl font-bold text-teal-800 font-mono ${
                      installmentPulseKey > 0 ? "animate-price-pulse" : ""
                    }`}
                  >
                    {money(animatedPerInstallment != null ? animatedPerInstallment : perInstallment)}
                  </span>
                  {isInterestFree && (
                    <span className="text-sm sm:text-base font-semibold text-teal-600">sem juros</span>
                  )}
                </div>
              )}
              {perInstallment && (
                <div className="text-xs text-stone-400 mt-2">
                  Total parcelado: {money(perInstallment * installments)}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : category === "boleto" && !boletoEntradaMet && budgetProcs.length > 0 ? (
        <div className="border border-dashed border-amber-300 bg-amber-50/40 rounded-2xl flex flex-col items-center justify-center py-16 text-amber-700">
          <Banknote className="w-8 h-8 mb-3" />
          <p className="text-sm text-center px-6">
            Preencha a entrada mínima de <span className="font-semibold">{money(minDownPayment)}</span> pra ver as parcelas
            e o valor total do boleto.
          </p>
        </div>
      ) : budgetProcs.length > 0 ? (
        <div className="border border-dashed border-stone-300 rounded-2xl flex flex-col items-center justify-center py-16 text-stone-400">
          <Banknote className="w-8 h-8 mb-3" />
          <p className="text-sm">Escolha a forma de pagamento pra ver o valor a cobrar.</p>
        </div>
      ) : (
        <div className="border border-dashed border-stone-300 rounded-2xl flex flex-col items-center justify-center py-16 text-stone-400">
          <Banknote className="w-8 h-8 mb-3" />
          <p className="text-sm">Adicione procedimentos ao orçamento pra ver o valor a cobrar.</p>
        </div>
      )}
      </div>

      {customItemModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={() => setCustomItemModal(null)}
        >
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-stone-800 mb-1 text-sm">
              {customItemModal.instanceId ? "Editar item avulso" : "Novo item avulso"}
            </h3>
            <p className="text-xs text-stone-400 mb-4">
              Pra custo adicional, serviço terceirizado ou qualquer coisa que não está na lista de procedimentos.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-stone-500 block mb-1">Nome</label>
                <input
                  autoFocus
                  value={customItemModal.name}
                  onChange={(e) => setCustomItemModal({ ...customItemModal, name: e.target.value })}
                  placeholder="Ex: Prótese terceirizada, taxa de laboratório..."
                  className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Custo (R$)</label>
                  <input
                    type="number"
                    value={customItemModal.cost}
                    onChange={(e) => setCustomItemModal({ ...customItemModal, cost: e.target.value })}
                    placeholder="Opcional"
                    className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Valor cobrado (R$)</label>
                  <input
                    type="number"
                    value={customItemModal.valorBase}
                    onChange={(e) => setCustomItemModal({ ...customItemModal, valorBase: e.target.value })}
                    className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-between items-center gap-2 mt-5">
              {customItemModal.instanceId ? (
                <button
                  onClick={() => {
                    removeItem(customItemModal.instanceId);
                    setCustomItemModal(null);
                  }}
                  className="text-xs font-medium text-rose-600 hover:underline"
                >
                  Remover
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setCustomItemModal(null)}
                  className="text-xs font-medium text-stone-500 border border-stone-200 rounded-lg px-3 py-2 hover:bg-stone-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (!customItemModal.name.trim()) return;
                    const payload = {
                      name: customItemModal.name.trim(),
                      cost: customItemModal.cost,
                      valorBase: customItemModal.valorBase,
                    };
                    if (customItemModal.instanceId) {
                      updateCustomItem(customItemModal.instanceId, payload);
                    } else {
                      addCustomItem(payload);
                    }
                    setCustomItemModal(null);
                  }}
                  disabled={!customItemModal.name.trim()}
                  className="text-xs font-semibold bg-teal-700 text-white rounded-lg px-3 py-2 hover:bg-teal-800 disabled:opacity-50"
                >
                  {customItemModal.instanceId ? "Salvar" : "Adicionar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabNav({ tab, setTab, accentColor, darkMode }) {
  const containerRef = useRef(null);
  const tabRefs = useRef({});
  const [pillStyle, setPillStyle] = useState(null);

  const tabs = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "simulation", label: "+ Novo Orçamento", icon: Calculator },
    { key: "patients", label: "Pacientes", icon: Users },
    { key: "procedures", label: "Procedimentos", icon: ClipboardList },
    { key: "history", label: "Histórico", icon: Clock },
  ];

  useLayoutEffect(() => {
    function updatePill() {
      const container = containerRef.current;
      const activeEl = tabRefs.current[tab];
      if (container && activeEl) {
        const containerRect = container.getBoundingClientRect();
        const activeRect = activeEl.getBoundingClientRect();
        setPillStyle({ left: activeRect.left - containerRect.left, width: activeRect.width });
      } else {
        // Não estamos em nenhuma das 3 abas (ex: Perfil/Configurações) —
        // não deixa nenhum item marcado como selecionado.
        setPillStyle(null);
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
              backgroundColor: accentColor || (darkMode ? "#71717a" : "#292524"),
            }}
          />
        )}
        {tabs.map((t) => (
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
        {tabs.map((t) => {
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

const CROP_PREVIEW_SIZE = 260;
const CROP_OUTPUT_SIZE = 320;

function ImageCropModal({ imageSrc, onCancel, onSave }) {
  const [naturalSize, setNaturalSize] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const imgElRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = imageSrc;
    return () => {
      cancelled = true;
    };
  }, [imageSrc]);

  const baseScale = naturalSize
    ? Math.max(CROP_PREVIEW_SIZE / naturalSize.width, CROP_PREVIEW_SIZE / naturalSize.height)
    : 1;
  const effectiveScale = baseScale * zoom;
  const displayWidth = naturalSize ? naturalSize.width * effectiveScale : 0;
  const displayHeight = naturalSize ? naturalSize.height * effectiveScale : 0;
  const maxOffsetX = Math.max(0, (displayWidth - CROP_PREVIEW_SIZE) / 2);
  const maxOffsetY = Math.max(0, (displayHeight - CROP_PREVIEW_SIZE) / 2);

  function clamp(o, mx, my) {
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
  }

  useEffect(() => {
    setOffset((o) => clamp(o, maxOffsetX, maxOffsetY));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, naturalSize]);

  function handlePointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, orig: offset };
  }
  function handlePointerMove(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clamp({ x: dragRef.current.orig.x + dx, y: dragRef.current.orig.y + dy }, maxOffsetX, maxOffsetY));
  }
  function handlePointerUp() {
    dragRef.current = null;
  }

  function handleSave() {
    if (!naturalSize || !imgElRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = CROP_OUTPUT_SIZE;
    canvas.height = CROP_OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    // Preenche de branco ANTES de recortar o círculo — assim, ao exportar
    // como JPEG (que não tem transparência), os cantos fora do círculo
    // ficam brancos em vez de pretos.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CROP_OUTPUT_SIZE, CROP_OUTPUT_SIZE);
    ctx.beginPath();
    ctx.arc(CROP_OUTPUT_SIZE / 2, CROP_OUTPUT_SIZE / 2, CROP_OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const ratio = CROP_OUTPUT_SIZE / CROP_PREVIEW_SIZE;
    const drawWidth = displayWidth * ratio;
    const drawHeight = displayHeight * ratio;
    const drawX = CROP_OUTPUT_SIZE / 2 - drawWidth / 2 + offset.x * ratio;
    const drawY = CROP_OUTPUT_SIZE / 2 - drawHeight / 2 + offset.y * ratio;
    ctx.drawImage(imgElRef.current, drawX, drawY, drawWidth, drawHeight);
    // JPEG em vez de PNG: bem mais leve pra salvar no banco (agora que a
    // foto de perfil é salva por conta, não só no navegador).
    onSave(canvas.toDataURL("image/jpeg", 0.85));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-semibold text-stone-700 mb-3">Ajustar imagem</div>
        <div
          className="relative mx-auto rounded-full overflow-hidden bg-stone-100 cursor-grab active:cursor-grabbing touch-none select-none"
          style={{ width: `${CROP_PREVIEW_SIZE}px`, height: `${CROP_PREVIEW_SIZE}px` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {naturalSize && (
            <img
              ref={imgElRef}
              src={imageSrc}
              alt="Pré-visualização"
              draggable={false}
              className="absolute top-1/2 left-1/2 pointer-events-none max-w-none"
              style={{
                width: `${displayWidth}px`,
                height: `${displayHeight}px`,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
          )}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs text-stone-400 shrink-0">Zoom</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
        </div>
        <p className="text-xs text-stone-400 mt-2 text-center">Arraste a imagem para posicionar dentro do círculo</p>
        <div className="flex gap-2 mt-5">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-full border border-stone-200 text-sm font-medium text-stone-600 hover:bg-stone-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!naturalSize}
            className="flex-1 px-4 py-2 rounded-full bg-teal-700 text-white text-sm font-medium hover:bg-teal-800 transition disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function OptionsMenu({ settings, onChange, onLogoUpload, onOpenProfileSettings }) {
  const [open, setOpen] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [contactSubject, setContactSubject] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactSending, setContactSending] = useState(false);
  const [contactFeedback, setContactFeedback] = useState(""); // "" | "sucesso" | "erro"
  const ref = useRef(null);
  const account = useAccount();
  const profilePhotoInputRef = useRef(null);

  const { available: installAvailable, promptInstall } = useInstallPrompt();
  const [installed, setInstalled] = useState(false);
  const alreadyInstalled = isRunningInstalled();
  const onIOS = isIOS();

  async function handleInstallClick() {
    const accepted = await promptInstall();
    if (accepted) setInstalled(true);
  }

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setShowContact(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSendContact(e) {
    e.preventDefault();
    if (!contactMessage.trim()) return;
    setContactSending(true);
    setContactFeedback("");
    try {
      await apiRequest("/api/support/contact", {
        method: "POST",
        body: JSON.stringify({ subject: contactSubject, message: contactMessage }),
      });
      setContactFeedback("sucesso");
      setContactSubject("");
      setContactMessage("");
    } catch (err) {
      setContactFeedback("erro");
    } finally {
      setContactSending(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Abrir opções"
        className="relative shrink-0 rounded-full flex items-center justify-center overflow-hidden transition hover:brightness-95"
        style={{
          width: "56px",
          height: "56px",
          backgroundColor: "rgba(0,0,0,0.08)",
          border: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        {settings.logoDataUrl ? (
          <img src={settings.logoDataUrl} alt="Foto de perfil" className="w-full h-full object-cover" />
        ) : (
          <User className="w-7 h-7 text-stone-400" />
        )}
      </button>
      {open && (
        <div className="fixed left-3 right-3 top-24 md:absolute md:left-auto md:right-0 md:top-auto md:mt-2 md:w-72 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden z-50 text-stone-800 max-h-[75vh] overflow-y-auto">
          {account?.user && (
            <div className="px-4 py-3 border-b border-stone-100">
              <div className="text-sm font-semibold text-stone-800 truncate">{account.user.email}</div>
              {account?.license &&
                typeof account.license.daysLeft === "number" &&
                (account.license.type === "trial" ||
                  !account.license.hasStripeSubscription ||
                  account.license.cancelAtPeriodEnd) && (
                  <div
                    className={`text-xs mt-0.5 ${
                      account.license.daysLeft <= 7 ? "text-rose-600 font-bold" : "text-stone-400"
                    }`}
                  >
                    {account.license.daysLeft <= 0
                      ? "Licença vence hoje"
                      : `${account.license.daysLeft} ${account.license.daysLeft === 1 ? "dia restante" : "dias restantes"} na licença`}
                  </div>
                )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-stone-100">
            <span className="text-sm">Modo escuro</span>
            <button
              type="button"
              role="switch"
              aria-checked={!!settings.darkMode}
              onClick={() => onChange({ ...settings, darkMode: !settings.darkMode })}
              className="relative w-11 h-6 rounded-full transition-colors shrink-0"
              style={{ backgroundColor: settings.darkMode ? "#0f766e" : "#d6d3d1" }}
            >
              <span
                className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
                style={{ transform: settings.darkMode ? "translateX(20px)" : "translateX(0)" }}
              />
            </button>
          </div>

          <button
            onClick={() => setShowContact((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-stone-50 transition border-t border-stone-100"
          >
            <span>Contato / Suporte</span>
            <ChevronRight className={`w-3.5 h-3.5 text-stone-400 transition-transform ${showContact ? "rotate-90" : ""}`} />
          </button>
          {showContact && (
            <div className="px-4 pb-4 pt-1 border-t border-stone-100">
              <p className="text-xs text-stone-400 mb-2 leading-relaxed">
                Manda uma mensagem pra gente — cai direto no e-mail do suporte.
              </p>
              <form onSubmit={handleSendContact} className="space-y-2">
                <input
                  type="text"
                  value={contactSubject}
                  onChange={(e) => setContactSubject(e.target.value)}
                  placeholder="Assunto (opcional)"
                  className="w-full text-xs border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
                />
                <textarea
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  placeholder="Escreva sua mensagem..."
                  rows={3}
                  required
                  className="w-full text-xs border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 resize-none"
                />
                <button
                  type="submit"
                  disabled={contactSending || !contactMessage.trim()}
                  className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium bg-teal-700 text-white rounded-lg py-1.5 hover:bg-teal-800 transition disabled:opacity-50"
                >
                  {contactSending ? "Enviando..." : "Enviar mensagem"}
                </button>
                {contactFeedback === "sucesso" && (
                  <div className="text-xs text-teal-600 text-center">Mensagem enviada! A gente responde por e-mail.</div>
                )}
                {contactFeedback === "erro" && (
                  <div className="text-xs text-rose-600 text-center">Não foi possível enviar. Tente de novo.</div>
                )}
              </form>
            </div>
          )}

          <button
            onClick={() => {
              setOpen(false);
              onOpenProfileSettings && onOpenProfileSettings();
            }}
            className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-stone-50 transition border-t border-stone-100"
          >
            <span className="inline-flex items-center gap-2">
              <Settings className="w-3.5 h-3.5 text-stone-400" /> Configurações
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
          </button>

          <button
            onClick={account?.onLogout}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-stone-500 hover:bg-stone-50 hover:text-rose-600 transition border-t border-stone-100"
          >
            <LogOut className="w-3.5 h-3.5" /> Sair
          </button>
        </div>
      )}
    </div>
  );
}

// Campo estruturado de registro profissional: obriga escolher CRO ou CRM,
// o estado (UF) do conselho, e um número de 4 a 6 dígitos — em vez de texto
// livre. Some as três partes automaticamente no formato "CRO-SP 123456"
// (mesmo formato de string que já era salvo em settings.professionalRegistration,
// então nada mais no app precisou mudar).
function ProfessionalRegistrationField({ value, onChange }) {
  const parsed = (() => {
    const m = /^(CRO|CRM)-([A-Z]{2})\s+(\d{4,6})$/.exec((value || "").trim().toUpperCase());
    return m ? { type: m[1], uf: m[2], number: m[3] } : { type: "", uf: "", number: "" };
  })();

  const [type, setType] = useState(parsed.type);
  const [uf, setUf] = useState(parsed.uf);
  const [number, setNumber] = useState(parsed.number);

  // Só recompõe e salva a string final quando os três campos estão completos
  // e válidos — evita gravar um registro pela metade enquanto o usuário
  // ainda está preenchendo.
  useEffect(() => {
    if (type && uf && /^\d{4,6}$/.test(number)) {
      const combined = `${type}-${uf} ${number}`;
      if (combined !== (value || "")) onChange(combined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, uf, number]);

  return (
    <div>
      <div className="text-xs text-stone-500 mb-1">CRO / CRM</div>
      <div className="flex gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="text-sm border border-stone-200 rounded-lg pl-2.5 pr-1.5 py-2 outline-none focus:border-teal-400 bg-white shrink-0"
        >
          <option value="">Tipo</option>
          <option value="CRO">CRO</option>
          <option value="CRM">CRM</option>
        </select>
        <select
          value={uf}
          onChange={(e) => setUf(e.target.value)}
          className="text-sm border border-stone-200 rounded-lg pl-2.5 pr-1.5 py-2 outline-none focus:border-teal-400 bg-white shrink-0"
        >
          <option value="">UF</option>
          {BRAZIL_UF_LIST.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <input
          type="text"
          inputMode="numeric"
          value={number}
          onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="Número"
          className="flex-1 min-w-0 text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
        />
      </div>
      <p className="text-xs text-stone-400 mt-1.5 leading-relaxed">
        Tipo, estado do conselho e número (4 a 6 dígitos) — vira automaticamente{" "}
        <strong>
          {type || "CRO"}-{uf || "SP"} {number || "123456"}
        </strong>{" "}
        nos orçamentos exportados.
      </p>
    </div>
  );
}

// Botão de um clique só que manda uma mensagem pronta pro suporte (mesma
// rota que o formulário de Contato/Suporte já usa) — usado quando não tem
// nenhum jeito de self-service pra resolver algo (ex: renovar uma licença
// sem assinatura Stripe).
function ProfileSettingsPage({ settings, onChange, onLogoUpload, onClinicLogoUpload }) {
  const profilePhotoInputRef = useRef(null);
  const clinicLogoInputRef = useRef(null);
  const account = useAccount();
  const [cancelSending, setCancelSending] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState(""); // "" | "sucesso" | "erro"
  const [cancelErrorMessage, setCancelErrorMessage] = useState("");
  const [renewModalOpen, setRenewModalOpen] = useState(false);
  const [renewPlan, setRenewPlan] = useState(null); // null | "monthly" | "annual"
  const [renewSubmitting, setRenewSubmitting] = useState(false);
  const [renewError, setRenewError] = useState("");
  const [renewWaiting, setRenewWaiting] = useState(false);

  const license = account?.license;
  const licenseTypeLabel =
    license?.type === "trial"
      ? "Teste"
      : license?.type === "annual"
      ? "Anual"
      : license?.type === "lifetime"
      ? "Vitalícia"
      : "Mensal";
  const daysLeft = license?.daysLeft;

  // Últimos 4 dígitos + bandeira do cartão usado na assinatura — só pra
  // exibir, buscado direto do Stripe na hora (o Precifica nunca guarda
  // número de cartão nenhum). Só busca quando faz sentido (assinatura de
  // verdade pelo Stripe) — pra licença admin/vitalícia nem tenta.
  const [cardInfo, setCardInfo] = useState(null);
  useEffect(() => {
    if (!license?.hasStripeSubscription) {
      setCardInfo(null);
      return;
    }
    let cancelled = false;
    apiRequest("/api/payments/stripe/payment-method")
      .then((data) => {
        if (!cancelled) setCardInfo(data.card || null);
      })
      .catch(() => {
        if (!cancelled) setCardInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [license?.hasStripeSubscription]);

  const CARD_BRAND_LABELS = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "American Express",
    discover: "Discover",
    diners: "Diners Club",
    jcb: "JCB",
    unionpay: "UnionPay",
  };

  const { available: installAvailable, promptInstall } = useInstallPrompt();
  const [installed, setInstalled] = useState(false);
  const alreadyInstalled = isRunningInstalled();
  const onIOS = isIOS();

  async function handleInstallClick() {
    const accepted = await promptInstall();
    if (accepted) setInstalled(true);
  }

  async function handleCancelSubscription() {
    setCancelSending(true);
    setCancelFeedback("");
    setCancelErrorMessage("");
    try {
      await apiRequest("/api/payments/stripe/cancel-subscription", { method: "POST" });
      setCancelFeedback("sucesso");
      account?.refreshSession?.();
    } catch (err) {
      setCancelFeedback("erro");
      setCancelErrorMessage(err.message || "Não foi possível cancelar agora. Tente de novo.");
    } finally {
      setCancelSending(false);
    }
  }

  // Renovar/trocar de plano SEM deslogar a pessoa: abre o checkout do Stripe
  // numa aba/popup nova (a aba principal, com a conta logada, nunca se
  // mexe) e fica de olho em quando essa aba fecha sozinha (o Stripe manda
  // ela pra "/renovacao-confirmada", que confirma o pagamento e se fecha)
  // pra então atualizar os dados da assinatura na tela principal.
  async function handleStartRenewal() {
    if (!renewPlan) {
      setRenewError("Escolha um plano antes de continuar.");
      return;
    }
    setRenewSubmitting(true);
    setRenewError("");
    try {
      const data = await apiRequest("/api/payments/stripe/renew-checkout", {
        method: "POST",
        body: JSON.stringify({ plan: renewPlan }),
      });
      const popup = window.open(data.checkoutUrl, "_blank");
      setRenewModalOpen(false);
      if (!popup || popup.closed) {
        // Navegador bloqueou o popup — melhor esforço, navega na mesma aba
        // (nesse caso desloga, mas é o único jeito de completar o
        // pagamento se o popup não abriu).
        window.location.href = data.checkoutUrl;
        return;
      }
      setRenewWaiting(true);
      const timer = setInterval(async () => {
        if (popup.closed) {
          clearInterval(timer);
          setRenewWaiting(false);
          await account?.refreshSession?.();
        }
      }, 1000);
    } catch (err) {
      setRenewError(err.message || "Não foi possível iniciar o pagamento agora.");
    } finally {
      setRenewSubmitting(false);
    }
  }

  return (
    <>
    <SettingsCard id="sec-perfil" icon={<User className="w-4 h-4 text-teal-700" />} title="Perfil">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative w-16 h-16 shrink-0 rounded-full border border-stone-200 overflow-hidden bg-stone-100 flex items-center justify-center">
            {settings.logoDataUrl ? (
              <img src={settings.logoDataUrl} alt="Foto de perfil" className="w-full h-full object-cover" />
            ) : (
              <User className="w-6 h-6 text-stone-400" />
            )}
          </div>
          <div>
            <button
              type="button"
              onClick={() => profilePhotoInputRef.current?.click()}
              className="text-xs font-medium text-teal-700 hover:text-teal-900 border border-stone-200 rounded-lg px-3 py-1.5 hover:bg-stone-50 transition"
            >
              Alterar foto
            </button>
            <input
              ref={profilePhotoInputRef}
              type="file"
              accept="image/*"
              onChange={onLogoUpload}
              className="hidden"
            />
          </div>
        </div>

        <div>
          <div className="text-xs text-stone-500 mb-1">Tipo</div>
          <div className="flex gap-2">
            {["Consultório", "Clínica"].map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onChange({ ...settings, orgLabel: opt })}
                className={`flex-1 text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                  (settings.orgLabel || "Consultório") === opt
                    ? "border-teal-400 bg-teal-50 text-teal-800"
                    : "border-stone-200 text-stone-500 hover:bg-stone-50"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs text-stone-500 mb-1">Logo do consultório/clínica</div>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 shrink-0 rounded-lg border border-stone-200 bg-stone-50 flex items-center justify-center overflow-hidden">
              {settings.clinicLogoDataUrl ? (
                <img src={settings.clinicLogoDataUrl} alt="Logo do consultório" className="w-full h-full object-contain" />
              ) : (
                <ImageIcon className="w-5 h-5 text-stone-300" />
              )}
            </div>
            <div>
              <button
                type="button"
                onClick={() => clinicLogoInputRef.current?.click()}
                className="text-xs font-medium border border-stone-200 rounded-lg px-3 py-1.5 hover:bg-stone-50 transition"
              >
                {settings.clinicLogoDataUrl ? "Trocar logo" : "Enviar logo"}
              </button>
              {settings.clinicLogoDataUrl && (
                <button
                  type="button"
                  onClick={() => onChange({ ...settings, clinicLogoDataUrl: "" })}
                  className="text-xs font-medium text-rose-500 ml-2 hover:text-rose-700 transition"
                >
                  Remover
                </button>
              )}
              <input ref={clinicLogoInputRef} type="file" accept="image/*" onChange={onClinicLogoUpload} className="hidden" />
              <p className="text-xs text-stone-400 mt-1 leading-relaxed">Aparece no cabeçalho do orçamento exportado.</p>
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs text-stone-500 mb-1">Nome</div>
          <input
            type="text"
            value={settings.clinicName}
            onChange={(e) => onChange({ ...settings, clinicName: e.target.value })}
            placeholder="Nome do consultório/clínica ou da(o) profissional"
            className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
          />
        </div>

        <div>
          <div className="text-xs text-stone-500 mb-1">Especialidade</div>
          <input
            type="text"
            value={settings.specialty}
            onChange={(e) => onChange({ ...settings, specialty: e.target.value })}
            placeholder="Ex: Ortodontia, Odontologia Geral..."
            className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
          />
          <p className="text-xs text-stone-400 mt-1 leading-relaxed">Aparece embaixo do nome no orçamento exportado.</p>
        </div>

        <ProfessionalRegistrationField
          value={settings.professionalRegistration}
          onChange={(v) => onChange({ ...settings, professionalRegistration: v })}
        />

        <div>
          <div className="text-xs text-stone-500 mb-1">Endereço</div>
          <input
            type="text"
            value={settings.address}
            onChange={(e) => onChange({ ...settings, address: e.target.value })}
            placeholder="Rua, número, bairro, cidade"
            className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
          />
        </div>

        <div>
          <div className="text-xs text-stone-500 mb-1">Telefone</div>
          <input
            type="text"
            inputMode="tel"
            value={settings.phone}
            onChange={(e) => onChange({ ...settings, phone: formatPhoneBR(e.target.value) })}
            placeholder="(00) 00000-0000"
            className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
          />
        </div>

        <div>
          <div className="text-xs text-stone-500 mb-1">Instagram</div>
          <input
            type="text"
            value={settings.instagramHandle}
            onChange={(e) => onChange({ ...settings, instagramHandle: e.target.value.replace(/^@/, "") })}
            placeholder="usuario_instagram"
            className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
          />
          <p className="text-xs text-stone-400 mt-1 leading-relaxed">Aparece no rodapé do orçamento exportado.</p>
        </div>

        <div>
          <div className="text-xs text-stone-500 mb-1">Validade do orçamento</div>
          <select
            value={settings.quoteValidityMonths || 3}
            onChange={(e) => onChange({ ...settings, quoteValidityMonths: Number(e.target.value) })}
            className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 bg-white"
          >
            {[1, 2, 3, 4, 5, 6].map((m) => (
              <option key={m} value={m}>
                {m} {m === 1 ? "mês" : "meses"}
              </option>
            ))}
          </select>
          <p className="text-xs text-stone-400 mt-1.5 leading-relaxed">
            Aparece no rodapé dos orçamentos exportados (PDF, imagem, WhatsApp).
          </p>
        </div>

        <div>
          <div className="text-xs text-stone-500 mb-1">Cor de destaque</div>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={settings.headerColor || "#005580"}
              onChange={(e) => onChange({ ...settings, headerColor: e.target.value })}
              className="w-11 h-9 rounded-lg border border-stone-200 cursor-pointer p-0.5 bg-white"
            />
            <span className="text-sm text-stone-600 font-mono">{settings.headerColor || "#005580"}</span>
          </div>
          <p className="text-xs text-stone-400 mt-1.5 leading-relaxed">
            Usada nas abas do sistema e nas partes coloridas do orçamento exportado (cabeçalho, tabela, total,
            rodapé) — escolha a que mais combina com o seu consultório/clínica.
          </p>
        </div>

        <button
          type="button"
          onClick={() => previewBudgetTemplate(settings)}
          className="w-full text-sm font-medium text-teal-700 border border-teal-200 rounded-lg py-2.5 hover:bg-teal-50 transition"
        >
          Visualizar modelo de orçamento
        </button>
      </div>

      {license && (
        <SettingsSubSection id="sub-assinatura" icon={<CheckCircle2 className="w-4 h-4 text-teal-700" />} title="Gerenciar Assinatura">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-stone-600">Tipo</span>
              <span className="text-sm font-medium text-stone-800">{licenseTypeLabel}</span>
            </div>
            {license.activatedAt && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-stone-600">Assinante desde</span>
                <span className="text-sm font-medium text-stone-800">
                  {new Date(license.activatedAt).toLocaleDateString("pt-BR")}
                </span>
              </div>
            )}
            {license.expiresAt && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-stone-600">
                  {license.hasStripeSubscription && !license.cancelAtPeriodEnd && license.type !== "trial"
                    ? "Próxima cobrança dia"
                    : "Expira em"}
                </span>
                <span className="text-sm font-medium text-stone-800">
                  {new Date(license.expiresAt).toLocaleDateString("pt-BR")}
                </span>
              </div>
            )}
            {cardInfo && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-stone-600">Cartão cadastrado</span>
                <span className="text-sm font-medium text-stone-800 inline-flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-stone-400" />
                  •••• {cardInfo.last4} · {CARD_BRAND_LABELS[cardInfo.brand] || cardInfo.brand}
                </span>
              </div>
            )}
            {typeof daysLeft === "number" &&
              (license.type === "trial" || !license.hasStripeSubscription || license.cancelAtPeriodEnd) && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-stone-600">Dias restantes</span>
                  <span className={`text-sm font-semibold ${daysLeft <= 7 ? "text-rose-600" : "text-stone-800"}`}>
                    {daysLeft} {daysLeft === 1 ? "dia" : "dias"}
                  </span>
                </div>
              )}

            {license.type === "lifetime" ? (
              <div className="pt-3 border-t border-stone-100">
                <p className="text-xs text-teal-700 leading-relaxed">
                  Acesso vitalício — sem cobrança nenhuma, sem data de vencimento. Nada pra gerenciar aqui.
                </p>
              </div>
            ) : (
              <div className="pt-3 border-t border-stone-100">
                <p className="text-xs text-stone-500 mb-2">
                  {license.type === "trial"
                    ? "Seu teste vira assinatura automaticamente quando os dias acabarem, cobrando no cartão cadastrado."
                    : "Sua assinatura renova automaticamente no cartão cadastrado."}
                </p>
                {cancelFeedback === "sucesso" || license.cancelAtPeriodEnd ? (
                  <div>
                    <p className="text-xs text-teal-600 leading-relaxed mb-2">
                      Sua assinatura não vai renovar automaticamente. Você continua com acesso até{" "}
                      {license.expiresAt ? new Date(license.expiresAt).toLocaleDateString("pt-BR") : "a data já paga"}.
                    </p>
                    <button
                      onClick={() => {
                        setRenewPlan(null);
                        setRenewError("");
                        setRenewModalOpen(true);
                      }}
                      className="w-full text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg py-2 transition"
                    >
                      Renovar assinatura
                    </button>
                    {renewWaiting && (
                      <p className="text-[11px] text-stone-400 text-center mt-2">
                        Aguardando confirmação do pagamento na outra aba...
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <button
                      onClick={handleCancelSubscription}
                    disabled={cancelSending}
                    className="w-full text-xs font-medium text-rose-600 border border-rose-200 rounded-lg py-2 hover:bg-rose-50 transition disabled:opacity-50"
                  >
                    {cancelSending
                      ? "Cancelando..."
                      : license.type === "trial"
                      ? "Cancelar teste grátis"
                      : "Cancelar assinatura (cartão)"}
                  </button>
                  <p className="text-[11px] text-stone-400 mt-1.5 leading-relaxed">
                    Você continua com acesso até o fim do período já pago — só a próxima cobrança automática é
                    cancelada.
                  </p>
                  {cancelFeedback === "erro" && (
                    <div className="text-xs text-rose-600 text-center mt-2">{cancelErrorMessage}</div>
                  )}
                </>
              )}
            </div>
            )}
          </div>
        </SettingsSubSection>
      )}

      <SettingsSubSection id="sub-instalar-app" icon={<Download className="w-4 h-4 text-teal-700" />} title="Adicionar app na tela inicial">
        {alreadyInstalled || installed ? (
          <p className="text-sm text-stone-600">Você já está usando o Precifica instalado como app. 🎉</p>
        ) : onIOS ? (
          <div className="text-sm text-stone-600 leading-relaxed">
            No iPhone/iPad, abra o Precifica pelo <strong>Safari</strong>, toque no ícone de compartilhar
            (<span className="inline-block">⬆️</span>) na barra de baixo e escolha{" "}
            <strong>"Adicionar à Tela de Início"</strong>.
          </div>
        ) : installAvailable ? (
          <button
            onClick={handleInstallClick}
            className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-teal-700 text-white rounded-lg py-2 hover:bg-teal-800 transition"
          >
            <Download className="w-3.5 h-3.5" /> Adicionar à tela inicial
          </button>
        ) : (
          <p className="text-sm text-stone-600 leading-relaxed">
            No Android, abra o menu do navegador (⋮) e procure por <strong>"Instalar aplicativo"</strong> ou{" "}
            <strong>"Adicionar à tela inicial"</strong>.
          </p>
        )}
      </SettingsSubSection>
    </SettingsCard>

    {renewModalOpen && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setRenewModalOpen(false)}>
        <div className="bg-white rounded-2xl p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
          <h3 className="font-semibold text-stone-800 text-sm mb-1">Renovar assinatura</h3>
          <p className="text-xs text-stone-400 mb-4 leading-relaxed">
            Escolha o plano. Vamos abrir o pagamento numa aba nova — essa tela continua aberta do jeito que está.
          </p>
          {renewError && <div className="text-xs text-rose-600 mb-3">{renewError}</div>}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => setRenewPlan("monthly")}
              className={`text-left rounded-xl border p-3 transition ${
                renewPlan === "monthly" ? "border-teal-500 bg-teal-50" : "border-stone-200 hover:bg-stone-50"
              }`}
            >
              <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Mensal</div>
              <div className="text-base font-bold text-stone-800 mt-1">R$ 99,90</div>
              <div className="text-[11px] text-stone-400">por mês</div>
            </button>
            <button
              onClick={() => setRenewPlan("annual")}
              className={`text-left rounded-xl border p-3 transition ${
                renewPlan === "annual" ? "border-teal-500 bg-teal-50" : "border-stone-200 hover:bg-stone-50"
              }`}
            >
              <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Anual</div>
              <div className="text-base font-bold text-stone-800 mt-1">R$ 599,90</div>
              <div className="text-[11px] text-stone-400">por ano</div>
            </button>
          </div>
          <button
            onClick={handleStartRenewal}
            disabled={renewSubmitting || !renewPlan}
            className="w-full text-sm font-semibold bg-teal-700 text-white rounded-lg py-2.5 hover:bg-teal-800 transition disabled:opacity-50"
          >
            {renewSubmitting ? "Abrindo pagamento..." : "Continuar"}
          </button>
        </div>
      </div>
    )}
    </>
  );
}

// Menu lateral fixo da página de Configurações — cada categoria (negrito)
// leva pro topo daquele card; cada item embaixo leva direto pra subseção
// correspondente (âncoras simples, sem JS de scroll — o navegador já
// resolve isso sozinho com href="#id" + scroll-behavior:smooth no CSS).
const SETTINGS_NAV_GROUPS = [
  {
    label: "Perfil",
    href: "#sec-perfil",
    items: [
      { label: "Gerenciar Assinatura", href: "#sub-assinatura" },
      { label: "Adicionar app na tela inicial", href: "#sub-instalar-app" },
    ],
  },
  {
    label: "Custos",
    href: "#sec-custos",
    items: [
      { label: "Custo da hora clínica", href: "#sub-custo-hora" },
      { label: "Imposto", href: "#sub-imposto" },
    ],
  },
  {
    label: "Formas de pagamento",
    href: "#sec-formas-pagamento",
    items: [
      { label: "Quem paga as taxas", href: "#sub-quem-paga" },
      { label: "Cartão", href: "#sub-cartao" },
      { label: "À vista", href: "#sub-avista" },
      { label: "Boleto", href: "#sub-boleto" },
      { label: "Taxas personalizadas", href: "#sub-taxas-personalizadas" },
    ],
  },
];

function SettingsSideNav() {
  return (
    <nav className="hidden md:block w-52 shrink-0 sticky top-4 self-start space-y-5">
      {SETTINGS_NAV_GROUPS.map((g) => (
        <div key={g.label}>
          <a href={g.href} className="block text-sm font-semibold text-stone-800 hover:text-teal-700 transition mb-1.5">
            {g.label}
          </a>
          <div className="space-y-1 border-l border-stone-200 pl-3">
            {g.items.map((it) => (
              <a key={it.href} href={it.href} className="block text-xs text-stone-500 hover:text-teal-700 transition py-0.5">
                {it.label}
              </a>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SettingsCard({ icon, title, children, id }) {
  // Sempre nasce fechado — no celular, fica minimizado até a pessoa clicar
  // (como sempre foi); no PC (md e acima), o conteúdo aparece sempre, não
  // importa o valor de "open", por causa do "hidden md:block" ali embaixo.
  const [open, setOpen] = useState(false);
  return (
    <div id={id} className="bg-white border border-stone-200 rounded-2xl overflow-hidden h-fit scroll-mt-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-5 py-4 hover:bg-stone-50 md:hover:bg-transparent md:cursor-default transition"
      >
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="font-semibold text-stone-800 text-left">{title}</h2>
        </div>
        <ChevronRight className={`w-4 h-4 text-stone-400 shrink-0 transition-transform md:hidden ${open ? "rotate-90" : ""}`} />
      </button>
      <div className={`${open ? "block" : "hidden md:block"} px-5 pb-5`}>{children}</div>
    </div>
  );
}

// Divisória visual DENTRO de um SettingsCard, pra agrupar vários blocos de
// configuração relacionados dentro de um card só (ex: "Custo da hora
// clínica" e "Imposto" dentro do card "Custos"), sem criar um card novo pra
// cada um. Aceita "id" pra virar âncora de navegação (menu lateral).
function SettingsSubSection({ icon, title, children, first, id }) {
  return (
    <div id={id} className={(first ? "" : "mt-6 pt-6 border-t border-stone-100") + " scroll-mt-4"}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-sm font-semibold text-stone-700">{title}</h3>
      </div>
      {children}
    </div>
  );
}

const BUDGET_STATUS_OPTIONS = [
  { key: "aberto", label: "Em aberto", icon: Clock, badgeClass: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "aprovado", label: "Aprovado", icon: CheckCircle2, badgeClass: "bg-blue-50 text-blue-700 border-blue-200" },
  { key: "pago", label: "Pago", icon: CircleDollarSign, badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { key: "reprovado", label: "Reprovado", icon: XCircle, badgeClass: "bg-rose-50 text-rose-700 border-rose-200" },
];

function getBudgetStatusOption(key) {
  return BUDGET_STATUS_OPTIONS.find((s) => s.key === key) || BUDGET_STATUS_OPTIONS[0];
}

const DASHBOARD_STATUS_META = {
  aberto: { label: "Em aberto", color: "#eda100" },
  aprovado: { label: "Aprovado", color: "#2a78d6" },
  pago: { label: "Pago", color: "#008300" },
  reprovado: { label: "Reprovado", color: "#e34948" },
};

function DashboardSection({ budgetHistory }) {
  const [days, setDays] = useState(90);
  const evolucaoCanvasRef = useRef(null);
  const evolucaoChartRef = useRef(null);
  const statusCanvasRef = useRef(null);
  const statusChartRef = useRef(null);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const entries = (budgetHistory || []).filter((e) => e.savedAt && new Date(e.savedAt) >= cutoff);

  const orcado = entries.reduce((s, e) => s + (e.price || 0), 0);
  const recebido = entries.filter((e) => e.status === "pago").reduce((s, e) => s + (e.price || 0), 0);
  const ticket = entries.length ? orcado / entries.length : 0;
  const decididos = entries.filter((e) => e.status && e.status !== "aberto").length;
  const aprovados = entries.filter((e) => e.status === "aprovado" || e.status === "pago").length;
  const aprovacao = decididos ? Math.round((aprovados / decididos) * 100) : 0;

  const statusCounts = { aberto: 0, aprovado: 0, pago: 0, reprovado: 0 };
  entries.forEach((e) => {
    if (statusCounts[e.status] !== undefined) statusCounts[e.status]++;
  });

  const monthBuckets = {};
  entries.forEach((e) => {
    const d = new Date(e.savedAt);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    if (!monthBuckets[key]) monthBuckets[key] = { orcado: 0, recebido: 0 };
    monthBuckets[key].orcado += e.price || 0;
    if (e.status === "pago") monthBuckets[key].recebido += e.price || 0;
  });
  const monthKeys = Object.keys(monthBuckets).sort();
  const monthLabels = monthKeys.map((m) => {
    const [y, mo] = m.split("-");
    return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("pt-BR", { month: "short" });
  });

  const procCounts = {};
  entries.forEach((e) => {
    (e.procedures || []).forEach((p) => {
      const name = p.name || "Sem nome";
      procCounts[name] = (procCounts[name] || 0) + 1;
    });
  });
  const topProcs = Object.entries(procCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxProcCount = topProcs.length ? topProcs[0][1] : 1;

  useEffect(() => {
    if (!evolucaoCanvasRef.current) return;
    if (evolucaoChartRef.current) evolucaoChartRef.current.destroy();
    evolucaoChartRef.current = new Chart(evolucaoCanvasRef.current, {
      type: "line",
      data: {
        labels: monthLabels,
        datasets: [
          { label: "Orçado", data: monthKeys.map((m) => monthBuckets[m].orcado), borderColor: "#0f766e", backgroundColor: "#0f766e1a", fill: true, tension: 0.3, pointRadius: 3 },
          { label: "Recebido", data: monthKeys.map((m) => monthBuckets[m].recebido), borderColor: "#008300", backgroundColor: "#0083001a", fill: true, tension: 0.3, pointRadius: 3 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { callback: (v) => "R$ " + (v / 1000).toFixed(0) + "k", color: "#a8a29e" }, grid: { color: "#e7e5e4" } },
          x: { ticks: { color: "#a8a29e" }, grid: { display: false } },
        },
      },
    });
    return () => {
      if (evolucaoChartRef.current) evolucaoChartRef.current.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, budgetHistory]);

  useEffect(() => {
    if (!statusCanvasRef.current) return;
    if (statusChartRef.current) statusChartRef.current.destroy();
    const keys = Object.keys(DASHBOARD_STATUS_META);
    statusChartRef.current = new Chart(statusCanvasRef.current, {
      type: "doughnut",
      data: {
        labels: keys.map((k) => DASHBOARD_STATUS_META[k].label),
        datasets: [{ data: keys.map((k) => statusCounts[k]), backgroundColor: keys.map((k) => DASHBOARD_STATUS_META[k].color), borderColor: "#ffffff", borderWidth: 2 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
    });
    return () => {
      if (statusChartRef.current) statusChartRef.current.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, budgetHistory]);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-stone-800 text-lg">Dashboard</h2>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="text-sm border border-stone-200 rounded-lg px-3 py-1.5 outline-none focus:border-teal-400 bg-white"
        >
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
          <option value={365}>Últimos 12 meses</option>
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-stone-200 rounded-2xl p-4">
              <div className="text-xs text-stone-400 mb-1">Orçado no período</div>
              <div className="text-xl font-semibold text-stone-800">{money(orcado)}</div>
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl p-4">
              <div className="text-xs text-stone-400 mb-1">Recebido (pago)</div>
              <div className="text-xl font-semibold text-emerald-700">{money(recebido)}</div>
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl p-4">
              <div className="text-xs text-stone-400 mb-1">Ticket médio</div>
              <div className="text-xl font-semibold text-stone-800">{money(ticket)}</div>
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl p-4">
              <div className="text-xs text-stone-400 mb-1">Taxa de aprovação</div>
              <div className="text-xl font-semibold text-stone-800">{aprovacao}%</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-4">
            <div className="bg-white border border-stone-200 rounded-2xl p-4">
              <div className="text-sm font-medium text-stone-700 mb-3">Orçado vs recebido, por mês</div>
              <div className="relative w-full" style={{ height: 220 }}>
                <canvas
                  ref={evolucaoCanvasRef}
                  role="img"
                  aria-label="Gráfico de linhas comparando valor orçado e valor recebido por mês"
                >
                  Evolução mensal de valor orçado e recebido.
                </canvas>
              </div>
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl p-4">
              <div className="text-sm font-medium text-stone-700 mb-3">Orçamentos por status</div>
              <div className="relative w-full" style={{ height: 160 }}>
                <canvas
                  ref={statusCanvasRef}
                  role="img"
                  aria-label="Gráfico de rosca mostrando a proporção de orçamentos abertos, aprovados, pagos e reprovados"
                >
                  Distribuição de orçamentos por status.
                </canvas>
              </div>
              <div className="flex flex-col gap-1.5 mt-3 text-xs">
                {Object.keys(DASHBOARD_STATUS_META).map((k) => {
                  const pct = entries.length ? Math.round((statusCounts[k] / entries.length) * 100) : 0;
                  return (
                    <span key={k} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: DASHBOARD_STATUS_META[k].color }} />
                      <span className="text-stone-500">{DASHBOARD_STATUS_META[k].label}</span>
                      <span className="ml-auto text-stone-700 font-medium">
                        {statusCounts[k]} ({pct}%)
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          {topProcs.length > 0 && (
            <div className="bg-white border border-stone-200 rounded-2xl p-4">
              <div className="text-sm font-medium text-stone-700 mb-3">Procedimentos mais orçados</div>
              <div className="flex flex-col gap-2.5">
                {topProcs.map(([name, count]) => {
                  const pct = Math.round((count / maxProcCount) * 100);
                  return (
                    <div key={name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-stone-700">{name}</span>
                        <span className="text-stone-400">{count}</span>
                      </div>
                      <div className="bg-stone-100 rounded h-1.5 overflow-hidden">
                        <div className="bg-teal-700 h-full rounded" style={{ width: pct + "%" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
    </div>
  );
}

function PatientsPage({ patients, budgetHistory, onAdd, onUpdate, onDelete, onReopen }) {
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  function orcamentosDoPaciente(name) {
    const key = normalizeText(name || "");
    return (budgetHistory || [])
      .filter((h) => normalizeText(h.patientName || "") === key)
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  }

  const filtered = patients
    .filter((p) => {
      if (!search.trim()) return true;
      const q = normalizeText(search);
      return normalizeText(p.name || "").includes(q) || (p.phone || "").includes(search) || normalizeText(p.email || "").includes(q);
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));

  function openNewForm() {
    setEditingId(null);
    setFormName("");
    setFormPhone("");
    setFormEmail("");
    setFormOpen(true);
  }

  function openEditForm(p) {
    setEditingId(p.id);
    setFormName(p.name || "");
    setFormPhone(p.phone || "");
    setFormEmail(p.email || "");
    setFormOpen(true);
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    if (!formName.trim()) return;
    const data = { name: formName.trim(), phone: formPhone.trim(), email: formEmail.trim() };
    if (editingId) onUpdate(editingId, data);
    else onAdd(data);
    setFormOpen(false);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-semibold text-stone-800 text-lg">Pacientes</h2>
        <button
          onClick={openNewForm}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg px-3 py-1.5 transition"
        >
          <Plus className="w-4 h-4" /> Novo paciente
        </button>
      </div>

      <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-3 py-2">
        <Search className="w-4 h-4 text-stone-400 shrink-0" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar por nome, telefone ou email..."
          className="flex-1 text-sm outline-none bg-transparent placeholder:text-stone-400"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
          <p className="text-sm text-stone-500">
            {patients.length === 0
              ? "Nenhum paciente cadastrado ainda — cadastre um novo, ou salve um orçamento com o nome do paciente que ele entra aqui sozinho."
              : "Nenhum paciente encontrado com essa busca."}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100 overflow-hidden">
          {filtered.map((p) => {
            const orcamentos = orcamentosDoPaciente(p.name);
            const n = orcamentos.length;
            const expanded = expandedId === p.id;
            return (
              <div key={p.id}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    disabled={n === 0}
                    onClick={() => setExpandedId(expanded ? null : p.id)}
                    className={`min-w-0 flex-1 text-left ${n > 0 ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-stone-800 truncate">{p.name}</span>
                      {n > 0 && (
                        <ChevronRight className={`w-3.5 h-3.5 text-stone-400 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
                      )}
                    </div>
                    <div className="text-xs text-stone-400 truncate">
                      {[p.phone, p.email].filter(Boolean).join(" · ") || "Sem contato cadastrado"}
                      {n > 0 && ` · ${n} orçamento${n > 1 ? "s" : ""}`}
                    </div>
                  </button>
                  {confirmDeleteId === p.id ? (
                    <button
                      onClick={() => {
                        onDelete(p.id);
                        setConfirmDeleteId(null);
                      }}
                      title="Confirmar exclusão"
                      className="text-rose-600 hover:text-rose-800 shrink-0"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(p.id)} title="Remover" className="text-stone-300 hover:text-rose-600 shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => openEditForm(p)} title="Editar" className="text-stone-300 hover:text-teal-700 shrink-0">
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
                {expanded && n > 0 && (
                  <div className="px-4 pb-3 bg-stone-50">
                    <div className="border-t border-stone-100 pt-3 space-y-2">
                      {orcamentos.map((h) => {
                        const meta = DASHBOARD_STATUS_META[h.status] || DASHBOARD_STATUS_META.aberto;
                        return (
                          <button
                            key={h.id}
                            onClick={() => onReopen(h)}
                            title="Abrir esse orçamento"
                            className="w-full flex items-center justify-between gap-3 text-xs text-left hover:bg-stone-100 rounded-lg px-2 py-1.5 -mx-2 transition"
                          >
                            <div className="min-w-0">
                              <div className="text-stone-600">
                                {h.savedAt ? new Date(h.savedAt).toLocaleDateString("pt-BR") : "Sem data"}
                              </div>
                              <div className="text-stone-400 truncate">
                                {(h.procedures || []).map((pr) => pr.name).join(", ") || "Sem procedimentos"}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-medium text-stone-700">{money(h.price || 0)}</span>
                              <span
                                className="px-2 py-0.5 rounded-full font-medium"
                                style={{ background: meta.color + "22", color: meta.color }}
                              >
                                {meta.label}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setFormOpen(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-stone-800 mb-4">{editingId ? "Editar paciente" : "Novo paciente"}</h3>
            <form onSubmit={handleFormSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-stone-500 block mb-1.5">Nome</label>
                <input
                  autoFocus
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nome do paciente"
                  required
                  className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
                />
              </div>
              <div>
                <label className="text-xs text-stone-500 block mb-1.5">Contato (celular)</label>
                <input
                  type="text"
                  inputMode="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(formatPhoneBR(e.target.value))}
                  placeholder="(00) 00000-0000"
                  className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
                />
              </div>
              <div>
                <label className="text-xs text-stone-500 block mb-1.5">Email (opcional)</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="paciente@email.com"
                  className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="flex-1 text-sm font-medium text-stone-600 border border-stone-200 rounded-lg py-2 hover:bg-stone-50 transition"
                >
                  Cancelar
                </button>
                <button type="submit" className="flex-1 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg py-2 transition">
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryPanel({ history, onReopen, onDelete, onClearAll, onUpdateStatus }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const deleteTimerRef = useRef(null);
  const clearTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, []);

  function handleDeleteClick(id) {
    if (confirmDeleteId === id) {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      setConfirmDeleteId(null);
      onDelete(id);
    } else {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      setConfirmDeleteId(id);
      deleteTimerRef.current = setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  }

  function handleClearAllClick() {
    if (confirmClearAll) {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      setConfirmClearAll(false);
      onClearAll();
    } else {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      setConfirmClearAll(true);
      clearTimerRef.current = setTimeout(() => setConfirmClearAll(false), 3000);
    }
  }

  const filtered = (history || []).filter((h) => {
    if (statusFilter !== "todos" && (h.status || "aberto") !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = normalizeText(search);
    const nameMatch = normalizeText(h.patientName || "").includes(q);
    const procMatch = (h.procedures || []).some((p) => normalizeText(p.name || "").includes(q));
    return nameMatch || procMatch;
  });

  if (!history || history.length === 0) {
    return (
      <div className="border border-dashed border-stone-300 rounded-2xl flex flex-col items-center justify-center py-24 text-stone-400">
        <Save className="w-8 h-8 mb-3" />
        <p>Nenhum orçamento salvo ainda.</p>
        <p className="text-xs mt-1">Use "Salvar orçamento" na aba "+ Novo Orçamento" pra guardar orçamentos aqui.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-stone-700">Histórico de orçamentos</h2>
        <button
          onClick={handleClearAllClick}
          className={`text-xs font-medium transition ${
            confirmClearAll ? "text-rose-600 font-semibold" : "text-stone-400 hover:text-rose-600"
          }`}
        >
          {confirmClearAll ? "Clique de novo pra confirmar" : "Limpar histórico"}
        </button>
      </div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por paciente ou procedimento..."
        className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 bg-white"
      />
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setStatusFilter("todos")}
          className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
            statusFilter === "todos" ? "border-teal-400 bg-teal-50 text-teal-800" : "border-stone-200 text-stone-500 hover:bg-stone-50"
          }`}
        >
          Todos
        </button>
        {BUDGET_STATUS_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.key}
              onClick={() => setStatusFilter(opt.key)}
              className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border transition ${
                statusFilter === opt.key ? opt.badgeClass : "border-stone-200 text-stone-500 hover:bg-stone-50"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {opt.label}
            </button>
          );
        })}
      </div>
      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-stone-400 border-b border-stone-100">
                <th className="px-5 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium">Procedimento</th>
                <th className="px-3 py-2 font-medium">Forma de pagamento</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-5 py-2 font-medium text-right">Valor</th>
                <th className="px-3 py-2 font-medium w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {filtered.map((h) => {
                const dateLabel = new Date(h.savedAt).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const procNames = (h.procedures || []).map((p) => p.name).join(", ");
                const statusOpt = getBudgetStatusOption(h.status);
                const StatusIcon = statusOpt.icon;
                return (
                  <tr key={h.id} onClick={() => onReopen(h)} className="hover:bg-stone-50 cursor-pointer group">
                    <td className="px-5 py-3 text-xs text-stone-400 whitespace-nowrap">{dateLabel}</td>
                    <td className="px-3 py-3 font-medium text-stone-800 whitespace-nowrap">
                      {h.patientName || "Sem nome"}
                    </td>
                    <td className="px-3 py-3 text-stone-600 max-w-xs truncate" title={procNames}>
                      {procNames || "—"}
                    </td>
                    <td className="px-3 py-3 text-stone-600 whitespace-nowrap">
                      {h.methodLabel || "—"}
                      {h.downPayment > 0 && (
                        <div className="text-xs text-stone-400">Entrada: {money(h.downPayment)}</div>
                      )}
                    </td>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div
                        className={`relative inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${statusOpt.badgeClass}`}
                      >
                        <StatusIcon className="w-3.5 h-3.5" />
                        <span>{statusOpt.label}</span>
                        <select
                          value={h.status || "aberto"}
                          onChange={(e) => onUpdateStatus(h.id, e.target.value)}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          title="Alterar status"
                        >
                          {BUDGET_STATUS_OPTIONS.map((opt) => (
                            <option key={opt.key} value={opt.key}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-semibold text-teal-700 whitespace-nowrap">
                      {h.price != null ? money(h.price) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(h.id);
                        }}
                        title={confirmDeleteId === h.id ? "Clique de novo pra confirmar" : "Remover"}
                        className={`transition ${
                          confirmDeleteId === h.id
                            ? "text-rose-600 opacity-100"
                            : "text-stone-300 hover:text-rose-600 opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        {confirmDeleteId === h.id ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {filtered.length === 0 && (
        <p className="text-sm text-stone-400 text-center py-8">Nenhum orçamento encontrado pra essa busca.</p>
      )}
    </div>
  );
}

function SettingsPanel({ settings, onChange }) {
  const [local, setLocal] = useState(settings);

  useEffect(() => setLocal(settings), [settings]);

  function set(patch) {
    const next = { ...local, ...patch };
    setLocal(next);
    onChange(next);
  }

  const activePreset = getActivePreset(local);

  function updatePreset(patch) {
    set({ cardPresets: local.cardPresets.map((p) => (p.id === activePreset.id ? { ...p, ...patch } : p)) });
  }

  function updateInstallment(idx, patch) {
    const rows = activePreset.installmentFees.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    updatePreset({ installmentFees: rows });
  }

  function addInstallment() {
    const maxN = activePreset.installmentFees.reduce((m, r) => Math.max(m, r.n), 0);
    updatePreset({ installmentFees: [...activePreset.installmentFees, { n: maxN + 1, fee: 0 }] });
  }

  function removeInstallment(idx) {
    updatePreset({ installmentFees: activePreset.installmentFees.filter((_, i) => i !== idx) });
  }

  function selectPreset(id) {
    set({ activePresetId: id });
  }

  function renamePreset(id, name) {
    set({ cardPresets: local.cardPresets.map((p) => (p.id === id ? { ...p, name } : p)) });
  }

  function addPreset() {
    const newPreset = {
      id: uid(),
      name: "Nova maquininha",
      debitFeePercent: 1.99,
      installmentFees: DEFAULT_INSTALLMENT_FEES.map((r) => ({ ...r })),
    };
    set({ cardPresets: [...local.cardPresets, newPreset], activePresetId: newPreset.id });
  }

  function deletePreset(id) {
    if (local.cardPresets.length <= 1) return;
    const next = local.cardPresets.filter((p) => p.id !== id);
    const nextActive = local.activePresetId === id ? next[0].id : local.activePresetId;
    set({ cardPresets: next, activePresetId: nextActive });
  }

  function updateBoletoInstallment(idx, patch) {
    const rows = local.boletoInstallmentFees.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    set({ boletoInstallmentFees: rows });
  }

  function addBoletoInstallment() {
    const maxN = local.boletoInstallmentFees.reduce((m, r) => Math.max(m, r.n), 0);
    set({ boletoInstallmentFees: [...local.boletoInstallmentFees, { n: maxN + 1, fee: 2.5 }] });
  }

  function removeBoletoInstallment(idx) {
    set({ boletoInstallmentFees: local.boletoInstallmentFees.filter((_, i) => i !== idx) });
  }

  function addCustomFee() {
    set({ customFees: [...(local.customFees || []), { id: uid(), name: "Nova taxa", percent: 0 }] });
  }

  function updateCustomFee(id, patch) {
    set({ customFees: local.customFees.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  }

  function removeCustomFee(id) {
    set({ customFees: local.customFees.filter((c) => c.id !== id) });
  }

  const sortedInstallments = activePreset.installmentFees.slice().sort((a, b) => a.n - b.n);
  const sortedBoletoInstallments = (local.boletoInstallmentFees || []).slice().sort((a, b) => a.n - b.n);
  const laborCalc = local.laborCalc || DEFAULT_SETTINGS.laborCalc;
  const hourlyCost = computeHourlyCost(laborCalc);

  function updateLaborCalc(patch) {
    set({ laborCalc: { ...laborCalc, ...patch } });
  }

  return (
    <>
      <SettingsCard id="sec-custos" icon={<Banknote className="w-4 h-4 text-teal-700" />} title="Custos">
        <SettingsSubSection id="sub-custo-hora" icon={<Banknote className="w-4 h-4 text-teal-700" />} title="Custo da hora clínica" first>
          <div className="mb-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm text-stone-600">Custos fixos mensais (R$)</label>
              <input
                type="number"
                value={laborCalc.fixedCosts}
                onChange={(e) => updateLaborCalc({ fixedCosts: Number(e.target.value) })}
                className="w-28 text-sm font-mono border border-stone-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-teal-400 text-right"
              />
            </div>
            <p className="text-xs text-stone-400 mt-1 leading-relaxed">
              Some tudo que você paga todo mês independente de atender ou não: aluguel, água/luz/internet, salário da
              equipe, softwares. Não inclua o material específico de cada procedimento — esse já entra separado, no
              cadastro de cada procedimento.
            </p>
          </div>
          <div className="mb-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm text-stone-600">Pró-labore desejado (R$)</label>
              <input
                type="number"
                value={laborCalc.desiredIncome}
                onChange={(e) => updateLaborCalc({ desiredIncome: Number(e.target.value) })}
                className="w-28 text-sm font-mono border border-stone-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-teal-400 text-right"
              />
            </div>
            <p className="text-xs text-stone-400 mt-1 leading-relaxed">
              Quanto você quer receber de salário/lucro líquido por mês — é a sua meta de ganho pessoal, não um custo
              da clínica. Esse valor é somado aos custos fixos para calcular o valor a ser cobrado de acordo com a
              margem de lucro definida.
            </p>
          </div>
          <div className="mb-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm text-stone-600">Horas produtivas / mês</label>
              <input
                type="number"
                value={laborCalc.productiveHours}
                onChange={(e) => updateLaborCalc({ productiveHours: Number(e.target.value) })}
                className="w-28 text-sm font-mono border border-stone-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-teal-400 text-right"
              />
            </div>
            <p className="text-xs text-stone-400 mt-1 leading-relaxed">
              Considere seu expediente de trabalho, não só o tempo efetivamente com paciente na cadeira — mesmo sem
              atender, você está no trabalho. Ex: 8h/dia, 5 dias por semana, são cerca de 160h/mês.
            </p>
          </div>
          <div className="flex items-center justify-between border-t border-stone-100 pt-3">
            <span className="text-sm font-medium text-stone-700">Custo / hora resultante</span>
            <span className="font-mono font-semibold text-amber-700">{money(hourlyCost)}</span>
          </div>
          <p className="text-xs text-stone-400 mt-1 leading-relaxed">Valor da hora trabalhada.</p>
        </SettingsSubSection>

        <SettingsSubSection
          id="sub-imposto"
          icon={<Percent className="w-4 h-4 text-amber-600" />}
          title={local.taxRegime === "cnpj" ? "Imposto — CNPJ" : "Imposto — Profissional liberal"}
        >
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => set({ taxRegime: "liberal" })}
              className={`flex-1 text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                (local.taxRegime || "liberal") === "liberal"
                  ? "border-teal-400 bg-teal-50 text-teal-800"
                  : "border-stone-200 text-stone-500 hover:bg-stone-50"
              }`}
            >
              Profissional liberal (CPF)
            </button>
            <button
              type="button"
              onClick={() => set({ taxRegime: "cnpj" })}
              className={`flex-1 text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                local.taxRegime === "cnpj"
                  ? "border-teal-400 bg-teal-50 text-teal-800"
                  : "border-stone-200 text-stone-500 hover:bg-stone-50"
              }`}
            >
              CNPJ
            </button>
          </div>

          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-3">
            <Percent className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              <strong>Esse percentual é sempre uma aproximação</strong>, não o cálculo exato do imposto que você vai
              pagar — em nenhum dos dois regimes o imposto real é um percentual fixo por atendimento. Ele serve só
              pra reservar uma margem realista dentro do preço, ajuste sempre que sua situação mudar.
            </p>
          </div>

          {local.taxRegime === "cnpj" ? (
            <>
              <FeeField
                label="Alíquota efetiva (Simples Nacional / Lucro Presumido)"
                value={local.taxProvisionPercent}
                onChange={(v) => set({ taxProvisionPercent: v })}
              />
              <p className="text-xs text-stone-400 mt-2 leading-relaxed">
                Se você é <strong>Simples Nacional</strong>, esse percentual já vem pronto todo mês na sua guia de
                pagamento (DAS) — procure o campo "Alíquota efetiva total". Se for{" "}
                <strong>Lucro Presumido</strong>, peça esse percentual pro seu contador (soma de IRPJ + CSLL + PIS +
                COFINS + ISS sobre a receita). Evite calcular a alíquota do Simples Nacional "na mão" (ela depende da
                receita dos últimos 12 meses e da folha de pagamento) — o valor da guia já vem certo.
              </p>
              <p className="text-xs text-stone-400 mt-2 leading-relaxed">
                <strong>Mesmo assim é uma aproximação pra precificação futura</strong>: no Simples Nacional a
                alíquota efetiva é recalculada todo mês conforme sua receita dos últimos 12 meses sobe ou desce — o
                número da guia de hoje pode não ser mais o de daqui a alguns meses. Volte aqui de vez em quando e
                atualize com a alíquota mais recente.
              </p>
            </>
          ) : (
            <>
              <FeeField
                label="Provisão estimada de IR (Carnê-Leão)"
                value={local.taxProvisionPercent}
                onChange={(v) => set({ taxProvisionPercent: v })}
              />
              <p className="text-xs text-stone-400 mt-2 leading-relaxed">
                Como profissional liberal, o IR pelo Carnê-Leão é calculado numa <strong>tabela progressiva</strong>{" "}
                sobre a receita menos despesas do Livro-Caixa do ano inteiro — não existe uma alíquota fixa por
                atendimento, e a alíquota real depende de quanto você ganha no total (somando todas as fontes de
                renda) e das suas deduções. Por isso esse campo é só uma reserva estimada pra efeito de
                precificação: quanto maior sua renda total no ano, maior tende a ser sua faixa real — ajuste esse
                percentual de tempos em tempos conforme sua situação.
              </p>
            </>
          )}
        </SettingsSubSection>
      </SettingsCard>

      <SettingsCard id="sec-formas-pagamento" icon={<CreditCard className="w-4 h-4 text-teal-700" />} title="Formas de Pagamento/Taxas">
        <SettingsSubSection id="sub-quem-paga" icon={<CreditCard className="w-4 h-4 text-teal-700" />} title="Quem paga as taxas" first>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => set({ feePayer: "client" })}
              className={`text-left p-3 rounded-xl border transition ${
                local.feePayer !== "clinic" ? "border-teal-400 bg-teal-50" : "border-stone-200 hover:bg-stone-50"
              }`}
            >
              <div className="text-sm font-semibold text-stone-800">Cliente paga</div>
              <div className="text-xs text-stone-500 mt-1 leading-relaxed">
                A taxa da forma de pagamento é embutida no valor cobrado — o valor final aumenta conforme a taxa do método
                escolhido (é o padrão do sistema).
              </div>
            </button>
            <button
              type="button"
              onClick={() => set({ feePayer: "clinic" })}
              className={`text-left p-3 rounded-xl border transition ${
                local.feePayer === "clinic" ? "border-teal-400 bg-teal-50" : "border-stone-200 hover:bg-stone-50"
              }`}
            >
              <div className="text-sm font-semibold text-stone-800">Consultório assume</div>
              <div className="text-xs text-stone-500 mt-1 leading-relaxed">
                O valor cobrado do paciente é sempre o mesmo, não importa a forma de pagamento — o consultório absorve a taxa,
                que reduz o lucro daquela venda.
              </div>
            </button>
            {local.feePayer === "clinic" && (
              <div className="pl-3 border-l-2 border-teal-200">
                <label className="text-xs text-stone-600 block mb-1.5 leading-relaxed">
                  No crédito, cliente passa a assumir a taxa a partir de quantas parcelas?
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={local.feePayerCreditThreshold || ""}
                  onChange={(e) =>
                    set({ feePayerCreditThreshold: e.target.value === "" ? 0 : Math.max(0, Number(e.target.value)) })
                  }
                  placeholder="Deixe em branco pra sempre absorver"
                  className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
                />
                <p className="text-xs text-stone-400 mt-1.5 leading-relaxed">
                  Ex: preenchendo 10, o consultório absorve a taxa até 10x no crédito; a partir de 11x a taxa passa a ser
                  embutida no valor cobrado do paciente. Débito, PIX, boleto e convênio não são afetados por esse limite.
                </p>
              </div>
            )}
          </div>
        </SettingsSubSection>

        <SettingsSubSection id="sub-cartao" icon={<CreditCard className="w-4 h-4 text-teal-700" />} title="Cartão">
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-2">Maquininha</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {local.cardPresets.map((preset) => (
                <div
                  key={preset.id}
                  className={`flex items-center gap-1 rounded-full pl-3 pr-1.5 py-1 text-sm border transition ${
                    preset.id === local.activePresetId
                      ? "bg-teal-700 border-teal-700 text-white"
                      : "bg-white border-stone-200 text-stone-600 hover:border-teal-300"
                  }`}
                >
                  <button onClick={() => selectPreset(preset.id)} className="font-medium">
                    {preset.name}
                  </button>
                  {local.cardPresets.length > 1 && (
                    <button
                      onClick={() => deletePreset(preset.id)}
                      title="Excluir maquininha"
                      className={preset.id === local.activePresetId ? "text-teal-200 hover:text-white" : "text-stone-300 hover:text-rose-600"}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addPreset}
                className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900 px-2 py-1"
              >
                <Plus className="w-3.5 h-3.5" /> Nova maquininha
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 mb-2.5">
            <label className="text-sm text-stone-600">Nome da maquininha</label>
            <input
              value={activePreset.name}
              onChange={(e) => renamePreset(activePreset.id, e.target.value)}
              className="w-40 text-sm border border-stone-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-teal-400"
              placeholder="Ex: Stone, Cielo, PagSeguro..."
            />
          </div>

          <FeeField label="Débito" value={activePreset.debitFeePercent} onChange={(v) => updatePreset({ debitFeePercent: v })} />

          <div className="mt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-2">
              Crédito — parcelamento (1x = à vista, até 18x)
            </div>
            <div className="space-y-1.5">
              {sortedInstallments.map((row) => {
                const idx = activePreset.installmentFees.indexOf(row);
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={row.n}
                        onChange={(e) => updateInstallment(idx, { n: Number(e.target.value) })}
                        className="w-14 text-sm font-mono border border-stone-200 rounded-lg px-2 py-1 outline-none focus:border-teal-400 text-right"
                      />
                      <span className="text-sm text-stone-400">x</span>
                    </div>
                    <input
                      type="number"
                      value={row.fee}
                      onChange={(e) => updateInstallment(idx, { fee: Number(e.target.value) })}
                      className="flex-1 text-sm font-mono border border-stone-200 rounded-lg px-2.5 py-1 outline-none focus:border-teal-400 text-right"
                    />
                    <span className="text-sm text-stone-400 w-4">%</span>
                    <button onClick={() => removeInstallment(idx)} className="text-stone-300 hover:text-rose-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
            <button onClick={addInstallment} className="text-xs font-medium text-teal-700 hover:text-teal-900 inline-flex items-center gap-1 mt-2">
              <Plus className="w-3.5 h-3.5" /> Adicionar parcela
            </button>
          </div>
        </SettingsSubSection>

        <SettingsSubSection id="sub-avista" icon={<Banknote className="w-4 h-4 text-teal-700" />} title="À vista">
          <FeeField label="PIX / Dinheiro" value={local.pixFeePercent} onChange={(v) => set({ pixFeePercent: v })} />
        </SettingsSubSection>

        <SettingsSubSection id="sub-boleto" icon={<Landmark className="w-4 h-4 text-teal-700" />} title="Boleto — parcelamento (1x = à vista, até 18x)">
          <div className="space-y-1.5">
            {sortedBoletoInstallments.map((row) => {
              const idx = local.boletoInstallmentFees.indexOf(row);
              return (
                <div key={idx} className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={row.n}
                      onChange={(e) => updateBoletoInstallment(idx, { n: Number(e.target.value) })}
                      className="w-14 text-sm font-mono border border-stone-200 rounded-lg px-2 py-1 outline-none focus:border-teal-400 text-right"
                    />
                    <span className="text-sm text-stone-400">x</span>
                  </div>
                  <input
                    type="number"
                    value={row.fee}
                    onChange={(e) => updateBoletoInstallment(idx, { fee: Number(e.target.value) })}
                    className="flex-1 text-sm font-mono border border-stone-200 rounded-lg px-2.5 py-1 outline-none focus:border-teal-400 text-right"
                  />
                  <span className="text-sm text-stone-400 w-4">%</span>
                  <button onClick={() => removeBoletoInstallment(idx)} className="text-stone-300 hover:text-rose-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <button onClick={addBoletoInstallment} className="text-xs font-medium text-teal-700 hover:text-teal-900 inline-flex items-center gap-1 mt-2">
            <Plus className="w-3.5 h-3.5" /> Adicionar parcela
          </button>
        </SettingsSubSection>

        <SettingsSubSection id="sub-taxas-personalizadas" icon={<Landmark className="w-4 h-4 text-teal-700" />} title="Taxas personalizadas">
          <div className="space-y-1.5">
            {(local.customFees || []).map((cf) => (
              <div key={cf.id} className="flex items-center gap-2">
                <input
                  value={cf.name}
                  onChange={(e) => updateCustomFee(cf.id, { name: e.target.value })}
                  className="flex-1 text-sm border border-stone-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-teal-400"
                  placeholder="Ex: Máquina Stone, Nubank..."
                />
                <input
                  type="number"
                  value={cf.percent}
                  onChange={(e) => updateCustomFee(cf.id, { percent: Number(e.target.value) })}
                  className="w-20 text-sm font-mono border border-stone-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-teal-400 text-right"
                />
                <span className="text-sm text-stone-400 w-4">%</span>
                <button onClick={() => removeCustomFee(cf.id)} className="text-stone-300 hover:text-rose-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addCustomFee} className="text-xs font-medium text-teal-700 hover:text-teal-900 inline-flex items-center gap-1 mt-2">
            <Plus className="w-3.5 h-3.5" /> Adicionar taxa
          </button>
        </SettingsSubSection>
      </SettingsCard>
    </>
  );
}

export default function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [procedures, setProcedures] = useState([]);
  const [materialsCatalog, setMaterialsCatalog] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState(() => tabFromPath(window.location.pathname));

  // Troca de aba "de verdade" — atualiza o estado E a URL (com pushState,
  // sem recarregar a página), pra dar pra favoritar/compartilhar o link de
  // uma seção específica e pro botão voltar do navegador funcionar entre
  // elas. Só existe esse jeito de trocar de aba a partir daqui — os
  // cliques (TabNav, logo, menu do perfil) todos passam por essa função.
  function navigateTab(nextTab) {
    setTab(nextTab);
    const path = TAB_TO_PATH[nextTab] || "/";
    if (window.location.pathname !== path) {
      window.history.pushState({ tab: nextTab }, "", path);
    }
  }

  // Sincroniza com o botão voltar/avançar do navegador.
  useEffect(() => {
    function handlePopState() {
      setTab(tabFromPath(window.location.pathname));
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  const [budgetItems, setBudgetItems] = useState([]);
  const [budgetCategory, setBudgetCategory] = useState("");
  const [budgetInstallments, setBudgetInstallments] = useState(1);
  const [budgetClientLevel, setBudgetClientLevel] = useState(0);
  const [budgetPatientName, setBudgetPatientName] = useState("");
  const [budgetPatientPhone, setBudgetPatientPhone] = useState("");
  const [budgetPatientEmail, setBudgetPatientEmail] = useState("");
  const [budgetDownPayment, setBudgetDownPayment] = useState(0);
  const [budgetHistoryEntryId, setBudgetHistoryEntryId] = useState(null);
  const [reopenWarning, setReopenWarning] = useState("");
  const [budgetHistory, setBudgetHistory] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [hasPending, setHasPending] = useState(false);
  const historyBaselineRef = useRef(null);
  const historyTimerRef = useRef(null);
  const [cropImageSrc, setCropImageSrc] = useState(null);
  const [editingProcId, setEditingProcId] = useState(null);

  // Aplica/remove a classe "dark" no <html> conforme a preferência salva —
  // é essa classe que os overrides de tema escuro em index.css usam. A
  // limpeza (remover a classe quando o App desmonta, ex: no logout) é
  // importante — sem ela, a classe "dark" ficava presa no <html> depois de
  // sair da conta, e a tela de login (que é outro componente, fora do App)
  // herdava o modo escuro de quem tinha acabado de sair.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", !!settings.darkMode);
    return () => document.documentElement.classList.remove("dark");
  }, [settings.darkMode]);

  useEffect(() => {
    (async () => {
      try {
        const s = await window.storage.get("settings", false);
        if (s && s.value) {
          const stored = JSON.parse(s.value);
          const merged = { ...DEFAULT_SETTINGS, ...stored };

          const hasPresets = Array.isArray(stored.cardPresets) && stored.cardPresets.length > 0;
          if (!hasPresets) {
            let installmentFees =
              Array.isArray(stored.installmentFees) && stored.installmentFees.length > 0
                ? stored.installmentFees
                : DEFAULT_INSTALLMENT_FEES.map((r) => ({ ...r }));
            if (!installmentFees.some((r) => r.n === 1)) {
              installmentFees = [{ n: 1, fee: Number(stored.creditSpotFeePercent) || 3.5 }, ...installmentFees];
            }
            const debitFeePercent =
              stored.debitFeePercent !== undefined ? Number(stored.debitFeePercent) : DEFAULT_SETTINGS.cardPresets[0].debitFeePercent;
            const preset = { id: uid(), name: "Maquininha padrão", debitFeePercent, installmentFees };
            merged.cardPresets = [preset];
            merged.activePresetId = preset.id;
          } else {
            merged.cardPresets = stored.cardPresets;
            merged.activePresetId =
              stored.activePresetId && stored.cardPresets.some((p) => p.id === stored.activePresetId)
                ? stored.activePresetId
                : stored.cardPresets[0].id;
          }

          const hasBoletoInstallments = Array.isArray(stored.boletoInstallmentFees) && stored.boletoInstallmentFees.length > 0;
          if (!hasBoletoInstallments) {
            const flatFee = Number(stored.boletoFeePercent);
            const fee = isNaN(flatFee) ? 2.5 : flatFee;
            merged.boletoInstallmentFees = DEFAULT_SETTINGS.boletoInstallmentFees.map((r) => ({ n: r.n, fee }));
          } else {
            merged.boletoInstallmentFees = stored.boletoInstallmentFees;
          }
          setSettings(merged);
        }
      } catch (e) {}
      let list = DEFAULT_PROCEDURES;
      try {
        const p = await window.storage.get("procedures", false);
        if (p && p.value) {
          const stored = JSON.parse(p.value);
          if (stored.length) list = stored;
        }
      } catch (e) {}
      setProcedures(list);
      try {
        const mc = await window.storage.get("materialsCatalog", false);
        if (mc && mc.value) {
          const storedCatalog = JSON.parse(mc.value);
          if (Array.isArray(storedCatalog)) setMaterialsCatalog(storedCatalog);
        }
      } catch (e) {}
      try {
        const bh = await window.storage.get("budgetHistory", false);
        if (bh && bh.value) {
          const storedHistory = JSON.parse(bh.value);
          if (Array.isArray(storedHistory)) setBudgetHistory(storedHistory);
        }
      } catch (e) {}
      try {
        const pts = await window.storage.get("patients", false);
        if (pts && pts.value) {
          const storedPatients = JSON.parse(pts.value);
          if (Array.isArray(storedPatients)) setPatients(storedPatients);
        }
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    function handleWheel() {
      const active = document.activeElement;
      if (active && active.tagName === "INPUT" && active.type === "number") {
        active.blur();
      }
    }
    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);

  const persistSettings = useCallback(async (next) => {
    setSettings(next);
    try {
      await window.storage.set("settings", JSON.stringify(next), false);
    } catch (e) {}
  }, []);

  async function handleLogoUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setCropImageSrc(dataUrl);
    } catch (err) {}
    e.target.value = "";
  }

  // Logo do consultório/clínica (marca) — diferente da foto de perfil
  // (handleLogoUpload acima), que passa por um recorte circular. Uma logo
  // pode ser retangular/quadrada, então aqui é upload direto, sem recorte.
  async function handleClinicLogoUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      persistSettings({ ...settings, clinicLogoDataUrl: dataUrl });
    } catch (err) {}
    e.target.value = "";
  }

  const persistProcedures = useCallback(async (next) => {
    const safeNext = Array.isArray(next) ? next : [];
    setProcedures(safeNext);
    try {
      await window.storage.set("procedures", JSON.stringify(safeNext), false);
    } catch (e) {}
  }, []);

  const persistMaterialsCatalog = useCallback(async (next) => {
    const safeNext = Array.isArray(next) ? next : [];
    setMaterialsCatalog(safeNext);
    try {
      await window.storage.set("materialsCatalog", JSON.stringify(safeNext), false);
    } catch (e) {}
  }, []);

  function addCatalogItem() {
    const item = { id: uid(), name: "", brand: "", packageQty: "", packageUnit: "", packagePrice: "" };
    persistMaterialsCatalog([...materialsCatalog, item]);
    return item.id;
  }

  // Ao renomear um material no catálogo (nome ou marca), atualiza também
  // esse mesmo material em todo procedimento que já o usa — sem isso, o uso
  // ficaria "sem preço cadastrado" (a ligação entre um uso e o catálogo é
  // por nome+marca normalizados, não por id, ver findCatalogItem).
  function updateCatalogItem(id, patch) {
    const current = materialsCatalog.find((c) => c.id === id);
    persistMaterialsCatalog(materialsCatalog.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    if (!current) return;

    const newName = patch.name !== undefined ? patch.name : current.name;
    const newBrand = patch.brand !== undefined ? patch.brand : current.brand;
    const nameChanged = normalizeMatchKey(newName) !== normalizeMatchKey(current.name);
    const brandChanged = normalizeMatchKey(newBrand) !== normalizeMatchKey(current.brand);
    if (!nameChanged && !brandChanged) return;

    const oldKey = `${normalizeMatchKey(current.name)}|${normalizeMatchKey(current.brand)}`;
    let touched = false;
    const nextProcedures = procedures.map((p) => {
      if (!p.materials || p.materials.length === 0) return p;
      let changedHere = false;
      const nextMaterials = p.materials.map((m) => {
        const key = `${normalizeMatchKey(m.material)}|${normalizeMatchKey(m.brand)}`;
        if (key !== oldKey) return m;
        changedHere = true;
        return { ...m, material: newName, brand: newBrand };
      });
      if (!changedHere) return p;
      touched = true;
      return { ...p, materials: nextMaterials };
    });
    if (touched) persistProcedures(nextProcedures);
  }

  function deleteCatalogItem(id) {
    persistMaterialsCatalog(materialsCatalog.filter((c) => c.id !== id));
  }

  const persistBudgetHistory = useCallback(async (next) => {
    const safeNext = Array.isArray(next) ? next : [];
    setBudgetHistory(safeNext);
    try {
      await window.storage.set("budgetHistory", JSON.stringify(safeNext), false);
    } catch (e) {}
  }, []);

  const persistPatients = useCallback(async (next) => {
    const safeNext = Array.isArray(next) ? next : [];
    setPatients(safeNext);
    try {
      await window.storage.set("patients", JSON.stringify(safeNext), false);
    } catch (e) {}
  }, []);

  function addPatient(data) {
    const p = { id: uid(), name: "", phone: "", email: "", ...data };
    persistPatients([p, ...patients]);
    return p.id;
  }

  function updatePatient(id, patch) {
    persistPatients(patients.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function deletePatient(id) {
    persistPatients(patients.filter((p) => p.id !== id));
  }

  // Toda vez que um orçamento é salvo, mantém o cadastro de pacientes em
  // dia sozinho — sem isso, quem só usa a aba de orçamento nunca apareceria
  // no Cadastro de Pacientes. Casa por nome (sem diferenciar acento/maiúscula,
  // igual ao resto do app); se já existe um paciente com esse nome, só
  // completa telefone/email que estiverem vazios (não sobrescreve o que a
  // pessoa já tinha preenchido na mão); se não existe, cria um novo.
  function syncPatientFromBudget(entry) {
    const name = (entry.patientName || "").trim();
    if (!name) return;
    const key = normalizeMatchKey(name);
    const existing = patients.find((p) => normalizeMatchKey(p.name) === key);
    if (existing) {
      const patch = {};
      if (!existing.phone && entry.patientPhone) patch.phone = entry.patientPhone;
      if (!existing.email && entry.patientEmail) patch.email = entry.patientEmail;
      if (Object.keys(patch).length > 0) {
        persistPatients(patients.map((p) => (p.id === existing.id ? { ...p, ...patch } : p)));
      }
    } else {
      persistPatients([{ id: uid(), name, phone: entry.patientPhone || "", email: entry.patientEmail || "" }, ...patients]);
    }
  }

  function handleSaveBudget(entry) {
    const exists = budgetHistory.some((h) => h.id === entry.id);
    if (exists) {
      persistBudgetHistory(budgetHistory.map((h) => (h.id === entry.id ? { ...entry, status: h.status } : h)));
    } else {
      persistBudgetHistory([entry, ...budgetHistory].slice(0, 200));
    }
    syncPatientFromBudget(entry);
  }

  function handleDeleteBudgetHistoryEntry(id) {
    persistBudgetHistory(budgetHistory.filter((h) => h.id !== id));
  }

  function handleClearBudgetHistory() {
    persistBudgetHistory([]);
  }

  function handleUpdateBudgetStatus(id, status) {
    persistBudgetHistory(budgetHistory.map((h) => (h.id === id ? { ...h, status } : h)));
  }

  function handleReopenBudget(entry) {
    const rawList = entry.procedures || [];
    const validItems = [];
    let missingCount = 0;
    rawList.forEach((it) => {
      if (it.custom) {
        validItems.push({ instanceId: uid(), custom: true, name: it.name, cost: it.cost, valorBase: it.valorBase });
      } else if (procedures.some((p) => p.id === it.procId)) {
        validItems.push({ instanceId: uid(), procId: it.procId });
      } else {
        missingCount++;
      }
    });
    setBudgetItems(validItems);
    setBudgetCategory(entry.category || "");
    setBudgetInstallments(entry.installments || 1);
    setBudgetClientLevel(entry.clientLevel || 0);
    setBudgetPatientName(entry.patientName || "");
    setBudgetPatientPhone(entry.patientPhone || "");
    setBudgetPatientEmail(entry.patientEmail || "");
    setBudgetDownPayment(entry.downPayment || 0);
    setBudgetHistoryEntryId(entry.id);
    navigateTab("simulation");
    if (missingCount > 0) {
      setReopenWarning(
        `${missingCount} procedimento${missingCount > 1 ? "s" : ""} desse orçamento não existe${
          missingCount > 1 ? "m" : ""
        } mais no cadastro e não ${missingCount > 1 ? "foram" : "foi"} reaberto${missingCount > 1 ? "s" : ""}.`
      );
      setTimeout(() => setReopenWarning(""), 6000);
    } else {
      setReopenWarning("");
    }
  }

  const proceduresFileInputRef = useRef(null);
  const [proceduresImportFeedback, setProceduresImportFeedback] = useState(""); // "" | "sucesso" | "erro"
  const materialsFileInputRef = useRef(null);
  const [materialsImportFeedback, setMaterialsImportFeedback] = useState("");

  // Compara nomes ignorando maiúsculas/minúsculas e acentos, pra casar
  // "Prótese Total" com "protese total" na hora de importar.
  function normalizeMatchKey(s) {
    return (s || "")
      .toString()
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  // Exporta o catálogo de materiais + os materiais usados em cada
  // procedimento no MESMO formato ({DATA, state, catalog}) da calculadora
  // avulsa que o Marcelo já usava — serve de backup e continua compatível
  // com a ferramenta antiga, se ele quiser abrir lá também.
  function handleExportMaterialsData() {
    const DATA = {};
    const state = {};
    procedures.forEach((p) => {
      const cat = p.category || "Sem categoria";
      if (!DATA[cat]) {
        DATA[cat] = [];
        state[cat] = {};
      }
      DATA[cat].push(p.name);
      state[cat][p.name] = (p.materials || []).map((m) => ({
        material: m.material || "",
        marca: m.brand || "",
        qtd: m.qty || "",
        unidade: m.unit || "",
      }));
    });
    const catalog = materialsCatalog.map((c) => ({
      id: c.id,
      nome: c.name || "",
      marca: c.brand || "",
      quantidade: c.packageQty || "",
      unidade: c.packageUnit || "",
      valor: c.packagePrice || "",
    }));
    const blob = new Blob([JSON.stringify({ DATA, state, catalog }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const fileNameBase = (settings.clinicName || "materiais")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-");
    a.href = url;
    a.download = `${fileNameBase}-custos-materiais.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Importa um arquivo no formato {DATA, state, catalog} da calculadora
  // avulsa: soma os materiais do catálogo (sem duplicar) e, pra cada
  // procedimento do arquivo, ou atualiza os materiais de um procedimento já
  // existente com o MESMO NOME (ignorando acento/maiúscula), ou CRIA um
  // procedimento novo (com a categoria do arquivo) se não existir nenhum
  // com esse nome — assim o arquivo importado pode servir de base pra
  // montar a lista de procedimentos do zero, não só preencher materiais em
  // procedimentos que já existiam.
  async function handleImportMaterialsFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const importedCatalog = Array.isArray(parsed?.catalog) ? parsed.catalog : [];
      const importedState = parsed?.state && typeof parsed.state === "object" ? parsed.state : {};

      const existingKeys = new Set(
        materialsCatalog.map((c) => `${normalizeMatchKey(c.name)}|${normalizeMatchKey(c.brand)}`)
      );
      const newCatalogItems = [];
      importedCatalog.forEach((c) => {
        const key = `${normalizeMatchKey(c.nome)}|${normalizeMatchKey(c.marca)}`;
        if (existingKeys.has(key)) return;
        existingKeys.add(key);
        newCatalogItems.push({
          id: uid(),
          name: c.nome || "",
          brand: c.marca || "",
          packageQty: c.quantidade || "",
          packageUnit: c.unidade || "",
          packagePrice: c.valor || "",
        });
      });
      const nextCatalog = newCatalogItems.length > 0 ? [...materialsCatalog, ...newCatalogItems] : materialsCatalog;
      if (newCatalogItems.length > 0) persistMaterialsCatalog(nextCatalog);

      let matched = 0;
      let created = 0;
      const nextProcedures = procedures.map((p) => ({ ...p }));
      Object.entries(importedState).forEach(([cat, procsMap]) => {
        const category = cat === "Sem categoria" ? "" : cat;
        Object.entries(procsMap || {}).forEach(([procName, usages]) => {
          const key = normalizeMatchKey(procName);
          let target = nextProcedures.find((p) => normalizeMatchKey(p.name) === key);
          const materials = (usages || []).map((u) => ({
            id: uid(),
            material: u.material || "",
            brand: u.marca || "",
            qty: u.qtd || "",
            unit: u.unidade || "",
          }));
          if (target) {
            target.materials = materials;
            matched++;
          } else {
            nextProcedures.push({
              id: uid(),
              name: procName,
              category,
              cost: 0,
              additionalCost: 0,
              durationMinutes: 30,
              sessions: 1,
              laborCost: 0,
              marginPercent: 40,
              valorMinimo: 0,
              valorBase: 0,
              materials,
            });
            created++;
          }
        });
      });
      if (matched > 0 || created > 0) persistProcedures(nextProcedures);

      const parts = [
        `${created} procedimento(s) criado(s)`,
        `${matched} procedimento(s) já existente(s) atualizado(s)`,
        `${newCatalogItems.length} material(is) novo(s) no catálogo`,
      ];
      setMaterialsImportFeedback({ type: "sucesso", text: parts.join(" — ") });
    } catch (err) {
      setMaterialsImportFeedback({ type: "erro", text: "Arquivo inválido" });
    }
    e.target.value = "";
  }

  // Apaga TODOS os procedimentos de uma vez (pra recomeçar do zero a partir
  // de uma importação). Passa pelo mesmo checkpoint de undo que qualquer
  // outra edição — se for engano, dá pra desfazer com o botão "Desfazer".
  function handleDeleteAllProcedures() {
    pushCheckpointNow(procedures);
    persistProcedures([]);
  }

  function handleExportProcedures() {
    const blob = new Blob([JSON.stringify(procedures, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const fileNameBase = (settings.clinicName || "procedimentos")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-");
    a.href = url;
    a.download = `${fileNameBase}-procedimentos.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleImportProceduresFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      // Aceita tanto um arquivo só com a lista de procedimentos (formato novo)
      // quanto um backup completo antigo (formato { procedures: [...] }),
      // pra não quebrar backups feitos antes dessa mudança.
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.procedures) ? parsed.procedures : null;
      if (!list) throw new Error("invalid");
      persistProcedures(list);
      setProceduresImportFeedback("Importado!");
    } catch (err) {
      setProceduresImportFeedback("Arquivo inválido");
    }
    setTimeout(() => setProceduresImportFeedback(""), 2500);
    e.target.value = "";
  }

  const MAX_HISTORY = 5;

  function flushHistoryBaseline() {
    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }
    if (historyBaselineRef.current) {
      const baseline = historyBaselineRef.current;
      historyBaselineRef.current = null;
      setHasPending(false);
      setHistory((h) => [...h.slice(-(MAX_HISTORY - 1)), baseline]);
      setFuture([]); // uma edição nova invalida qualquer "refazer" pendente
    }
  }

  function scheduleHistoryCheckpoint(before) {
    if (!Array.isArray(before)) return;
    if (!historyBaselineRef.current) {
      historyBaselineRef.current = before;
      setHasPending(true);
    }
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    historyTimerRef.current = setTimeout(flushHistoryBaseline, 1000);
  }

  function pushCheckpointNow(before) {
    if (!Array.isArray(before)) return;
    flushHistoryBaseline();
    setHistory((h) => [...h.slice(-(MAX_HISTORY - 1)), before]);
    setFuture([]);
  }

  function undo() {
    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }
    if (historyBaselineRef.current) {
      const prev = historyBaselineRef.current;
      historyBaselineRef.current = null;
      setHasPending(false);
      setFuture((f) => [...f.slice(-(MAX_HISTORY - 1)), procedures]);
      persistProcedures(prev);
      return;
    }
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      if (Array.isArray(prev)) {
        setFuture((f) => [...f.slice(-(MAX_HISTORY - 1)), procedures]);
        persistProcedures(prev);
      }
      return h.slice(0, -1);
    });
  }

  function redo() {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[f.length - 1];
      if (Array.isArray(next)) {
        setHistory((h) => [...h.slice(-(MAX_HISTORY - 1)), procedures]);
        persistProcedures(next);
      }
      return f.slice(0, -1);
    });
  }

  function addProcedure() {
    pushCheckpointNow(procedures);
    const p = {
      id: uid(),
      name: "Novo procedimento",
      category: "",
      cost: 0,
      additionalCost: 0,
      durationMinutes: 30,
      sessions: 1,
      laborCost: 0,
      marginPercent: 40,
      valorMinimo: 0,
      valorBase: 0,
    };
    persistProcedures([...procedures, p]);
    navigateTab("procedures");
  }

  // Mesma coisa que addProcedure(), só que já nasce dentro de uma categoria
  // específica — usada pela seção da Calculadora, que cria procedimentos
  // direto dentro da categoria ativa (sem precisar editar depois).
  // Aplica a nova ordem depois de um arraste (procedimentos dentro de uma
  // categoria). Só mexe nos procedimentos DAQUELA categoria — os de outras
  // categorias continuam exatamente onde estavam no array.
  function reorderProceduresInCategory(category, newOrderIds) {
    const idToProc = new Map(procedures.map((p) => [p.id, p]));
    const next = [];
    let inserted = false;
    procedures.forEach((p) => {
      if (p.category !== category) {
        next.push(p);
        return;
      }
      if (!inserted) {
        newOrderIds.forEach((id) => {
          const proc = idToProc.get(id);
          if (proc) next.push(proc);
        });
        inserted = true;
      }
    });
    persistProcedures(next);
  }

  // Aplica a nova ordem dos materiais dentro de UM procedimento específico.
  function reorderMaterialsInProcedure(procId, newOrderIds) {
    const proc = procedures.find((p) => p.id === procId);
    if (!proc) return;
    const idToMat = new Map((proc.materials || []).map((m) => [m.id, m]));
    const nextMaterials = newOrderIds.map((id) => idToMat.get(id)).filter(Boolean);
    updateProcedure(procId, { materials: nextMaterials });
  }

  function addProcedureToCategory(category, name) {
    pushCheckpointNow(procedures);
    const p = {
      id: uid(),
      name: name || "Novo procedimento",
      category: category || "",
      cost: 0,
      additionalCost: 0,
      durationMinutes: 30,
      sessions: 1,
      laborCost: 0,
      marginPercent: 40,
      valorMinimo: 0,
      valorBase: 0,
      materials: [],
    };
    persistProcedures([...procedures, p]);
  }

  function updateProcedure(id, patch) {
    scheduleHistoryCheckpoint(procedures);
    persistProcedures(procedures.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function duplicateProcedure(id) {
    pushCheckpointNow(procedures);
    const idx = procedures.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const copy = { ...procedures[idx], id: uid(), name: `${procedures[idx].name} (cópia)` };
    const next = [...procedures];
    next.splice(idx + 1, 0, copy);
    persistProcedures(next);
    setSelectedId(copy.id);
  }

  function deleteProcedure(id) {
    pushCheckpointNow(procedures);
    persistProcedures(procedures.filter((p) => p.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  // Adiciona uma categoria "vazia" (sem procedimento nenhum ainda) — fica
  // guardada em settings pra continuar aparecendo mesmo sem nenhum
  // procedimento usando ela ainda.
  // Guarda a largura ajustada de uma coluna da tabela de Procedimentos.
  // Salva em settings (persiste por conta, igual o resto das preferências
  // de aparência), mesclando com o que já tinha pras outras colunas.
  function handleResizeColumn(key, width) {
    const current = settings.procedureColumnWidths || {};
    persistSettings({ ...settings, procedureColumnWidths: { ...current, [key]: Math.round(width) } });
  }

  // Escape hatch: limpa todas as larguras salvas, voltando pro padrão. Serve
  // tanto pra quem só quer recomeçar do zero, quanto pra corrigir qualquer
  // largura minúscula que tenha ficado gravada sem querer.
  function handleResetColumnWidths() {
    persistSettings({ ...settings, procedureColumnWidths: {} });
  }

  function handleAddCategory(name) {
    const trimmed = (name || "").trim();
    if (!trimmed || trimmed === "Sem categoria") return;
    const current = settings.procedureCategories || [];
    if (current.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return;
    persistSettings({ ...settings, procedureCategories: [...current, trimmed] });
  }

  // Renomeia a categoria tanto na lista de categorias quanto em todos os
  // procedimentos que estavam usando o nome antigo.
  function handleRenameCategory(oldName, newName) {
    const trimmed = (newName || "").trim();
    if (!trimmed || trimmed === oldName) return;
    const current = settings.procedureCategories || [];
    const nextCategories = current.includes(oldName)
      ? current.map((c) => (c === oldName ? trimmed : c))
      : [...current, trimmed];
    persistSettings({ ...settings, procedureCategories: nextCategories });
    pushCheckpointNow(procedures);
    persistProcedures(procedures.map((p) => (p.category === oldName ? { ...p, category: trimmed } : p)));
  }

  // Remove a categoria da lista — os procedimentos que estavam nela NÃO são
  // apagados, só voltam a ficar "Sem categoria" (ação não-destrutiva).
  function handleDeleteCategory(name) {
    const current = settings.procedureCategories || [];
    persistSettings({ ...settings, procedureCategories: current.filter((c) => c !== name) });
    pushCheckpointNow(procedures);
    persistProcedures(procedures.map((p) => (p.category === name ? { ...p, category: "" } : p)));
  }

  // Ajusta a margem de vários procedimentos de uma vez (botão "Igualar
  // tudo" no cabeçalho da coluna). Importante: calcula o array inteiro num
  // único passe e chama persistProcedures UMA VEZ só — chamar onUpdate em
  // loop, um procedimento por vez, perderia updates, porque cada chamada
  // partiria do mesmo "procedures" desatualizado (o estado só atualiza de
  // verdade depois que o React re-renderiza, e isso não acontece no meio
  // de um loop síncrono).
  function equalizeMargins(procIds) {
    const idSet = new Set(procIds);
    pushCheckpointNow(procedures);
    const next = procedures.map((p) => {
      if (!idSet.has(p.id)) return p;
      const calc = calcProcedure(p, settings, materialsCatalog);
      const totalCost = calc.totalCost || 0;
      const valorBase = Number(p.valorBase) || 0;
      if (!(totalCost > 0 && valorBase > 0)) return p;
      const requiredMargin = 100 * (1 - totalCost / valorBase);
      return { ...p, marginPercent: Number(requiredMargin.toFixed(2)) };
    });
    persistProcedures(next);
  }

  const canUndo = history.length > 0 || hasPending;
  const canRedo = future.length > 0;
  const selectedProc = (procedures || []).find((p) => p.id === selectedId) || null;
  const calcs = {};
  (procedures || []).forEach((p) => {
    calcs[p.id] = calcProcedure(p, settings, materialsCatalog);
  });
  const selectedCalc = selectedProc ? calcs[selectedProc.id] : null;

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 text-stone-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans">
      <style>{`
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type=number] {
          -moz-appearance: textfield;
        }
        @keyframes pricePulseKeyframes {
          0% { transform: scale(1); }
          35% { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
        .animate-price-pulse {
          display: inline-block;
          animation: pricePulseKeyframes 380ms ease-out;
        }
      `}</style>
      <div style={{ paddingTop: "env(safe-area-inset-top, 0px)" }} className="bg-stone-50">
        <header
          style={{ position: "relative", zIndex: 30 }}
          className="bg-white border border-stone-200 rounded-2xl shadow-sm mx-2 mt-2 md:mx-6 md:mt-5"
        >
          <div className="px-3 py-3 md:px-5 md:py-3.5 flex items-center justify-between gap-2 md:grid md:grid-cols-[1fr_auto_1fr] md:gap-3">
            <button
              onClick={() => navigateTab("dashboard")}
              className="flex items-center gap-2.5 min-w-0 hover:opacity-80 transition"
            >
              <img src="/icons/icon-512.png" alt="Precifica" className="w-11 h-11 shrink-0" />
              <span className="text-xl font-semibold text-stone-800 tracking-tight">Precifica</span>
            </button>

            <TabNav tab={tab} setTab={navigateTab} accentColor={settings.headerColor} darkMode={settings.darkMode} />

            <div className="flex items-center gap-3 justify-end min-w-0">
              <div className="min-w-0 text-right hidden sm:block">
                <div className="text-[10px] uppercase tracking-widest text-stone-400 truncate">
                  {settings.orgLabel || "Consultório"}
                </div>
                <div className="text-base font-semibold text-stone-700 truncate max-w-[220px]">
                  {settings.clinicName || "Nome"}
                </div>
              </div>
              <OptionsMenu
                settings={settings}
                onChange={persistSettings}
                onLogoUpload={handleLogoUpload}
                onOpenProfileSettings={() => navigateTab("profile-settings")}
              />
              <ChevronDown className="w-4 h-4 text-stone-400 shrink-0" />
          </div>
        </div>
      </header>
      </div>

      <main
        className={`mx-auto px-5 py-6 pb-[calc(1.5rem+64px+env(safe-area-inset-bottom,0px))] md:pb-6 ${
          tab === "procedures" ? "max-w-none" : "max-w-6xl"
        }`}
      >
        {reopenWarning && (
          <div className="mb-4 flex items-start justify-between gap-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
            <span>{reopenWarning}</span>
            <button onClick={() => setReopenWarning("")} className="text-amber-500 hover:text-amber-700 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {tab === "history" ? (
          <HistoryPanel
            history={budgetHistory}
            onReopen={handleReopenBudget}
            onDelete={handleDeleteBudgetHistoryEntry}
            onClearAll={handleClearBudgetHistory}
            onUpdateStatus={handleUpdateBudgetStatus}
          />
        ) : tab === "patients" ? (
          <PatientsPage
            patients={patients}
            budgetHistory={budgetHistory}
            onAdd={addPatient}
            onUpdate={updatePatient}
            onDelete={deletePatient}
            onReopen={handleReopenBudget}
          />
        ) : tab === "perfil" || tab === "profile-settings" ? (
          <div className="flex gap-6 items-start max-w-4xl mx-auto">
            <SettingsSideNav />
            <div className="flex-1 min-w-0 grid grid-cols-1 gap-5">
              <ProfileSettingsPage
                settings={settings}
                onChange={persistSettings}
                onLogoUpload={handleLogoUpload}
                onClinicLogoUpload={handleClinicLogoUpload}
              />
              <SettingsPanel settings={settings} onChange={persistSettings} />
            </div>
          </div>
        ) : tab === "calculadora" ? (
          <CalculadoraSection
            procedures={procedures}
            settings={settings}
            materialsCatalog={materialsCatalog}
            onUpdateProcedure={updateProcedure}
            onDeleteProcedure={deleteProcedure}
            onAddProcedure={addProcedureToCategory}
            onReorderMaterials={reorderMaterialsInProcedure}
            onAddCategory={handleAddCategory}
            onDeleteCategory={handleDeleteCategory}
            onAddCatalogItem={addCatalogItem}
            onUpdateCatalogItem={updateCatalogItem}
            onDeleteCatalogItem={deleteCatalogItem}
            onExport={handleExportMaterialsData}
            onImportFile={handleImportMaterialsFile}
            onDeleteAllProcedures={handleDeleteAllProcedures}
            importFeedback={materialsImportFeedback}
            fileInputRef={materialsFileInputRef}
            onBack={() => navigateTab("procedures")}
          />
        ) : tab === "dashboard" ? (
          <DashboardSection budgetHistory={budgetHistory} />
        ) : tab === "simulation" ? (
          <SimulationPanel
            procedures={procedures}
            settings={settings}
            materialsCatalog={materialsCatalog}
            items={budgetItems}
            setItems={setBudgetItems}
            category={budgetCategory}
            setCategory={setBudgetCategory}
            installments={budgetInstallments}
            setInstallments={setBudgetInstallments}
            clientLevel={budgetClientLevel}
            setClientLevel={setBudgetClientLevel}
            patientName={budgetPatientName}
            setPatientName={setBudgetPatientName}
            patientPhone={budgetPatientPhone}
            setPatientPhone={setBudgetPatientPhone}
            patientEmail={budgetPatientEmail}
            setPatientEmail={setBudgetPatientEmail}
            downPayment={budgetDownPayment}
            setDownPayment={setBudgetDownPayment}
            currentEntryId={budgetHistoryEntryId}
            setCurrentEntryId={setBudgetHistoryEntryId}
            onSaveBudget={handleSaveBudget}
            patients={patients}
          />
        ) : (
          <div className="space-y-5">
            <div className="mx-auto space-y-5" style={{ width: "fit-content", maxWidth: "100%" }}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-sm font-semibold text-stone-700">Procedimentos</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  {canUndo && (
                    <button
                      onClick={undo}
                      title="Desfazer última alteração"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border border-stone-200 text-stone-600 hover:bg-stone-100 transition"
                    >
                      <Undo2 className="w-4 h-4" /> Desfazer
                    </button>
                  )}
                  {canRedo && (
                    <button
                      onClick={redo}
                      title="Refazer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border border-stone-200 text-stone-600 hover:bg-stone-100 transition"
                    >
                      <Redo2 className="w-4 h-4" /> Refazer
                    </button>
                  )}
                  <button
                    onClick={handleResetColumnWidths}
                    title="Redefinir larguras das colunas pro padrão"
                    className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-stone-200 text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition"
                  >
                    <Columns3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigateTab("calculadora")}
                    title="Criar procedimentos, categorias e calcular custo por material"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-teal-700 text-white text-sm font-medium hover:bg-teal-800 transition"
                  >
                    <Calculator className="w-4 h-4" /> Custos / Materiais
                  </button>
                </div>
              </div>

            {procedures.length === 0 ? (
              <div className="border border-dashed border-stone-300 rounded-2xl flex flex-col items-center justify-center py-24 text-stone-400">
                <Stethoscope className="w-8 h-8 mb-3" />
                <p>Nenhum procedimento cadastrado ainda.</p>
                <button onClick={addProcedure} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:text-teal-900">
                  <Plus className="w-4 h-4" /> Cadastrar o primeiro
                </button>
              </div>
            ) : (
              <ProcedureTable
                procedures={procedures}
                calcs={calcs}
                settings={settings}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onUpdate={updateProcedure}
                onDelete={deleteProcedure}
                onDuplicate={duplicateProcedure}
                onEditProcedure={setEditingProcId}
                onRenameCategory={handleRenameCategory}
                onDeleteCategory={handleDeleteCategory}
                onEqualizeMargins={equalizeMargins}
                columnWidths={settings.procedureColumnWidths}
                onResizeColumn={handleResizeColumn}
              />
            )}

            <PaymentSimulationPanel selectedProc={selectedProc} calc={selectedCalc} taxRegime={settings.taxRegime} />
            </div>
          </div>
        )}
      </main>

      {cropImageSrc && (
        <ImageCropModal
          imageSrc={cropImageSrc}
          onCancel={() => setCropImageSrc(null)}
          onSave={(dataUrl) => {
            persistSettings({ ...settings, logoDataUrl: dataUrl });
            setCropImageSrc(null);
          }}
        />
      )}

      {editingProcId &&
        (() => {
          const proc = procedures.find((p) => p.id === editingProcId);
          if (!proc) return null;
          const allCategoryNames = Array.from(
            new Set([...(settings.procedureCategories || []), ...procedures.map((p) => p.category).filter(Boolean)])
          );
          return (
            <ProcedureEditModal
              proc={proc}
              categories={allCategoryNames}
              onUpdate={updateProcedure}
              onClose={() => setEditingProcId(null)}
              onAddCategory={handleAddCategory}
              materialsCatalog={materialsCatalog}
              onAddCatalogItem={addCatalogItem}
            />
          );
        })()}
    </div>
  );
}
