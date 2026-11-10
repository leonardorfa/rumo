"use client";

import { useEffect, useRef, useState } from "react";
import { aiConfig, apagarChave, limparMarkdown, perguntar, saveAiConfig, type Msg } from "@/lib/ai";
import { buildResumo } from "@/lib/resumo";
import { useData } from "@/lib/store";
import { Button, Sheet, toast } from "./ui";

const SUGESTOES = [
  "Quanto posso gastar hoje sem atrasar minhas metas?",
  "O que muda se eu gastar R$ 300 em shows este mês?",
  "Como ajusto meus aportes para a meta de longo prazo?",
  "Estou no ritmo do peso e dos treinos?",
];

/** Conversa com o Gemini usando a sua chave. Mostra o que sai antes de mandar. */
export default function Assistente({ onClose }: { onClose: () => void }) {
  const d = useData();
  const [cfg, setCfg] = useState(aiConfig);
  const [chave, setChave] = useState("");
  const [aceito, setAceito] = useState(cfg.entendi);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [txt, setTxt] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [vendo, setVendo] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);

  const resumo = cfg.enviarResumo ? buildResumo(d) : null;

  async function enviar(p: string) {
    const pergunta = p.trim();
    if (!pergunta || busy) return;
    setErro(""); setTxt(""); setBusy(true);
    const hist = msgs;
    setMsgs([...hist, { role: "user", text: pergunta }]);
    try {
      const r = await perguntar(hist, pergunta, resumo);
      setMsgs((m) => [...m, { role: "model", text: limparMarkdown(r) }]);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ---- primeira vez: chave e aviso ----
  if (!cfg.key) {
    return (
      <Sheet open onClose={onClose} title="Perguntar à IA">
        <p className="text-ink2 mb-3">O app usa o Gemini do Google com a <b>sua</b> chave, que é grátis. Leva 2 minutos:</p>
        <ol className="text-ink2 list-decimal pl-5 mb-3 flex flex-col gap-1">
          <li>Abra <b>aistudio.google.com/apikey</b> no Safari e entre com sua conta Google.</li>
          <li>Toque em <b>Create API key</b> e copie a chave.</li>
          <li>Cole aqui embaixo.</li>
        </ol>
        <div className="card p-3 mb-3 text-[13px] text-ink2">
          <b className="text-alert">O que sai do seu iPhone:</b> a sua pergunta e, se você deixar ligado, um resumo dos seus números, metas e treino. Nunca saem nome, extrato, descrição de compra, senha nem backup.
          No plano grátis o Google pode usar o que você enviar para melhorar os produtos dele, e o limite de uso não é garantido.
        </div>
        <label className="flex items-center gap-3 bg-card rounded-2xl px-4 py-3 mb-3">
          <input type="checkbox" checked={aceito} onChange={(e) => setAceito(e.target.checked)} className="!w-6 !h-6 shrink-0 accent-[var(--meu)]" />
          <span className="text-[14px]">Entendi que isso sai do aparelho.</span>
        </label>
        <input placeholder="Cole a chave aqui" value={chave} onChange={(e) => setChave(e.target.value)} className="mb-3" autoCapitalize="off" autoCorrect="off" />
        <Button tone="primary" className="w-full" disabled={!aceito || chave.trim().length < 20}
          onClick={() => { saveAiConfig({ key: chave, entendi: true }); setCfg(aiConfig()); toast("Chave guardada neste iPhone"); }}>
          Guardar e começar
        </Button>
        <p className="text-[13px] text-ink3 mt-2">A chave fica só neste aparelho e não vai para o backup. Dá para apagar em Mais, Ajustes, Assistente.</p>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title="Perguntar à IA">
      <div className="flex items-center justify-between text-[13px] text-ink3 mb-2 gap-2">
        <button className="text-link font-semibold" onClick={() => setVendo(!vendo)}>{cfg.enviarResumo ? (vendo ? "Esconder o que é enviado" : "Ver o que é enviado") : "Resumo desligado"}</button>
        <button className="text-link font-semibold" onClick={() => { saveAiConfig({ enviarResumo: !cfg.enviarResumo }); setCfg(aiConfig()); }}>
          {cfg.enviarResumo ? "Não enviar meus números" : "Enviar meus números"}
        </button>
      </div>
      {vendo && resumo && <pre className="card p-3 mb-3 text-[12px] whitespace-pre-wrap text-ink2 max-h-48 overflow-y-auto">{resumo}</pre>}

      {msgs.length === 0 && (
        <div className="flex flex-col gap-2 mb-3">
          <div className="text-[13px] text-ink3 px-1">Pergunte o que quiser sobre dinheiro, metas e treino:</div>
          {SUGESTOES.map((s) => (
            <button key={s} onClick={() => enviar(s)} className="card px-4 py-3 text-left text-[15px]">{s}</button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2 mb-3">
        {msgs.map((m, i) => (
          <div key={i} className={`rounded-2xl px-4 py-3 whitespace-pre-wrap text-[15px] ${m.role === "user" ? "bg-brand text-onbrand self-end max-w-[88%]" : "bg-card self-start max-w-[94%]"}`}>{m.text}</div>
        ))}
        {busy && <div className="bg-card rounded-2xl px-4 py-3 self-start text-ink3">Pensando…</div>}
        {erro && <div className="text-alert text-[14px] px-1">{erro}</div>}
        <div ref={fim} />
      </div>
      <div className="sticky bottom-0 bg-bg pt-2 pb-1">
        <div className="flex gap-2">
          <input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Sua pergunta" className="flex-1 min-w-0"
            onKeyDown={(e) => e.key === "Enter" && enviar(txt)} />
          <Button tone="primary" disabled={!txt.trim() || busy} onClick={() => enviar(txt)}>Enviar</Button>
        </div>
        {msgs.length > 0 && <button className="text-[13px] text-link font-semibold mt-2" onClick={() => { setMsgs([]); setErro(""); }}>Limpar conversa</button>}
      </div>
    </Sheet>
  );
}


