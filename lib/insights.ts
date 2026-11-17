// Análises que só leem os dados (nada aqui grava). Tudo regra simples, sem IA.
import { typeOf } from "./categories";
import { normalize, prettyName } from "./classifier";
import { daysInMonth, localDay, shiftMonth } from "./format";
import { byCategory, isMyVariableSpend, ofMonth, variableSpend } from "./stats";
import { billActive, billDay, billPaid, cardDebt, cdbNet, invoiceOpen, parcela, fatherBalance, monthKey, myMoney } from "./store";
import type { Bill, Data, Tx } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;
const dayOf = (iso: string) => Number(iso.slice(8, 10));
const billKey = (b: Bill) => normalize(b.match || b.name);
const matches = (b: Bill, t: Tx) => {
  const k = billKey(b);
  return !!k && t.amount < 0 && normalize(t.description).includes(k);
};
export { billDay, billPaid };
const newest = (txs: Tx[]) => [...txs].sort((a, z) => (a.date < z.date ? 1 : -1))[0];

/** Dinheiro seu que está na conta (o crédito do pai não conta; dívida dele não está na conta). */
export const mineInAccount = (d: Data) => d.config.accountBalance - Math.max(0, fatherBalance(d));


/** Dia do salário pelo último que caiu, senão dia 5. */
export function payday(d: Data): number {
  if (d.config.prefs?.payday) return d.config.prefs.payday;
  const last = newest(d.txs.filter((t) => t.category === "income_salary" && t.amount > 0));
  return last ? dayOf(last.date) : 5;
}

const salaryIn = (d: Data, month: string) =>
  d.config.salaryReceivedMonth === month || ofMonth(d.txs, month).some((t) => t.category === "income_salary" && t.amount > 0);

// ---------- quanto dá para gastar ----------

/**
 * O menor entre o que sobra do teto e o que você tem de fato na conta depois
 * das contas fixas que ainda vão sair no mês. Não adianta o teto dizer 800 se
 * na conta só tem 300.
 */
export function safeToSpend(d: Data, teto: number, now = new Date()) {
  const month = monthKey(now);
  const sobraTeto = teto - variableSpend(ofMonth(d.txs, month));
  const aPagar = d.config.bills.filter((b) => !b.atSource && billActive(b, month) && !billPaid(d, b, month)).reduce((s, b) => s + b.amount, 0);
  const naConta = mineInAccount(d) - aPagar - cardDebt(d); // fatura a pagar também sai da conta
  const livre = Math.max(0, Math.min(sobraTeto, naConta));
  const dias = daysInMonth(month) - now.getDate() + 1;
  return { livre: r2(livre), porDia: r2(livre / dias), dias, aPagar: r2(aPagar), pelaConta: naConta < sobraTeto };
}

// ---------- categorias com comparação ----------

export function categoryTable(txs: Tx[], month: string) {
  const prev = new Map(byCategory(ofMonth(txs, shiftMonth(month, -1))).map((c) => [c.key, c.value]));
  return byCategory(ofMonth(txs, month)).map((c) => ({ ...c, prev: prev.get(c.key) ?? 0 }));
}

// ---------- recorrências ----------

export interface Recurring { key: string; name: string; amount: number; day: number; months: number }

/**
 * Parece conta fixa: mesmo nome em 2+ meses dos últimos 4, valor estável
 * (variação até 25%) e no máximo ~1 por mês. Uber toda semana não entra.
 */
export function recurringSuggestions(d: Data, now = monthKey()): Recurring[] {
  const janela = [0, 1, 2, 3].map((i) => shiftMonth(now, -i));
  const grupos = new Map<string, Tx[]>();
  for (const t of d.txs) {
    const tipo = typeOf(t.category);
    if (t.amount >= 0 || !janela.includes(t.date.slice(0, 7)) || (tipo !== "variable" && tipo !== "fixed")) continue;
    const k = normalize(t.description);
    if (k) grupos.set(k, [...(grupos.get(k) || []), t]);
  }
  const jaSao = d.config.bills.map(billKey).filter(Boolean);
  const out: Recurring[] = [];
  for (const [key, list] of grupos) {
    const meses = new Set(list.map((t) => t.date.slice(0, 7))).size;
    const vals = list.map((t) => -t.amount);
    if (meses < 2 || list.length > meses * 1.5) continue;
    if (Math.max(...vals) > Math.min(...vals) * 1.25) continue;
    if (jaSao.some((b) => key.includes(b) || b.includes(key)) || d.config.dismissedRecurring.includes(key)) continue;
    const last = newest(list);
    out.push({ key, name: prettyName(last.description), amount: r2(-last.amount), day: dayOf(last.date), months: meses });
  }
  return out.sort((a, z) => z.amount - a.amount);
}

/** Conta fixa cujo último pagamento veio com valor diferente do cadastrado. */
export function priceChanges(d: Data, now = monthKey()) {
  const recentes = [now, shiftMonth(now, -1)];
  return d.config.bills.filter((b) => !b.until).flatMap((b) => {
    const last = newest(d.txs.filter((t) => matches(b, t) && recentes.includes(t.date.slice(0, 7))));
    const recusado = last && (d.config.dismissedPrices ?? []).includes(`${b.id}:${r2(-last.amount)}`);
    return last && !recusado && Math.abs(-last.amount - b.amount) >= 0.5 ? [{ bill: b, novo: r2(-last.amount) }] : [];
  });
}

// ---------- próximos 30 dias ----------


export interface ForecastEvent { date: string; label: string; amount: number }

/**
 * Seu dinheiro na conta dia a dia: gasto variável no ritmo do teto, contas
 * fixas no dia em que costumam sair e salário no dia em que costuma cair.
 */
export function forecast30(d: Data, teto: number, now = new Date()) {
  const mesAtual = monthKey(now);
  const sobraTeto = Math.max(0, teto - variableSpend(ofMonth(d.txs, mesAtual)));
  const diasRestantes = daysInMonth(mesAtual) - now.getDate() + 1;
  const events: ForecastEvent[] = [];
  const points: { date: string; label: string; value: number }[] = [];
  let saldo = mineInAccount(d);
  // fatura vencida que o extrato ainda não mostrou paga: conta já hoje
  if (d.config.prefs?.countInvoices) for (const inv of d.config.invoices || []) if (inv.due <= localDay(now)) saldo -= invoiceOpen(d, inv);
  const pd = payday(d);

  for (let i = 0; i <= 30; i++) {
    const dia = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const iso = localDay(dia);
    const mes = iso.slice(0, 7);
    const n = dia.getDate();
    const ultimo = daysInMonth(mes);
    const noDia = (alvo: number) => n === Math.min(alvo, ultimo);
    if (i > 0) {
      saldo -= mes === mesAtual ? sobraTeto / diasRestantes : teto / ultimo;
      for (const b of d.config.bills) {
        if (b.atSource || !billActive(b, mes) || !noDia(billDay(d, b)) || billPaid(d, b, mes)) continue;
        saldo -= b.amount;
        const p = parcela(b, mes);
        events.push({ date: iso, label: p ? `${b.name} (${p.n}/${p.total})` : b.name, amount: -b.amount });
      }
      for (const inv of d.config.prefs?.countInvoices ? d.config.invoices || [] : []) {
        const falta = invoiceOpen(d, inv);
        if (inv.due === iso && falta > 0) {
          saldo -= falta;
          events.push({ date: iso, label: "Fatura do cartão", amount: -falta });
        }
      }
      if (noDia(pd) && !salaryIn(d, mes)) {
        saldo += d.config.salary;
        events.push({ date: iso, label: "Salário", amount: d.config.salary });
      }
      if (n === 1) {
        for (const e of d.config.specialExpenses.filter((x) => x.month === dia.getMonth() + 1)) {
          saldo -= e.amount;
          events.push({ date: iso, label: e.description, amount: -e.amount });
        }
      }
    }
    points.push({ date: iso, label: `${n}/${dia.getMonth() + 1}`, value: Math.round(saldo) });
  }
  const menor = points.reduce((m, p) => (p.value < m.value ? p : m), points[0]);
  return { points, events, menor, payday: pd };
}

// ---------- evolução do patrimônio ----------

/**
 * "Meu dinheiro" no fim de cada mês, refeito de trás para frente a partir de
 * hoje: tira da conta o que entrou/saiu depois. O CDB é aproximado (não
 * desconta o rendimento do período).
 */
export function netWorthHistory(d: Data, meses = 6, now = new Date()) {
  const atual = monthKey(now);
  const primeiro = d.txs.reduce((m, t) => (!m || t.date < m ? t.date : m), "").slice(0, 7) || atual;
  const out: { month: string; value: number }[] = [];
  for (let i = meses - 1; i >= 1; i--) {
    const m = shiftMonth(atual, -i);
    if (m < primeiro) continue;
    const fim = `${m}-31`;
    const depois = d.txs.filter((t) => !t.card && t.date > fim);
    const conta = d.config.accountBalance - depois.reduce((s, t) => s + t.amount, 0);
    const cdb = cdbNet(d, now).liquido + depois.filter((t) => typeOf(t.category) === "savings").reduce((s, t) => s + t.amount, 0);
    const entradas = d.father.filter((e) => e.date <= fim);
    const pai = entradas.length ? entradas[entradas.length - 1].balanceAfter : d.config.fatherCreditStart;
    out.push({ month: m, value: Math.round(conta - pai + cdb) });
  }
  out.push({ month: atual, value: Math.round(myMoney(d)) });
  return out;
}

// ---------- saúde financeira ----------

/** Quantos meses você se mantém com o seu dinheiro, no seu custo de hoje. */
export function runway(d: Data, now = new Date()) {
  const atual = monthKey(now);
  const n = d.config.prefs?.avgMonths || 3;
  const ultimos = Array.from({ length: n }, (_, i) => ofMonth(d.txs, shiftMonth(atual, -i - 1))).filter((m) => m.some(isMyVariableSpend));
  const variavel = ultimos.length ? ultimos.reduce((s, m) => s + variableSpend(m), 0) / ultimos.length : 0;
  const fixas = d.config.bills.filter((b) => billActive(b, atual)).reduce((s, b) => s + b.amount, 0);
  const custo = variavel + fixas;
  return { custo: r2(custo), meses: custo > 0 ? Math.round((myMoney(d) / custo) * 10) / 10 : null };
}

/** Quanto da sua renda do mês sobrou (entradas suas − gastos seus). */
export function savingsRate(txs: Tx[], month: string) {
  const doMes = ofMonth(txs, month);
  const renda = doMes.filter((t) => t.amount > 0 && typeOf(t.category) === "income").reduce((s, t) => s + t.amount, 0);
  const gasto = -doMes.filter((t) => t.amount < 0 && ["variable", "fixed"].includes(typeOf(t.category))).reduce((s, t) => s + t.amount, 0);
  return { renda: r2(renda), gasto: r2(gasto), pct: renda > 0 ? Math.round(((renda - gasto) / renda) * 100) : null };
}

/** Categorias mais usadas (para os atalhos da revisão), pelo sinal do valor. */
export function topCategories(txs: Tx[], sign: 1 | -1, n = 6) {
  const conta = new Map<string, number>();
  for (const t of txs) {
    if (t.review || t.category === "uncategorized" || Math.sign(t.amount) !== sign) continue;
    conta.set(t.category, (conta.get(t.category) || 0) + 1);
  }
  return [...conta.entries()].sort((a, z) => z[1] - a[1]).slice(0, n).map(([k]) => k);
}
