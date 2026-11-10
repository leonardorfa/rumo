const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmt0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const brl = (v: number) => fmt.format(v || 0);
export const brl0 = (v: number) => fmt0.format(v || 0);
/** Com sinal explícito: +R$ 10,00 / −R$ 10,00 */
export const brlSigned = (v: number) => (v >= 0 ? "+" : "−") + fmt.format(Math.abs(v));

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
  "setembro", "outubro", "novembro", "dezembro"];
export const monthName = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  const n = MONTHS[m - 1];
  return n[0].toUpperCase() + n.slice(1) + (y === new Date().getFullYear() ? "" : ` ${y}`);
};
export const shiftMonth = (key: string, delta: number) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
export const dayLabel = (iso: string) => {
  const s =
  new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
  return s[0].toUpperCase() + s.slice(1);
};
export const daysInMonth = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};

/** Hoje no fuso do aparelho (toISOString é UTC: depois das 21h já seria amanhã). */
export const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
