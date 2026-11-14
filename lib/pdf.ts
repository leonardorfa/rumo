const base = process.env.NEXT_PUBLIC_BASE_PATH || "";

export class NeedsPassword extends Error {}
export class LeituraDemorou extends Error {}

/**
 * Texto do PDF linha a linha, lido no próprio aparelho (pdf.js, sem internet
 * depois da 1ª abertura). Junta os pedaços pela altura na página, como no C6.
 */
export async function pdfToText(file: File, password?: string): Promise<string> {
  // pdf.js (versão "legacy", que roda também em iPhones mais antigos) fica em /public e é carregado
  // como módulo nativo, fora do bundle.
  const pdfjs = await import(/* webpackIgnore: true */ `${base}/pdfjs-legacy/pdf.min.mjs`);
  pdfjs.GlobalWorkerOptions.workerSrc = `${base}/pdfjs-legacy/pdf.worker.min.mjs`;
  let doc;
  try {
    // sem isso, um PDF que trava a leitura deixava o app esperando para sempre
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password, isEvalSupported: false });
    doc = await Promise.race([
      task.promise,
      new Promise<never>((_, no) => setTimeout(() => { task.destroy?.(); no(new LeituraDemorou()); }, 30000)),
    ]);
  } catch (e) {
    if ((e as Error)?.name === "PasswordException") throw new NeedsPassword();
    throw e;
  }
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const rows: { y: number; items: { x: number; s: string }[] }[] = [];
    for (const it of content.items as { str: string; transform: number[] }[]) {
      if (!it.str?.trim()) continue;
      const [, , , , x, y] = it.transform;
      let r = rows.find((r) => Math.abs(r.y - y) <= 2);
      if (!r) rows.push((r = { y, items: [] }));
      r.items.push({ x, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y).forEach((r) => lines.push(r.items.sort((a, b) => a.x - b.x).map((i) => i.s).join(" ")));
  }
  return lines.join("\n");
}
