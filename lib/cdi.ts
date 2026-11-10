// CDI de cada dia, direto do Banco Central (série 12 do SGS, pública e grátis).
// Só a taxa vem da internet; nenhum dado seu sai do iPhone.
import { localDay } from "./format";
import { getData, update } from "./store";

const LAST = "cdi-fetched";
const STATUS = "cdi-status";
const br = (iso: string) => iso.split("-").reverse().join("/");
const iso = (d: string) => d.split("/").reverse().join("-");
const menos = (isoDia: string, n: number) => localDay(new Date(Date.parse(isoDia + "T12:00:00") - n * 86400000));

export interface CdiResultado { ok: boolean; msg: string }

/**
 * Lê a resposta do Banco Central. Período sem nenhum dia publicado volta 404
 * ("Value(s) not found"): isso não é erro nem falta de internet, é "nada novo".
 */
export function interpretaCdi(status: number, corpo: string): { dias: Record<string, number>; msg: string; ok: boolean } {
  if (status === 404 && /not found/i.test(corpo)) return { dias: {}, ok: true, msg: "O Banco Central ainda não publicou um dia novo. O app segue com a última taxa." };
  if (status >= 500) return { dias: {}, ok: false, msg: "O Banco Central está fora do ar agora. Tente daqui a pouco." };
  if (status !== 200) return { dias: {}, ok: false, msg: `O Banco Central recusou a consulta (erro ${status}).` };
  try {
    const rows: { data: string; valor: string }[] = JSON.parse(corpo);
    const dias = Object.fromEntries(rows.map((x) => [iso(x.data), parseFloat(x.valor)]).filter(([, v]) => Number.isFinite(v)));
    return { dias, ok: true, msg: `CDI atualizado (${Object.keys(dias).length} dias).` };
  } catch {
    return { dias: {}, ok: false, msg: "A resposta do Banco Central veio num formato inesperado." };
  }
}

/** Última tentativa de busca (para mostrar na aba CDB). */
export function cdiStatus(): { t: number; ok: boolean; msg: string } | null {
  try { return JSON.parse(localStorage.getItem(STATUS) || "null"); } catch { return null; }
}
const guarda = (r: CdiResultado) => { try { localStorage.setItem(STATUS, JSON.stringify({ t: Date.now(), ...r })); } catch { /* ok */ } return r; };

/** Busca o CDI desde a última conferência do CDB. Sem `force`, no máximo a cada 6 horas. */
export async function refreshCdi(force = false): Promise<CdiResultado> {
  const { rendaFixa, rendaFixaDate } = getData().config;
  if (!rendaFixa || !rendaFixaDate) return { ok: false, msg: "Confira o valor do CDB com o C6 primeiro: sem ele o app não sabe de onde contar." };
  try {
    if (!force && Date.now() - Number(localStorage.getItem(LAST) || 0) < 6 * 3600e3) return { ok: true, msg: "Buscado há pouco." };
  } catch {
    /* sem storage: busca mesmo assim */
  }
  // Começa uma semana antes da conferência: nunca fica um período vazio, e a última taxa vem junto.
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${br(menos(rendaFixaDate, 7))}&dataFinal=${br(localDay())}`;
  let status = 0, corpo = "";
  try {
    const r = await fetch(url);
    status = r.status;
    corpo = await r.text();
  } catch {
    return guarda({ ok: false, msg: "Sem conexão com o Banco Central. Confira a internet e tente de novo." });
  }
  const res = interpretaCdi(status, corpo);
  if (res.ok) {
    const chaves = Object.keys(res.dias).sort();
    const ultimo = chaves.length ? res.dias[chaves[chaves.length - 1]] : NaN;
    update((d) => ({
      ...d,
      config: {
        ...d.config,
        cdiDaily: { ...(d.config.cdiDaily || {}), ...res.dias }, // soma ao que já tinha, não troca
        // a anual acompanha a última taxa (usada na previsão e quando o BC ainda não publicou o dia)
        cdb: Number.isFinite(ultimo)
          ? { ...d.config.cdb, cdiAnnual: Math.round(((1 + ultimo / 100) ** 252 - 1) * 10000) / 100 }
          : d.config.cdb,
      },
    }));
    try { localStorage.setItem(LAST, String(Date.now())); } catch { /* ok */ }
  }
  return guarda({ ok: res.ok, msg: res.msg });
}
