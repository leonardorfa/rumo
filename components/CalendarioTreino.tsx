"use client";

import { useState } from "react";
import { daysInMonth, localDay, monthName, shiftMonth } from "@/lib/format";
import { aguaOf, exerciciosDoTreino, fmtAgua, resumoDoDia, WEEKDAYS } from "@/lib/life";
import { useData } from "@/lib/store";
import type { Workout } from "@/lib/types";
import { Button, Card, Progress, Sheet } from "./ui";

const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const INI = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Calendário do mês: dias de treino feitos, previstos e perdidos. Tocar num dia mostra a água e o treino. */
export default function CalendarioTreino({ onClose, onEditar }: { onClose: () => void; onEditar: (w: Workout) => void }) {
  const d = useData();
  const hoje = localDay();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [dia, setDia] = useState<string>(hoje);
  const primeiro = (new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1).getDay() + 6) % 7; // segunda = 0
  const n = daysInMonth(mes);
  const celulas: (string | null)[] = [...Array(primeiro).fill(null), ...Array.from({ length: n }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`)];
  const feitosNoMes = celulas.filter((x) => x && resumoDoDia(d, x, hoje).feito).length;
  const r = resumoDoDia(d, dia, hoje);
  const agua = aguaOf(d);

  return (
    <Sheet open onClose={onClose} title="Calendário de treino">
      <div className="flex items-center justify-between mb-2">
        <button className="h-10 px-3 text-[22px] text-link" aria-label="Mês anterior" onClick={() => setMes(shiftMonth(mes, -1))}>‹</button>
        <div className="text-center">
          <div className="font-semibold">{monthName(mes)}</div>
          <div className="text-[12px] text-ink3">{feitosNoMes} treino{feitosNoMes === 1 ? "" : "s"} no mês</div>
        </div>
        <button className="h-10 px-3 text-[22px] text-link" aria-label="Próximo mês" onClick={() => setMes(shiftMonth(mes, 1))}>›</button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {INI.map((x) => <span key={x} className="text-[11px] text-ink3">{x}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center mb-2">
        {celulas.map((iso, i) => {
          if (!iso) return <span key={`v${i}`} />;
          const x = resumoDoDia(d, iso, hoje);
          const estado = x.feito ? "feito" : x.previsto ? (x.passou ? "perdido" : "falta") : "descanso";
          const sel = iso === dia;
          return (
            <button key={iso} onClick={() => setDia(iso)} aria-label={`${dataBR(iso)}: ${estado}`}
              className={`relative h-11 rounded-full grid place-items-center text-[14px] font-semibold ${
                estado === "feito" ? "bg-ok text-[#031a14]" : estado === "perdido" ? "border-2 border-alert text-alert" : estado === "falta" ? "border-2 border-meu text-meu" : "bg-fill text-ink2"
              } ${sel ? "ring-2 ring-offset-2 ring-[var(--ink)]" : ""} ${x.hoje ? "underline underline-offset-4" : ""}`}>
              {iso.slice(8).replace(/^0/, "")}
              {x.aguaMl > 0 && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-[var(--s1)]" aria-hidden />}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink3 mb-4">
        <span><b className="text-ok">●</b> treinou</span>
        <span><b className="text-meu">○</b> previsto</span>
        <span><b className="text-alert">○</b> perdeu</span>
        <span><b className="text-[var(--s1)]">•</b> bebeu água</span>
      </div>

      <Card>
        <div className="font-semibold">{WEEKDAYS[r.wd]}, {dataBR(r.iso)}{r.hoje ? " (hoje)" : ""}</div>

        <div className="mt-3">
          <div className="flex justify-between text-[14px]"><span className="text-ink2">Água</span><span className="font-semibold">{fmtAgua(r.aguaMl)} de {fmtAgua(agua.metaMl)}</span></div>
          <div className="mt-1"><Progress value={Math.min(r.aguaMl, agua.metaMl)} max={agua.metaMl} color="var(--meu)" /></div>
        </div>

        <div className="mt-4">
          <div className="text-[14px] text-ink2 mb-1">Treino</div>
          {r.treinos.length === 0 ? (
            <div className="text-[14px]">
              {r.previsto
                ? <>{r.passou ? "Previsto e não registrado" : "Previsto"}: <b>{r.plano!.name}</b>{r.plano!.exercises.length ? <span className="text-ink3"> · {r.plano!.exercises.join(", ")}</span> : null}</>
                : <span className="text-ink3">{r.passou ? "Dia de descanso, sem treino registrado." : "Dia de descanso."}</span>}
            </div>
          ) : r.treinos.map((w) => {
            const rot = d.fit?.routines.find((x) => x.id === w.routineId);
            const exs = exerciciosDoTreino(w);
            return (
              <div key={w.id} className="mb-3 last:mb-0">
                <div className="flex justify-between text-[14px]">
                  <span className="font-semibold">{rot?.name ?? "Treino livre"}</span>
                  <span className="text-ink3">{w.sets.length} séries · {num(w.sets.reduce((a, s) => a + s.kg * s.reps, 0))} kg</span>
                </div>
                <div className="divide-y divide-line mt-1">
                  {exs.map((e) => (
                    <div key={e.ex} className="py-1.5 text-[14px]">
                      <div>{e.ex}</div>
                      <div className="text-[12px] text-ink3">{e.sets.length ? e.sets.map((s) => `${num(s.kg)} kg × ${s.reps}`).join("  ·  ") : "sem série anotada"}</div>
                    </div>
                  ))}
                </div>
                {w.cardio && <div className="text-[13px] text-ink2 mt-1">Cardio: {w.cardio.tipo} {w.cardio.min} min</div>}
                {w.note && <div className="text-[13px] text-ink3 mt-1">“{w.note}”</div>}
                <Button className="w-full mt-2 !h-9" onClick={() => { onClose(); onEditar(w); }}>Ver ou editar este treino</Button>
              </div>
            );
          })}
        </div>
      </Card>
    </Sheet>
  );
}
