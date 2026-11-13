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

/** Comprou mais: soma a quantidade e refaz o custo médio (média ponderada pelo que pagou). */
export function comprarCripto(d: Data, id: string, qty: number, pagoReais: number): Data {
  return { ...d, cripto: criptoOf(d).map((c) => (c.id !== id || qty <= 0 ? c : { ...c, qty: c.qty + qty, avgCost: (c.qty * c.avgCost + pagoReais) / (c.qty + qty) })) };
}
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
