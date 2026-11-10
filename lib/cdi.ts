// CDI de cada dia, direto do Banco Central (série 12 do SGS, pública e grátis).
// Só a taxa vem da internet; nenhum dado seu sai do iPhone.
import { localDay } from "./format";
import { getData, update } from "./store";

const LAST = "cdi-fetched";
const br = (iso: string) => iso.split("-").reverse().join("/");
const iso = (br: string) => br.split("/").reverse().join("-");

/** Busca o CDI desde a última conferência do CDB. No máximo a cada 6 horas. */
export async function refreshCdi(force = false): Promise<boolean> {
  const { rendaFixa, rendaFixaDate } = getData().config;
  if (!rendaFixa || !rendaFixaDate) return false;
  try {
    if (!force && Date.now() - Number(localStorage.getItem(LAST) || 0) < 6 * 3600e3) return false;
  } catch {
    /* sem storage: busca mesmo assim */
  }
  try {
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${br(rendaFixaDate)}&dataFinal=${br(localDay())}`;
    const r = await fetch(url);
    if (!r.ok) return false;
    const rows: { data: string; valor: string }[] = await r.json();
    const daily = Object.fromEntries(rows.map((x) => [iso(x.data), parseFloat(x.valor)]).filter(([, v]) => Number.isFinite(v)));
    const ultimo = rows.length ? parseFloat(rows[rows.length - 1].valor) : NaN;
    update((d) => ({
      ...d,
      config: {
        ...d.config,
        cdiDaily: daily,
        // a anual acompanha a última taxa (usada na previsão e quando o BC ainda não publicou o dia)
        cdb: Number.isFinite(ultimo)
          ? { ...d.config.cdb, cdiAnnual: Math.round(((1 + ultimo / 100) ** 252 - 1) * 10000) / 100 }
          : d.config.cdb,
      },
    }));
    try {
      localStorage.setItem(LAST, String(Date.now()));
    } catch {
      /* ok */
    }
    return true;
  } catch {
    return false; // sem internet: segue com a última taxa conhecida
  }
}
