import { useSyncExternalStore } from "react";
import { classify, detectPassthroughs, normalize } from "./classifier";
import { catName, typeOf } from "./categories";
import { localDay } from "./format";
import type { ProjectionInput } from "./projections";
import type { Bill, CdbTranche, Config, Data, Envelope, FatherEntry, Invoice, ParsedTransaction, Receivable, Rule, Tx } from "./types";

const KEY = "financas:v1";

export const DEFAULT_PREFS: Config["prefs"] = {
  name: "", hideOnStart: true, avgMonths: 3, economyPct: 30, areasCount: 6, alertPct: 80, backupDays: 14, payday: 0, countReceivables: true, countInvoices: false, countCripto: true, autoCotacao: true, splash: true, anim: true, birth: "", returnPct: 10,
};

export const DEFAULT_CONFIG: Config = {
  prefs: DEFAULT_PREFS,
  salary: 2270,
  bills: [
    { id: "spotify", name: "Spotify", amount: 40.9, match: "SPOTIFY", atSource: false },
    { id: "claude", name: "Claude Pro", amount: 120, match: "ANTHROPIC", atSource: false },
    { id: "academia", name: "Evolve", amount: 149.05, match: "EVOLVE", atSource: false },
  ],
  goalAmount: 15000,
  goalDeadline: "2026-12",
  accountBalance: 0,
  balanceDate: "",
  rendaFixa: 0,
  rendaFixaDate: "",
  cdb: { pctCdi: 101.5, cdiAnnual: 15, principal: 0 },
  cdiDaily: {},
  fatherCreditStart: 0,
  salaryReceivedMonth: "",
  specialExpenses: [{ month: 10, amount: 100, description: "Google (anual)" }],
  customCats: [],
  envelopes: [
    { id: "bar", label: "Bar e saídas", cats: ["var_bar"], share: 0.36 },
    { id: "shows", label: "Shows e eventos", cats: ["var_show"], share: 0.16 },
    { id: "comida", label: "Comida e delivery", cats: ["var_food", "var_delivery"], share: 0.16 },
    { id: "igreja", label: "Igreja e doações", cats: ["var_church"], share: 0.1 },
    { id: "amigos", label: "Transferência p/ amigos", cats: ["var_friends"], share: 0.08 },
    { id: "barbearia", label: "Barbearia", cats: ["var_barber"], share: 0.06 },
    { id: "resto", label: "Resto", cats: [], share: 0.08 },
  ],
  envelopeOverrides: {},
  billsPaid: {},
  lock: { on: false, pinHash: "", credId: "" }, // o PIN é seu: define em Mais, Segurança (e vai no backup)
  dismissedRecurring: [],
  invoices: [],
};

const empty = (): Data => ({
  version: 1, txs: [], father: [], receivables: [], rules: [], config: { ...DEFAULT_CONFIG }, lastBackup: null,
});

// ---------- persistência (localStorage do app na Tela de Início) ----------

const SERVER = empty();
let cache: Data | null = null;
const listeners = new Set<() => void>();

function read(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const antes = JSON.parse(raw);
      const d = withDefaults(antes);
      // grava a correção, senão a data "hoje" mudaria a cada abertura
      if (d.config.rendaFixaDate && !antes.config?.rendaFixaDate) localStorage.setItem(KEY, JSON.stringify(d));
      return d;
    }
  } catch {
    /* dado corrompido ou storage bloqueado: começa vazio, backup resolve */
  }
  return empty();
}

function withDefaults(d: Data): Data {
  const { fixedSpotify, fixedClaude, smartfit, ...cfg } = (d.config ?? {}) as Partial<Config> & Record<string, number>;
  const config = { ...DEFAULT_CONFIG, ...cfg, prefs: { ...DEFAULT_PREFS, ...(cfg.prefs as Partial<Config["prefs"]> | undefined) } };
  // Backup antigo tinha 3 campos fixos: vira a lista editável de contas.
  if (!Array.isArray(cfg.bills)) {
    const [s, c, a] = DEFAULT_CONFIG.bills;
    config.bills = [
      { ...s, amount: fixedSpotify ?? s.amount },
      { ...c, amount: fixedClaude ?? c.amount },
      { ...a, amount: smartfit ?? a.amount },
    ];
  }
  // CDB digitado numa versão antiga ficou sem data: sem ela não rende nunca.
  // Passa a render a partir de hoje.
  if (config.rendaFixa > 0 && !config.rendaFixaDate) config.rendaFixaDate = localDay();
  const out = { ...empty(), ...d, config };
  // Extrato no formato novo do C6 (nov/2026) virava uma entrada falsa "a 14/11/2026" com o saldo como valor: some aqui.
  out.txs = (out.txs ?? []).filter((t) => t.manual || !/^a \d{2}\/\d{2}\/\d{4}$/i.test(t.description.trim()));
  return config.rendaFixa > 0 && !(config.cdb.tranches ?? []).length ? migrarParaAplicacoes(out) : out;
}

export function getData(): Data {
  if (!cache) {
    cache = read();
    // Pede ao iOS para não apagar os dados sob pouca memória.
    navigator.storage?.persist?.().catch(() => {});
  }
  return cache;
}

// ---------- proteção dos dados: contador de alterações e estados anteriores ----------

const CHANGES = "rumo-changes";
const SNAPS = "rumo-snaps";
const SNAP_EVERY = 20 * 60 * 1000; // um estado anterior a cada 20 min de uso
const SNAP_KEEP = 6;
export interface Snap { t: number; tx: number; json: string }

const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };

/** Quantas alterações você fez desde o último backup salvo em arquivo. */
export const changesSinceBackup = () => Number(lsGet(CHANGES) || 0);
export const resetChanges = () => lsSet(CHANGES, "0");

export function listSnapshots(): Snap[] {
  try { return JSON.parse(lsGet(SNAPS) || "[]"); } catch { return []; }
}
/** Guarda o estado atual como ponto de volta (antes de restaurar, importar ou trocar algo grande). */
export function snapshotNow(d: Data = getData()) {
  let list = [{ t: Date.now(), tx: d.txs.length, json: JSON.stringify(d) }, ...listSnapshots()].slice(0, SNAP_KEEP);
  // se estourar o espaço do aparelho, abre mão dos mais antigos
  while (list.length && !lsSet(SNAPS, JSON.stringify(list))) list = list.slice(0, -1);
}
export function restoreSnapshot(i: number): boolean {
  const s = listSnapshots()[i];
  if (!s) return false;
  snapshotNow(); // voltar também é reversível
  setData(withDefaults(JSON.parse(s.json)));
  return true;
}

export function setData(d: Data) {
  const antes = cache;
  cache = d;
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    alert("Não consegui salvar no aparelho. Faça um backup em Mais → Dados.");
  }
  lsSet(CHANGES, String(changesSinceBackup() + 1));
  const ultimo = listSnapshots()[0];
  if (antes && (!ultimo || Date.now() - ultimo.t > SNAP_EVERY)) snapshotNow(antes);
  listeners.forEach((l) => l());
}

export const update = (fn: (d: Data) => Data) => setData(fn(getData()));

export function useData(): Data {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    getData,
    () => SERVER
  );
}

// ---------- saldos derivados ----------

/**
 * Gasto ou entrada do pai que ainda não entrou no crédito dele (e é mais novo que o último ajuste do crédito).
 * É o que faz "o pai me deve" parecer não contar: o lançamento existe, mas não foi para o crédito.
 */
export function fatherPending(d: Data): Tx[] {
  const ligados = new Set(d.father.map((e) => e.txId).filter(Boolean));
  const ult = d.father.length ? d.father[d.father.length - 1].date : "";
  return d.txs.filter((t) => !t.card && (t.category === "income_fathers" || t.category === "fathers_expense") && !ligados.has(t.id) && t.date > ult);
}

export const fatherBalance = (d: Data) =>
  d.father.length ? d.father[d.father.length - 1].balanceAfter : d.config.fatherCreditStart;

/** Dias de semana depois de `from` e antes de `to` (as duas pontas fora). */
function weekdaysBetween(from: string, to: string): number {
  let n = 0;
  const cur = new Date(from + "T12:00:00");
  for (cur.setDate(cur.getDate() + 1); localDay(cur) < to && n < 400; cur.setDate(cur.getDate() + 1)) {
    if (cur.getDay() !== 0 && cur.getDay() !== 6) n++;
  }
  return n;
}

/** CDI de um dia útil (% ao dia) a partir da taxa anual, base 252. */
const cdiFromAnnual = (annual: number) => ((1 + annual / 100) ** (1 / 252) - 1) * 100;

const addDay = (iso: string, n: number) => {
  const x = new Date(iso + "T12:00:00");
  x.setDate(x.getDate() + n);
  return localDay(x);
};

/**
 * Faz `valor` render dos dias depois de `de` até `ate` (inclusive), um dia útil
 * por vez. Usa o CDI real de cada dia (Banco Central); nos dias que o BC ainda
 * não publicou, a última taxa conhecida. Feriado não tem CDI: não rende.
 */
function accrue(d: Data, valor: number, de: string, ate: string, pctCdi = d.config.cdb.pctCdi): number {
  if (ate <= de) return valor;
  const { cdiDaily } = d.config;
  const pct = pctCdi / 100;
  const pub = Object.keys(cdiDaily || {}).sort();
  const ultimaPub = pub.length ? pub[pub.length - 1] : "";
  let f = 1;
  for (const k of pub) if (k > de && k <= ate) f *= 1 + (cdiDaily[k] / 100) * pct;
  const apos = ultimaPub > de ? ultimaPub : de;
  if (ate > apos) f *= (1 + (lastCdi(d) / 100) * pct) ** weekdaysBetween(apos, addDay(ate, 1));
  return valor * f;
}

/**
 * CDB hoje: o valor conferido no C6 rende até cada aplicação ou resgate
 * posterior, soma o movimento e segue rendendo até ontem (o rendimento de
 * um dia só entra no dia seguinte).
 */
export function rendaFixaNow(d: Data, now = new Date()): number {
  if (usaTranches(d)) return r2(cdbTranches(d).reduce((s, t) => s + trancheValue(d, t, now), 0));
  const { rendaFixa, rendaFixaDate, cdb } = d.config;
  const hoje = localDay(now);
  const moves = [...(cdb.moves || [])].filter((m) => m.date <= hoje).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!rendaFixaDate && !moves.length) return rendaFixa;
  let v = rendaFixa;
  let cursor = rendaFixaDate || moves[0].date;
  const ontem = addDay(hoje, -1); // o rendimento de hoje só entra amanhã
  for (const m of moves) {
    const ate = m.date > ontem ? ontem : m.date;
    v = accrue(d, v, cursor, ate) + m.amount;
    if (ate > cursor) cursor = ate;
  }
  return r2(accrue(d, v, cursor, ontem));
}

/** Total aplicado hoje: o da conferência mais o que entrou ou saiu depois. */
export const cdbPrincipalNow = (d: Data, now = new Date()) =>
  usaTranches(d) ? r2(cdbTranches(d).filter((t) => t.date <= localDay(now)).reduce((s, t) => s + t.principal, 0)) : r2(d.config.cdb.principal + (d.config.cdb.moves || []).filter((m) => m.date <= localDay(now)).reduce((s, m) => s + (m.principal ?? m.amount), 0));

/** Você conferiu o valor no C6: recomeça daí e registra quanto o app tinha errado. */
export function conferirCdb(d: Data, c6: number, aplicado: number, now = new Date()): Data {
  const hoje = localDay(now);
  const app = rendaFixaNow(d, now);
  const checks = [...(d.config.cdb.checks || []), { date: hoje, app, c6: r2(c6) }].slice(-12);
  return {
    ...d,
    config: {
      ...d.config,
      rendaFixa: r2(c6),
      rendaFixaDate: hoje,
      cdb: { ...d.config.cdb, principal: r2(aplicado), moves: [], checks },
    },
  };
}

// ---------- aplicações (uma linha por aplicação, como no C6) ----------

/**
 * Converte o CDB de um valor só (modelo antigo) em aplicações: a conferência vira uma aplicação
 * e cada aplicação posterior vira outra, com a sua data.
 */
export function migrarParaAplicacoes(d: Data): Data {
  const { rendaFixa, rendaFixaDate, cdb } = d.config;
  if (!(rendaFixa > 0)) return d;
  const base: CdbTranche = {
    id: uid(), name: "CDB", date: cdb.since || rendaFixaDate, principal: r2(cdb.principal || rendaFixa), pct: cdb.pctCdi,
    checkDate: addDay(rendaFixaDate, -1), checkValue: r2(rendaFixa),
  };
  const novas: CdbTranche[] = (cdb.moves ?? []).filter((m) => m.amount > 0).map((m) => ({
    id: uid(), name: "CDB", date: m.date, principal: r2(m.principal ?? m.amount), pct: cdb.pctCdi, txId: m.txId,
  }));
  return { ...d, config: { ...d.config, cdb: { ...cdb, tranches: [base, ...novas], moves: [] } } };
}

/** Corta no centavo, como o banco faz com o IR (não arredonda para cima). */
const floorCent = (n: number) => Math.floor(n * 100 + 1e-6) / 100;
const diasEntre = (a: string, b: string) => Math.floor((Date.parse(b + "T12:00:00") - Date.parse(a + "T12:00:00")) / 86400000);

export const cdbTranches = (d: Data): CdbTranche[] => (d.config.cdb.tranches ?? []).filter((t) => !t.closed);
export const usaTranches = (d: Data) => (d.config.cdb.tranches ?? []).length > 0;

/** Valor bruto de uma aplicação hoje (o CDI de ontem é o último que entra, como no C6). */
export function trancheValue(d: Data, t: CdbTranche, now = new Date()): number {
  const hoje = localDay(now);
  if (t.date > hoje || (t.closed && t.closed <= hoje)) return 0;
  const ontem = addDay(hoje, -1);
  if (t.checkDate && t.checkValue !== undefined && ontem >= t.checkDate) return r2(accrue(d, t.checkValue, t.checkDate, ontem, t.pct));
  return r2(accrue(d, t.principal, addDay(t.date, -1), ontem, t.pct));
}

export interface TrancheInfo {
  t: CdbTranche; value: number; rendimento: number; ir: number; aliquota: number; liquido: number; dias: number;
  proxima: { em: number; data: string; nova: number } | null;
}
/** Tudo de uma aplicação: valor, rendimento, IR (da faixa dela), líquido e quando o IR cai. */
export function trancheInfo(d: Data, t: CdbTranche, now = new Date()): TrancheInfo {
  const hoje = localDay(now);
  const value = trancheValue(d, t, now);
  const rendimento = r2(Math.max(0, value - t.principal));
  const dias = Math.max(0, diasEntre(t.date, hoje));
  const aliquota = t.isento ? 0 : irRate(dias);
  const ir = floorCent(rendimento * (aliquota / 100));
  const alvo = t.isento ? undefined : [181, 361, 721].find((f) => f > dias);
  return {
    t, value, rendimento, ir, aliquota, liquido: r2(value - ir), dias,
    proxima: alvo === undefined ? null : { em: alvo - dias, data: addDay(hoje, alvo - dias), nova: irRate(alvo) },
  };
}
export const cdbItens = (d: Data, now = new Date()) => cdbTranches(d).map((t) => trancheInfo(d, t, now)).sort((a, b) => (a.t.date < b.t.date ? -1 : 1));

/** De quando precisamos do CDI do Banco Central. */
export function cdbDesde(d: Data): string {
  const ts = cdbTranches(d);
  if (ts.length) return ts.reduce((m, t) => { const x = t.checkDate ?? t.date; return !m || x < m ? x : m; }, "");
  return d.config.rendaFixaDate;
}

/** Cria a aplicação que corresponde a um lançamento de CDB (modo por aplicação). */
function trancheDeLancamento(d: Data, tx: { id: string; date: string; amount: number }): CdbTranche {
  const ult = [...cdbTranches(d)].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  return { id: uid(), name: ult?.name ?? "CDB", date: tx.date, principal: r2(-tx.amount), pct: ult?.pct ?? d.config.cdb.pctCdi, due: undefined, isento: ult?.isento, txId: tx.id };
}

/** Última taxa diária conhecida (do BC), senão a estimada pela anual. */
export function lastCdi(d: Data): number {
  const k = Object.keys(d.config.cdiDaily || {}).sort().pop();
  return k ? d.config.cdiDaily[k] : cdiFromAnnual(d.config.cdb.cdiAnnual || 0);
}

/** Quanto o CDB rende num dia útil, no valor de hoje (bruto). */
export const cdbPerDay = (d: Data) =>
  usaTranches(d)
    ? r2(cdbTranches(d).reduce((s, t) => s + trancheValue(d, t) * (lastCdi(d) / 100) * (t.pct / 100), 0))
    : r2(rendaFixaNow(d) * (lastCdi(d) / 100) * (d.config.cdb.pctCdi / 100));

/** Tabela regressiva do IR sobre o rendimento, pelos dias desde a aplicação. */
export const irRate = (dias: number) => (dias <= 180 ? 22.5 : dias <= 360 ? 20 : dias <= 720 ? 17.5 : 15);

/**
 * O CDB como você receberia hoje: o IR sai só do rendimento. Sem a data da
 * aplicação, usa a alíquota mais alta (22,5%) para não prometer o que não tem.
 */
export function cdbNet(d: Data, now = new Date()) {
  if (usaTranches(d)) {
    const itens = cdbItens(d, now);
    const bruto = r2(itens.reduce((s, i) => s + i.value, 0));
    const principal = r2(itens.reduce((s, i) => s + i.t.principal, 0));
    const ir = r2(itens.reduce((s, i) => s + i.ir, 0));
    const rendimento = r2(Math.max(0, bruto - principal));
    const dias = itens.length ? Math.max(...itens.map((i) => i.dias)) : null;
    return { bruto, rendimento, aliquota: rendimento > 0 ? Math.round((ir / rendimento) * 1000) / 10 : itens.length ? Math.min(...itens.map((i) => i.aliquota)) : 22.5, ir, liquido: r2(bruto - ir), dias };
  }
  const bruto = rendaFixaNow(d, now);
  const { since } = d.config.cdb;
  const principal = cdbPrincipalNow(d, now);
  const dias = since ? Math.floor((Date.parse(localDay(now)) - Date.parse(since)) / 86400000) : null;
  const aliquota = dias === null ? 22.5 : irRate(dias);
  const rendimento = principal > 0 ? Math.max(0, bruto - principal) : 0;
  const ir = r2(rendimento * (aliquota / 100));
  return { bruto, rendimento: r2(rendimento), aliquota, ir, liquido: r2(bruto - ir), dias };
}

// ---------- fatura do cartão ----------

const addDays = (iso: string, n: number) => {
  const x = new Date(iso + "T12:00:00");
  x.setDate(x.getDate() + n);
  return localDay(x);
};

/**
 * Quanto falta pagar da fatura. Conta como pagamento o "pagamento de fatura"
 * do extrato entre 20 dias antes e 7 depois do vencimento (janela menor que
 * um mês, para um pagamento não valer para duas faturas).
 */
export function invoiceOpen(d: Data, inv: Invoice): number {
  if (inv.paidManual) return 0;
  const ini = addDays(inv.due, -20);
  const fim = addDays(inv.due, 7);
  const pago = -d.txs
    .filter((t) => t.category === "pay_card" && t.amount < 0 && t.date >= ini && t.date <= fim)
    .reduce((s, t) => s + t.amount, 0);
  return Math.max(0, r2(inv.total - pago));
}

/** Tudo o que você deve no cartão (faturas importadas ainda não pagas). */
export const cardDebt = (d: Data) =>
  d.config.prefs?.countInvoices ? r2((d.config.invoices || []).reduce((s, i) => s + invoiceOpen(d, i), 0)) : 0; // só desconta se você ligar em Ajustes

export const toggleInvoicePaid = (d: Data, id: string): Data => ({
  ...d, config: { ...d.config, invoices: d.config.invoices.map((i) => (i.id === id ? { ...i, paidManual: !i.paidManual } : i)) },
});
export const deleteInvoice = (d: Data, id: string): Data => ({
  ...d, config: { ...d.config, invoices: d.config.invoices.filter((i) => i.id !== id) },
});

/**
 * Meu dinheiro = saldo da conta − crédito do pai + CDB líquido de IR − fatura
 * do cartão em aberto. Compra no cartão já é dinheiro que saiu: quando a
 * fatura é paga, sai da conta e deixa de contar como dívida.
 */
export const myMoney = (d: Data) => moneyParts(d).total;

/**
 * O "meu dinheiro" aberto em partes.
 * disponível: o que é seu na conta, menos a fatura do cartão em aberto.
 * a receber: o que seu pai te deve (crédito dele negativo) e o que outras pessoas te devem.
 * total: disponível + CDB líquido + a receber.
 */
export function moneyParts(d: Data, now = new Date()) {
  const pai = fatherBalance(d);
  const fatura = cardDebt(d);
  const disponivel = r2(d.config.accountBalance - Math.max(0, pai) - fatura);
  const cdb = cdbNet(d, now).liquido;
  const doPai = r2(Math.max(0, -pai));
  const pessoas = d.config.prefs?.countReceivables === false ? 0 : receivablesOpen(d);
  const aReceber = r2(doPai + pessoas);
  const cripto = d.config.prefs?.countCripto === false ? 0 : r2((d.cripto ?? []).reduce((s, c) => s + c.qty * (c.price ?? c.avgCost), 0));
  const paiGuardado = r2(Math.max(0, pai)); // dinheiro do seu pai que está na sua conta (não é seu)
  return { disponivel, cdb, cripto, doPai, paiGuardado, pessoas, aReceber, fatura, conta: d.config.accountBalance, total: r2(disponivel + cdb + cripto + aReceber) };
}

// ---------- a receber (quem te deve) ----------

export const receivableLeft = (r: Receivable) => r2(r.amount - r.payments.reduce((s, p) => s + p.amount, 0));
export const receivablesOpen = (d: Data) => r2((d.receivables || []).reduce((s, r) => s + Math.max(0, receivableLeft(r)), 0));

/**
 * Anota que alguém te deve. Se o dinheiro saiu da sua conta agora (emprestou,
 * pagou por ele), lança essa saída também — como "emprestei", não como gasto.
 */
export function addReceivable(d: Data, r: { person: string; description: string; amount: number; date: string; saiuDaConta: boolean }): Data {
  const novo = { id: uid(), person: r.person.trim(), description: r.description.trim(), amount: r2(r.amount), date: r.date, payments: [] };
  const out: Data = { ...d, receivables: [...(d.receivables || []), novo] };
  return r.saiuDaConta
    ? addManual(out, { date: r.date, description: `Para ${novo.person}${novo.description ? ": " + novo.description : ""}`, amount: -novo.amount, category: "lend_out" })
    : out;
}

/** A pessoa pagou (tudo ou parte). Se entrou na conta agora, lança a entrada referente a isso. */
export function payReceivable(d: Data, id: string, p: { amount: number; date: string; entrouNaConta: boolean }): Data {
  const r = (d.receivables || []).find((x) => x.id === id);
  if (!r) return d;
  let out = d;
  let txId: string | undefined;
  if (p.entrouNaConta) {
    out = addManual(out, { date: p.date, description: `${r.person} pagou${r.description ? ": " + r.description : ""}`, amount: r2(p.amount), category: "income_debt" });
    txId = out.txs[out.txs.length - 1].id;
  }
  return {
    ...out,
    receivables: (out.receivables || []).map((x) => (x.id === id ? { ...x, payments: [...x.payments, { date: p.date, amount: r2(p.amount), ...(txId ? { txId } : {}) }] } : x)),
  };
}

/** A pessoa pagou um valor: abate das dívidas dela, da mais antiga para a mais nova (uma entrada só). */
export function payPerson(d: Data, person: string, p: { amount: number; date: string; entrouNaConta: boolean }): Data {
  let resta = r2(p.amount);
  let out = d;
  const abertas = openReceivableOf(d, person);
  for (const r of abertas) {
    if (resta <= 0) break;
    const parte = Math.min(resta, receivableLeft(r));
    out = payReceivable(out, r.id, { amount: parte, date: p.date, entrouNaConta: false });
    resta = r2(resta - parte);
  }
  if (p.entrouNaConta) {
    out = addManual(out, { date: p.date, description: `${abertas[0]?.person ?? person} pagou`, amount: r2(p.amount), category: "income_debt" });
  }
  return out;
}

export const deleteReceivable = (d: Data, id: string): Data => ({ ...d, receivables: (d.receivables || []).filter((r) => r.id !== id) });

/** Dívida em aberto de uma pessoa (nome sem acento/maiúscula), a mais antiga primeiro. */
export function openReceivableOf(d: Data, person: string) {
  const n = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return (d.receivables || []).filter((r) => n(r.person) === n(person) && receivableLeft(r) > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---------- contas fixas e parcelamentos ----------

const monthsBetween = (a: string, b: string) => {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
};

/** Conta vale no mês? Parcelamento só entre a primeira e a última parcela. */
export const billActive = (b: Bill, month: string) => (!b.from || month >= b.from) && (!b.until || month <= b.until);

/** "3 de 10" de um parcelamento no mês. */
export const parcela = (b: Bill, month: string) =>
  b.until ? { n: monthsBetween(b.from ?? month, month) + 1, total: monthsBetween(b.from ?? b.until, b.until) + 1 } : null;

const billMatches = (b: Bill, t: Tx) => {
  const k = normalize(b.match || b.name);
  return !!k && t.amount < 0 && normalize(t.description).includes(k);
};

/** Conta paga no mês: apareceu no extrato/fatura ou você marcou. */
export const billPaid = (d: Data, b: Bill, month: string) =>
  (d.config.billsPaid[month] || []).includes(b.id) || d.txs.some((t) => t.date.startsWith(month) && billMatches(b, t));

/** Dia do mês em que a conta costuma sair (pelo último pagamento), senão dia 10. */
export function billDay(d: Data, b: Bill): number {
  if (b.day) return b.day;
  const last = d.txs.filter((t) => billMatches(b, t)).sort((a, z) => (a.date < z.date ? 1 : -1))[0];
  return last ? Number(last.date.slice(8, 10)) : 10;
}

export const monthKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const r2 = (n: number) => Math.round(n * 100) / 100;
const uid = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
const today = () => localDay();
const dupKey = (t: { date: string; description: string; amount: number }) =>
  `${t.date}|${normalize(t.description)}|${t.amount.toFixed(2)}`;
/** Chaves que já estão no app. Transação dividida conta pela original. */
const seenKeys = (txs: Tx[]) => new Set(txs.flatMap((t) => (t.splitFrom ? [dupKey(t), t.splitFrom] : [dupKey(t)])));

// ---------- importação ----------

export interface ImportStats {
  imported: number;
  duplicates: number;
  review: number;
  closingBalance: number | null;
  closingApplied: boolean; // false = extrato mais antigo que o saldo atual
  replacedManual: number; // lançamentos manuais substituídos pelo extrato
  accountDelta: number;
}

export function importParsed(
  d: Data,
  parsed: ParsedTransaction[],
  closingBalance: number | null,
  statementDate: string | null = null
): { data: Data; stats: ImportStats } {
  const seen = seenKeys(d.txs);
  const fresh = parsed.filter((p) => {
    const k = dupKey(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const pt = detectPassthroughs(fresh);
  const txs: Tx[] = fresh.map((p, i) => {
    const c = pt.has(i) ? { category: "passthrough", review: true } : classify(p.description, p.amount, d.rules);
    return { id: uid(), date: p.date, description: p.description, amount: p.amount, ...c };
  });

  const cfg = { ...d.config };
  const before = cfg.accountBalance;
  const lastTx = parsed.reduce((m, t) => (t.date > m ? t.date : m), "");
  const firstTx = parsed.reduce((m, t) => (!m || t.date < m ? t.date : m), "");
  const stmtDate = statementDate || lastTx || today();
  // O que você lançou na mão dentro do período agora vem do extrato de verdade:
  // some com os lançamentos manuais para não contar duas vezes.
  const kept = d.txs.filter((t) => !(t.manual && t.date >= firstTx && t.date <= stmtDate));
  const replacedManual = d.txs.length - kept.length;
  // Extrato mais antigo que o último extrato que já temos só entra como histórico.
  // (Lançamento seu de hoje move o balanceDate, mas não é extrato: não pode travar o saldo.)
  const ultimoExtrato = cfg.stmtDate || d.txs.filter((t) => !t.manual && !t.card).reduce((m, t) => (t.date > m ? t.date : m), "");
  const newer = !ultimoExtrato || stmtDate >= ultimoExtrato;
  const after = txs.filter((t) => !cfg.balanceDate || t.date > cfg.balanceDate);
  const closingApplied = closingBalance !== null && newer;
  if (closingApplied) {
    // Fonte da verdade: o "Saldo do dia" do extrato.
    // + o que você lançou na mão depois da data do extrato, que o banco ainda não mostra.
    const depois = kept.filter((t) => t.manual && !t.card && t.date > stmtDate).reduce((s, t) => s + t.amount, 0);
    cfg.accountBalance = r2(closingBalance! + depois);
    cfg.balanceDate = stmtDate;
    cfg.stmtDate = stmtDate;
  } else if (closingBalance === null && after.length) {
    cfg.accountBalance = r2(cfg.accountBalance + after.reduce((s, t) => s + t.amount, 0));
    cfg.balanceDate = after.reduce((m, t) => (t.date > m ? t.date : m), cfg.balanceDate);
  }
  // Aplicação em CDB sai da conta e entra na renda fixa (resgate faz o contrário).
  // Cada movimento rende a partir da própria data. O que veio antes da conferência
  // no C6 já está dentro do valor conferido: não entra de novo.
  const apagados = new Set(d.txs.filter((t) => !kept.includes(t)).map((t) => t.id));
  const poupa = txs.filter((x) => typeOf(x.category) === "savings");
  if (usaTranches(d)) {
    // Por aplicação: o lançamento manual que o extrato substituiu passa o vínculo para o lançamento de verdade,
    // sem perder o que você já ajustou (taxa, nome, conferência). Aplicação já conhecida não vira outra.
    const livres = poupa.filter((x) => x.amount < 0);
    const usados = new Set<string>();
    const acha = (date: string, valor: number) => livres.find((x) => !usados.has(x.id) && x.date === date && Math.abs(-x.amount - valor) < 0.01);
    let ts = (cfg.cdb.tranches ?? []).flatMap((tr) => {
      if (!tr.txId || !apagados.has(tr.txId)) return [tr];
      const novo = acha(tr.date, tr.principal);
      if (!novo) return []; // o lançamento sumiu sem substituto: a aplicação também
      usados.add(novo.id);
      return [{ ...tr, txId: novo.id }];
    });
    const ultimaConferencia = ts.reduce((m, tr) => (tr.checkDate && tr.checkDate > m ? tr.checkDate : m), "");
    for (const x of livres) {
      if (usados.has(x.id)) continue;
      const igual = ts.find((tr) => !tr.txId && tr.date === x.date && Math.abs(tr.principal + x.amount) < 0.01);
      if (igual) ts = ts.map((tr) => (tr === igual ? { ...tr, txId: x.id } : tr));
      else if (!ultimaConferencia || x.date > ultimaConferencia) ts = [...ts, trancheDeLancamento({ ...d, config: { ...d.config, cdb: { ...d.config.cdb, tranches: ts } } }, x)];
    }
    cfg.cdb = { ...cfg.cdb, tranches: ts };
  } else {
    let moves = (cfg.cdb.moves || []).filter((m) => !m.txId || !apagados.has(m.txId));
    for (const t of poupa) {
      if (!cfg.rendaFixaDate || t.date > cfg.rendaFixaDate) moves = [...moves, { date: t.date, amount: r2(-t.amount), txId: t.id }];
    }
    cfg.cdb = { ...cfg.cdb, moves };
  }

  return {
    data: syncFather({ ...d, txs: [...kept, ...txs], config: cfg }, txs),
    stats: {
      imported: txs.length,
      duplicates: parsed.length - txs.length,
      review: txs.filter((t) => t.review).length,
      closingBalance,
      closingApplied,
      replacedManual,
      accountDelta: r2(cfg.accountBalance - before),
    },
  };
}

// ---------- fatura do cartão ----------

/**
 * Compras da fatura. Não mexem no saldo da conta: quem debita é o pagamento
 * da fatura, que aparece no extrato como "PGTO FAT CARTAO".
 */
export function importInvoice(
  d: Data,
  purchases: (ParsedTransaction & { installment?: string })[],
  meta: { due: string | null; total: number | null } = { due: null, total: null }
): { data: Data; imported: number; duplicates: number; review: number } {
  const seen = seenKeys(d.txs);
  const fresh = purchases.filter((p) => {
    const k = dupKey(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const txs: Tx[] = fresh.map((p) => ({
    id: uid(),
    date: p.date,
    description: p.description,
    amount: p.amount,
    card: true,
    ...(p.installment ? { installment: p.installment } : {}),
    ...classify(p.description, p.amount, d.rules),
  }));
  // A fatura vira dívida até o pagamento aparecer (reimportar a mesma só atualiza).
  const ultima = purchases.reduce((m, p) => (p.date > m ? p.date : m), "");
  const due = meta.due ?? (ultima ? addDays(ultima, 15) : null);
  const total = meta.total ?? r2(-purchases.reduce((s, p) => s + p.amount, 0));
  const invoices = (d.config.invoices || []).filter((i) => i.due !== due);
  if (due && total > 0) {
    const antiga = (d.config.invoices || []).find((i) => i.due === due);
    invoices.push({ id: antiga?.id ?? uid(), due, total: r2(total), ...(antiga?.paidManual ? { paidManual: true } : {}) });
  }
  return {
    data: { ...d, txs: [...d.txs, ...txs], config: { ...d.config, invoices: invoices.sort((a, b) => (a.due < b.due ? -1 : 1)) } },
    imported: txs.length,
    duplicates: purchases.length - txs.length,
    review: txs.filter((t) => t.review).length,
  };
}

// ---------- envelopes do teto ----------

/** Quanto cada envelope tem no mês: ajuste do mês, senão a fatia padrão. */
export function envelopeBudgets(d: Data, month: string, teto: number): Record<string, number> {
  const over = d.config.envelopeOverrides[month] || {};
  const out: Record<string, number> = {};
  for (const e of d.config.envelopes) {
    out[e.id] = over[e.id] !== undefined ? over[e.id] : Math.round(teto * e.share);
  }
  // Sem ajuste do mês, o arredondamento sobra: o envelope curinga absorve.
  if (!Object.keys(over).length && d.config.envelopes.length) {
    const catchAll = d.config.envelopes.find((e) => !e.cats.length) ?? d.config.envelopes[d.config.envelopes.length - 1];
    const soma = Object.values(out).reduce((a, b) => a + b, 0);
    out[catchAll.id] = Math.max(0, out[catchAll.id] + (Math.round(teto) - soma));
  }
  return out;
}

/** Remanejar: muda um envelope no mês e tira a diferença do "Resto". */
export function setEnvelopeAmount(d: Data, month: string, id: string, value: number, teto: number): Data {
  const budgets = envelopeBudgets(d, month, teto);
  budgets[id] = Math.max(0, Math.round(value));
  return { ...d, config: { ...d.config, envelopeOverrides: { ...d.config.envelopeOverrides, [month]: budgets } } };
}

export const resetEnvelopes = (d: Data, month: string): Data => {
  const over = { ...d.config.envelopeOverrides };
  delete over[month];
  return { ...d, config: { ...d.config, envelopeOverrides: over } };
};

export const saveEnvelope = (d: Data, e: Envelope): Data => ({
  ...d,
  config: {
    ...d.config,
    envelopes: d.config.envelopes.some((x) => x.id === e.id)
      ? d.config.envelopes.map((x) => (x.id === e.id ? e : x))
      : [...d.config.envelopes, { ...e, id: e.id || uid().slice(0, 6) }],
  },
});

export const deleteEnvelope = (d: Data, id: string): Data => ({
  ...d, config: { ...d.config, envelopes: d.config.envelopes.filter((e) => e.id !== id) },
});

// ---------- contas fixas: marcar como paga na mão ----------

export function toggleBillPaid(d: Data, month: string, billId: string): Data {
  const list = d.config.billsPaid[month] || [];
  const next = list.includes(billId) ? list.filter((b) => b !== billId) : [...list, billId];
  return { ...d, config: { ...d.config, billsPaid: { ...d.config.billsPaid, [month]: next } } };
}

// ---------- trava do app ----------

export const setLock = (d: Data, patch: Partial<Data["config"]["lock"]>): Data => ({
  ...d, config: { ...d.config, lock: { ...d.config.lock, ...patch } },
});

// ---------- lançamento manual (já mexe no saldo) ----------

/**
 * Gasto ou entrada lançado por você. Mexe no saldo na hora, sem esperar o
 * extrato. Quando o extrato do período chegar, o lançamento manual sai e o
 * de verdade entra no lugar.
 */
export function addManual(
  d: Data,
  t: { date: string; description: string; amount: number; category: string },
  opts: { semCdb?: boolean } = {}
): Data {
  const tx: Tx = { id: uid(), ...t, review: false, manual: true };
  const cfg = { ...d.config };
  cfg.accountBalance = r2(cfg.accountBalance + t.amount);
  if (typeOf(t.category) === "savings" && !opts.semCdb) {
    if (usaTranches(d)) {
      // aplicação nova vira uma aplicação; resgate é registrado na aba CDB (qual aplicação saiu)
      if (t.amount < 0) cfg.cdb = { ...cfg.cdb, tranches: [...(cfg.cdb.tranches ?? []), trancheDeLancamento(d, { id: tx.id, date: t.date, amount: t.amount })] };
    } else if (!cfg.rendaFixaDate || t.date >= cfg.rendaFixaDate) {
      cfg.cdb = { ...cfg.cdb, moves: [...(cfg.cdb.moves || []), { date: t.date, amount: r2(-t.amount), txId: tx.id }] };
    }
  }
  if (t.date > cfg.balanceDate) cfg.balanceDate = t.date;
  return syncFather({ ...d, txs: [...d.txs, tx], config: cfg }, [tx]);
}

// ---------- categorias suas ----------

export function addCategory(d: Data, prefix: string, name: string, icon: string): Data {
  const key = `${prefix}u${uid().slice(0, 6)}`;
  return { ...d, config: { ...d.config, customCats: [...d.config.customCats, { key, name, icon }] } };
}

export const editCategory = (d: Data, key: string, name: string, icon: string): Data => ({
  ...d,
  config: { ...d.config, customCats: d.config.customCats.map((c) => (c.key === key ? { ...c, name, icon } : c)) },
});

/** Apagar categoria sua devolve as transações dela para "Sem categoria". */
export const deleteCategory = (d: Data, key: string): Data => ({
  ...d,
  txs: d.txs.map((t) => (t.category === key ? { ...t, category: "uncategorized", review: true } : t)),
  rules: d.rules.filter((r) => r.category !== key),
  config: { ...d.config, customCats: d.config.customCats.filter((c) => c.key !== key) },
});

// ---------- classificação que aprende ----------

/**
 * Troca a categoria. Com `learn`, cria regra pelo nome normalizado e aplica
 * nas transações iguais que ainda estão sem categoria ou a revisar.
 */
export function recategorize(d: Data, id: string, category: string, learn: boolean): { data: Data; applied: number } {
  const tx = d.txs.find((t) => t.id === id);
  if (!tx) return { data: d, applied: 0 };
  const pattern = normalize(tx.description);
  const sign: 1 | -1 = tx.amount >= 0 ? 1 : -1;
  let applied = 0;
  const mexidos: Tx[] = [];
  const txs = d.txs.map((t) => {
    if (t.id === id) {
      const n = { ...t, category, review: false };
      mexidos.push(n);
      return n;
    }
    if (
      learn && pattern && (t.review || t.category === "uncategorized") &&
      normalize(t.description) === pattern && Math.sign(t.amount || 1) === sign
    ) {
      applied++;
      const n = { ...t, category, review: false };
      mexidos.push(n);
      return n;
    }
    return t;
  });
  const rules: Rule[] = learn && pattern
    ? [...d.rules.filter((r) => !(r.pattern === pattern && r.sign === sign)), { pattern, category, sign, learned: true }]
    : d.rules;
  return { data: syncFather({ ...d, txs, rules }, mexidos), applied };
}

export const confirmTx = (d: Data, id: string): Data => ({
  ...d, txs: d.txs.map((t) => (t.id === id ? { ...t, review: false } : t)),
});

/** Apagar um lançamento manual devolve o dinheiro (ele tinha saído do saldo na hora). */
export function deleteTx(d: Data, id: string): Data {
  const t = d.txs.find((x) => x.id === id);
  const cfg = { ...d.config };
  if (t?.manual) {
    cfg.accountBalance = r2(cfg.accountBalance - t.amount);
    cfg.cdb = { ...cfg.cdb, moves: (cfg.cdb.moves || []).filter((m) => m.txId !== id), ...(cfg.cdb.tranches ? { tranches: cfg.cdb.tranches.filter((tr) => tr.txId !== id) } : {}) };
  }
  return recalcFather({ ...d, config: cfg, txs: d.txs.filter((x) => x.id !== id), father: d.father.filter((e) => e.txId !== id) });
}

/** Corrigir um lançamento manual: desfaz o antigo e lança de novo. */
export function editManual(d: Data, id: string, t: { date: string; description: string; amount: number; category: string; note?: string }): Data {
  const antes = d.txs.find((x) => x.id === id);
  if (!antes?.manual) return d;
  const out = addManual(deleteTx(d, id), t);
  const novo = out.txs[out.txs.length - 1];
  return t.note ? { ...out, txs: out.txs.map((x) => (x.id === novo.id ? { ...x, note: t.note } : x)) } : out;
}

export const setNote = (d: Data, id: string, note: string): Data => ({
  ...d, txs: d.txs.map((t) => (t.id === id ? { ...t, note: note.trim() || undefined } : t)),
});

/**
 * Divide uma transação em pedaços (ex.: parte sua, parte do pai). O total não
 * muda, então o saldo da conta também não. Os pedaços lembram a original para
 * o próximo extrato não trazer ela de volta.
 */
export function splitTx(d: Data, id: string, parts: { amount: number; category: string }[]): Data {
  const t = d.txs.find((x) => x.id === id);
  if (!t || parts.length < 2) return d;
  const soma = r2(parts.reduce((s, p) => s + p.amount, 0));
  if (soma !== r2(t.amount) || parts.some((p) => !p.amount || Math.sign(p.amount) !== Math.sign(t.amount))) {
    throw new Error("Os pedaços precisam somar o valor da transação.");
  }
  const origem = t.splitFrom ?? dupKey(t);
  const pedacos: Tx[] = parts.map((p) => ({ ...t, id: uid(), amount: r2(p.amount), category: p.category, review: false, splitFrom: origem }));
  const txs = d.txs.flatMap((x) => (x.id === id ? pedacos : [x]));
  return syncFather({ ...d, txs, father: d.father.filter((e) => e.txId !== id) }, pedacos);
}

/** Compra parcelada: vira uma conta que só vale da primeira à última parcela. */
export function addParcelamento(d: Data, p: { name: string; parcela: number; from: string; until: string; match: string }): Data {
  const b: Bill = { id: uid(), name: p.name, amount: r2(p.parcela), match: p.match.trim().toUpperCase(), atSource: false, from: p.from, until: p.until };
  return { ...d, config: { ...d.config, bills: [...d.config.bills, b] } };
}

/** Recusa o aviso de preço novo de uma conta (volta a avisar só se o valor mudar de novo). */
export const dismissPrice = (d: Data, billId: string, novo: number): Data => ({
  ...d, config: { ...d.config, dismissedPrices: [...(d.config.dismissedPrices ?? []), `${billId}:${novo}`] },
});

export const dismissRecurring = (d: Data, key: string): Data => ({
  ...d, config: { ...d.config, dismissedRecurring: [...d.config.dismissedRecurring, key] },
});

export const deleteRule = (d: Data, r: Rule): Data => ({
  ...d, rules: d.rules.filter((x) => !(x.pattern === r.pattern && x.sign === r.sign)),
});

// ---------- crédito do pai (pode ficar negativo = pai te deve) ----------

function addFather(d: Data, description: string, amount: number, balanceAfter: number): Data {
  const e: FatherEntry = { id: uid(), date: today(), description, amount: r2(amount), balanceAfter: r2(balanceAfter) };
  return { ...d, father: [...d.father, e] };
}

export const fatherMove = (d: Data, amount: number, description: string) =>
  addFather(d, description, amount, fatherBalance(d) + amount);

export const fatherSet = (d: Data, balance: number, description = "Ajuste de saldo") =>
  addFather(d, description, balance - fatherBalance(d), balance);

export const fatherDelete = (d: Data, id: string): Data =>
  recalcFather({ ...d, father: d.father.filter((e) => e.id !== id) });

/** Refaz o saldo corrente da lista do pai. O total não depende da ordem. */
function recalcFather(d: Data): Data {
  let b = d.config.fatherCreditStart;
  return { ...d, father: d.father.map((e) => ({ ...e, balanceAfter: (b = r2(b + e.amount)) })) };
}

/**
 * Gasto ou entrada do pai mexe no crédito dele sozinho: desconta do que ele
 * tem e, se não tiver, o saldo fica negativo — ou seja, vira crédito seu com
 * ele. Compra na fatura fica de fora: quem debita é o pagamento da fatura.
 * Só vale para os lançamentos passados aqui, então o que já foi acertado na
 * mão antes continua como está.
 */
export function syncFather(d: Data, mexidos: Tx[]): Data {
  const novos = new Set(mexidos.map((t) => t.id));
  const vivos = new Set(d.txs.map((t) => t.id));
  const keep = d.father.filter((e) => !e.txId || (vivos.has(e.txId) && !novos.has(e.txId)));
  const doPai = mexidos
    .filter((t) => !t.card && vivos.has(t.id) && typeOf(t.category) === "fathers")
    .map((t) => ({ id: uid(), txId: t.id, date: t.date, description: t.description, amount: r2(t.amount), balanceAfter: 0 }));
  return recalcFather({ ...d, father: [...keep, ...doPai] });
}

// ---------- projeção ----------

/** Parcelas de cada mês até o prazo da meta (a deste mês fica de fora se já foi paga). */
function parcelasNaJanela(d: Data, inicio: string, meses: number) {
  const out: { month: number; amount: number; description: string }[] = [];
  for (let i = 0; i < meses; i++) {
    const [y, m] = inicio.split("-").map(Number);
    const dt = new Date(y, m - 1 + i, 1);
    const mes = monthKey(dt);
    for (const b of d.config.bills) {
      if (!b.until || b.atSource || !billActive(b, mes) || (i === 0 && billPaid(d, b, mes))) continue;
      out.push({ month: dt.getMonth() + 1, amount: b.amount, description: b.name });
    }
  }
  return out;
}

export function projectionInput(d: Data, now = new Date()): ProjectionInput {
  const c = d.config;
  const mes = monthKey(now);
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const [gy, gm] = c.goalDeadline.split("-").map(Number);
  const remainingMonths = Math.max(1, (gy - y) * 12 + (gm - m) + 1);
  // Despesas especiais só dentro da janela (as que já passaram saem da conta).
  const inWindow = (month: number) => (gy > y ? month >= m || month <= gm : month >= m && month <= gm);
  return {
    effectiveBalance: myMoney(d),
    salary: c.salary,
    // Conta que já sai do salário não é descontada de novo.
    fixedCosts: c.bills.filter((b) => !b.atSource && !b.until).reduce((s, b) => s + b.amount, 0),
    remainingMonths,
    specialExpenses: [
      ...c.specialExpenses.filter((e) => inWindow(e.month)),
      ...parcelasNaJanela(d, monthKey(now), remainingMonths),
    ],
    goalAmount: c.goalAmount,
    startYear: y,
    startMonth: m,
    // salário do mês já caiu se você marcou ou se ele está no extrato
    skipFirstMonthSalary: c.salaryReceivedMonth === mes || d.txs.some((t) => t.category === "income_salary" && t.amount > 0 && t.date.startsWith(mes)),
    spentThisMonth: variableOf(d, mes),
    paidFixedThisMonth: c.bills.filter((b) => !b.atSource && !b.until && billPaid(d, b, mes)).reduce((s, b) => s + b.amount, 0),
    recentAvg: recentVariableAvg(d, mes),
    economyPct: c.prefs?.economyPct ?? 30,
    // CDB rende todo mês: ~21 dias úteis, já sem IR
    cdbMonthly: Math.floor(cdbPerDay(d) * 21 * (1 - cdbNet(d, now).aliquota / 100)),
  };
}

/** Os últimos n meses fechados antes de `mes` que tiveram gasto. */
function ultimosMeses(d: Data, mes: string, n: number): string[] {
  const [y, m] = mes.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => monthKey(new Date(y, m - 2 - i, 1))).filter((k) => variableOf(d, k) > 0);
}

/** Valor de uma área de agora até o prazo da meta (o que você define como padrão). */
export function setAreaFromNow(d: Data, id: string, value: number, teto: number, mes = monthKey()): Data {
  const [gy, gm] = d.config.goalDeadline.split("-").map(Number);
  let out = d;
  for (let x = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5)) - 1, 1); x <= new Date(gy, gm - 1, 1); x.setMonth(x.getMonth() + 1)) {
    out = setEnvelopeAmount(out, monthKey(x), id, value, teto);
  }
  return out;
}

/** Gasto variável seu num mês (o que o teto controla). */
const variableOf = (d: Data, month: string) =>
  -d.txs.filter((t) => t.amount < 0 && t.date.startsWith(month) && typeOf(t.category) === "variable").reduce((s, t) => s + t.amount, 0);

/** Média mensal de cada categoria nos últimos 3 meses fechados com gasto. */
export function categoryAverages(d: Data, mes = monthKey(), n = d.config.prefs?.avgMonths || 3): Record<string, number> {
  const meses = ultimosMeses(d, mes, n);
  const out: Record<string, number> = {};
  if (!meses.length) return out;
  for (const t of d.txs) {
    if (t.amount >= 0 || typeOf(t.category) !== "variable" || !meses.includes(t.date.slice(0, 7))) continue;
    out[t.category] = (out[t.category] || 0) - t.amount / meses.length;
  }
  for (const k in out) out[k] = Math.round(out[k]);
  return out;
}

/**
 * Áreas montadas pelo seu jeito de gastar: as 6 categorias em que você mais
 * gasta viram uma área cada e o resto vai para "Outros". Do mês atual até o
 * prazo, cada área recebe a sua média — se a soma passar do teto, todas
 * diminuem na mesma proporção. O que sobra do teto fica guardado.
 */
export function envelopesFromHistory(d: Data, mes = monthKey(), teto = Infinity): Data {
  const avg = Object.entries(categoryAverages(d, mes)).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = avg.reduce((s, [, v]) => s + v, 0);
  if (!total) return d;
  const top = avg.filter(([k]) => k !== "uncategorized").slice(0, d.config.prefs?.areasCount || 6);
  const valorTop = Object.fromEntries(top);
  const resto = total - top.reduce((s, [, v]) => s + v, 0);
  const envelopes: Envelope[] = [
    ...top.map(([k, v]) => ({ id: k, label: catName(k, d.config.customCats), cats: [k], share: v / total })),
    { id: "resto", label: "Outros", cats: [], share: resto / total },
  ];
  const fator = Math.min(1, teto / total);
  const plano = Object.fromEntries(envelopes.map((e) => [e.id, Math.round((e.id === "resto" ? resto : valorTop[e.id]) * fator)]));
  const overrides = Object.fromEntries(Object.entries(d.config.envelopeOverrides).filter(([k]) => k < mes));
  const [gy, gm] = d.config.goalDeadline.split("-").map(Number);
  for (let x = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5)) - 1, 1); x <= new Date(gy, gm - 1, 1); x.setMonth(x.getMonth() + 1)) {
    overrides[monthKey(x)] = { ...plano };
  }
  return { ...d, config: { ...d.config, envelopes, envelopeOverrides: overrides } };
}

/** Média dos últimos 3 meses fechados que tiveram gasto (o "seu ritmo"). */
export function recentVariableAvg(d: Data, mes = monthKey()): number {
  const vals = ultimosMeses(d, mes, d.config.prefs?.avgMonths || 3).map((k) => variableOf(d, k));
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
}

// ---------- backup ----------

export function exportBackup(d: Data): string {
  return JSON.stringify({ ...d, exportedAt: new Date().toISOString() }, null, 1);
}

/** Lê o backup. A senha do PDF (se vier) volta à parte e não entra nos dados. */
export function parseBackup(text: string): { data: Data; pdfPassword: string | null } {
  const j = JSON.parse(text);
  if (j?.version !== 1 || !Array.isArray(j.txs) || !Array.isArray(j.father) || !j.config) {
    throw new Error("Arquivo não é um backup deste app.");
  }
  const { pdfPassword, exportedAt: _e, ...rest } = j;
  return { data: withDefaults(rest), pdfPassword: typeof pdfPassword === "string" && pdfPassword ? pdfPassword : null };
}
