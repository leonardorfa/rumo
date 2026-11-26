"use client";

import { useState } from "react";
import { apagarCoisa, coisasOf, equivalente, fmtPeso, salvarCoisa } from "@/lib/pesos";
import { act, Button, Card, Progress, Sheet } from "./ui";
import { useData } from "@/lib/store";

/** "≈ 1,4 hipopótamo 🦛" numa linha, para listas e para a janela do treino. */
export function LinhaEquivalencia({ kg, className = "" }: { kg: number; className?: string }) {
  const d = useData();
  const e = equivalente(coisasOf(d), kg);
  if (!e.coisa) return null;
  return <span className={className}>≈ {e.frase} <span aria-hidden>{e.coisa.emoji}</span></span>;
}

/** Cartão com o peso, o desenho da coisa equivalente (repetido) e o caminho até a próxima. */
export function Equivalencia({ titulo, kg }: { titulo: string; kg: number }) {
  const d = useData();
  const e = equivalente(coisasOf(d), kg);
  const inteiras = e.coisa ? Math.max(1, Math.floor(e.qtd)) : 0;
  const mostradas = Math.min(inteiras, 6);
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-ink2">{titulo}</span>
        <span className="num text-[24px] font-bold">{fmtPeso(kg)}</span>
      </div>
      {e.coisa ? (
        <>
          <div className="flex flex-wrap items-end justify-center gap-1 my-2" role="img" aria-label={`Equivale a ${e.frase}`}>
            {Array.from({ length: mostradas }, (_, i) => (
              <span key={i} className="leading-none" style={{ fontSize: mostradas === 1 ? 84 : mostradas <= 3 ? 60 : 42, filter: "drop-shadow(0 0 14px color-mix(in srgb, var(--s1) 55%, transparent))" }}>{e.coisa!.emoji}</span>
            ))}
            {inteiras > mostradas && <span className="text-ink3 text-[14px] self-center">+{inteiras - mostradas}</span>}
          </div>
          <div className="text-center text-[15px]">Esse peso é o equivalente a <b>{e.frase}</b>.</div>
        </>
      ) : (
        <div className="text-center text-[14px] text-ink3 my-2">{kg > 0 ? "Quase lá." : "Anote uma série com carga para comparar."}</div>
      )}
      {e.prox && kg > 0 && (
        <div className="mt-3">
          <Progress value={kg} max={e.prox.kg} color="var(--s1)" />
          <div className="text-[12px] text-ink3 mt-1">Faltam {fmtPeso(e.falta)} para 1 {e.prox.nome} {e.prox.emoji}</div>
        </div>
      )}
    </Card>
  );
}

/** As comparações são suas: dá para criar outras (e apagar as que criou). */
export function MinhasComparacoes() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button onClick={() => setAberto(true)} className="text-link text-[14px] font-semibold px-1 mt-2">Minhas comparações ›</button>
      {aberto && <ComparacoesSheet onClose={() => setAberto(false)} />}
    </>
  );
}

function ComparacoesSheet({ onClose }: { onClose: () => void }) {
  const d = useData();
  const minhas = d.fit?.coisas ?? [];
  const [nome, setNome] = useState("");
  const [plural, setPlural] = useState("");
  const [emoji, setEmoji] = useState("🏋️");
  const [peso, setPeso] = useState("");
  const kg = parseFloat(peso.replace(/\./g, "").replace(",", "."));
  const ok = nome.trim() && kg > 0;
  return (
    <Sheet open onClose={onClose} title="Minhas comparações">
      {minhas.length > 0 && (
        <div className="card px-4 mb-3">
          {minhas.map((c, i) => (
            <div key={c.nome} className={`flex items-center gap-3 py-2.5 ${i ? "border-t border-line" : ""}`}>
              <span className="text-[24px]" aria-hidden>{c.emoji}</span>
              <span className="flex-1 min-w-0 truncate">{c.nome}</span>
              <span className="text-ink3 text-[13px]">{fmtPeso(c.kg)}</span>
              <button className="text-ink3 px-1" aria-label={`Apagar ${c.nome}`} onClick={() => act("Apagado", (dd) => apagarCoisa(dd, c.nome))}>×</button>
            </div>
          ))}
        </div>
      )}
      <label className="block mb-2"><span className="block text-[13px] text-ink3 px-1 mb-1">Nome</span>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: moto" /></label>
      <label className="block mb-2"><span className="block text-[13px] text-ink3 px-1 mb-1">Plural (opcional)</span>
        <input value={plural} onChange={(e) => setPlural(e.target.value)} placeholder="Ex.: motos" /></label>
      <div className="grid grid-cols-[96px_1fr] gap-2 mb-3">
        <label className="block min-w-0"><span className="block text-[13px] text-ink3 px-1 mb-1">Desenho</span>
          <input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="text-center" aria-label="Emoji" /></label>
        <label className="block min-w-0"><span className="block text-[13px] text-ink3 px-1 mb-1">Quanto pesa (kg)</span>
          <input inputMode="decimal" className="num" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="150" /></label>
      </div>
      <Button tone="primary" className="w-full" disabled={!ok} onClick={() => {
        act("Comparação salva", (dd) => salvarCoisa(dd, { nome: nome.trim(), plural: plural.trim() || nome.trim(), emoji: emoji.trim() || "🏋️", kg }));
        setNome(""); setPlural(""); setPeso("");
      }}>Adicionar</Button>
    </Sheet>
  );
}
