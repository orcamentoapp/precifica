import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { Plus, Stethoscope, ChevronRight, ChevronUp, ChevronDown, Search, Percent, CreditCard, Landmark, Banknote, X, Loader2, Undo2, Star, Save, Check, Download, Upload, FileText, Image as ImageIcon, Printer, MessageCircle, Clock, CheckCircle2, XCircle, CircleDollarSign, Settings, LogOut } from "lucide-react";
import { apiRequest } from "./api";
import { useAccount } from "./AccountContext";

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

const DEFAULT_SETTINGS = {
  clinicName: "Nome",
  logoDataUrl: "",
  orgLabel: "Consultório",
  professionalRegistration: "",
  address: "",
  phone: "",
  quoteValidityMonths: 3,
  headerColor: "#005580",
  secondaryColor: "#71CFFE",
  taxProvisionPercent: 15,
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
  laborCalc: { fixedCosts: 8000, desiredIncome: 15000, productiveHours: 100 },
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
    durationMinutes: 30,
    laborCost: 0,
    marginPercent: 40,
    valorMinimo,
    valorBase,
  }))
);

function groupByCategory(procedures) {
  const map = new Map();
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

function calcProcedure(proc, settings) {
  const directCost = Number(proc.cost) || 0;
  const durationMinutes = Number(proc.durationMinutes) || 0;
  const hourlyCost = computeHourlyCost(settings.laborCalc || DEFAULT_SETTINGS.laborCalc);
  const laborCost = (durationMinutes / 60) * hourlyCost;
  const totalCost = directCost + laborCost;
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

  return { totalCost, directCost, laborCost, margin, suggestedBase, listPrice, taxPct, rows };
}

function calcBudget(procList, settings, clientLevelPercent = 0) {
  const taxPct = Number(settings.taxProvisionPercent) || 0;
  const methods = buildPaymentMethods(settings);
  const hourlyCost = computeHourlyCost(settings.laborCalc || DEFAULT_SETTINGS.laborCalc);

  let sumCost = 0;
  let sumDirectCost = 0;
  let sumLaborCost = 0;
  let sumBasis = 0;
  let sumListPrice = 0;

  procList.forEach((proc) => {
    const directCost = Number(proc.cost) || 0;
    const durationMinutes = Number(proc.durationMinutes) || 0;
    const laborCost = (durationMinutes / 60) * hourlyCost;
    const totalCost = directCost + laborCost;
    const margin = Number(proc.marginPercent) || 0;
    const suggestedBase = Math.round(margin < 100 ? totalCost / (1 - margin / 100) : totalCost);
    const listPrice = Number(proc.valorBase) > 0 ? Number(proc.valorBase) : suggestedBase;
    const basis = totalCost > 0 ? suggestedBase : listPrice;
    sumCost += totalCost;
    sumDirectCost += directCost;
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


function Row({ label, value, bold, accent }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-stone-600">{label}</span>
      <span
        className={`font-mono text-sm ${
          bold ? "font-semibold text-stone-900" : accent ? "font-semibold text-amber-700" : "text-stone-700"
        }`}
      >
        {value}
      </span>
    </div>
  );
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

function SortableHeader({ label, sortKey, sortConfig, onSort, align = "right" }) {
  const active = sortConfig?.key === sortKey;
  return (
    <th className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-stone-600 transition group ${active ? "text-teal-700" : ""}`}
      >
        {label}
        {active ? (
          sortConfig.direction === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3 opacity-0 group-hover:opacity-100" />
        )}
      </button>
    </th>
  );
}

function ProcedureTable({ procedures = [], calcs, settings, selectedId, onSelect, onUpdate, onDelete, onDuplicate }) {
  const [collapsed, setCollapsed] = useState(() => {
    const initial = {};
    groupByCategory(procedures).forEach(([cat]) => {
      initial[cat] = true;
    });
    return initial;
  });
  const [query, setQuery] = useState("");
  const [sortConfig, setSortConfig] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);

  function openContextMenu(e, procId) {
    e.preventDefault();
    const menuWidth = 160;
    const menuHeight = 84;
    const x = Math.min(e.clientX, Math.max(8, window.innerWidth - menuWidth - 8));
    const y = Math.min(e.clientY, Math.max(8, window.innerHeight - menuHeight - 8));
    setContextMenu({ x, y, procId });
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
  const groups = groupByCategory(filtered);
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
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
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
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-stone-400 border-b border-stone-100">
              <SortableHeader label="Procedimento" sortKey="name" sortConfig={sortConfig} onSort={toggleSort} align="left" />
              <SortableHeader label="Custo" sortKey="cost" sortConfig={sortConfig} onSort={toggleSort} />
              <SortableHeader label="Valor" sortKey="valorBase" sortConfig={sortConfig} onSort={toggleSort} />
              <SortableHeader label="Margem de lucro alvo" sortKey="marginPercent" sortConfig={sortConfig} onSort={toggleSort} />
              <SortableHeader label="Preço base sugerido pelo custo" sortKey="suggestedBase" sortConfig={sortConfig} onSort={toggleSort} />
              <SortableHeader label="Duração (min)" sortKey="durationMinutes" sortConfig={sortConfig} onSort={toggleSort} />
              <SortableHeader label="Mão de obra" sortKey="laborCost" sortConfig={sortConfig} onSort={toggleSort} />
            </tr>
          </thead>
          {renderGroups.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-stone-400">
                  Nenhum procedimento encontrado para "{query}"
                </td>
              </tr>
            </tbody>
          )}
          {renderGroups.map(({ cat, items, isCollapsed }) => (
            <tbody key={cat} className="divide-y divide-stone-50">
              <tr className="bg-stone-50 cursor-pointer hover:bg-stone-100" onClick={() => toggleCategory(cat)}>
                <td colSpan={7} className="px-5 py-1.5">
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
                      onClick={() => onSelect(p.id)}
                      onContextMenu={(e) => {
                        openContextMenu(e, p.id);
                        onSelect(p.id);
                      }}
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
                        <input
                          type="number"
                          value={p.cost}
                          onChange={(e) => onUpdate(p.id, { cost: e.target.value })}
                          className="w-24 text-sm font-mono text-right bg-stone-100/70 border border-stone-200 hover:border-teal-300 hover:bg-stone-50 focus:bg-white focus:border-teal-400 rounded-full px-2.5 py-1 outline-none transition"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          value={p.valorBase}
                          onChange={(e) => onUpdate(p.id, { valorBase: e.target.value })}
                          className="w-24 text-sm font-mono font-semibold text-teal-800 text-right bg-teal-50 border border-teal-100 hover:border-teal-300 hover:bg-teal-50 focus:bg-white focus:border-teal-400 rounded-full px-2.5 py-1 outline-none transition"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            value={p.marginPercent}
                            onChange={(e) => onUpdate(p.id, { marginPercent: e.target.value })}
                            className="w-16 text-sm font-mono text-right bg-stone-100/70 border border-stone-200 hover:border-teal-300 hover:bg-stone-50 focus:bg-white focus:border-teal-400 rounded-full px-2.5 py-1 outline-none transition"
                          />
                          <span className="text-stone-400">%</span>
                        </div>
                        {(() => {
                          const totalCost = calc ? calc.totalCost : 0;
                          const valorBase = Number(p.valorBase) || 0;
                          if (!(totalCost > 0 && valorBase > 0)) return null;
                          const requiredMargin = 100 * (1 - totalCost / valorBase);
                          const alreadyMatches = Math.abs(requiredMargin - (Number(p.marginPercent) || 0)) < 0.01;
                          return (
                            <div className="text-right mt-0.5">
                              {alreadyMatches ? (
                                <span className="text-[10px] text-teal-600">✓ igual ao valor</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onUpdate(p.id, { marginPercent: Number(requiredMargin.toFixed(2)) })}
                                  title="Clique para aplicar essa margem"
                                  className="text-[10px] text-stone-400 hover:text-teal-700 hover:underline transition"
                                >
                                  → {pct(requiredMargin)} p/ igualar
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono font-semibold text-amber-700">
                        {calc ? money(calc.suggestedBase) : "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          value={p.durationMinutes}
                          onChange={(e) => onUpdate(p.id, { durationMinutes: e.target.value })}
                          className="w-16 text-sm font-mono text-right bg-stone-100/70 border border-stone-200 hover:border-teal-300 hover:bg-stone-50 focus:bg-white focus:border-teal-400 rounded-full px-2.5 py-1 outline-none transition"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <div className="font-mono text-sm font-medium text-stone-700" title="Calculado automaticamente: duração × custo da hora clínica (definido em Taxas)">
                          {money(calc ? calc.laborCost : 0)}
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
            className="absolute bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden py-1 w-40"
            style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
            onClick={(e) => e.stopPropagation()}
          >
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
    </div>
  );
}

function PaymentTable({ calc }) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-dashed border-stone-300">
        <div className="text-xs font-semibold uppercase tracking-wide text-stone-400">Simulação por forma de pagamento</div>
        <div className="text-xs text-stone-400 mt-0.5">
          Provisão de imposto (Carnê-Leão) aplicada: {pct(calc.taxPct)} — estimativa, pois o IRPF é progressivo
        </div>
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

function PaymentSimulationPanel({ selectedProc, calc }) {
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
            <PaymentTable calc={calc} />
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
            style={n <= level ? { color: MUSTARD_YELLOW, fill: MUSTARD_YELLOW } : { color: "#d6d3d1" }}
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

function ModeToggle({ patientMode, onChange }) {
  return (
    <div
      className="relative inline-flex items-center rounded-full p-1 bg-stone-100 border border-stone-200 shrink-0"
      style={{ width: "196px" }}
    >
      <div
        className="absolute top-1 bottom-1 rounded-full bg-white shadow transition-all duration-300 ease-out"
        style={{ width: "calc(50% - 4px)", left: patientMode ? "calc(50% + 2px)" : "4px" }}
      />
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`relative z-10 flex-1 text-center text-xs font-semibold py-1.5 rounded-full transition-colors duration-300 ${
          !patientMode ? "text-teal-800" : "text-stone-400"
        }`}
      >
        Profissional
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`relative z-10 flex-1 text-center text-xs font-semibold py-1.5 rounded-full transition-colors duration-300 ${
          patientMode ? "text-teal-800" : "text-stone-400"
        }`}
      >
        Paciente
      </button>
    </div>
  );
}

function SimulationPanel({
  procedures,
  settings,
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
  downPayment,
  setDownPayment,
  currentEntryId,
  setCurrentEntryId,
  onSaveBudget,
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
      const proc = procedures.find((p) => p.id === it.procId);
      return proc ? { ...proc, instanceId: it.instanceId } : null;
    })
    .filter(Boolean);
  const clientMarkupPercent = CLIENT_LEVEL_MARKUP[clientLevel] || 0;
  const markupMult = 1 + clientMarkupPercent / 100;
  const calc = budgetProcs.length > 0 ? calcBudget(budgetProcs, settings, clientMarkupPercent) : null;
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

  function removeItem(instanceId) {
    setItems(items.filter((it) => it.instanceId !== instanceId));
  }

  function handleClear() {
    setItems([]);
    setCategory("");
    setInstallments(1);
    setClientLevel(0);
    setPatientName("");
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
      procedures: budgetProcs.map((p) => ({ procId: p.id, name: p.name || "Sem nome", category: p.category || "" })),
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

  function handleExportPNG() {
    const canvas = buildExportCanvas();
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "orcamento-paciente.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 1800);
  }

  function handleExportPDF() {
    const canvas = buildExportCanvas();
    if (!canvas) return;
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

  function handlePrint() {
    const canvas = buildExportCanvas();
    if (!canvas) return;
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
    const canvas = buildExportCanvas();
    if (!canvas) return;
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
    <div className={patientMode ? "fixed inset-0 z-50 bg-stone-50 overflow-y-auto" : undefined}>
      <div className={patientMode ? "max-w-3xl mx-auto p-5 sm:p-8 space-y-5" : "space-y-5"}>
      <div className="bg-white border border-stone-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <div className="text-sm font-semibold text-stone-700">Orçamento</div>
          <div className="flex items-center gap-3">
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
            <ModeToggle patientMode={patientMode} onChange={setPatientMode} />
            {(items.length > 0 || category || clientLevel > 0 || patientName) && (
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
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            placeholder="Nome do paciente"
            className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 bg-white"
          />
        </div>
        <ProcedureCombobox procedures={procedures} value="" onChange={addItem} />

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
                    <div className="min-w-0 flex items-baseline gap-2">
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
    </div>
  );
}

function TabNav({ tab, setTab, secondaryColor }) {
  const containerRef = useRef(null);
  const tabRefs = useRef({});
  const [pillStyle, setPillStyle] = useState(null);

  const tabs = [
    { key: "simulation", label: "Simulação" },
    { key: "procedures", label: "Procedimentos" },
    { key: "history", label: "Histórico" },
  ];

  useLayoutEffect(() => {
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
    <nav ref={containerRef} className="relative flex flex-wrap gap-1 rounded-full p-1" style={{ backgroundColor: "rgba(0,0,0,0.25)" }}>
      {pillStyle && (
        <div
          className="absolute top-1 bottom-1 bg-stone-50 rounded-full transition-all duration-300 ease-out"
          style={{ left: `${pillStyle.left}px`, width: `${pillStyle.width}px` }}
        />
      )}
      {tabs.map((t) => (
        <button
          key={t.key}
          ref={(el) => (tabRefs.current[t.key] = el)}
          onClick={() => setTab(t.key)}
          className="relative z-10 px-4 py-1.5 rounded-full text-sm font-medium transition-colors duration-300"
          style={{ color: tab === t.key ? "#134e4a" : secondaryColor || "#71CFFE" }}
        >
          {t.label}
        </button>
      ))}
    </nav>
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
  const [showAppearance, setShowAppearance] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [contactSubject, setContactSubject] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactSending, setContactSending] = useState(false);
  const [contactFeedback, setContactFeedback] = useState(""); // "" | "sucesso" | "erro"
  const ref = useRef(null);
  const account = useAccount();

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setShowAppearance(false);
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
        className="relative w-12 h-12 shrink-0 rounded-full flex items-center justify-center overflow-hidden transition hover:brightness-95"
        style={{
          width: "72px",
          height: "72px",
          backgroundColor: "rgba(0,0,0,0.25)",
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        {settings.logoDataUrl ? (
          <img src={settings.logoDataUrl} alt="Foto de perfil" className="w-full h-full object-cover" />
        ) : (
          <Stethoscope className="w-6 h-6 text-amber-400" />
        )}
      </button>
      {open && (
        <div className="absolute left-0 mt-2 w-72 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden z-50 text-stone-800">
          {account?.user && (
            <div className="px-4 py-3 border-b border-stone-100">
              <div className="text-sm font-semibold text-stone-800 truncate">{account.user.email}</div>
            </div>
          )}

          <button
            onClick={() => setShowAppearance((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-stone-50 transition"
          >
            <span>Aparência</span>
            <ChevronRight className={`w-3.5 h-3.5 text-stone-400 transition-transform ${showAppearance ? "rotate-90" : ""}`} />
          </button>
          {showAppearance && (
            <div className="px-4 pb-4 pt-1 border-t border-stone-100">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-stone-500 mb-1">Cor primária</div>
                  <input
                    type="color"
                    value={settings.headerColor || "#005580"}
                    onChange={(e) => onChange({ ...settings, headerColor: e.target.value })}
                    className="w-full h-10 rounded-lg cursor-pointer border border-stone-200"
                  />
                </div>
                <div>
                  <div className="text-xs text-stone-500 mb-1">Cor secundária</div>
                  <input
                    type="color"
                    value={settings.secondaryColor || "#71CFFE"}
                    onChange={(e) => onChange({ ...settings, secondaryColor: e.target.value })}
                    className="w-full h-10 rounded-lg cursor-pointer border border-stone-200"
                  />
                </div>
              </div>
              <button
                onClick={() =>
                  onChange({
                    ...settings,
                    headerColor: DEFAULT_SETTINGS.headerColor,
                    secondaryColor: DEFAULT_SETTINGS.secondaryColor,
                  })
                }
                className="mt-3 w-full text-xs font-medium text-stone-600 border border-stone-200 rounded-lg py-1.5 hover:bg-stone-50 transition"
              >
                Padrão
              </button>
            </div>
          )}

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

function ProfileSettingsPage({ settings, onChange, onLogoUpload }) {
  const profilePhotoInputRef = useRef(null);
  const account = useAccount();
  const [renewSending, setRenewSending] = useState(false);
  const [renewFeedback, setRenewFeedback] = useState(""); // "" | "sucesso" | "erro"

  const license = account?.license;
  const licenseTypeLabel = license?.type === "trial" ? "Teste" : license?.type === "annual" ? "Anual" : "Mensal";
  const daysLeft = license?.daysLeft;
  const showRenewButton = license && typeof daysLeft === "number" && daysLeft <= 7;

  async function handleRequestRenewal() {
    setRenewSending(true);
    setRenewFeedback("");
    try {
      await apiRequest("/api/support/contact", {
        method: "POST",
        body: JSON.stringify({
          subject: "Renovação de licença",
          message: `Minha licença (${licenseTypeLabel}) está a ${daysLeft} ${
            daysLeft === 1 ? "dia" : "dias"
          } de expirar — gostaria de renová-la.`,
        }),
      });
      setRenewFeedback("sucesso");
    } catch (err) {
      setRenewFeedback("erro");
    } finally {
      setRenewSending(false);
    }
  }

  return (
    <SettingsCard icon={<Stethoscope className="w-4 h-4 text-teal-700" />} title="Configurações da Conta">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative w-16 h-16 shrink-0 rounded-full border border-stone-200 overflow-hidden bg-stone-100 flex items-center justify-center">
            {settings.logoDataUrl ? (
              <img src={settings.logoDataUrl} alt="Foto de perfil" className="w-full h-full object-cover" />
            ) : (
              <Stethoscope className="w-6 h-6 text-stone-400" />
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
          <div className="text-xs text-stone-500 mb-1">CRO / CRM</div>
          <input
            type="text"
            value={settings.professionalRegistration}
            onChange={(e) => onChange({ ...settings, professionalRegistration: e.target.value })}
            placeholder="Ex: CRO-SP 12345"
            className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400"
          />
        </div>

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
      </div>

      {license && (
        <SettingsSubSection icon={<CheckCircle2 className="w-4 h-4 text-teal-700" />} title="Licença">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-stone-600">Tipo</span>
              <span className="text-sm font-medium text-stone-800">{licenseTypeLabel}</span>
            </div>
            {license.expiresAt && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-stone-600">Expira em</span>
                <span className="text-sm font-medium text-stone-800">
                  {new Date(license.expiresAt).toLocaleDateString("pt-BR")}
                </span>
              </div>
            )}
            {typeof daysLeft === "number" && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-stone-600">Dias restantes</span>
                <span className={`text-sm font-semibold ${daysLeft <= 7 ? "text-rose-600" : "text-stone-800"}`}>
                  {daysLeft} {daysLeft === 1 ? "dia" : "dias"}
                </span>
              </div>
            )}
            {showRenewButton && (
              <div className="pt-2 border-t border-stone-100">
                <button
                  onClick={handleRequestRenewal}
                  disabled={renewSending}
                  className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-teal-700 text-white rounded-lg py-2 hover:bg-teal-800 transition disabled:opacity-50"
                >
                  {renewSending ? "Enviando pedido..." : "Renovar licença"}
                </button>
                {renewFeedback === "sucesso" && (
                  <div className="text-xs text-teal-600 text-center mt-2">
                    Pedido enviado! A gente entra em contato pra renovar.
                  </div>
                )}
                {renewFeedback === "erro" && (
                  <div className="text-xs text-rose-600 text-center mt-2">
                    Não foi possível enviar o pedido. Tente de novo.
                  </div>
                )}
              </div>
            )}
          </div>
        </SettingsSubSection>
      )}
    </SettingsCard>
  );
}

function SettingsCard({ icon, title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden h-fit">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-5 py-4 hover:bg-stone-50 transition"
      >
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="font-semibold text-stone-800 text-left">{title}</h2>
        </div>
        <ChevronRight className={`w-4 h-4 text-stone-400 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

// Divisória visual DENTRO de um SettingsCard, pra agrupar vários blocos de
// configuração relacionados dentro de um card só (ex: "Custo da hora
// clínica" e "Imposto" dentro do card "Custos"), sem criar um card novo pra
// cada um.
function SettingsSubSection({ icon, title, children, first }) {
  return (
    <div className={first ? "" : "mt-6 pt-6 border-t border-stone-100"}>
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
        <p className="text-xs mt-1">Use "Salvar orçamento" na aba Simulação pra guardar orçamentos aqui.</p>
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
      <SettingsCard icon={<Banknote className="w-4 h-4 text-teal-700" />} title="Custos">
        <SettingsSubSection icon={<Banknote className="w-4 h-4 text-teal-700" />} title="Custo da hora clínica" first>
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <label className="text-sm text-stone-600">Custos fixos mensais (R$)</label>
            <input
              type="number"
              value={laborCalc.fixedCosts}
              onChange={(e) => updateLaborCalc({ fixedCosts: Number(e.target.value) })}
              className="w-28 text-sm font-mono border border-stone-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-teal-400 text-right"
            />
          </div>
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <label className="text-sm text-stone-600">Pró-labore desejado (R$)</label>
            <input
              type="number"
              value={laborCalc.desiredIncome}
              onChange={(e) => updateLaborCalc({ desiredIncome: Number(e.target.value) })}
              className="w-28 text-sm font-mono border border-stone-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-teal-400 text-right"
            />
          </div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <label className="text-sm text-stone-600">Horas produtivas / mês</label>
            <input
              type="number"
              value={laborCalc.productiveHours}
              onChange={(e) => updateLaborCalc({ productiveHours: Number(e.target.value) })}
              className="w-28 text-sm font-mono border border-stone-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-teal-400 text-right"
            />
          </div>
          <div className="flex items-center justify-between border-t border-stone-100 pt-3">
            <span className="text-sm font-medium text-stone-700">Custo / hora resultante</span>
            <span className="font-mono font-semibold text-amber-700">{money(hourlyCost)}</span>
          </div>
          <p className="text-xs text-stone-400 mt-2 leading-relaxed">
            Horas produtivas = tempo real com paciente na cadeira, não o expediente todo. Esse valor calcula automaticamente a mão de obra de
            cada procedimento a partir da duração em minutos.
          </p>
        </SettingsSubSection>

        <SettingsSubSection
          icon={<Percent className="w-4 h-4 text-amber-600" />}
          title="Imposto — Profissional liberal (Receita Saúde)"
        >
          <FeeField label="Provisão estimada de IR (Carnê-Leão)" value={local.taxProvisionPercent} onChange={(v) => set({ taxProvisionPercent: v })} />
          <p className="text-xs text-stone-400 mt-2 leading-relaxed">
            Como profissional liberal você recolhe o IR pelo Carnê-Leão (tabela progressiva, sobre a receita menos despesas do Livro Caixa), e
            não por uma alíquota fixa em cada atendimento. Esse percentual é apenas uma reserva estimada para efeito de precificação — ajuste
            conforme sua faixa real e suas deduções.
          </p>
        </SettingsSubSection>
      </SettingsCard>

      <SettingsCard icon={<CreditCard className="w-4 h-4 text-teal-700" />} title="Formas de Pagamento/Taxas">
        <SettingsSubSection icon={<CreditCard className="w-4 h-4 text-teal-700" />} title="Quem paga as taxas" first>
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

        <SettingsSubSection icon={<CreditCard className="w-4 h-4 text-teal-700" />} title="Cartão">
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

        <SettingsSubSection icon={<Banknote className="w-4 h-4 text-teal-700" />} title="À vista">
          <FeeField label="PIX / Dinheiro" value={local.pixFeePercent} onChange={(v) => set({ pixFeePercent: v })} />
          <FeeField label="Desconto convênio / plano" value={local.convenioDiscountPercent} onChange={(v) => set({ convenioDiscountPercent: v })} />
        </SettingsSubSection>

        <SettingsSubSection icon={<Landmark className="w-4 h-4 text-teal-700" />} title="Boleto — parcelamento (1x = à vista, até 18x)">
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

        <SettingsSubSection icon={<Landmark className="w-4 h-4 text-teal-700" />} title="Taxas personalizadas">
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
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("simulation");
  const [budgetItems, setBudgetItems] = useState([]);
  const [budgetCategory, setBudgetCategory] = useState("");
  const [budgetInstallments, setBudgetInstallments] = useState(1);
  const [budgetClientLevel, setBudgetClientLevel] = useState(0);
  const [budgetPatientName, setBudgetPatientName] = useState("");
  const [budgetDownPayment, setBudgetDownPayment] = useState(0);
  const [budgetHistoryEntryId, setBudgetHistoryEntryId] = useState(null);
  const [reopenWarning, setReopenWarning] = useState("");
  const [budgetHistory, setBudgetHistory] = useState([]);
  const [justSaved, setJustSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState([]);
  const [hasPending, setHasPending] = useState(false);
  const historyBaselineRef = useRef(null);
  const historyTimerRef = useRef(null);
  const [cropImageSrc, setCropImageSrc] = useState(null);

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
        const bh = await window.storage.get("budgetHistory", false);
        if (bh && bh.value) {
          const storedHistory = JSON.parse(bh.value);
          if (Array.isArray(storedHistory)) setBudgetHistory(storedHistory);
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

  const persistProcedures = useCallback(async (next) => {
    const safeNext = Array.isArray(next) ? next : [];
    setProcedures(safeNext);
    try {
      await window.storage.set("procedures", JSON.stringify(safeNext), false);
    } catch (e) {}
  }, []);

  const persistBudgetHistory = useCallback(async (next) => {
    const safeNext = Array.isArray(next) ? next : [];
    setBudgetHistory(safeNext);
    try {
      await window.storage.set("budgetHistory", JSON.stringify(safeNext), false);
    } catch (e) {}
  }, []);

  function handleSaveBudget(entry) {
    const exists = budgetHistory.some((h) => h.id === entry.id);
    if (exists) {
      persistBudgetHistory(budgetHistory.map((h) => (h.id === entry.id ? { ...entry, status: h.status } : h)));
    } else {
      persistBudgetHistory([entry, ...budgetHistory].slice(0, 200));
    }
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
    const validItems = (entry.procedures || [])
      .filter((it) => procedures.some((p) => p.id === it.procId))
      .map((it) => ({ instanceId: uid(), procId: it.procId }));
    const missingCount = (entry.procedures || []).length - validItems.length;
    setBudgetItems(validItems);
    setBudgetCategory(entry.category || "");
    setBudgetInstallments(entry.installments || 1);
    setBudgetClientLevel(entry.clientLevel || 0);
    setBudgetPatientName(entry.patientName || "");
    setBudgetDownPayment(entry.downPayment || 0);
    setBudgetHistoryEntryId(entry.id);
    setTab("simulation");
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

  function flushHistoryBaseline() {
    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }
    if (historyBaselineRef.current) {
      const baseline = historyBaselineRef.current;
      historyBaselineRef.current = null;
      setHasPending(false);
      setHistory((h) => [...h.slice(-19), baseline]);
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
    setHistory((h) => [...h.slice(-19), before]);
  }

  async function handleManualSave() {
    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }
    if (historyBaselineRef.current) {
      historyBaselineRef.current = null;
      setHasPending(false);
    }
    await persistProcedures(procedures);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
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
      persistProcedures(prev);
      return;
    }
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      if (Array.isArray(prev)) persistProcedures(prev);
      return h.slice(0, -1);
    });
  }

  function addProcedure() {
    pushCheckpointNow(procedures);
    const p = {
      id: uid(),
      name: "Novo procedimento",
      category: "",
      cost: 0,
      durationMinutes: 30,
      laborCost: 0,
      marginPercent: 40,
      valorMinimo: 0,
      valorBase: 0,
    };
    persistProcedures([...procedures, p]);
    setTab("procedures");
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

  const canUndo = history.length > 0 || hasPending;
  const selectedProc = (procedures || []).find((p) => p.id === selectedId) || null;
  const calcs = {};
  (procedures || []).forEach((p) => {
    calcs[p.id] = calcProcedure(p, settings);
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
      <header
        style={{ backgroundColor: settings.headerColor || "#005580", position: "relative", zIndex: 30 }}
        className="border-b border-stone-200 text-stone-50"
      >
        <div className="max-w-6xl mx-auto px-5 pt-1.5 flex justify-end">
          <span style={{ fontSize: "9px", color: settings.secondaryColor || "#71CFFE" }}>Desenvolvido por Marcelo Zap</span>
        </div>
        <div className="max-w-6xl mx-auto px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative z-20 w-[72px] h-[72px] shrink-0">
              <OptionsMenu
                settings={settings}
                onChange={persistSettings}
                onLogoUpload={handleLogoUpload}
                onOpenProfileSettings={() => setTab("profile-settings")}
              />
            </div>
            <div className="min-w-0 ml-3">
              <div
                className="text-xs uppercase tracking-widest"
                style={{ color: settings.secondaryColor || "#71CFFE" }}
              >
                {settings.orgLabel || "Consultório"}
              </div>
              <div
                style={{ fontSize: "15px" }}
                className="font-semibold tracking-tight -mt-0.5 text-stone-50 truncate w-64 sm:w-96"
              >
                {settings.clinicName || "Nome"}
              </div>
            </div>
          </div>
          <TabNav tab={tab} setTab={setTab} secondaryColor={settings.secondaryColor} />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-6">
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
        ) : tab === "profile-settings" ? (
          <div className="grid grid-cols-1 gap-5 max-w-2xl">
            <ProfileSettingsPage settings={settings} onChange={persistSettings} onLogoUpload={handleLogoUpload} />
            <SettingsPanel settings={settings} onChange={persistSettings} />
          </div>
        ) : tab === "simulation" ? (
          <SimulationPanel
            procedures={procedures}
            settings={settings}
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
            downPayment={budgetDownPayment}
            setDownPayment={setBudgetDownPayment}
            currentEntryId={budgetHistoryEntryId}
            setCurrentEntryId={setBudgetHistoryEntryId}
            onSaveBudget={handleSaveBudget}
          />
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-sm font-semibold text-stone-700">Procedimentos</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={undo}
                  disabled={!canUndo}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                    canUndo
                      ? "border-stone-200 text-stone-600 hover:bg-stone-100"
                      : "border-stone-100 text-stone-300 cursor-not-allowed"
                  }`}
                >
                  <Undo2 className="w-4 h-4" /> Desfazer
                </button>
                <button
                  onClick={handleManualSave}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                    justSaved
                      ? "border-teal-200 bg-teal-50 text-teal-700"
                      : "border-stone-200 text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  {justSaved ? (
                    <>
                      <Check className="w-4 h-4" /> Salvo!
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" /> Salvar
                    </>
                  )}
                </button>
                <button
                  onClick={handleExportProcedures}
                  title="Exportar a lista de procedimentos num arquivo .json"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border border-stone-200 text-stone-600 hover:bg-stone-100 transition"
                >
                  <Download className="w-4 h-4" /> Exportar
                </button>
                <button
                  onClick={() => proceduresFileInputRef.current?.click()}
                  title="Importar uma lista de procedimentos de um arquivo .json"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border border-stone-200 text-stone-600 hover:bg-stone-100 transition"
                >
                  <Upload className="w-4 h-4" /> Importar
                </button>
                <input
                  ref={proceduresFileInputRef}
                  type="file"
                  accept="application/json"
                  onChange={handleImportProceduresFile}
                  className="hidden"
                />
                {proceduresImportFeedback && (
                  <span
                    className={`text-xs ${proceduresImportFeedback === "Importado!" ? "text-teal-600" : "text-rose-600"}`}
                  >
                    {proceduresImportFeedback}
                  </span>
                )}
                <button
                  onClick={addProcedure}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-teal-700 text-white text-sm font-medium hover:bg-teal-800 transition"
                >
                  <Plus className="w-4 h-4" /> Novo procedimento
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
              />
            )}

            <PaymentSimulationPanel selectedProc={selectedProc} calc={selectedCalc} />
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
    </div>
  );
}
