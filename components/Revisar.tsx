"use client";

import { useRef, useState } from "react";
import { catIcon, catName } from "@/lib/categories";
import { normalize, prettyName } from "@/lib/classifier";
import { dayLabel } from "@/lib/format";
import { topCategories } from "@/lib/insights";
import { confirmTx, recategorize, useData } from "@/lib/store";
import type { Tx } from "@/lib/types";
import { CategoryGrid, TxSheet } from "./Tx";
import { act, Button, Money, Sheet } from "./ui";

/**
 * Revisão uma por vez, estilo cartas: arrasta para a direita = está certo,
 * para a esquerda = pula. Escolher categoria ensina o app e já resolve as
 * iguais que estavam na fila.
 */
export default function Revisar({ onClose }: { onClose: () => void }) {
  const d = useData();
  const customs = d.config.customCats;
  const [pulei, setPulei] = useState<string[]>([]);
  const [grade, setGrade] = useState(false);
  const [mais, setMais] = useState<Tx | null>(null);
  const [dx, setDx] = useState(0);
  const inicio = useRef<number | null>(null);

  const fila = d.txs.filter((t) => t.review).sort((a, b) => (a.date < b.date ? 1 : -1));
  const resta = fila.filter((t) => !pulei.includes(t.id));
  const t = resta[0];
  const iguais = t ? fila.filter((x) => x.id !== t.id && normalize(x.description) === normalize(t.description)).length : 0;

  function escolher(cat: string) {
    if (!t) return;
    let n = 0;
    act(() => `${prettyName(t.description)} → ${catName(cat, customs)}${n ? ` (+${n} iguais)` : ""}`, (dd) => {
      const r = recategorize(dd, t.id, cat, true);
      n = r.applied;
      return r.data;
    });
    setGrade(false);
  }
  const certo = () => {
    if (!t) return;
    if (t.category === "uncategorized") return setGrade(true);
    act("Confirmada", (dd) => confirmTx(dd, t.id));
  };
  const pular = () => t && setPulei([...pulei, t.id]);

  const soltar = () => {
    if (dx > 90) certo();
    else if (dx < -90) pular();
    setDx(0);
    inicio.current = null;
  };

  if (!t) {
    return (
      <Sheet open onClose={onClose} title="Revisar">
        <div className="text-center py-10">
          <div className="text-5xl mb-3" aria-hidden>🎉</div>
          <div className="text-[20px] font-semibold">{fila.length ? "Só sobraram as que você pulou" : "Tudo revisado"}</div>
          <p className="text-ink2 mt-1">{fila.length ? `${fila.length} continuam no Extrato → Revisar.` : "O app aprendeu com cada escolha."}</p>
          {fila.length > 0 && <Button className="mt-4" onClick={() => setPulei([])}>Ver as puladas de novo</Button>}
        </div>
      </Sheet>
    );
  }

  const sugestao = t.category !== "uncategorized" ? t.category : null;
  const atalhos = [...new Set([...(sugestao ? [sugestao] : []), ...topCategories(d.txs, t.amount < 0 ? -1 : 1)])].slice(0, 6);

  return (
    <Sheet open onClose={onClose} title={`Revisar · ${fila.length - resta.length + 1} de ${fila.length}`}>
      <div
        className="card p-5 mb-4 select-none touch-pan-y"
        style={{ transform: `translateX(${dx}px) rotate(${dx / 25}deg)`, transition: inicio.current === null ? "transform .2s" : "none" }}
        onPointerDown={(e) => { inicio.current = e.clientX; }}
        onPointerMove={(e) => inicio.current !== null && setDx(e.clientX - inicio.current)}
        onPointerUp={soltar}
        onPointerCancel={() => { setDx(0); inicio.current = null; }}
      >
        <div className="flex justify-between text-[13px] font-semibold h-5">
          <span className="text-ink3" style={{ opacity: Math.max(0, -dx / 90) }}>← pular</span>
          <span className="text-ok" style={{ opacity: Math.max(0, dx / 90) }}>está certo →</span>
        </div>
        <Money v={t.amount} signed className={`block text-[34px] font-bold ${t.amount > 0 ? "text-ok" : ""}`} />
        <div className="text-[19px] font-semibold mt-1">{prettyName(t.description)}</div>
        <div className="text-[13px] text-ink3 mt-1 break-words">{t.description}</div>
        <div className="text-[13px] text-ink3 mt-1">
          {dayLabel(t.date)}{t.card ? " · cartão" : ""}{iguais ? ` · +${iguais} iguais na fila` : ""}
        </div>
        {sugestao && (
          <div className="mt-3 inline-flex items-center gap-1.5 bg-fill rounded-full px-3 py-1 text-[14px]">
            <span aria-hidden>{catIcon(sugestao, customs)}</span> O app acha que é {catName(sugestao, customs)}
          </div>
        )}
      </div>

      {grade ? (
        <CategoryGrid customs={customs} current={t.category} onPick={escolher} />
      ) : (
        <>
          <div className="text-[13px] text-ink3 px-1 mb-1.5">É o quê?</div>
          <div className="grid grid-cols-3 gap-2 mb-2">
            {atalhos.map((k) => (
              <button key={k} onClick={() => escolher(k)}
                className={`rounded-xl px-2 py-2.5 text-[13px] leading-tight flex flex-col items-center gap-1 ${k === sugestao ? "bg-brand text-onbrand" : "bg-card"}`}>
                <span className="text-xl" aria-hidden>{catIcon(k, customs)}</span>
                {catName(k, customs)}
              </button>
            ))}
          </div>
          <Button className="w-full mb-4" onClick={() => setGrade(true)}>Outra categoria…</Button>
        </>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Button onClick={pular}>← Pular</Button>
        <Button onClick={() => setMais(t)}>Mais</Button>
        <Button tone="primary" onClick={certo}>{sugestao ? "Certo →" : "Escolher"}</Button>
      </div>
      <TxSheet tx={mais} onClose={() => setMais(null)} />
    </Sheet>
  );
}
