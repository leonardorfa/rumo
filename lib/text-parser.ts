import type { ParsedTransaction } from "./types";

/**
 * Parse pasted bank data (CSV, TSV, or a copied statement table) into
 * transactions — fully local, no API. Robust to Brazilian number/date formats.
 *
 * Each line is expected to contain a date, a description, and an amount, in
 * any order and with any delimiter. We locate the date and the amount by
 * pattern and treat whatever is left as the description.
 */
export function parseStatementText(
  text: string,
  defaultYear?: number
): {
  transactions: ParsedTransaction[];
  skipped: number;
  closingBalance: number | null;
  statementDate: string | null; // data do fim do período (do saldo do dia)
} {
  const lines = text.split(/\r?\n/);
  const transactions: ParsedTransaction[] = [];
  let skipped = 0;

  // Ano vem do "Período • 11 de maio de 2026 até 10 de junho de 2026" (C6).
  // Mês depois do mês final = ano anterior (extrato que cruza a virada).
  // Melhor fonte: cada seção do C6 abre com "Maio 2025 ( 07/05/2025 - 31/05/2025 )".
  const period = periodEnd(lines);
  let sectionYear = 0;
  const yearFor = (month: number) =>
    sectionYear ||
    (period ? (month > period.month ? period.year - 1 : period.year) : defaultYear || new Date().getFullYear());

  // "Saldo do dia • 2 de julho de 2026 • R$ 8.797,01" → saldo atual da conta.
  const closingBalance = extractClosingBalance(lines);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const section = line.match(/\(\s*\d{2}\/\d{2}\/(\d{4})\s*-/);
    if (section) sectionYear = Number(section[1]);
    // Cabeçalhos, saldos diários e o resumo "Entradas: R$ … • Saídas: R$ …".
    if (
      /^(data|dia|hist[oó]rico|valor|descri|saldo|total|per[ií]odo|extrato|exportado)\b/i.test(line) ||
      /entradas:|sa[ií]das:/i.test(line) ||
      // formato novo do C6: "15/10/2026 a 14/11/2026 R$ 3.839,63" é o período e o saldo, não uma transação
      PERIODO_NOVO.test(line)
    ) {
      continue;
    }

    const date = extractDate(line, yearFor);
    const amount = extractAmount(line);
    if (!date || amount === null) {
      skipped++;
      continue;
    }

    const description = extractDescription(line, date.raw, amount.raw);
    if (!description) {
      skipped++;
      continue;
    }

    transactions.push({
      date: date.iso,
      description,
      amount: amount.value,
    });
  }

  return { transactions, skipped, closingBalance, statementDate: period?.iso ?? null };
}

/**
 * Find the statement's closing balance ("Saldo do dia / atual / final").
 * Uses the LAST such line found (most recent day in a multi-day statement).
 */
function extractClosingBalance(lines: string[]): number | null {
  // O cabeçalho do C6 ("Saldo do dia • …") é o saldo na data da exportação.
  const header = lines.find((l) => /saldo\s+do\s+dia\s*•/i.test(l));
  if (header) return extractAmount(header)?.value ?? null;
  // Formato novo do C6 (nov/2026): "Período da Exportação  Saldo no dia da exportação"
  // e, na linha de baixo, "15/10/2026 a 14/11/2026 R$ 3.839,63".
  const i = lines.findIndex((l) => /saldo\s+no\s+dia\s+da\s+exporta/i.test(l));
  if (i >= 0) {
    const prox = (lines[i + 1] ?? "").trim();
    const v = extractAmount(lines[i]) ?? (PERIODO_NOVO.test(prox) ? extractAmount(prox) : null);
    if (v) return v.value;
  }
  let last: number | null = null;
  for (const rawLine of lines) {
    if (!/saldo\s+(cont[aá]bil\s+)?(do\s+dia|atual|final|em\s+conta|dispon)/i.test(rawLine)) continue;
    const amt = extractAmount(rawLine);
    if (amt) last = amt.value;
  }
  return last;
}

const MONTHS = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho",
  "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Linha de período do formato novo do C6: "15/10/2026 a 14/11/2026 …". */
const PERIODO_NOVO = /^(\d{2})\/(\d{2})\/(\d{4})\s+a\s+(\d{2})\/(\d{2})\/(\d{4})/;

/** "… até 10 de junho de 2026" ou "15/10/2026 a 14/11/2026" → { month: 11, year: 2026, iso: "2026-11-14" } */
function periodEnd(lines: string[]): { month: number; year: number; iso: string } | null {
  const novo = lines.map((l) => l.trim().match(PERIODO_NOVO)).find(Boolean);
  if (novo) return { month: Number(novo[5]), year: Number(novo[6]), iso: `${novo[6]}-${novo[5]}-${novo[4]}` };
  const line = lines.find((l) => /per[ií]odo/i.test(l));
  const m = line
    ?.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .match(/ate\s+(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2]) + 1;
  if (!month) return null;
  const iso = `${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return { month, year: Number(m[3]), iso };
}

interface DateHit {
  iso: string;
  raw: string;
}

function extractDate(line: string, yearFor: (month: number) => number): DateHit | null {
  // ISO: 2026-06-09
  let m = line.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { iso: `${m[1]}-${m[2]}-${m[3]}`, raw: m[0] };

  // DD/MM/YYYY or DD/MM/YY
  m = line.match(/(\d{2})\/(\d{2})\/(\d{4}|\d{2})(?!\d)/);
  if (m) {
    let y = m[3];
    if (y.length === 2) y = `20${y}`;
    return { iso: `${y}-${m[2]}-${m[1]}`, raw: m[0] };
  }

  // DD/MM (no year) — infer from defaultYear.
  m = line.match(/(\d{2})\/(\d{2})(?!\/|\d)/);
  if (m) {
    return { iso: `${yearFor(Number(m[2]))}-${m[2]}-${m[1]}`, raw: m[0] };
  }

  return null;
}

interface AmountHit {
  value: number;
  raw: string;
}

/**
 * Find the monetary amount on the line. Uses the LAST money-looking token,
 * since statements put the value at the end. Handles:
 *   R$ +1.234,56  |  -1.234,56  |  1234.56  |  (1.234,56)  |  R$ 1.234,56 D
 */
function extractAmount(line: string): AmountHit | null {
  // Matches optional R$, sign (+ - − parentheses), digits with . or , groups.
  const re = /(\(?\s*)([+\-−]?)\s*R?\$?\s*(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})|\d+,\d{2}|\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2}|\d+)(\s*\)?)(\s*[DC])?/gi;

  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    // Ignore bare integers that are likely doc numbers unless they carry a
    // decimal or currency/sign marker.
    const hasDecimal = /[.,]\d{2}\b/.test(m[3]);
    const hasMarker = /R\$/i.test(m[0]) || /[+\-−]/.test(m[2]) || /[DC]/i.test(m[4] || "");
    if (!hasDecimal && !hasMarker) continue;
    last = m;
  }
  if (!last) return null;

  const numStr = last[3];
  let value = brNumberToFloat(numStr);
  if (value === null) return null;

  const sign = last[2];
  const paren = last[1].includes("(");
  const dc = (last[4] || "").trim().toUpperCase();
  if (sign === "-" || sign === "−" || paren || dc === "D") value = -Math.abs(value);
  else if (sign === "+" || dc === "C") value = Math.abs(value);
  // No explicit sign: keep as-is (positive). User can flip in the UI.

  return { value, raw: last[0] };
}

/** Convert "1.234,56" (pt-BR) or "1,234.56" (en) or "1234.56" to a float. */
function brNumberToFloat(s: string): number | null {
  let clean = s.replace(/\s/g, "");
  const hasComma = clean.includes(",");
  const hasDot = clean.includes(".");
  if (hasComma && hasDot) {
    // Last separator is the decimal one.
    if (clean.lastIndexOf(",") > clean.lastIndexOf(".")) {
      clean = clean.replace(/\./g, "").replace(",", ".");
    } else {
      clean = clean.replace(/,/g, "");
    }
  } else if (hasComma) {
    clean = clean.replace(",", ".");
  }
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : null;
}

function extractDescription(line: string, dateRaw: string, amountRaw: string): string {
  let desc = line;
  desc = desc.replace(dateRaw, " ");
  // C6 traz duas datas (lançamento e contábil): a segunda também sai.
  desc = desc.replace(/^\s*\d{2}\/\d{2}(\/\d{2,4})?\b/, " ");
  // Remove the amount only once (last occurrence).
  const idx = desc.lastIndexOf(amountRaw.trim());
  if (idx >= 0) {
    desc = desc.slice(0, idx) + " " + desc.slice(idx + amountRaw.trim().length);
  }
  // Collapse delimiters/whitespace.
  desc = desc.replace(/[;\t|]+/g, " ").replace(/\s{2,}/g, " ").trim();
  // Trim leading/trailing lone commas left by CSV splitting.
  desc = desc.replace(/^[,\s]+|[,\s]+$/g, "").trim();
  return desc;
}
