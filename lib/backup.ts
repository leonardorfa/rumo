import { localDay } from "./format";
import { catName } from "./categories";
import { exportBackup, getData, parseBackup, setData } from "./store";
import type { Data } from "./types";

const PW_KEY = "pdf-password";

/** Restaura um .json de backup. Guarda a senha do PDF, se vier junto. */
export async function restoreFile(f: File, confirmReplace = true): Promise<number> {
  const { data, pdfPassword } = parseBackup(await f.text());
  if (confirmReplace && getData().txs.length && !confirm(`Substituir tudo por esse backup (${data.txs.length} transações)?`)) {
    return -1;
  }
  setData(data);
  if (pdfPassword) {
    try {
      localStorage.setItem(PW_KEY, pdfPassword);
    } catch {
      /* sem storage: só perde o atalho da senha */
    }
  }
  return data.txs.length;
}

/** No iPhone abre a folha de compartilhar ("Salvar em Arquivos"); no PC baixa. */
export async function shareFile(file: File): Promise<boolean> {
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
    else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(a.href);
    }
    return true;
  } catch {
    return false; // cancelou a folha de compartilhar
  }
}

export async function saveBackup(): Promise<boolean> {
  const d = getData();
  const ok = await shareFile(new File([exportBackup(d)], `rumo-backup-${localDay()}.json`, { type: "application/json" }));
  if (ok) setData({ ...d, lastBackup: new Date().toISOString() });
  return ok;
}

/** Planilha com tudo, no formato do Excel brasileiro (; e vírgula decimal). */
export function toCsv(d: Data): string {
  const cell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const linhas = [...d.txs]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((t) => [
      t.date.split("-").reverse().join("/"),
      t.description,
      t.amount.toFixed(2).replace(".", ","),
      catName(t.category, d.config.customCats),
      t.card ? "cartão" : t.manual ? "manual" : "extrato",
      t.note ?? "",
    ].map(cell).join(";"));
  return "﻿Data;Descrição;Valor;Categoria;Origem;Nota\n" + linhas.join("\n");
}

export const exportCsv = () =>
  shareFile(new File([toCsv(getData())], `rumo-${localDay()}.csv`, { type: "text/csv" }));
