// Tudo do CDB numa conta só: série, projeção, faixa de IR e movimentações.
// Com aplicações cadastradas (uma por linha, como no C6) cada uma rende com a sua taxa e paga o seu IR.
import { localDay } from "./format";
import { addManual, cdbItens, cdbNet, cdbPrincipalNow, cdbTranches, irRate, lastCdi, rendaFixaNow, trancheValue, usaTranches } from "./store";
import type { CdbTranche, Data } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;
const DIA = 86400000;
const addDia = (iso: string, n: number) => localDay(new Date(Date.parse(iso + "T12:00:00") + n * DIA));
const uid = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
const floorCent = (n: number) => Math.floor(n * 100 + 1e-6) / 100;

/** Dias úteis por mês usados na projeção (base 252 / 12). */
const UTEIS_MES = 21;

/** Valor bruto dia a dia até hoje (para o gráfico), no máximo os últimos 150 dias. */
export function cdbSerie(d: Data, now = new Date()) {
  const hoje = localDay(now);
  const ts = cdbTranches(d);
  let ini = usaTranches(d) ? ts.reduce((m, t) => (!m || t.date < m ? t.date : m), "") : d.config.rendaFixaDate || (d.config.cdb.moves?.[0]?.date ?? "");
  if (!ini) return [];
  if (ini < addDia(hoje, -150)) ini = addDia(hoje, -150);
  const out: { date: string; bruto: number }[] = [];
  for (let x = ini; x <= hoje && out.length < 200; x = addDia(x, 1)) {
    const wd = new Date(x + "T12:00:00").getDay();
    if (x === hoje || x === ini || (wd !== 0 && wd !== 6)) out.push({ date: x, bruto: rendaFixaNow(d, new Date(x + "T12:00:00")) });
  }
  return out;
}

/** Projeção mês a mês com a taxa de hoje e um aporte mensal opcional (no início de cada mês). */
export function cdbProjecao(d: Data, meses: number, aporte = 0, now = new Date()) {
  const hoje = localDay(now);
  const cdi = lastCdi(d) / 100;
  if (usaTranches(d)) {
    const itens = cdbItens(d, now);
    const ult = [...itens].sort((a, b) => (a.t.date < b.t.date ? 1 : -1))[0];
    const pctAp = (ult?.t.pct ?? d.config.cdb.pctCdi) / 100;
    const isentoAp = !!ult?.t.isento;
    const base = itens.reduce((s, i) => s + i.t.principal, 0);
    return Array.from({ length: meses + 1 }, (_, m) => {
      let bruto = 0, ir = 0;
      for (const i of itens) {
        const v = i.value * (1 + cdi * (i.t.pct / 100)) ** (UTEIS_MES * m);
        bruto += v;
        ir += i.t.isento ? 0 : floorCent(Math.max(0, v - i.t.principal) * (irRate(i.dias + 30 * m) / 100));
      }
      for (let k = 1; k <= m; k++) { // cada aporte começa no início do mês k
        const v = aporte * (1 + cdi * pctAp) ** (UTEIS_MES * (m - k + 1));
        bruto += v;
        ir += isentoAp ? 0 : floorCent(Math.max(0, v - aporte) * (irRate(30 * (m - k + 1)) / 100));
      }
      const principal = base + aporte * m;
      return { m, bruto: r2(bruto), principal: r2(principal), liquido: r2(bruto - ir), aliquota: bruto - principal > 0 ? Math.round((ir / (bruto - principal)) * 1000) / 10 : 0 };
    });
  }
  const pct = d.config.cdb.pctCdi / 100;
  const mensal = (1 + cdi * pct) ** UTEIS_MES;
  let v = rendaFixaNow(d, now);
  let principal = cdbPrincipalNow(d, now);
  const out = [{ m: 0, bruto: r2(v), principal: r2(principal) }];
  for (let m = 1; m <= meses; m++) {
    v = (v + aporte) * mensal;
    principal += aporte;
    out.push({ m, bruto: r2(v), principal: r2(principal) });
  }
  const since = d.config.cdb.since;
  return out.map((p) => {
    const dias = since ? Math.floor((Date.parse(hoje) - Date.parse(since)) / DIA) + p.m * 30 : 0;
    const aliq = since ? irRate(dias) : 22.5;
    const rend = Math.max(0, p.bruto - p.principal);
    return { ...p, liquido: r2(p.bruto - rend * (aliq / 100)), aliquota: aliq };
  });
}

/** A próxima vez que o IR cai de faixa (entre todas as aplicações) e quanto isso vale hoje. */
export function proximaFaixa(d: Data, now = new Date()) {
  if (usaTranches(d)) {
    const itens = cdbItens(d, now);
    if (!itens.length) return null;
    const com = itens.filter((i) => i.proxima).sort((a, b) => a.proxima!.em - b.proxima!.em)[0];
    if (!com) return { dias: Math.max(...itens.map((i) => i.dias)), aliquota: Math.min(...itens.map((i) => i.aliquota)), ultima: true as const };
    return {
      dias: com.dias, aliquota: com.aliquota, ultima: false as const, em: com.proxima!.em, data: com.proxima!.data, nova: com.proxima!.nova,
      ganho: r2(com.rendimento * ((com.aliquota - com.proxima!.nova) / 100)), nome: `${com.t.name} (${com.t.date.split("-").reverse().join("/")})`,
    };
  }
  const { since } = d.config.cdb;
  if (!since) return null;
  const dias = Math.floor((Date.parse(localDay(now)) - Date.parse(since)) / DIA);
  const alvo = [181, 361, 721].find((f) => f > dias);
  if (alvo === undefined) return { dias, aliquota: 15, ultima: true as const };
  const n = cdbNet(d, now);
  const nova = irRate(alvo);
  return { dias, aliquota: n.aliquota, ultima: false as const, em: alvo - dias, data: addDia(localDay(now), alvo - dias), nova, ganho: r2(n.rendimento * ((n.aliquota - nova) / 100)), nome: "" };
}

/** Rendimento por dia útil, semana (5), mês (21) e ano (252) com a taxa de hoje, bruto e líquido. */
export function cdbRende(d: Data, now = new Date()) {
  const n = cdbNet(d, now);
  const cdi = lastCdi(d) / 100;
  const itens = usaTranches(d) ? cdbItens(d, now) : [];
  const dia = usaTranches(d) ? itens.reduce((s, i) => s + i.value * cdi * (i.t.pct / 100), 0) : n.bruto * cdi * (d.config.cdb.pctCdi / 100);
  const ano = usaTranches(d) ? itens.reduce((s, i) => s + i.value * ((1 + cdi * (i.t.pct / 100)) ** 252 - 1), 0) : n.bruto * ((1 + cdi * (d.config.cdb.pctCdi / 100)) ** 252 - 1);
  const liq = (v: number) => v * (1 - n.aliquota / 100);
  return [
    { rotulo: "Por dia útil", bruto: r2(dia), liquido: r2(liq(dia)) },
    { rotulo: "Por semana", bruto: r2(dia * 5), liquido: r2(liq(dia * 5)) },
    { rotulo: "Por mês", bruto: r2(dia * UTEIS_MES), liquido: r2(liq(dia * UTEIS_MES)) },
    { rotulo: "Em 1 ano", bruto: r2(ano), liquido: r2(liq(ano)) },
  ];
}

/**
 * Aplicar ou resgatar no modelo antigo (valor único). A conta recebe/entrega `valorConta`; o CDB muda `valorCdb`.
 * No resgate a diferença é o IR retido. O total aplicado cai na mesma proporção.
 */
export function registrarCdb(d: Data, p: { tipo: "aplicar" | "resgatar"; valorCdb: number; valorConta: number; date: string }, now = new Date()): Data {
  const aplicar = p.tipo === "aplicar";
  const bruto = rendaFixaNow(d, now);
  const principal = cdbPrincipalNow(d, now);
  const out = addManual(d, { date: p.date, description: aplicar ? "Aplicação CDB" : "Resgate CDB", amount: aplicar ? -p.valorConta : p.valorConta, category: "savings_cdb" });
  const moves = [...(out.config.cdb.moves || [])];
  const ultimo = moves[moves.length - 1];
  if (!ultimo) return out; // lançamento anterior à conferência: já está no valor conferido
  const dPrincipal = aplicar ? p.valorCdb : -r2(bruto > 0 ? principal * Math.min(1, p.valorCdb / bruto) : p.valorCdb);
  moves[moves.length - 1] = { ...ultimo, amount: aplicar ? p.valorCdb : -p.valorCdb, principal: dPrincipal };
  return { ...out, config: { ...out.config, cdb: { ...out.config.cdb, moves } } };
}

// ---------- por aplicação ----------

const troca = (d: Data, ts: CdbTranche[]): Data => ({ ...d, config: { ...d.config, cdb: { ...d.config.cdb, tranches: ts } } });
const todas = (d: Data) => d.config.cdb.tranches ?? [];
const addCheck = (d: Data, entrada: { app: number; c6: number; name: string }, now: Date): Data => ({
  ...d, config: { ...d.config, cdb: { ...d.config.cdb, checks: [...(d.config.cdb.checks ?? []), { date: localDay(now), ...entrada }].slice(-24) } },
});

/** Você conferiu uma aplicação no C6: ela recomeça do valor que o C6 mostra e a diferença fica registrada. */
export function conferirAplicacao(d: Data, id: string, valor: number, now = new Date()): Data {
  const t = todas(d).find((x) => x.id === id);
  if (!t) return d;
  const app = trancheValue(d, t, now);
  const out = troca(d, todas(d).map((x) => (x.id === id ? { ...x, checkDate: addDia(localDay(now), -1), checkValue: r2(valor) } : x)));
  return addCheck(out, { app, c6: r2(valor), name: `${t.name} ${t.date.split("-").reverse().slice(0, 2).join("/")}` }, now);
}

/** Cria ou atualiza uma aplicação. `valorAgora` (opcional) é o que o C6 mostra hoje para ela. */
export function salvarAplicacao(
  d: Data, a: { id?: string; name: string; date: string; principal: number; pct: number; due?: string; isento?: boolean; valorAgora?: number }, now = new Date(),
): Data {
  const id = a.id || uid();
  const velho = todas(d).find((x) => x.id === id);
  const base: CdbTranche = { ...(velho ?? {}), id, name: a.name.trim() || "CDB", date: a.date, principal: r2(a.principal), pct: a.pct, due: a.due || undefined, isento: a.isento || undefined };
  if (!base.due) delete base.due;
  if (!base.isento) delete base.isento;
  if (a.valorAgora !== undefined && Number.isFinite(a.valorAgora)) { base.checkDate = addDia(localDay(now), -1); base.checkValue = r2(a.valorAgora); }
  return troca(d, velho ? todas(d).map((x) => (x.id === id ? base : x)) : [...todas(d), base]);
}
export const apagarAplicacao = (d: Data, id: string): Data => troca(d, todas(d).filter((x) => x.id !== id));

/** Aplicou dinheiro: vira uma aplicação nova (e sai da conta, se saiu agora). */
export function aplicarCdb(
  d: Data, p: { name: string; date: string; valor: number; pct: number; due?: string; isento?: boolean; saiuDaConta: boolean }, now = new Date(),
): Data {
  let out = d;
  let txId: string | undefined;
  if (p.saiuDaConta) {
    out = addManual(out, { date: p.date, description: `Aplicação ${p.name}`, amount: -p.valor, category: "savings_cdb" }, { semCdb: true });
    txId = out.txs[out.txs.length - 1].id;
  }
  const t: CdbTranche = { id: uid(), name: p.name.trim() || "CDB", date: p.date, principal: r2(p.valor), pct: p.pct, ...(p.due ? { due: p.due } : {}), ...(p.isento ? { isento: true } : {}), ...(txId ? { txId } : {}) };
  void now;
  return troca(out, [...todas(out), t]);
}

/** Resgatou de uma aplicação (tudo ou parte). `liquido` é o que caiu na conta; a diferença é o IR retido. */
export function resgatarAplicacao(
  d: Data, id: string, p: { bruto: number; liquido: number; date: string; entrouNaConta: boolean }, now = new Date(),
): Data {
  const t = todas(d).find((x) => x.id === id);
  if (!t) return d;
  const v = trancheValue(d, t, now);
  const tudo = p.bruto >= v - 0.01;
  let out = d;
  if (p.entrouNaConta) out = addManual(out, { date: p.date, description: `Resgate ${t.name}`, amount: r2(p.liquido), category: "savings_cdb" }, { semCdb: true });
  const novo: CdbTranche = tudo
    ? { ...t, closed: p.date }
    : { ...t, principal: r2(t.principal * (1 - p.bruto / v)), checkDate: addDia(localDay(now), -1), checkValue: r2(v - p.bruto) };
  return troca(out, todas(out).map((x) => (x.id === id ? novo : x)));
}
