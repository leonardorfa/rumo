import { typeOf } from "./categories";
import { daysInMonth } from "./format";
import { envelopeBudgets, monthKey } from "./store";
import type { Data, Tx } from "./types";

export const ofMonth = (txs: Tx[], month: string) => txs.filter((t) => t.date.startsWith(month));

/** Mês mais recente com transação, sem passar do mês atual. */
export function latestMonth(d: Data): string {
  const now = monthKey();
  const last = d.txs.reduce((m, t) => (t.date.slice(0, 7) > m && t.date.slice(0, 7) <= now ? t.date.slice(0, 7) : m), "");
  return last || now;
}

/** Gasto variável seu (o que o teto controla): saídas, sem fixos, pai, repasse ou CDB. */
export const isMyVariableSpend = (t: Tx) => t.amount < 0 && typeOf(t.category) === "variable";
export const variableSpend = (txs: Tx[]) => txs.filter(isMyVariableSpend).reduce((s, t) => s - t.amount, 0);

export function byCategory(txs: Tx[]) {
  const sums = new Map<string, number>();
  for (const t of txs.filter(isMyVariableSpend)) sums.set(t.category, (sums.get(t.category) || 0) - t.amount);
  return [...sums.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
}

/** Gasto acumulado dia a dia (este mês e o anterior no mesmo eixo de dias). */
export function cumulative(txs: Tx[], month: string, prevMonth: string, uptoToday: boolean) {
  const days = Math.max(daysInMonth(month), daysInMonth(prevMonth));
  const perDay = (m: string) => {
    const a = new Array(days + 1).fill(0);
    for (const t of ofMonth(txs, m)) if (isMyVariableSpend(t)) a[Number(t.date.slice(8, 10))] -= t.amount;
    return a;
  };
  const cur = perDay(month), prev = perDay(prevMonth);
  const lastDay = uptoToday ? new Date().getDate() : daysInMonth(month);
  let c = 0, p = 0;
  return Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    c += cur[day];
    p += prev[day];
    return { day, atual: day <= lastDay ? Math.round(c) : null, anterior: day <= daysInMonth(prevMonth) ? Math.round(p) : null };
  });
}

/** Envelopes do teto: quanto tem e quanto já foi gasto em cada um, no mês. */
export function envelopes(d: Data, month: string, teto: number) {
  const monthTxs = ofMonth(d.txs, month);
  const budgets = envelopeBudgets(d, month, teto);
  const named = d.config.envelopes.flatMap((e) => e.cats);
  return d.config.envelopes.map((e) => ({
    id: e.id,
    label: e.label,
    budget: budgets[e.id] ?? 0,
    // envelope sem categorias fica com tudo que não pertence a outro
    spent: monthTxs
      .filter((t) => isMyVariableSpend(t) && (e.cats.length ? e.cats.includes(t.category) : !named.includes(t.category)))
      .reduce((s, t) => s - t.amount, 0),
  }));
}

/** Dinheiro do pai que passou pela conta no mês. */
export function fatherFlow(monthTxs: Tx[]) {
  const sum = (f: (t: Tx) => boolean) => monthTxs.filter(f).reduce((s, t) => s + t.amount, 0);
  const entrou = sum((t) => t.category === "income_fathers" && t.amount > 0);
  const saiu = -sum((t) => t.category === "fathers_expense" && t.amount < 0);
  const repasse = sum((t) => t.category === "passthrough");
  return { entrou, saiu, repasse, sobrou: entrou - saiu + repasse };
}

/** Entradas e saídas (suas, sem pai, repasse nem CDB) acumuladas dia a dia no mês, para o fluxo de caixa. */
export function fluxoDoMes(txs: Tx[], month: string, uptoToday: boolean) {
  const n = daysInMonth(month);
  const ent = new Array(n + 1).fill(0), sai = new Array(n + 1).fill(0);
  for (const t of ofMonth(txs, month)) {
    const tp = typeOf(t.category);
    const dia = Number(t.date.slice(8, 10));
    if (t.amount > 0 && tp === "income") ent[dia] += t.amount;
    if (t.amount < 0 && (tp === "variable" || tp === "fixed")) sai[dia] -= t.amount;
  }
  const ultimo = uptoToday ? new Date().getDate() : n;
  let e = 0, s = 0;
  const dias = Array.from({ length: ultimo }, (_, i) => { e += ent[i + 1]; s += sai[i + 1]; return { day: i + 1, entradas: Math.round(e), saidas: Math.round(s) }; });
  return { dias, entradas: e, saidas: s, sobra: e - s };
}
