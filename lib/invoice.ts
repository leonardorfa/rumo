import type { ParsedTransaction } from "./types";

/**
 * Fatura do cartão de crédito (C6). Cada linha é uma compra, não um débito na
 * conta: o débito é o pagamento da fatura, que vem no extrato. Por isso as
 * compras entram sem mexer no saldo.
 */
export interface ParsedInvoice {
  purchases: (ParsedTransaction & { installment?: string })[];
  total: number | null;
  dueDate: string | null; // vencimento (YYYY-MM-DD)
  skipped: number;
}

const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

// Linhas de resumo, que não são compra.
const SKIP = /total da fatura|total a pagar|pagamento m[ií]nimo|limite|dispon[ií]vel|vencimento|fatura anterior|saldo anterior|resumo|demonstrativo|parcelamento|encargos previstos|pontos|d[eé]bito autom|pagamento (recebido|efetuado)|pagto recebido|^\s*data\b|^\s*descri/i;

const clean = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function parseInvoiceText(text: string, defaultYear?: number): ParsedInvoice {
  const lines = text.split(/\r?\n/);
  const purchases: ParsedInvoice["purchases"] = [];
  let skipped = 0;

  const dueDate = findDue(lines);
  const closeMonth = dueDate ? Number(dueDate.slice(5, 7)) : new Date().getMonth() + 1;
  const closeYear = dueDate ? Number(dueDate.slice(0, 4)) : defaultYear || new Date().getFullYear();
  // Compra de mês posterior ao vencimento é do ano anterior (virada de ano).
  const yearFor = (m: number) => (m > closeMonth ? closeYear - 1 : closeYear);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || SKIP.test(clean(line))) continue;

    const date = pickDate(line, yearFor);
    const amount = pickAmount(line);
    if (!date || amount === null) {
      if (date || amount !== null) skipped++;
      continue;
    }

    const inst = line.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\b/);
    let desc = line.replace(date.raw, " ").replace(amount.raw, " ");
    desc = desc.replace(/\s{2,}/g, " ").replace(/^[\s\-–|]+|[\s\-–|]+$/g, "").trim();
    if (!desc) {
      skipped++;
      continue;
    }
    purchases.push({
      date: date.iso,
      description: desc,
      // compra na fatura = saída; estorno vem com sinal negativo no PDF e vira entrada
      amount: amount.credit ? Math.abs(amount.value) : -Math.abs(amount.value),
      ...(inst ? { installment: `${inst[1]}/${inst[2]}` } : {}),
    });
  }

  return { purchases, total: findTotal(lines), dueDate, skipped };
}

function findDue(lines: string[]): string | null {
  for (const l of lines) {
    if (!/vencimento/i.test(clean(l))) continue;
    const dmy = l.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    const dmn = clean(l).match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/);
    if (dmn) {
      const m = MONTHS[dmn[2].slice(0, 3)];
      if (m) return `${dmn[3]}-${String(m).padStart(2, "0")}-${dmn[1].padStart(2, "0")}`;
    }
  }
  return null;
}

function findTotal(lines: string[]): number | null {
  const l = lines.find((x) => /total da fatura|total a pagar/i.test(clean(x)));
  return l ? pickAmount(l, true)?.value ?? null : null;
}

function pickDate(line: string, yearFor: (m: number) => number) {
  // 12/09 ou 12/09/2026
  let m = line.match(/(\d{2})\/(\d{2})(?:\/(\d{2,4}))?/);
  if (m) {
    const mm = Number(m[2]);
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : yearFor(mm);
    return { iso: `${y}-${m[2]}-${m[1]}`, raw: m[0] };
  }
  // 12 SET / 12 set 2026
  m = clean(line).match(/\b(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\w*\.?\s*(\d{4})?/);
  if (m) {
    const mm = MONTHS[m[2]];
    const y = m[3] ? Number(m[3]) : yearFor(mm);
    const idx = clean(line).indexOf(m[0]);
    return {
      iso: `${y}-${String(mm).padStart(2, "0")}-${m[1].padStart(2, "0")}`,
      raw: line.slice(idx, idx + m[0].length),
    };
  }
  return null;
}

/** Último valor monetário da linha. `credit` quando vem com sinal de menos. */
function pickAmount(line: string, anySign = false) {
  const re = /([+\-−]?)\s*R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) last = m;
  if (!last) return null;
  const value = parseFloat(last[2].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(value)) return null;
  const credit = !anySign && /[-−]/.test(last[1]);
  return { value, raw: last[0], credit };
}
