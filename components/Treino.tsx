"use client";

import { useEffect, useMemo, useState } from "react";
import { shareFile } from "@/lib/backup";
import { localDay } from "@/lib/format";
import {
  rascunhoChave, seriesFaltando, parecidosCom, marcarDistintos, paresParecidos, juntarExercicios, agrupar, buildIcs, deleteRoutine, GRUPOS, grupoDaRotina, grupoDe, MODELOS, setExGroup, planForDay, setDayExtra, deleteWeight, deleteWorkout, exerciseHistory, fitOf, goalStatus, knownExercises, lastSets, logWeight,
  recordsOf, saveRoutine, saveWorkout, setTrainingDay, setTrainingTime, SUGESTOES, weekStats, weeklyVolume, weightTrend, WEEKDAYS,
} from "@/lib/life";
import { update, useData } from "@/lib/store";
import type { Cardio, Routine, Workout } from "@/lib/types";
import { Bars3D, BarsChart, MiniTrend, TrendChart } from "./charts";
import CalendarioTreino from "./CalendarioTreino";
import { AguaCard, MetasSemana, PesoLevantado } from "./Habitos";
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
  const [treino, setTreino] = useState<{ w?: Workout; routineId?: string; exercicios?: string[] } | null>(null);
  const [peso, setPeso] = useState(false);
  const [outro, setOutro] = useState(false);
  const [calendario, setCalendario] = useState(false);
  const wd = new Date(hoje + "T12:00:00").getDay();
  const plano = planForDay(d, wd);
  const rotina = plano?.routine;
  const feitoHoje = f.workouts.find((w) => w.date === hoje);
  const meta = (d.goals ?? []).find((g) => g.kind === "weight");
  const ult = f.weights[f.weights.length - 1];
  const tend = weightTrend(d);
  const recentes = [...f.workouts].reverse().slice(0, 6);
  const semRotinas = f.routines.length === 0;
  const livre = !plano || !rotina; // descanso ou treino livre: você escolhe qual treino fazer
  const comecar = (r?: Routine) => setTreino({ routineId: r?.id, exercicios: r && r.id === rotina?.id ? plano?.exercises : r?.exercises });
  return (
    <>
      {semRotinas && (
        <Card className="mt-1">
          <div className="font-semibold">Monte seus treinos</div>
          <div className="text-[13px] text-ink2 mb-3">Três prontos para começar: peito, tríceps e ombro; costas e bíceps; perna. Depois você muda os exercícios do seu jeito em Plano.</div>
          <Button tone="primary" className="w-full" onClick={() => act("3 treinos adicionados", (dd) => MODELOS.reduce((acc, m) => saveRoutine(acc, { id: "", name: m.name, focus: m.focus, exercises: m.exercises }), dd))}>
            Adicionar os 3 treinos
          </Button>
        </Card>
      )}
      <Card className={semRotinas ? "mt-3" : "mt-1"}>
        <div className="text-[13px] text-ink3">{WEEKDAYS[wd]}, {dataBR(hoje).slice(0, 5)}</div>
        {feitoHoje ? (
          <>
            <div className="text-[22px] font-bold text-ok">✓ Treino de hoje feito</div>
            <div className="text-[13px] text-ink2">{[...new Set(feitoHoje.sets.map((s) => s.ex))].join(", ") || "sem exercícios"}{feitoHoje.cardio ? ` · ${feitoHoje.cardio.tipo} ${feitoHoje.cardio.min} min` : ""}</div>
            <Button className="w-full mt-3" onClick={() => setTreino({ w: feitoHoje })}>Ver ou editar</Button>
            <Button className="w-full mt-2" onClick={() => comecar()}>Treino livre (fechar séries que faltam)</Button>
          </>
        ) : (
          <>
            <div className="text-[22px] font-bold">{!plano ? "Dia de descanso" : rotina ? `Hoje: ${plano.name}` : "Hoje é dia de treino"}</div>
            {plano && rotina && (
              <>
                <div className="text-[13px] text-ink2">{plano.exercises.join(" · ")}</div>
                {(plano.focus || plano.minutes || plano.cardio) && (
                  <div className="text-[13px] text-ink3 mt-1">
                    {[plano.focus && `Ênfase: ${plano.focus}`, plano.minutes && `${plano.minutes} min`, plano.cardio && `${plano.cardio.tipo} ${plano.cardio.min} min`].filter(Boolean).join(" · ")}
                  </div>
                )}
              </>
            )}
            {!livre && (
              <>
                <Button tone="primary" className="w-full mt-3" onClick={() => comecar(rotina)}>Iniciar treino</Button>
                {!semRotinas && <button className="text-link text-[14px] font-semibold mt-2" onClick={() => setOutro(!outro)}>{outro ? "Esconder" : "Fazer outro treino hoje"}</button>}
              </>
            )}
            {livre && !semRotinas && <div className="text-[13px] text-ink3 mt-1">{!plano ? "Treinou mesmo assim? Escolha qual:" : "Escolha qual treino vai fazer:"}</div>}
          </>
        )}
        {!feitoHoje && (livre || outro) && (
          <div className="flex flex-col gap-2 mt-2">
            {f.routines.map((r) => (
              <button key={r.id} onClick={() => comecar(r)} className="rounded-xl bg-fill px-4 py-3 text-left">
                <span className="block font-semibold">{r.name}</span>
                <span className="block text-[12px] text-ink3 truncate">{r.exercises.join(", ")}</span>
              </button>
            ))}
            <Button className="w-full" onClick={() => comecar()}>Treino livre (escolho na hora)</Button>
          </div>
        )}
      </Card>

      <Section action={<span className="text-link text-[15px] font-semibold">Calendário ›</span>}>Esta semana</Section>
      <Card onClick={() => setCalendario(true)}>
        <div className="grid grid-cols-7 gap-1 text-center">
          {ws.dias.map((x) => {
            const ini = WEEKDAYS[x.wd].slice(0, 3);
            const estado = x.feito ? "feito" : x.previsto ? (x.passou ? "perdido" : "falta") : "descanso";
            return (
              <div key={x.data} className="flex flex-col items-center gap-1">
                <span className={`text-[11px] ${x.hoje ? "text-link font-bold" : "text-ink3"}`}>{ini}</span>
                <span className={`w-9 h-9 rounded-full grid place-items-center text-[14px] font-semibold ${
                  estado === "feito" ? "bg-ok text-[#031a14]" : estado === "perdido" ? "border-2 border-alert text-alert" : estado === "falta" ? "border-2 border-meu text-meu" : "bg-fill text-ink3"}`}>
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

      <MetasSemana />
      <AguaCard />
      {calendario && <CalendarioTreino onClose={() => setCalendario(false)} onEditar={(w) => setTreino({ w })} />}

      <Section>Peso</Section>
      <Card>
        {ult ? (
          <>
            <div className="flex items-baseline gap-2 flex-wrap">
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
      {treino && <TreinoSheet w={treino.w} routineId={treino.routineId} exercicios={treino.exercicios} onClose={() => setTreino(null)} />}
      {peso && <PesoSheet onClose={() => setPeso(false)} />}
    </>
  );
}

// ---------- registrar treino ----------

type Bloco = { ex: string; sets: { kg: string; reps: string }[] };

function TreinoSheet({ w, routineId, exercicios, onClose }: { w?: Workout; routineId?: string; exercicios?: string[]; onClose: () => void }) {
  const d = useData();
  const f = fitOf(d);
  const [rotId, setRotId] = useState(w?.routineId ?? routineId ?? "");
  const rotina = f.routines.find((r) => r.id === rotId);
  const [cTipo, setCTipo] = useState(w?.cardio?.tipo ?? rotina?.cardio?.tipo ?? "Bike");
  const [cMin, setCMin] = useState(w?.cardio ? String(w.cardio.min) : "");
  const [data, setData] = useState(w?.date ?? localDay());
  const [nota, setNota] = useState(w?.note ?? "");
  const [add, setAdd] = useState(false);
  const [grupoAdd, setGrupoAdd] = useState<string | undefined>(undefined);
  // Treino livre (sem rotina) começa vazio e não guarda rascunho: serve para fechar séries que faltam.
  const livre = !w && !routineId;
  const chaveRascunho = rascunhoChave(routineId);
  const [blocos, setBlocos] = useState<Bloco[]>(() => {
    if (w) {
      const ex = [...new Set([...w.sets.map((s) => s.ex), ...(w.pend ?? [])])];
      return ex.map((e) => ({ ex: e, sets: w.sets.some((s) => s.ex === e) ? w.sets.filter((s) => s.ex === e).map((s) => ({ kg: String(s.kg).replace(".", ","), reps: String(s.reps) })) : preencher(d, e) }));
    }
    // treino começado e não salvo: volta como estava (o mesmo dia e a mesma rotina)
    if (!chaveRascunho) return livre ? [] : (exercicios ?? []).map((e) => ({ ex: e, sets: preencher(d, e) }));
    try {
      const r = JSON.parse(localStorage.getItem(chaveRascunho) || "null") as { dia: string; blocos: Bloco[] } | null;
      if (r && r.dia === localDay() && r.blocos?.length) return r.blocos;
    } catch { /* sem rascunho */ }
    const exs = exercicios ?? f.routines.find((r) => r.id === (routineId ?? ""))?.exercises ?? [];
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
  useEffect(() => {
    if (w || !chaveRascunho) return;
    try { localStorage.setItem(chaveRascunho, JSON.stringify({ dia: localDay(), blocos })); } catch { /* sem storage */ }
  }, [blocos]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (i: number, j: number, p: Partial<Bloco["sets"][number]>) =>
    setBlocos(blocos.map((b, x) => (x !== i ? b : { ...b, sets: b.sets.map((s, y) => (y === j ? { ...s, ...p } : s)) })));
  const total = blocos.reduce((a, b) => a + b.sets.filter((s) => parse(s.reps) > 0).length, 0);
  const temCardio = Number.isFinite(parse(cMin)) && parse(cMin) > 0;

  function salvar() {
    const sets = blocos.flatMap((b) => b.sets.map((s) => ({ ex: b.ex, kg: parse(s.kg || "0"), reps: Math.round(parse(s.reps)) })).filter((s) => s.reps > 0 && Number.isFinite(s.kg)));
    if (!sets.length && !temCardio && !blocos.length) return;
    try { if (chaveRascunho) localStorage.removeItem(chaveRascunho); } catch { /* ok */ }
    const pend = !rotId ? [] : blocos.filter((b) => !sets.some((s) => s.ex === b.ex)).map((b) => b.ex);
    const min = Math.round(parse(cMin));
    const cardio: Cardio | undefined = Number.isFinite(min) && min > 0 ? { tipo: cTipo.trim() || "Cardio", min } : undefined;
    const novo: Workout = { id: w?.id ?? "", date: data, routineId: rotId || undefined, note: nota.trim() || undefined, cardio, sets, pend };
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
                  <input inputMode="decimal" className="num text-center !px-1" placeholder="kg" value={s.kg} onChange={(e) => set(i, j, { kg: e.target.value })} aria-label={`Carga da série ${j + 1}`} />
                  <input inputMode="numeric" className="num text-center !px-1" placeholder="reps" value={s.reps} onChange={(e) => set(i, j, { reps: e.target.value })} aria-label={`Repetições da série ${j + 1}`} />
                  <button className="text-ink3" aria-label="Tirar série" onClick={() => setBlocos(blocos.map((x, y) => (y === i ? { ...x, sets: x.sets.filter((_, z) => z !== j) } : x)))}>×</button>
                </div>
              ))}
            </div>
            <Button className="w-full mt-2 !h-9" onClick={() => setBlocos(blocos.map((x, y) => (y === i ? { ...x, sets: [...x.sets, { ...(x.sets[x.sets.length - 1] ?? { kg: "", reps: "" }) }] } : x)))}>+ série</Button>
          </div>
        );
      })}
      {!rotId && !w && (() => {
        const falta = seriesFaltando(d);
        return falta.length > 0 ? (
          <div className="card p-3 mb-3">
            <div className="font-semibold">Séries que faltam na semana</div>
            <div className="text-[12px] text-ink3 mb-2">Toque num grupo para escolher o exercício.</div>
            <div className="flex flex-wrap gap-2">
              {falta.map((x) => (
                <button key={x.grupo} className="rounded-full bg-fill px-3 py-1.5 text-[14px]" onClick={() => { setGrupoAdd(x.grupo); setAdd(true); }}>
                  {x.grupo} <b>{x.falta}</b>
                </button>
              ))}
            </div>
          </div>
        ) : null;
      })()}
      <Button className="w-full mb-3" onClick={() => { setGrupoAdd(undefined); setAdd(true); }}>+ Exercício</Button>
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
        <Button tone="primary" className="flex-[2]" disabled={!total && !temCardio && !blocos.length} onClick={salvar}>Salvar {total ? `· ${total} séries` : temCardio ? "· cardio" : ""}</Button>
      </div>
      {add && <EscolherExercicio grupo={grupoAdd} onPick={(ex) => { setBlocos([...blocos, { ex, sets: preencher(d, ex) }]); setAdd(false); }} onClose={() => setAdd(false)} />}
    </Sheet>
  );
}

/** Séries já preenchidas com o que você fez da última vez (ou 3 vazias). */
function preencher(d: ReturnType<typeof useData>, ex: string): Bloco["sets"] {
  const u = lastSets(d, ex);
  return u ? u.sets.map((s) => ({ kg: String(s.kg).replace(".", ","), reps: String(s.reps) })) : [1, 2, 3].map(() => ({ kg: "", reps: "" }));
}

function EscolherExercicio({ onPick, onClose, grupo }: { onPick: (ex: string) => void; onClose: () => void; grupo?: string }) {
  const d = useData();
  const [q, setQ] = useState("");
  const [gNovo, setGNovo] = useState("");
  const meus = knownExercises(d);
  const outros = SUGESTOES.filter((s) => !meus.some((m) => m.toLowerCase() === s.toLowerCase()));
  const filtra = (xs: string[]) => xs.filter((x) => x.toLowerCase().includes(q.toLowerCase()) && (!grupo || grupoDe(d, x) === grupo));
  const parecidos = q.trim() ? parecidosCom(d, q.trim()) : [];
  return (
    <Sheet open onClose={onClose} title="Exercício">
      {grupo && <div className="text-[13px] text-ink3 px-1 mb-2">Mostrando só {grupo}.</div>}
      <input autoFocus placeholder="Buscar ou escrever um novo" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" />
      {q.trim() && parecidos.length > 0 && !meus.concat(outros).some((x) => x.toLowerCase() === q.trim().toLowerCase()) && (
        <div className="card p-3 mb-3">
          <div className="font-semibold mb-1">“{q.trim()}” é o mesmo exercício que algum destes?</div>
          {parecidos.map((p) => (
            <div key={p} className="py-2 border-t border-line first:border-t-0">
              <div className="mb-1.5">{p}</div>
              <div className="grid grid-cols-2 gap-2">
                <Button tone="primary" className="!h-9" onClick={() => onPick(p)}>É o mesmo, usar este</Button>
                <Button className="!h-9" onClick={() => update((dd) => marcarDistintos(dd, q.trim(), p))}>São diferentes</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {q.trim() && !parecidos.length && !meus.concat(outros).some((x) => x.toLowerCase() === q.trim().toLowerCase()) && (
        <div className="card p-3 mb-3">
          <div className="text-[13px] text-ink3 mb-1">Grupo muscular de “{q.trim()}”</div>
          <select value={gNovo || grupoDe(d, q.trim())} onChange={(e) => setGNovo(e.target.value)} className="mb-2">
            {GRUPOS.map((g) => <option key={g}>{g}</option>)}
          </select>
          <Button tone="primary" className="w-full" onClick={() => { const x = q.trim(), g = gNovo || grupoDe(d, x); update((dd) => setExGroup(dd, x, g)); onPick(x); }}>Criar e usar</Button>
        </div>
      )}
      {[["Os seus", filtra(meus)], ["Sugestões", filtra(outros)]].map(([titulo, lista]) => (lista as string[]).length > 0 && (
        <div key={titulo as string} className="mb-3">
          <div className="text-[13px] font-semibold text-ink2 px-1 mb-1">{titulo as string}</div>
          {agrupar(lista as string[], (x) => grupoDe(d, x)).map((g) => (
            <div key={g.grupo} className="mb-2">
              <div className="text-[12px] text-ink3 px-1 mb-0.5">{g.grupo}</div>
              <div className="card px-4">
                {g.itens.map((x, i) => <button key={x} onClick={() => onPick(x)} className={`w-full text-left py-3 ${i ? "border-t border-line" : ""}`}>{x}</button>)}
              </div>
            </div>
          ))}
        </div>
      ))}
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

      <PesoLevantado />

      <PorTreino />

      <Section>Cargas</Section>
      {comHist.length === 0 ? (
        <Card className="text-ink2">Registre treinos na aba Hoje e a evolução de cada exercício aparece aqui.</Card>
      ) : (
        <>
          <select value={atual} onChange={(e) => setEx(e.target.value)} className="mb-3">
            {agrupar(comHist, (e) => grupoDe(d, e)).map((g) => (
              <optgroup key={g.grupo} label={g.grupo}>{g.itens.map((e) => <option key={e} value={e}>{e}</option>)}</optgroup>
            ))}
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
        <Bars3D name="Volume (kg)" fmt={(v) => v.toLocaleString("pt-BR")} explica="Cada barra é uma semana (dia/mês da segunda-feira) e a altura é o peso total levantado nela: carga × repetições de todas as séries." data={vol.map((v) => ({ label: v.label, nome: `Semana de ${v.label}`, value: v.volume }))} />
      </Card>
    </>
  );
}

/** Cada treino com todos os seus exercícios e um gráfico da carga de cada um ao longo dos dias. */
function PorTreino() {
  const d = useData();
  const f = fitOf(d);
  const [rid, setRid] = useState(f.routines[0]?.id ?? "");
  const r = f.routines.find((x) => x.id === rid) ?? f.routines[0];
  if (!r) return null;
  // exercícios da rotina + extras de qualquer dia que use ela + o que você já fez nela
  const extras = Object.entries(f.days).filter(([, v]) => v === r.id).flatMap(([wd]) => f.dayExtra?.[wd]?.extra ?? []);
  const feitos = f.workouts.filter((w) => w.routineId === r.id).flatMap((w) => w.sets.map((s) => s.ex));
  const exs = [...new Map([...r.exercises, ...extras, ...feitos].map((e) => [e.toLowerCase(), e])).values()];
  return (
    <>
      <Section>Por treino</Section>
      <select value={r.id} onChange={(e) => setRid(e.target.value)} className="mb-3">
        {f.routines.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <div className="flex flex-col gap-3">
        {exs.map((ex) => {
          const h = exerciseHistory(d, ex);
          const ult = h[h.length - 1];
          const melhor = h.reduce((m, x) => (x.kg > m ? x.kg : m), 0);
          const u = lastSets(d, ex);
          return (
            <Card key={ex}>
              <div className="flex justify-between items-baseline gap-2">
                <span className="font-semibold">{ex}</span>
                {melhor > 0 && <span className="text-[12px] text-ink3 shrink-0">recorde {num(melhor)} kg</span>}
              </div>
              {h.length === 0 ? (
                <div className="text-[13px] text-ink3 mt-1">Ainda sem registro. Faça o treino e anote a carga.</div>
              ) : (
                <>
                  <div className="text-[13px] text-ink2 mt-0.5">
                    Última vez ({dataBR(ult.date).slice(0, 5)}): {u ? u.sets.map((s) => `${num(s.kg)}×${s.reps}`).join(", ") : ""}
                  </div>
                  {h.length >= 2 ? (
                    <div className="mt-2"><MiniTrend data={h.map((x) => ({ label: dataBR(x.date).slice(0, 5), value: x.kg }))} unit="kg" /></div>
                  ) : <div className="text-[12px] text-ink3 mt-1">Com o segundo treino aparece o gráfico.</div>}
                  {h.length >= 2 && (
                    <div className="text-[12px] text-ink3 flex justify-between mt-1">
                      <span>{dataBR(h[0].date).slice(0, 5)}: {num(h[0].kg)} kg</span>
                      <span className={ult.kg >= h[0].kg ? "text-ok" : "text-alert"}>{ult.kg >= h[0].kg ? "+" : ""}{num(ult.kg - h[0].kg)} kg</span>
                    </div>
                  )}
                </>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

// ---------- plano ----------

/** Exercícios de nome parecido (de qualquer grupo): você escolhe juntar ou manter separados. */
function ParecidosCard() {
  const d = useData();
  const pares = paresParecidos(d);
  if (!pares.length) return null;
  return (
    <>
      <Section>Nomes parecidos</Section>
      <div className="text-[13px] text-ink3 px-1 mb-2">Estes exercícios têm nomes parecidos. Se forem o mesmo, junte: o histórico e as rotinas passam para um só nome.</div>
      <div className="flex flex-col gap-3">
        {pares.slice(0, 6).map(([a, b]) => (
          <Card key={a + b}>
            <div className="text-[15px]">{a}</div>
            <div className="text-[15px] text-ink2">{b}</div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Button tone="primary" className="!h-9" onClick={() => act(`Juntei em “${a}”`, (dd) => juntarExercicios(dd, b, a))}>Juntar em “{a.length > 14 ? a.slice(0, 13) + "…" : a}”</Button>
              <Button className="!h-9" onClick={() => act("Mantive separados", (dd) => marcarDistintos(dd, a, b))}>São diferentes</Button>
            </div>
            <button className="text-link text-[13px] font-semibold mt-2" onClick={() => act(`Juntei em “${b}”`, (dd) => juntarExercicios(dd, a, b))}>Ou juntar em “{b}”</button>
          </Card>
        ))}
        {pares.length > 6 && <div className="text-[12px] text-ink3 px-1">Mais {pares.length - 6} depois que você resolver estes.</div>}
      </div>
    </>
  );
}

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
          const pl = planForDay(d, wd);
          return (
            <button key={wd} onClick={() => setDia(wd)} className={`w-full flex items-center gap-3 py-3 text-left ${i ? "border-t border-line" : ""}`}>
              <span className="w-[72px] shrink-0 font-medium">{WEEKDAYS[wd]}</span>
              <span className="flex-1 min-w-0">
                {!pl ? <span className="text-ink3">Descanso</span> : (
                  <>
                    <span className="block truncate">{pl.name}</span>
                    <span className="block text-[12px] text-ink3 truncate">
                      {pl.routine ? [pl.focus && `ênfase ${pl.focus}`, pl.minutes && `${pl.minutes} min`, pl.cardio && `${pl.cardio.tipo} ${pl.cardio.min} min`, `${pl.exercises.length} exercícios`].filter(Boolean).join(" · ") : "você escolhe os exercícios na hora"}
                    </span>
                  </>
                )}
              </span>
              <span className="text-ink3 text-xl" aria-hidden>›</span>
            </button>
          );
        })}
      </div>
      <p className="text-[13px] text-ink3 px-1 mt-2">Toque num dia para mudar entre descanso e treino e escolher a rotina.</p>

      <ParecidosCard />

      <Section>Rotinas</Section>
      <div className="card px-4">
        {agrupar(f.routines, (r) => grupoDaRotina(d, r)).map((g) => (
          <div key={g.grupo}>
            <div className="text-[12px] font-semibold text-ink3 uppercase tracking-wide pt-3">{g.grupo}</div>
            {g.itens.map((r) => (
              <button key={r.id} onClick={() => setRot({ r })} className="w-full flex items-center gap-3 py-3 text-left border-t border-line first:border-t-0">
                <span className="flex-1 min-w-0">
                  <span className="block">{r.name}</span>
                  <span className="block text-[12px] text-ink3 truncate">{r.exercises.join(", ") || "sem exercícios"}</span>
                </span>
                <span className="text-ink3 text-xl" aria-hidden>›</span>
              </button>
            ))}
          </div>
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

/** Um dia da semana: descanso ou treino, qual rotina e os ajustes daquele dia (ênfase, tempo, cardio, exercícios a mais). */
function DiaSheet({ wd, onClose, onEditar, onNova }: { wd: number; onClose: () => void; onEditar: (r: Routine) => void; onNova: (wd: number) => void }) {
  const d = useData();
  const f = fitOf(d);
  const v = f.days[String(wd)];
  const treina = v !== undefined;
  const e = f.dayExtra?.[String(wd)] ?? {};
  const rotina = f.routines.find((r) => r.id === v);
  const [foco, setFoco] = useState(e.focus ?? "");
  const [min, setMin] = useState(e.minutes ? String(e.minutes) : "");
  const [cMin, setCMin] = useState(e.cardio ? String(e.cardio.min) : "");
  const [extra, setExtra] = useState<string[]>(e.extra ?? []);
  const [add, setAdd] = useState(false);
  const escolher = (id: string | null) => act("Agenda atualizada", (dd) => setTrainingDay(dd, wd, id));
  function pronto() {
    const m = Math.round(parse(min)), c = Math.round(parse(cMin));
    update((dd) => setDayExtra(dd, wd, treina ? {
      focus: foco.trim() || undefined, minutes: Number.isFinite(m) && m > 0 ? m : undefined,
      cardio: Number.isFinite(c) && c > 0 ? { tipo: e.cardio?.tipo ?? rotina?.cardio?.tipo ?? "Bike", min: c } : undefined, extra,
    } : null));
    onClose();
  }
  return (
    <Sheet open onClose={pronto} title={WEEKDAYS[wd]}>
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

          <div className="text-[13px] text-ink3 px-1 mt-5 mb-1.5">Só neste dia ({WEEKDAYS[wd].toLowerCase()})</div>
          <div className="card p-3">
            <div className="grid grid-cols-2 gap-2 mb-3">
              <label className="block min-w-0"><span className="block text-[12px] text-ink3 px-1 mb-1">Ênfase</span>
                <input value={foco} onChange={(x) => setFoco(x.target.value)} placeholder={rotina?.focus ?? "Ex.: ombro"} /></label>
              <label className="block min-w-0"><span className="block text-[12px] text-ink3 px-1 mb-1">Tempo (min)</span>
                <input inputMode="numeric" className="num" value={min} onChange={(x) => setMin(x.target.value)} placeholder={rotina?.minutes ? String(rotina.minutes) : "60"} /></label>
            </div>
            <label className="block mb-3"><span className="block text-[12px] text-ink3 px-1 mb-1">Cardio (min)</span>
              <input inputMode="numeric" className="num" value={cMin} onChange={(x) => setCMin(x.target.value)} placeholder={rotina?.cardio ? `${rotina.cardio.tipo} ${rotina.cardio.min}` : "0"} /></label>
            <div className="text-[12px] text-ink3 px-1 mb-1">Exercícios a mais neste dia</div>
            {extra.map((x, i) => (
              <div key={x + i} className="flex items-center gap-2 py-2 border-t border-line">
                <span className="flex-1 min-w-0 truncate">{x}</span>
                <button className="text-ink3 px-2" aria-label="Tirar" onClick={() => setExtra(extra.filter((_, y) => y !== i))}>×</button>
              </div>
            ))}
            <Button className="w-full mt-2 !h-9" onClick={() => setAdd(true)}>+ Exercício só neste dia</Button>
          </div>
        </>
      )}
      <Button tone="primary" className="w-full mt-4" onClick={pronto}>Pronto</Button>
      {add && <EscolherExercicio onPick={(x) => { setExtra([...extra, x]); setAdd(false); }} onClose={() => setAdd(false)} />}
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
  const dd0 = useData();
  const [grupo, setGrupo] = useState(r?.group ?? "");
  const grupoAuto = grupoDaRotina(dd0, { id: "", name: nome, exercises: exs });
  return (
    <Sheet open onClose={onClose} title={r?.id ? "Editar rotina" : "Nova rotina"}>
      <label className="block mb-3"><span className="block text-[13px] text-ink3 px-1 mb-1">Nome</span>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Peito, tríceps e ombro" /></label>
      <label className="block mb-3"><span className="block text-[13px] text-ink3 px-1 mb-1">Grupo muscular</span>
        <select value={grupo || grupoAuto} onChange={(e) => setGrupo(e.target.value)}>{GRUPOS.map((g) => <option key={g}>{g}</option>)}</select></label>
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
              id: r?.id ?? "", name: nome.trim(), exercises: exs, focus: foco.trim() || undefined, group: grupo || undefined,
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
