"use client";

import { useMemo, useState } from "react";
import { shareFile } from "@/lib/backup";
import { localDay } from "@/lib/format";
import {
  buildIcs, deleteRoutine, MODELOS, deleteWeight, deleteWorkout, exerciseHistory, fitOf, goalStatus, knownExercises, lastSets, logWeight,
  recordsOf, saveRoutine, saveWorkout, setTrainingDay, setTrainingTime, SUGESTOES, weekStats, weeklyVolume, weightTrend, WEEKDAYS,
} from "@/lib/life";
import { useData } from "@/lib/store";
import type { Cardio, Routine, Workout } from "@/lib/types";
import { BarsChart, TrendChart } from "./charts";
import { act, Button, Card, Progress, Section, Segmented, Sheet, Title, toast } from "./ui";

type Aba = "hoje" | "progresso" | "plano";
const parse = (v: string) => parseFloat(v.replace(/\./g, "").replace(",", "."));
const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const num = (v: number, max = 1) => v.toLocaleString("pt-BR", { maximumFractionDigits: max });
const ORDEM = [1, 2, 3, 4, 5, 6, 0]; // segunda a domingo

export default function Treino() {
  const [aba, setAba] = useState<Aba>(() => {
    try { return (localStorage.getItem("aba-treino") as Aba) || "hoje"; } catch { return "hoje"; }
  });
  const troca = (v: Aba) => { setAba(v); try { localStorage.setItem("aba-treino", v); } catch { /* ok */ } };
  return (
    <div>
      <Title>Treino</Title>
      <div className="sticky top-0 z-20 -mx-4 px-4 pt-1 pb-2 bg-bg" style={{ paddingTop: "max(4px, env(safe-area-inset-top))" }}>
        <Segmented value={aba} onChange={troca} options={[{ value: "hoje", label: "Hoje" }, { value: "progresso", label: "Progresso" }, { value: "plano", label: "Plano" }]} />
      </div>
      {aba === "hoje" && <Hoje />}
      {aba === "progresso" && <Progresso />}
      {aba === "plano" && <Plano />}
    </div>
  );
}

// ---------- hoje ----------

function Hoje() {
  const d = useData();
  const f = fitOf(d);
  const hoje = localDay();
  const ws = weekStats(d);
  const [treino, setTreino] = useState<{ w?: Workout; routineId?: string } | null>(null);
  const [peso, setPeso] = useState(false);
  const wd = new Date(hoje + "T12:00:00").getDay();
  const rid = f.days[String(wd)];
  const rotina = f.routines.find((r) => r.id === rid);
  const feitoHoje = f.workouts.find((w) => w.date === hoje);
  const meta = (d.goals ?? []).find((g) => g.kind === "weight");
  const ult = f.weights[f.weights.length - 1];
  const tend = weightTrend(d);
  const recentes = [...f.workouts].reverse().slice(0, 6);
  return (
    <>
      <Card className="mt-1">
        <div className="text-[13px] text-ink3">{WEEKDAYS[wd]}, {dataBR(hoje).slice(0, 5)}</div>
        {feitoHoje ? (
          <>
            <div className="text-[22px] font-bold text-ok">✓ Treino de hoje feito</div>
            <div className="text-[13px] text-ink2">{[...new Set(feitoHoje.sets.map((s) => s.ex))].join(", ") || "sem exercícios"}{feitoHoje.cardio ? ` · ${feitoHoje.cardio.tipo} ${feitoHoje.cardio.min} min` : ""}</div>
            <Button className="w-full mt-3" onClick={() => setTreino({ w: feitoHoje })}>Ver ou editar</Button>
          </>
        ) : (
          <>
            <div className="text-[22px] font-bold">{rid === undefined ? "Dia de descanso" : rotina ? `Hoje: ${rotina.name}` : "Hoje é dia de treino"}</div>
            <div className="text-[13px] text-ink2">
              {rotina?.exercises.length ? rotina.exercises.join(" · ") : rid === undefined ? "Treinou mesmo assim? Dá para registrar." : "Registre o que fizer."}
            </div>
            {rotina && (rotina.focus || rotina.minutes || rotina.cardio) && (
              <div className="text-[13px] text-ink3 mt-1">
                {[rotina.focus && `Ênfase: ${rotina.focus}`, rotina.minutes && `${rotina.minutes} min`, rotina.cardio && `${rotina.cardio.tipo} ${rotina.cardio.min} min`].filter(Boolean).join(" · ")}
              </div>
            )}
            <Button tone="primary" className="w-full mt-3" onClick={() => setTreino({ routineId: rotina?.id })}>
              {rid === undefined ? "Registrar um treino" : "Iniciar treino"}
            </Button>
          </>
        )}
      </Card>

      <Section>Esta semana</Section>
      <Card>
        <div className="grid grid-cols-7 gap-1 text-center">
          {ws.dias.map((x) => {
            const ini = WEEKDAYS[x.wd].slice(0, 3);
            const estado = x.feito ? "feito" : x.previsto ? (x.passou ? "perdido" : "falta") : "descanso";
            return (
              <div key={x.data} className="flex flex-col items-center gap-1">
                <span className={`text-[11px] ${x.hoje ? "text-link font-bold" : "text-ink3"}`}>{ini}</span>
                <span className={`w-9 h-9 rounded-full grid place-items-center text-[14px] font-semibold ${
                  estado === "feito" ? "bg-ok text-white" : estado === "perdido" ? "border-2 border-alert text-alert" : estado === "falta" ? "border-2 border-meu text-meu" : "bg-fill text-ink3"}`}>
                  {estado === "feito" ? "✓" : estado === "perdido" ? "×" : x.data.slice(8)}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[14px] mt-3">
          <span>{ws.previstos ? <><b>{ws.feitos}</b> de {ws.previstos} treinos</> : "Defina seus dias na aba Plano"}</span>
          {ws.seguidas > 0 && <span className="text-ok">🔥 {ws.seguidas} semana{ws.seguidas === 1 ? "" : "s"} seguida{ws.seguidas === 1 ? "" : "s"}</span>}
        </div>
      </Card>

      <Section>Peso</Section>
      <Card>
        {ult ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-[28px] font-bold num">{num(ult.kg)} kg</span>
              <span className="text-ink3 text-[13px]">em {dataBR(ult.date).slice(0, 5)}</span>
              {tend !== null && <span className={`text-[13px] font-semibold ${tend > 0 ? "text-ok" : "text-ink2"}`}>{tend > 0 ? "▲ +" : tend < 0 ? "▼ " : ""}{num(tend, 2)} kg/sem</span>}
            </div>
            {meta && (() => {
              const s = goalStatus(d, meta);
              return (
                <>
                  <div className="mt-2"><Progress value={s.pct} max={100} color={s.naFrente ? "var(--ok)" : "var(--meta)"} /></div>
                  <div className="text-[13px] text-ink2 mt-1">
                    Meta {num(meta.target)} kg até {dataBR(meta.deadline)} · {s.batida ? "batida" : <>precisa de {num(Math.abs(s.porSemana), 2)} kg/semana</>}
                  </div>
                </>
              );
            })()}
          </>
        ) : <div className="text-ink2">Registre seu peso para acompanhar a meta.</div>}
        <Button className="w-full mt-3" onClick={() => setPeso(true)}>Registrar peso</Button>
      </Card>

      {recentes.length > 0 && (
        <>
          <Section>Últimos treinos</Section>
          <div className="card px-4">
            {recentes.map((w, i) => {
              const rec = recordsOf(d, w);
              const r = f.routines.find((x) => x.id === w.routineId);
              return (
                <button key={w.id} onClick={() => setTreino({ w })} className={`w-full flex items-center gap-3 py-3 text-left ${i ? "border-t border-line" : ""}`}>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{WEEKDAYS[new Date(w.date + "T12:00:00").getDay()].slice(0, 3)} {dataBR(w.date).slice(0, 5)}{r ? ` · ${r.name}` : ""}</span>
                    <span className="block text-[12px] text-ink3 truncate">{[...new Set(w.sets.map((s) => s.ex))].join(", ")}</span>
                  </span>
                  {rec.length > 0 && <span className="text-[12px] text-ok font-semibold shrink-0">🏆 {rec.length}</span>}
                  <span className="text-ink3 text-xl" aria-hidden>›</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {treino && <TreinoSheet w={treino.w} routineId={treino.routineId} onClose={() => setTreino(null)} />}
      {peso && <PesoSheet onClose={() => setPeso(false)} />}
    </>
  );
}

// ---------- registrar treino ----------

type Bloco = { ex: string; sets: { kg: string; reps: string }[] };

function TreinoSheet({ w, routineId, onClose }: { w?: Workout; routineId?: string; onClose: () => void }) {
  const d = useData();
  const f = fitOf(d);
  const [rotId, setRotId] = useState(w?.routineId ?? routineId ?? "");
  const rotina = f.routines.find((r) => r.id === rotId);
  const [cTipo, setCTipo] = useState(w?.cardio?.tipo ?? rotina?.cardio?.tipo ?? "Bike");
  const [cMin, setCMin] = useState(w?.cardio ? String(w.cardio.min) : "");
  const [data, setData] = useState(w?.date ?? localDay());
  const [nota, setNota] = useState(w?.note ?? "");
  const [add, setAdd] = useState(false);
  const [blocos, setBlocos] = useState<Bloco[]>(() => {
    if (w) {
      const ex = [...new Set(w.sets.map((s) => s.ex))];
      return ex.map((e) => ({ ex: e, sets: w.sets.filter((s) => s.ex === e).map((s) => ({ kg: String(s.kg).replace(".", ","), reps: String(s.reps) })) }));
    }
    const exs = f.routines.find((r) => r.id === (routineId ?? ""))?.exercises ?? [];
    return exs.map((e) => ({ ex: e, sets: preencher(d, e) }));
  });
  // Trocar a rotina: sem nada digitado troca tudo; com séries já preenchidas só soma o que falta.
  function trocarRotina(id: string) {
    setRotId(id);
    const exs = f.routines.find((r) => r.id === id)?.exercises ?? [];
    const digitou = blocos.some((b) => b.sets.some((x) => x.reps.trim() || x.kg.trim() && !lastSets(d, b.ex)));
    const novos = exs.map((e) => ({ ex: e, sets: preencher(d, e) }));
    setBlocos(digitou ? [...blocos, ...novos.filter((n) => !blocos.some((b) => b.ex === n.ex))] : novos);
    const c = f.routines.find((r) => r.id === id)?.cardio;
    if (c) setCTipo(c.tipo);
  }
  const set = (i: number, j: number, p: Partial<Bloco["sets"][number]>) =>
    setBlocos(blocos.map((b, x) => (x !== i ? b : { ...b, sets: b.sets.map((s, y) => (y === j ? { ...s, ...p } : s)) })));
  const total = blocos.reduce((a, b) => a + b.sets.filter((s) => parse(s.reps) > 0).length, 0);
  const temCardio = Number.isFinite(parse(cMin)) && parse(cMin) > 0;

  function salvar() {
    const sets = blocos.flatMap((b) => b.sets.map((s) => ({ ex: b.ex, kg: parse(s.kg || "0"), reps: Math.round(parse(s.reps)) })).filter((s) => s.reps > 0 && Number.isFinite(s.kg)));
    if (!sets.length && !temCardio) return;
    const min = Math.round(parse(cMin));
    const cardio: Cardio | undefined = Number.isFinite(min) && min > 0 ? { tipo: cTipo.trim() || "Cardio", min } : undefined;
    const novo: Workout = { id: w?.id ?? "", date: data, routineId: rotId || undefined, note: nota.trim() || undefined, cardio, sets };
    let recs: string[] = [];
    act(() => (recs.length ? `🏆 Recorde: ${recs.join(", ")}` : "Treino salvo"), (dd) => {
      const out = saveWorkout(dd, novo);
      const salvo = fitOf(out).workouts.find((x) => (w ? x.id === w.id : x.date === data && x.sets.length === sets.length && x.sets[0]?.ex === sets[0]?.ex)) ?? novo;
      recs = recordsOf(out, salvo);
      return out;
    });
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={w ? "Treino" : "Novo treino"}>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <label className="block min-w-0">
          <span className="block text-[13px] text-ink3 px-1 mb-1">Dia</span>
          <input type="date" value={data} max={localDay()} onChange={(e) => setData(e.target.value)} />
        </label>
        <label className="block min-w-0">
          <span className="block text-[13px] text-ink3 px-1 mb-1">Treino</span>
          <select value={rotId} onChange={(e) => trocarRotina(e.target.value)}>
            <option value="">Livre</option>
            {f.routines.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
      </div>
      {rotina && (rotina.focus || rotina.minutes) && (
        <p className="text-[13px] text-ink3 px-1 -mt-1 mb-3">{[rotina.focus && `Ênfase: ${rotina.focus}`, rotina.minutes && `${rotina.minutes} min`].filter(Boolean).join(" · ")}</p>
      )}
      {blocos.map((b, i) => {
        const ult = lastSets(d, b.ex, data);
        return (
          <div key={i} className="card p-3 mb-3">
            <div className="flex justify-between items-start gap-2">
              <span className="font-semibold">{b.ex}</span>
              <button className="text-ink3 text-[13px] px-1" onClick={() => setBlocos(blocos.filter((_, x) => x !== i))}>tirar</button>
            </div>
            <div className="text-[12px] text-ink3 mb-2">
              {ult ? `última vez (${dataBR(ult.date).slice(0, 5)}): ${ult.sets.map((s) => `${num(s.kg)}×${s.reps}`).join(", ")}` : "primeira vez"}
            </div>
            <div className="grid grid-cols-[28px_1fr_1fr_28px] gap-2 items-center">
              {b.sets.map((s, j) => (
                <div key={j} className="contents">
                  <span className="text-[13px] text-ink3 text-center">{j + 1}</span>
                  <input inputMode="decimal" className="num text-center" placeholder="kg" value={s.kg} onChange={(e) => set(i, j, { kg: e.target.value })} aria-label={`Carga da série ${j + 1}`} />
                  <input inputMode="numeric" className="num text-center" placeholder="reps" value={s.reps} onChange={(e) => set(i, j, { reps: e.target.value })} aria-label={`Repetições da série ${j + 1}`} />
                  <button className="text-ink3" aria-label="Tirar série" onClick={() => setBlocos(blocos.map((x, y) => (y === i ? { ...x, sets: x.sets.filter((_, z) => z !== j) } : x)))}>×</button>
                </div>
              ))}
            </div>
            <Button className="w-full mt-2 !h-9" onClick={() => setBlocos(blocos.map((x, y) => (y === i ? { ...x, sets: [...x.sets, { ...(x.sets[x.sets.length - 1] ?? { kg: "", reps: "" }) }] } : x)))}>+ série</Button>
          </div>
        );
      })}
      <Button className="w-full mb-3" onClick={() => setAdd(true)}>+ Exercício</Button>
      <div className="card p-3 mb-3">
        <div className="font-semibold mb-2">Cardio</div>
        <div className="grid grid-cols-[1fr_96px] gap-2">
          <input value={cTipo} onChange={(e) => setCTipo(e.target.value)} placeholder="Bike, esteira…" aria-label="Tipo de cardio" />
          <input inputMode="numeric" className="num text-center" value={cMin} onChange={(e) => setCMin(e.target.value)} placeholder={rotina?.cardio ? String(rotina.cardio.min) : "min"} aria-label="Minutos de cardio" />
        </div>
      </div>
      <label className="block mb-4">
        <span className="block text-[13px] text-ink3 px-1 mb-1">Anotação (como foi, dor, humor…)</span>
        <input value={nota} onChange={(e) => setNota(e.target.value)} />
      </label>
      <div className="sticky bottom-0 bg-bg pt-2 pb-1 flex gap-2">
        {w && <Button tone="danger" className="flex-1" onClick={() => { act("Treino apagado", (dd) => deleteWorkout(dd, w.id)); onClose(); }}>Apagar</Button>}
        <Button tone="primary" className="flex-[2]" disabled={!total && !temCardio} onClick={salvar}>Salvar {total ? `· ${total} séries` : temCardio ? "· cardio" : ""}</Button>
      </div>
      {add && <EscolherExercicio onPick={(ex) => { setBlocos([...blocos, { ex, sets: preencher(d, ex) }]); setAdd(false); }} onClose={() => setAdd(false)} />}
    </Sheet>
  );
}

/** Séries já preenchidas com o que você fez da última vez (ou 3 vazias). */
function preencher(d: ReturnType<typeof useData>, ex: string): Bloco["sets"] {
  const u = lastSets(d, ex);
  return u ? u.sets.map((s) => ({ kg: String(s.kg).replace(".", ","), reps: String(s.reps) })) : [1, 2, 3].map(() => ({ kg: "", reps: "" }));
}

function EscolherExercicio({ onPick, onClose }: { onPick: (ex: string) => void; onClose: () => void }) {
  const d = useData();
  const [q, setQ] = useState("");
  const meus = knownExercises(d);
  const outros = SUGESTOES.filter((s) => !meus.some((m) => m.toLowerCase() === s.toLowerCase()));
  const filtra = (xs: string[]) => xs.filter((x) => x.toLowerCase().includes(q.toLowerCase()));
  return (
    <Sheet open onClose={onClose} title="Exercício">
      <input autoFocus placeholder="Buscar ou escrever um novo" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" />
      {q.trim() && !meus.concat(outros).some((x) => x.toLowerCase() === q.trim().toLowerCase()) && (
        <Button tone="primary" className="w-full mb-3" onClick={() => onPick(q.trim())}>Criar “{q.trim()}”</Button>
      )}
      {filtra(meus).length > 0 && <div className="text-[13px] text-ink3 px-1 mb-1">Os seus</div>}
      <div className="card px-4 mb-3">
        {filtra(meus).map((x, i) => <button key={x} onClick={() => onPick(x)} className={`w-full text-left py-3 ${i ? "border-t border-line" : ""}`}>{x}</button>)}
      </div>
      <div className="text-[13px] text-ink3 px-1 mb-1">Sugestões</div>
      <div className="card px-4">
        {filtra(outros).map((x, i) => <button key={x} onClick={() => onPick(x)} className={`w-full text-left py-3 ${i ? "border-t border-line" : ""}`}>{x}</button>)}
      </div>
    </Sheet>
  );
}

// ---------- peso ----------

export function PesoSheet({ onClose }: { onClose: () => void }) {
  const d = useData();
  const ws = fitOf(d).weights;
  const [kg, setKg] = useState(ws.length ? String(ws[ws.length - 1].kg).replace(".", ",") : "");
  const [dia, setDia] = useState(localDay());
  const n = parse(kg);
  return (
    <Sheet open onClose={onClose} title="Peso">
      <div className="flex gap-2 mb-3">
        <label className="flex-1 min-w-0"><span className="block text-[13px] text-ink3 px-1 mb-1">Peso (kg)</span>
          <input inputMode="decimal" autoFocus className="num text-[22px]" value={kg} onChange={(e) => setKg(e.target.value)} /></label>
        <label className="flex-1 min-w-0"><span className="block text-[13px] text-ink3 px-1 mb-1">Dia</span>
          <input type="date" value={dia} max={localDay()} onChange={(e) => setDia(e.target.value)} /></label>
      </div>
      <Button tone="primary" className="w-full" disabled={!Number.isFinite(n) || n < 20 || n > 400}
        onClick={() => { act(`Peso: ${num(n)} kg`, (dd) => logWeight(dd, n, dia)); onClose(); }}>Salvar</Button>
      {ws.length > 0 && (
        <div className="card px-4 mt-4">
          {[...ws].reverse().slice(0, 12).map((w, i) => (
            <div key={w.date} className={`flex items-center gap-3 py-2.5 ${i ? "border-t border-line" : ""}`}>
              <span className="flex-1 text-ink2">{dataBR(w.date)}</span>
              <span className="num font-semibold">{num(w.kg)} kg</span>
              <button className="text-ink3 px-1" aria-label="Apagar" onClick={() => act("Peso apagado", (dd) => deleteWeight(dd, w.date))}>×</button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

// ---------- progresso ----------

function Progresso() {
  const d = useData();
  const f = fitOf(d);
  const comHist = useMemo(() => knownExercises(d).filter((e) => exerciseHistory(d, e).length > 0), [d]);
  const [ex, setEx] = useState("");
  const atual = ex && comHist.includes(ex) ? ex : comHist[0] ?? "";
  const h = atual ? exerciseHistory(d, atual) : [];
  const meta = (d.goals ?? []).find((g) => g.kind === "weight");
  const vol = weeklyVolume(d, 8);
  const pesos = f.weights.slice(-40);
  return (
    <>
      <Section>Peso</Section>
      <Card>
        {pesos.length >= 2
          ? <TrendChart name="Peso" fmt={(v) => `${num(v)} kg`} goal={meta?.target} data={pesos.map((w) => ({ label: dataBR(w.date).slice(0, 5), value: w.kg }))} />
          : <div className="text-ink2">Registre pelo menos 2 pesos para ver o gráfico.</div>}
      </Card>

      <Section>Cargas</Section>
      {comHist.length === 0 ? (
        <Card className="text-ink2">Registre treinos na aba Hoje e a evolução de cada exercício aparece aqui.</Card>
      ) : (
        <>
          <select value={atual} onChange={(e) => setEx(e.target.value)} className="mb-3">
            {comHist.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <Card>
            {h.length >= 2 && (
              <>
                <TrendChart name="1RM estimado" fmt={(v) => `${num(v)} kg`} data={h.map((x) => ({ label: dataBR(x.date).slice(0, 5), value: x.rm }))} />
                <div className="text-[14px] mt-1 mb-2">
                  Maior carga: <b>{num(h[0].kg)} → {num(h[h.length - 1].kg)} kg</b>
                  {h[h.length - 1].kg !== h[0].kg && <span className={h[h.length - 1].kg > h[0].kg ? "text-ok" : "text-alert"}> ({h[h.length - 1].kg > h[0].kg ? "+" : ""}{num(h[h.length - 1].kg - h[0].kg)} kg)</span>}
                </div>
              </>
            )}
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-[12px] text-ink3 pb-1 border-b border-line">
              <span>Dia</span><span className="text-right">Carga</span><span className="text-right">1RM*</span><span className="text-right">Volume</span>
            </div>
            <div className="divide-y divide-line">
              {[...h].reverse().slice(0, 8).map((x) => (
                <div key={x.date} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 py-2 text-[14px]">
                  <span className="text-ink2">{dataBR(x.date).slice(0, 5)}</span>
                  <span className="text-right num">{num(x.kg)} kg</span>
                  <span className="text-right num">{num(x.rm)}</span>
                  <span className="text-right num text-ink2">{x.volume.toLocaleString("pt-BR")}</span>
                </div>
              ))}
            </div>
            <p className="text-[12px] text-ink3 mt-2">*1RM é a carga máxima estimada para 1 repetição. Volume = kg × repetições.</p>
          </Card>
        </>
      )}

      <Section>Constância</Section>
      <Card>
        <div className="text-[13px] text-ink2 mb-1">Treinos por semana (últimas 8)</div>
        <BarsChart name="Treinos" data={vol.map((v) => ({ label: v.label, value: v.treinos }))} color="var(--s3)" />
        <div className="text-[13px] text-ink2 mt-3 mb-1">Volume total por semana (kg)</div>
        <BarsChart name="Volume (kg)" data={vol.map((v) => ({ label: v.label, value: v.volume }))} />
      </Card>
    </>
  );
}

// ---------- plano ----------

const resumoRotina = (r: Routine) =>
  [r.focus && `ênfase ${r.focus}`, r.minutes && `${r.minutes} min`, r.cardio && `${r.cardio.tipo} ${r.cardio.min} min`, `${r.exercises.length} exercício${r.exercises.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ");

function Plano() {
  const d = useData();
  const f = fitOf(d);
  const [dia, setDia] = useState<number | null>(null);
  const [rot, setRot] = useState<{ r: Routine | null; paraDia?: number } | null>(null);
  const [modelos, setModelos] = useState(false);
  return (
    <>
      <Section>Semana</Section>
      <div className="card px-4">
        {ORDEM.map((wd, i) => {
          const v = f.days[String(wd)];
          const r = f.routines.find((x) => x.id === v);
          return (
            <button key={wd} onClick={() => setDia(wd)} className={`w-full flex items-center gap-3 py-3 text-left ${i ? "border-t border-line" : ""}`}>
              <span className="w-[72px] shrink-0 font-medium">{WEEKDAYS[wd]}</span>
              <span className="flex-1 min-w-0">
                {v === undefined ? <span className="text-ink3">Descanso</span> : (
                  <>
                    <span className="block truncate">{r ? r.name : "Treino livre"}</span>
                    <span className="block text-[12px] text-ink3 truncate">{r ? resumoRotina(r) : "você escolhe os exercícios na hora"}</span>
                  </>
                )}
              </span>
              <span className="text-ink3 text-xl" aria-hidden>›</span>
            </button>
          );
        })}
      </div>
      <p className="text-[13px] text-ink3 px-1 mt-2">Toque num dia para mudar entre descanso e treino e escolher a rotina.</p>

      <Section>Rotinas</Section>
      <div className="card px-4">
        {f.routines.map((r, i) => (
          <button key={r.id} onClick={() => setRot({ r })} className={`w-full flex items-center gap-3 py-3 text-left ${i ? "border-t border-line" : ""}`}>
            <span className="flex-1 min-w-0">
              <span className="block">{r.name}</span>
              <span className="block text-[12px] text-ink3 truncate">{r.exercises.join(", ") || "sem exercícios"}</span>
            </span>
            <span className="text-ink3 text-xl" aria-hidden>›</span>
          </button>
        ))}
        <button className={`w-full text-left py-3 text-link font-semibold ${f.routines.length ? "border-t border-line" : ""}`} onClick={() => setRot({ r: null })}>+ Nova rotina</button>
        <button className="w-full text-left py-3 text-link font-semibold border-t border-line" onClick={() => setModelos(true)}>+ Começar de um modelo</button>
      </div>

      <Section>Agenda</Section>
      <Card>
        <label className="flex items-center justify-between gap-3 mb-3">
          <span>Horário do treino</span>
          <input type="time" value={f.time} className="!w-32" onChange={(e) => e.target.value && act("Horário salvo", (dd) => setTrainingTime(dd, e.target.value))} />
        </label>
        <Button tone="primary" className="w-full" disabled={!Object.keys(f.days).length} onClick={async () => {
          const ok = await shareFile(new File([buildIcs(d)], "treino-semanal.ics", { type: "text/calendar" }));
          if (ok) toast("Abra o arquivo e toque em Adicionar tudo");
        }}>Colocar na agenda do iPhone (.ics)</Button>
        <p className="text-[13px] text-ink3 mt-2">Cria um evento por semana em cada dia de treino, com a duração da rotina e aviso 30 minutos antes. Se mudar os dias, exporte de novo e apague os antigos na Agenda.</p>
      </Card>
      {dia !== null && (
        <DiaSheet wd={dia} onClose={() => setDia(null)}
          onEditar={(r) => { setDia(null); setRot({ r }); }} onNova={(wd) => { setDia(null); setRot({ r: null, paraDia: wd }); }} />
      )}
      {rot && <RotinaForm r={rot.r} paraDia={rot.paraDia} onClose={() => setRot(null)} />}
      {modelos && <ModelosSheet onClose={() => setModelos(false)} />}
    </>
  );
}

/** Um dia da semana: descanso ou treino, e qual rotina. */
function DiaSheet({ wd, onClose, onEditar, onNova }: { wd: number; onClose: () => void; onEditar: (r: Routine) => void; onNova: (wd: number) => void }) {
  const d = useData();
  const f = fitOf(d);
  const v = f.days[String(wd)];
  const treina = v !== undefined;
  const escolher = (id: string | null) => act("Agenda atualizada", (dd) => setTrainingDay(dd, wd, id));
  return (
    <Sheet open onClose={onClose} title={WEEKDAYS[wd]}>
      <Segmented value={treina ? "treino" : "rest"} onChange={(x) => escolher(x === "rest" ? null : v ?? "")}
        options={[{ value: "rest", label: "Descanso" }, { value: "treino", label: "Treino" }]} />
      {treina && (
        <>
          <div className="text-[13px] text-ink3 px-1 mt-4 mb-1.5">Qual treino</div>
          <div className="card px-4">
            <button onClick={() => escolher("")} className="w-full flex items-center gap-3 py-3 text-left">
              <span className="flex-1">Treino livre<span className="block text-[12px] text-ink3">você escolhe os exercícios na hora</span></span>
              {v === "" && <span className="text-ok font-bold">✓</span>}
            </button>
            {f.routines.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-3 border-t border-line">
                <button onClick={() => escolher(r.id)} className="flex-1 min-w-0 text-left">
                  <span className="block truncate">{r.name}</span>
                  <span className="block text-[12px] text-ink3 truncate">{resumoRotina(r)}</span>
                </button>
                {v === r.id && <span className="text-ok font-bold">✓</span>}
                <button className="text-link text-[13px] font-semibold px-1" onClick={() => onEditar(r)}>Editar</button>
              </div>
            ))}
          </div>
          <Button className="w-full mt-3" onClick={() => onNova(wd)}>+ Nova rotina para {WEEKDAYS[wd].toLowerCase()}</Button>
        </>
      )}
      <Button tone="primary" className="w-full mt-4" onClick={onClose}>Pronto</Button>
    </Sheet>
  );
}

function ModelosSheet({ onClose }: { onClose: () => void }) {
  const d = useData();
  const tem = new Set(fitOf(d).routines.map((r) => r.name));
  return (
    <Sheet open onClose={onClose} title="Modelos de treino">
      <p className="text-ink2 mb-3">Toque para adicionar. Depois você muda os exercícios, a ênfase e o tempo do seu jeito.</p>
      <div className="flex flex-col gap-2">
        {MODELOS.map((m) => (
          <button key={m.name} disabled={tem.has(m.name)} className="card p-4 text-left disabled:opacity-50"
            onClick={() => { act(`“${m.name}” adicionada`, (dd) => saveRoutine(dd, { id: "", name: m.name, focus: m.focus, exercises: m.exercises })); onClose(); }}>
            <span className="block font-semibold">{m.name}{tem.has(m.name) ? " · já adicionada" : ""}</span>
            <span className="block text-[13px] text-ink3">{m.exercises.join(", ")}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function RotinaForm({ r, paraDia, onClose }: { r: Routine | null; paraDia?: number; onClose: () => void }) {
  const [nome, setNome] = useState(r?.name ?? "");
  const [foco, setFoco] = useState(r?.focus ?? "");
  const [min, setMin] = useState(r?.minutes ? String(r.minutes) : "");
  const [cTipo, setCTipo] = useState(r?.cardio?.tipo ?? "Bike");
  const [cMin, setCMin] = useState(r?.cardio ? String(r.cardio.min) : "");
  const [exs, setExs] = useState<string[]>(r?.exercises ?? []);
  const [add, setAdd] = useState(false);
  return (
    <Sheet open onClose={onClose} title={r?.id ? "Editar rotina" : "Nova rotina"}>
      <label className="block mb-3"><span className="block text-[13px] text-ink3 px-1 mb-1">Nome</span>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Peito, tríceps e ombro" /></label>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <label className="block min-w-0"><span className="block text-[13px] text-ink3 px-1 mb-1">Ênfase</span>
          <input value={foco} onChange={(e) => setFoco(e.target.value)} placeholder="Ex.: ombro" /></label>
        <label className="block min-w-0"><span className="block text-[13px] text-ink3 px-1 mb-1">Tempo (min)</span>
          <input inputMode="numeric" className="num" value={min} onChange={(e) => setMin(e.target.value)} placeholder="60" /></label>
      </div>
      <div className="grid grid-cols-[1fr_96px] gap-2 mb-3 items-end">
        <label className="block min-w-0"><span className="block text-[13px] text-ink3 px-1 mb-1">Cardio</span>
          <input value={cTipo} onChange={(e) => setCTipo(e.target.value)} placeholder="Bike" /></label>
        <label className="block"><span className="block text-[13px] text-ink3 px-1 mb-1">Minutos</span>
          <input inputMode="numeric" className="num text-center" value={cMin} onChange={(e) => setCMin(e.target.value)} placeholder="0" /></label>
      </div>
      <div className="text-[13px] text-ink3 px-1 mb-1.5">Exercícios, na ordem</div>
      <div className="card px-4 mb-3">
        {exs.map((e, i) => (
          <div key={e + i} className={`flex items-center gap-2 py-2.5 ${i ? "border-t border-line" : ""}`}>
            <span className="flex-1 min-w-0 truncate">{e}</span>
            <button className="text-ink3 px-2" aria-label="Subir" disabled={!i} onClick={() => setExs(exs.map((x, y) => (y === i - 1 ? exs[i] : y === i ? exs[i - 1] : x)))}>↑</button>
            <button className="text-ink3 px-2" aria-label="Tirar" onClick={() => setExs(exs.filter((_, y) => y !== i))}>×</button>
          </div>
        ))}
        {!exs.length && <div className="py-3 text-ink3">Nenhum exercício ainda.</div>}
      </div>
      <Button className="w-full mb-4" onClick={() => setAdd(true)}>+ Exercício</Button>
      <div className="sticky bottom-0 bg-bg pt-2 pb-1 flex gap-2">
        {r?.id && <Button tone="danger" className="flex-1" onClick={() => { act("Rotina apagada", (dd) => deleteRoutine(dd, r.id)); onClose(); }}>Apagar</Button>}
        <Button tone="primary" className="flex-[2]" disabled={!nome.trim()} onClick={() => {
          const cm = Math.round(parse(cMin)), tm = Math.round(parse(min));
          act("Rotina salva", (dd) => {
            let out = saveRoutine(dd, {
              id: r?.id ?? "", name: nome.trim(), exercises: exs, focus: foco.trim() || undefined,
              minutes: Number.isFinite(tm) && tm > 0 ? tm : undefined, cardio: Number.isFinite(cm) && cm > 0 ? { tipo: cTipo.trim() || "Cardio", min: cm } : undefined,
            });
            // rotina nova criada a partir de um dia da semana: já fica nesse dia
            if (paraDia !== undefined) {
              const antes = new Set(fitOf(dd).routines.map((x) => x.id));
              const nova = fitOf(out).routines.find((x) => !antes.has(x.id));
              if (nova) out = setTrainingDay(out, paraDia, nova.id);
            }
            return out;
          });
          onClose();
        }}>Salvar</Button>
      </div>
      {add && <EscolherExercicio onPick={(x) => { setExs([...exs, x]); setAdd(false); }} onClose={() => setAdd(false)} />}
    </Sheet>
  );
}
