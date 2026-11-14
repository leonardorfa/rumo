const base = process.env.NEXT_PUBLIC_BASE_PATH || "";

export class NeedsPassword extends Error {}
export class LeituraDemorou extends Error {}
/** Em que passo a leitura está (ou parou): aparece no aviso quando algo dá errado. */
export let etapaPdf = "";
const etapa = (s: string) => { etapaPdf = s; };

/**
 * Texto do PDF linha a linha, lido no próprio aparelho (pdf.js, sem internet
 * depois da 1ª abertura). Junta os pedaços pela altura na página, como no C6.
 */
export function pdfToText(file: File, password?: string): Promise<string> {
  // trava em qualquer passo (inclusive ao baixar o arquivo do iCloud) vira um aviso em vez de espera infinita
  return Promise.race([lerPdf(file, password), new Promise<never>((_, no) => setTimeout(() => no(new LeituraDemorou()), 45000))]);
}

async function lerPdf(file: File, password?: string): Promise<string> {
  // pdf.js (versão "legacy", que roda também em iPhones mais antigos) fica em /public e é carregado
  // como módulo nativo, fora do bundle.
  etapa("lendo o arquivo");
  const bytes = new Uint8Array(await file.arrayBuffer());
  etapa("abrindo o leitor de PDF");
  const pdfjs = await import(/* webpackIgnore: true */ `${base}/pdfjs-legacy/pdf.min.mjs`);
  pdfjs.GlobalWorkerOptions.workerSrc = `${base}/pdfjs-legacy/pdf.worker.min.mjs`;
  let doc;
  try {
    // sem isso, um PDF que trava a leitura deixava o app esperando para sempre
    etapa("abrindo o PDF");
    const task = pdfjs.getDocument({ data: bytes, password, isEvalSupported: false });
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
    etapa(`lendo a página ${p} de ${doc.numPages}`);
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
