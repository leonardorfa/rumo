// Investimentos de preço variável (cripto): custo médio, preço de agora, quanto ganhou ou perdeu.
import { localDay } from "./format";
import type { Cripto, Data } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;
const uid = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

export const criptoOf = (d: Data): Cripto[] => d.cripto ?? [];
export const precoDe = (c: Cripto) => c.price ?? c.avgCost;

/** Situação de uma posição: quanto pagou, quanto vale e o resultado. */
export function posicao(c: Cripto) {
  const investido = r2(c.qty * c.avgCost);
  const valor = r2(c.qty * precoDe(c));
  const resultado = r2(valor - investido);
  return { investido, valor, resultado, pct: investido > 0 ? Math.round((resultado / investido) * 10000) / 100 : 0, semPreco: c.price === undefined };
}

export function totais(d: Data) {
  const ps = criptoOf(d).map(posicao);
  const investido = r2(ps.reduce((s, p) => s + p.investido, 0));
  const valor = r2(ps.reduce((s, p) => s + p.valor, 0));
  const resultado = r2(valor - investido);
  return { investido, valor, resultado, pct: investido > 0 ? Math.round((resultado / investido) * 10000) / 100 : 0 };
}

export function salvarCripto(d: Data, c: Omit<Cripto, "id"> & { id?: string }): Data {
  const id = c.id || uid();
  const novo: Cripto = { ...c, id, symbol: c.symbol.trim().toUpperCase(), name: c.name.trim() || c.symbol.trim().toUpperCase() };
  const lista = criptoOf(d);
  return { ...d, cripto: lista.some((x) => x.id === id) ? lista.map((x) => (x.id === id ? { ...x, ...novo } : x)) : [...lista, novo] };
}
export const apagarCripto = (d: Data, id: string): Data => ({ ...d, cripto: criptoOf(d).filter((c) => c.id !== id) });

/** Comprou mais: soma a quantidade, refaz o custo médio (média ponderada pelo que pagou) e guarda a compra no histórico. */
export function comprarCripto(d: Data, id: string, qty: number, pagoReais: number, date = localDay()): Data {
  return { ...d, cripto: criptoOf(d).map((c) => (c.id !== id || qty <= 0 ? c : { ...c, qty: c.qty + qty, avgCost: (c.qty * c.avgCost + pagoReais) / (c.qty + qty), compras: [...(c.compras ?? []), { id: uid(), date, qty, pago: r2(pagoReais) }] })) };
}

/** Cada entrada (posição inicial e compras) com quanto vale hoje e quanto valorizou ou desvalorizou. */
export function historicoDe(c: Cripto) {
  const compras = c.compras ?? [];
  const qtdInicial = c.qty - compras.reduce((s, x) => s + x.qty, 0);
  // o custo da posição inicial é o que sobra do total pago depois de tirar as compras
  const pagoInicial = Math.max(0, c.avgCost * c.qty - compras.reduce((s, x) => s + x.pago, 0));
  const linhas = [
    ...(qtdInicial > 1e-12 ? [{ id: "ini", date: c.desde ?? "", qty: qtdInicial, pago: r2(pagoInicial) }] : []),
    ...compras,
  ];
  const p = precoDe(c);
  return linhas.map((l) => {
    const valor = r2(l.qty * p);
    return { ...l, valor, resultado: r2(valor - l.pago), pct: l.pago > 0 ? Math.round(((valor - l.pago) / l.pago) * 10000) / 100 : 0 };
  });
}

/** Moedas cujo resultado atravessou a meta de lucro (ou de perda) entre dois estados dos dados. */
export function alvosAtingidos(antes: Data, depois: Data): { id: string; symbol: string; tipo: "lucro" | "perda"; pct: number }[] {
  const out: { id: string; symbol: string; tipo: "lucro" | "perda"; pct: number }[] = [];
  for (const c of criptoOf(depois)) {
    const a = criptoOf(antes).find((x) => x.id === c.id);
    if (!a || !c.alvo) continue;
    const pa = posicao(a).pct, pd = posicao(c).pct;
    if (c.alvo.lucroPct && pa < c.alvo.lucroPct && pd >= c.alvo.lucroPct) out.push({ id: c.id, symbol: c.symbol, tipo: "lucro", pct: pd });
    if (c.alvo.perdaPct && pa > -c.alvo.perdaPct && pd <= -c.alvo.perdaPct) out.push({ id: c.id, symbol: c.symbol, tipo: "perda", pct: pd });
  }
  return out;
}
/** Moedas que estão agora acima da meta de lucro (para o aviso fixo no Início). */
export const noLucroAlvo = (d: Data) => criptoOf(d).filter((c) => c.alvo?.lucroPct && posicao(c).pct >= c.alvo.lucroPct);
/** Vendeu parte: o custo médio não muda, só a quantidade. */
export function venderCripto(d: Data, id: string, qty: number): Data {
  return { ...d, cripto: criptoOf(d).map((c) => (c.id !== id ? c : { ...c, qty: Math.max(0, c.qty - qty) })) };
}

/** Define o preço de agora e guarda o valor do dia no histórico (um ponto por dia). */
export function definirPreco(d: Data, id: string, price: number, agora = new Date()): Data {
  const dia = localDay(agora);
  return {
    ...d,
    cripto: criptoOf(d).map((c) => {
      if (c.id !== id) return c;
      const valor = r2(c.qty * price);
      return { ...c, price, priceAt: agora.toISOString(), hist: [...(c.hist ?? []).filter((h) => h.date !== dia), { date: dia, value: valor }].slice(-400) };
    }),
  };
}

/**
 * Cotação em reais pelo endpoint público da Coinbase (sem conta nem chave).
 * Só roda quando você toca em "Atualizar cotações" e só leva o símbolo (SOL, BTC…).
 */
export async function buscarPrecos(simbolos: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.all([...new Set(simbolos)].map(async (s) => {
    try {
      const r = await fetch(`https://api.coinbase.com/v2/prices/${encodeURIComponent(s)}-BRL/spot`);
      if (!r.ok) return;
      const v = Number((await r.json())?.data?.amount);
      if (Number.isFinite(v) && v > 0) out[s] = v;
    } catch { /* sem internet ou símbolo desconhecido: fica o preço anterior */ }
  }));
  return out;
}
