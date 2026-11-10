// Assistente com a sua chave grátis do Gemini. A chave fica só neste aparelho (fora do backup).
// Sai pela internet: a sua pergunta e, se você deixar ligado, o resumo de números de buildResumo().
const K = { key: "rumo-gemini-key", model: "rumo-gemini-model", resumo: "rumo-gemini-resumo", ok: "rumo-gemini-ok" };
export const MODELO_PADRAO = "gemini-3.8-flash";

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sem storage */ } };

export const aiConfig = () => ({
  key: get(K.key) ?? "",
  model: get(K.model) || MODELO_PADRAO,
  enviarResumo: get(K.resumo) !== "0",
  entendi: get(K.ok) === "1", // leu o aviso de que o texto sai do aparelho
});
export const saveAiConfig = (p: Partial<{ key: string; model: string; enviarResumo: boolean; entendi: boolean }>) => {
  if (p.key !== undefined) put(K.key, p.key.trim() || null);
  if (p.model !== undefined) put(K.model, p.model.trim() || null);
  if (p.enviarResumo !== undefined) put(K.resumo, p.enviarResumo ? "1" : "0");
  if (p.entendi !== undefined) put(K.ok, p.entendi ? "1" : null);
};
export const apagarChave = () => put(K.key, null);
export const chaveMascarada = (k: string) => (k.length > 8 ? `••••${k.slice(-4)}` : k ? "••••" : "");

const SISTEMA = [
  "Você é o assistente do app Rumo, que junta dinheiro, metas e treino de um jovem brasileiro.",
  "Responda em português do Brasil, direto, sem introdução e sem repetir a pergunta.",
  "Comece toda frase com letra maiúscula. Não use travessão como pausa.",
  "Use somente os dados do bloco DADOS quando houver; se faltar um dado, diga qual falta em vez de inventar.",
  "Mostre as contas que fizer (valores em reais, prazos em meses). Se a resposta for não vai dar certo, diga isso na primeira frase.",
  "Não recomende produto financeiro específico nem prometa retorno. Para treino e dieta, dê orientação geral e lembre de um profissional só quando houver risco.",
  "Respostas curtas: no máximo 8 linhas, listas só quando ajudarem.",
].join(" ");

export type Msg = { role: "user" | "model"; text: string };

export async function perguntar(historico: Msg[], pergunta: string, resumo: string | null): Promise<string> {
  const { key, model } = aiConfig();
  if (!key) throw new Error("Falta a chave do Gemini.");
  const contents = [
    ...(resumo ? [{ role: "user", parts: [{ text: `DADOS (do app, de hoje):\n${resumo}` }] }, { role: "model", parts: [{ text: "Entendi os dados." }] }] : []),
    ...historico.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    { role: "user", parts: [{ text: pergunta }] },
  ];
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 40000);
  let r: Response;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SISTEMA }] }, contents, generationConfig: { temperature: 0.4, maxOutputTokens: 1200 } }),
      signal: ctl.signal,
    });
  } catch {
    throw new Error("Sem conexão com o Gemini. Confira a internet e tente de novo.");
  } finally {
    clearTimeout(timer);
  }
  if (!r.ok) throw new Error(erroAmigavel(r.status, await r.text().catch(() => "")));
  const j = await r.json();
  const txt = (j?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("").trim();
  if (!txt) throw new Error(j?.promptFeedback?.blockReason ? "O Gemini recusou essa pergunta. Reescreva de outro jeito." : "O Gemini não respondeu. Tente de novo.");
  return txt;
}

export function erroAmigavel(status: number, corpo: string): string {
  if (status === 400 && /API key/i.test(corpo)) return "A chave não foi aceita. Copie de novo em aistudio.google.com/apikey.";
  if (status === 401 || status === 403) return "A chave não tem permissão. Crie uma nova em aistudio.google.com/apikey.";
  if (status === 404) return "Esse modelo não existe mais. Troque o modelo em Mais, Ajustes, Assistente.";
  if (status === 429) return "O limite grátis acabou por agora. Espere alguns minutos, ou até amanhã, e tente de novo.";
  if (status >= 500) return "O Gemini está fora do ar agora. Tente daqui a pouco.";
  return `O Gemini devolveu erro ${status}.`;
}

/** **negrito** e listas simples do Gemini viram texto limpo. */
export const limparMarkdown = (t: string) =>
  t.replace(/^\s*[*-]\s+/gm, "• ").replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#+\s*/gm, "").replace(/`/g, "");
