// Tudo do CDB numa conta só: série, projeção, faixa de IR e movimentações.
import { localDay } from "./format";
import { addManual, cdbNet, cdbPrincipalNow, irRate, lastCdi, rendaFixaNow } from "./store";
import type { Data } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;
const DIA = 86400000;
const addDia = (iso: string, n: number) => localDay(new Date(Date.parse(iso + "T12:00:00") + n * DIA));

/** Dias úteis por mês usados na projeção (base 252 / 12). */
const UTEIS_MES = 21;

/** Valor bruto dia a dia, da conferência até hoje (para o gráfico). */
export function cdbSerie(d: Data, now = new Date()) {
  const hoje = localDay(now);
  const ini = d.config.rendaFixaDate || (d.config.cdb.moves?.[0]?.date ?? "");
  if (!ini) return [];
  const out: { date: string; bruto: number }[] = [];
  for (let x = ini; x <= hoje && out.length < 400; x = addDia(x, 1)) {
    const wd = new Date(x + "T12:00:00").getDay();
    if (x === hoje || x === ini || (wd !== 0 && wd !== 6)) out.push({ date: x, bruto: rendaFixaNow(d, new Date(x + "T12:00:00")) });
  }
  return out;
}

/** Projeção mês a mês com a taxa de hoje e um aporte mensal opcional (no início de cada mês). */
export function cdbProjecao(d: Data, meses: number, aporte = 0, now = new Date()) {
  const pct = d.config.cdb.pctCdi / 100;
  const mensal = (1 + (lastCdi(d) / 100) * pct) ** UTEIS_MES;
  let v = rendaFixaNow(d, now);
  let principal = cdbPrincipalNow(d, now);
  const out = [{ m: 0, bruto: r2(v), principal: r2(principal) }];
  for (let m = 1; m <= meses; m++) {
    v = (v + aporte) * mensal;
    principal += aporte;
    out.push({ m, bruto: r2(v), principal: r2(principal) });
  }
  const since = d.config.cdb.since;
  const hoje = localDay(now);
  return out.map((p) => {
    // IR pela idade da aplicação naquele mês (sem data usa a alíquota mais alta)
    const dias = since ? Math.floor((Date.parse(hoje) - Date.parse(since)) / DIA) + p.m * 30 : 0;
    const aliq = since ? irRate(dias) : 22.5;
    const rend = Math.max(0, p.bruto - p.principal);
    return { ...p, liquido: r2(p.bruto - rend * (aliq / 100)), aliquota: aliq };
  });
}

/** Em quantos dias o IR cai de faixa e quanto isso vale no rendimento de hoje. */
export function proximaFaixa(d: Data, now = new Date()) {
  const { since } = d.config.cdb;
  if (!since) return null;
  const dias = Math.floor((Date.parse(localDay(now)) - Date.parse(since)) / DIA);
  const faixas = [181, 361, 721];
  const alvo = faixas.find((f) => f > dias);
  if (alvo === undefined) return { dias, aliquota: 15, ultima: true as const };
  const n = cdbNet(d, now);
  const nova = irRate(alvo);
  return { dias, aliquota: n.aliquota, ultima: false as const, em: alvo - dias, data: addDia(localDay(now), alvo - dias), nova, ganho: r2(n.rendimento * ((n.aliquota - nova) / 100)) };
}

/** Rendimento por dia útil, semana (5), mês (21) e ano (252) com a taxa de hoje, bruto e líquido. */
export function cdbRende(d: Data, now = new Date()) {
  const n = cdbNet(d, now);
  const dia = n.bruto * (lastCdi(d) / 100) * (d.config.cdb.pctCdi / 100);
  const liq = (v: number) => v * (1 - n.aliquota / 100);
  return [
    { rotulo: "Por dia útil", bruto: r2(dia), liquido: r2(liq(dia)) },
    { rotulo: "Por semana", bruto: r2(dia * 5), liquido: r2(liq(dia * 5)) },
    { rotulo: "Por mês", bruto: r2(dia * UTEIS_MES), liquido: r2(liq(dia * UTEIS_MES)) },
    { rotulo: "Em 1 ano", bruto: r2(n.bruto * ((1 + (lastCdi(d) / 100) * (d.config.cdb.pctCdi / 100)) ** 252 - 1)), liquido: 0 },
  ].map((x) => (x.rotulo === "Em 1 ano" ? { ...x, liquido: r2(liq(x.bruto)) } : x));
}

/**
 * Aplicar ou resgatar. A conta recebe/entrega `valorConta`; o CDB muda `valorCdb`.
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
