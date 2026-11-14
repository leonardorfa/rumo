// Metas de vida e treino. Só regra e conta, sem IA; os dados moram em Data.goals e Data.fit.
import { localDay } from "./format";
import { netWorthHistory } from "./insights";
import { myMoney } from "./store";
import type { Cardio, CdbTranche, Cripto, Data, DayExtra, Fit, Goal, Routine, Workout } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;
const uid = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
const DAY = 86400000;
const t = (iso: string) => Date.parse(iso + "T12:00:00");
export const addDaysIso = (iso: string, n: number) => localDay(new Date(t(iso) + n * DAY));

// ---------- idade ----------

/** "20 anos e 4 meses" a partir da data de nascimento. */
export function ageText(birth: string, now = new Date()): string {
  if (!birth) return "";
  const [y, m, d] = birth.split("-").map(Number);
  let anos = now.getFullYear() - y;
  let meses = now.getMonth() + 1 - m;
  if (now.getDate() < d) meses--;
  if (meses < 0) { anos--; meses += 12; }
  return `${anos} ano${anos === 1 ? "" : "s"}${meses ? ` e ${meses} ${meses === 1 ? "mês" : "meses"}` : ""}`;
}

/** Data do aniversário de `idade` anos. */
export const birthdayAt = (birth: string, idade: number) => `${Number(birth.slice(0, 4)) + idade}${birth.slice(4)}`;

/** Idade que a pessoa terá numa data. */
export const ageAt = (birth: string, iso: string) => {
  const [y, m, d] = birth.split("-").map(Number);
  const [yy, mm, dd] = iso.split("-").map(Number);
  return yy - y - (mm < m || (mm === m && dd < d) ? 1 : 0);
};

/** "4 anos e 7 meses" entre duas datas (para o que falta). */
export function spanText(from: string, to: string): string {
  if (to <= from) return "prazo chegou";
  const dias = Math.round((t(to) - t(from)) / DAY);
  if (dias < 45) return `${dias} dia${dias === 1 ? "" : "s"}`;
  const meses = Math.round(dias / 30.4375);
  const a = Math.floor(meses / 12), m = meses % 12;
  return [a ? `${a} ano${a === 1 ? "" : "s"}` : "", m ? `${m} ${m === 1 ? "mês" : "meses"}` : ""].filter(Boolean).join(" e ");
}

// ---------- metas ----------

const lastBy = <T extends { date: string }>(xs: T[]) => [...xs].sort((a, b) => (a.date < b.date ? 1 : -1))[0];

export const fitOf = (d: Data): Fit => ({ weights: [], days: {}, dayExtra: {}, time: "18:00", routines: [], workouts: [], ...(d.fit ?? {}) });

/** O que está planejado para um dia da semana: a rotina com os ajustes daquele dia. null = descanso. */
export function planForDay(d: Data, wd: number): { routine?: Routine; name: string; focus?: string; minutes?: number; cardio?: Cardio; exercises: string[] } | null {
  const f = fitOf(d);
  const rid = f.days[String(wd)];
  if (rid === undefined) return null;
  const r = f.routines.find((x) => x.id === rid);
  const e = f.dayExtra?.[String(wd)] ?? {};
  const base = r?.exercises ?? [];
  return {
    routine: r, name: r?.name ?? "Treino livre", focus: e.focus || r?.focus, minutes: e.minutes ?? r?.minutes, cardio: e.cardio ?? r?.cardio,
    exercises: [...base, ...(e.extra ?? []).filter((x) => !base.includes(x))],
  };
}

/** Onde você está hoje em relação à meta. */
export function goalCurrent(d: Data, g: Goal): number {
  if (g.kind === "net") return Math.round(myMoney(d));
  if (g.kind === "weight") return lastBy(fitOf(d).weights)?.kg ?? g.start;
  return lastBy(g.log ?? [])?.value ?? g.start;
}

export function goalStatus(d: Data, g: Goal, now = new Date()) {
  const hoje = localDay(now);
  const atual = goalCurrent(d, g);
  const total = g.target - g.start;
  const pct = total === 0 ? 100 : Math.max(0, Math.min(100, Math.round(((atual - g.start) / total) * 100)));
  const prazo = Math.max(1, (t(g.deadline) - t(g.startDate)) / DAY);
  const passou = Math.max(0, Math.min(prazo, (t(hoje) - t(g.startDate)) / DAY));
  const esperado = g.start + total * (passou / prazo); // linha reta da data de início até o prazo
  const diff = (atual - esperado) * Math.sign(total || 1); // > 0: na frente
  const diasRest = Math.max(0, Math.round((t(g.deadline) - t(hoje)) / DAY));
  const semanas = Math.max(diasRest / 7, 1 / 7);
  return {
    atual, pct, esperado: r2(esperado), diff: r2(diff), naFrente: diff >= 0, batida: total >= 0 ? atual >= g.target : atual <= g.target,
    diasRest, porSemana: r2((g.target - atual) / semanas),
  };
}

/** Ritmo do peso nas últimas 4 semanas (kg por semana), se der para medir. */
export function weightTrend(d: Data, now = new Date()): number | null {
  const desde = addDaysIso(localDay(now), -28);
  const pts = fitOf(d).weights.filter((w) => w.date >= desde).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (pts.length < 2 || t(pts[pts.length - 1].date) - t(pts[0].date) < 6 * DAY) return null;
  const xs = pts.map((p) => (t(p.date) - t(pts[0].date)) / DAY / 7);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = pts.reduce((a, b) => a + b.kg, 0) / pts.length;
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return den ? r2(xs.reduce((s, x, i) => s + (x - mx) * (pts[i].kg - my), 0) / den) : null;
}

/**
 * Meta de dinheiro de longo prazo: quanto guardar por mês, a juros compostos
 * (retorno que você escolhe), para chegar no alvo no prazo.
 */
export function moneyPlan(d: Data, g: Goal, now = new Date()) {
  const hoje = localDay(now);
  const v0 = goalCurrent(d, g);
  const n = Math.max(1, Math.round((t(g.deadline) - t(hoje)) / DAY / 30.4375));
  const r = (g.returnPct ?? d.config.prefs.returnPct ?? 10) / 100;
  const i = (1 + r) ** (1 / 12) - 1;
  const cresce = (1 + i) ** n;
  const aporte = Math.max(0, i > 1e-9 ? ((g.target - v0 * cresce) * i) / (cresce - 1) : (g.target - v0) / n);
  const valorEm = (meses: number) => {
    const c = (1 + i) ** meses;
    return v0 * c + (i > 1e-9 ? aporte * ((c - 1) / i) : aporte * meses);
  };
  // onde você deveria estar no fim de cada ano até o prazo
  const marcos: { data: string; valor: number; ano: number }[] = [];
  for (let ano = now.getFullYear(); ano <= Number(g.deadline.slice(0, 4)); ano++) {
    const fim = ano === Number(g.deadline.slice(0, 4)) ? g.deadline : `${ano}-12-31`;
    if (fim <= hoje) continue;
    marcos.push({ data: fim, ano, valor: Math.round(valorEm(Math.round((t(fim) - t(hoje)) / DAY / 30.4375))) });
  }
  // ritmo de crescimento dos últimos meses (patrimônio, já com rendimento)
  const hist = netWorthHistory(d, 4, now);
  const ritmo = hist.length >= 2 ? Math.round((hist[hist.length - 1].value - hist[0].value) / (hist.length - 1)) : null;
  const noRitmo = ritmo === null ? null : Math.round(v0 + ritmo * n);
  const curva = Array.from({ length: Math.min(n, 120) + 1 }, (_, k) => {
    const m = Math.round((k / Math.min(n, 120)) * n);
    return { m, valor: Math.round(valorEm(m)) };
  });
  return { v0, n, aporte: Math.round(aporte), marcos, ritmo, noRitmo, taxa: r * 100, curva, sobraSalario: d.config.salary - Math.round(aporte) };
}

export function saveGoal(d: Data, g: Goal): Data {
  const goals = d.goals ?? [];
  const id = g.id || uid();
  const novo = { ...g, id };
  return { ...d, goals: goals.some((x) => x.id === id) ? goals.map((x) => (x.id === id ? novo : x)) : [...goals, novo] };
}
export const deleteGoal = (d: Data, id: string): Data => ({ ...d, goals: (d.goals ?? []).filter((g) => g.id !== id) });
export const logGoal = (d: Data, id: string, value: number, date = localDay()): Data => ({
  ...d,
  goals: (d.goals ?? []).map((g) => (g.id === id ? { ...g, log: [...(g.log ?? []).filter((l) => l.date !== date), { date, value }] } : g)),
});

// ---------- treino ----------

const setFit = (d: Data, patch: Partial<Fit>): Data => ({ ...d, fit: { ...fitOf(d), ...patch } });

export const logWeight = (d: Data, kg: number, date = localDay()): Data =>
  setFit(d, { weights: [...fitOf(d).weights.filter((w) => w.date !== date), { date, kg: r2(kg) }].sort((a, b) => (a.date < b.date ? -1 : 1)) });
export const deleteWeight = (d: Data, date: string): Data => setFit(d, { weights: fitOf(d).weights.filter((w) => w.date !== date) });

/** Dia da semana → rotina ("" = treino sem rotina). `null` = descanso. */
export function setTrainingDay(d: Data, weekday: number, routineId: string | null): Data {
  const days = { ...fitOf(d).days };
  if (routineId === null) delete days[String(weekday)];
  else days[String(weekday)] = routineId;
  return setFit(d, { days });
}
export function setDayExtra(d: Data, weekday: number, extra: DayExtra | null): Data {
  const de = { ...(fitOf(d).dayExtra ?? {}) };
  const limpo = extra && { ...extra };
  if (limpo) {
    if (!limpo.focus?.trim()) delete limpo.focus;
    if (!limpo.minutes || limpo.minutes <= 0) delete limpo.minutes;
    if (!limpo.cardio || limpo.cardio.min <= 0) delete limpo.cardio;
    if (!limpo.extra?.length) delete limpo.extra;
  }
  if (!limpo || !Object.keys(limpo).length) delete de[String(weekday)];
  else de[String(weekday)] = limpo;
  return setFit(d, { dayExtra: de });
}
export const setTrainingTime = (d: Data, time: string): Data => setFit(d, { time });

export function saveRoutine(d: Data, r: Routine): Data {
  const rs = fitOf(d).routines;
  const id = r.id || uid();
  const novo = { ...r, id, exercises: r.exercises.map((e) => e.trim()).filter(Boolean) };
  if (!novo.focus?.trim()) delete novo.focus;
  if (!novo.minutes || novo.minutes <= 0) delete novo.minutes;
  if (!novo.cardio || novo.cardio.min <= 0) delete novo.cardio;
  return setFit(d, { routines: rs.some((x) => x.id === id) ? rs.map((x) => (x.id === id ? novo : x)) : [...rs, novo] });
}
export function deleteRoutine(d: Data, id: string): Data {
  const days = Object.fromEntries(Object.entries(fitOf(d).days).map(([k, v]) => [k, v === id ? "" : v]));
  return setFit(d, { routines: fitOf(d).routines.filter((r) => r.id !== id), days });
}

export function saveWorkout(d: Data, w: Workout): Data {
  const ws = fitOf(d).workouts;
  const id = w.id || uid();
  const limpo = { ...w, id, sets: w.sets.filter((s) => s.ex && s.kg >= 0 && s.reps > 0) };
  if (!limpo.cardio || limpo.cardio.min <= 0) delete limpo.cardio;
  if (!limpo.pend?.length) delete limpo.pend;
  return setFit(d, { workouts: (ws.some((x) => x.id === id) ? ws.map((x) => (x.id === id ? limpo : x)) : [...ws, limpo]).sort((a, b) => (a.date < b.date ? -1 : 1)) });
}
export const deleteWorkout = (d: Data, id: string): Data => setFit(d, { workouts: fitOf(d).workouts.filter((w) => w.id !== id) });

/** Carga estimada para 1 repetição (Epley). */
export const est1RM = (kg: number, reps: number) => (reps <= 1 ? kg : kg * (1 + reps / 30));

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** O que você fez na última vez que treinou esse exercício (antes de `antesDe`). */
export function lastSets(d: Data, ex: string, antesDe?: string): { date: string; sets: { kg: number; reps: number }[] } | null {
  const w = [...fitOf(d).workouts].reverse().find((x) => (!antesDe || x.date < antesDe) && x.sets.some((s) => norm(s.ex) === norm(ex)));
  return w ? { date: w.date, sets: w.sets.filter((s) => norm(s.ex) === norm(ex)).map(({ kg, reps }) => ({ kg, reps })) } : null;
}

/** Evolução de um exercício: melhor série (1RM estimado), maior carga e volume de cada treino. */
export function exerciseHistory(d: Data, ex: string) {
  return fitOf(d).workouts.flatMap((w) => {
    const ss = w.sets.filter((s) => norm(s.ex) === norm(ex));
    if (!ss.length) return [];
    return [{
      date: w.date,
      rm: r2(Math.max(...ss.map((s) => est1RM(s.kg, s.reps)))),
      kg: Math.max(...ss.map((s) => s.kg)),
      volume: Math.round(ss.reduce((a, s) => a + s.kg * s.reps, 0)),
      sets: ss.length,
    }];
  });
}

/** Exercícios em que este treino bateu recorde de carga (a maior até então). */
export function recordsOf(d: Data, w: Workout): string[] {
  const antes = fitOf(d).workouts.filter((x) => x.date < w.date && x.id !== w.id);
  const out: string[] = [];
  for (const ex of [...new Set(w.sets.map((s) => s.ex))]) {
    const prev = Math.max(0, ...antes.flatMap((x) => x.sets.filter((s) => norm(s.ex) === norm(ex)).map((s) => s.kg)));
    const hoje = Math.max(...w.sets.filter((s) => norm(s.ex) === norm(ex)).map((s) => s.kg));
    if (prev > 0 && hoje > prev) out.push(ex);
  }
  return out;
}

export const knownExercises = (d: Data) =>
  [...new Map([...fitOf(d).routines.flatMap((r) => r.exercises), ...fitOf(d).workouts.flatMap((w) => w.sets.map((s) => s.ex))].map((e) => [norm(e), e])).values()].sort((a, b) => a.localeCompare(b));

/** Segunda a domingo da semana de `hoje`. */
export function weekDates(hoje: string): string[] {
  const dow = new Date(t(hoje)).getDay(); // 0 = domingo
  const seg = addDaysIso(hoje, -((dow + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDaysIso(seg, i));
}

export function weekStats(d: Data, now = new Date()) {
  const hoje = localDay(now);
  const f = fitOf(d);
  const semana = weekDates(hoje);
  const dias = semana.map((data) => {
    const wd = new Date(t(data)).getDay();
    return { data, wd, previsto: String(wd) in f.days, feito: f.workouts.some((w) => w.date === data), hoje: data === hoje, passou: data < hoje };
  });
  const previstos = dias.filter((x) => x.previsto).length;
  const feitos = dias.filter((x) => x.feito).length;
  // semanas seguidas (até a anterior) com todos os treinos previstos feitos
  let seguidas = 0;
  if (previstos) {
    for (let k = 1; k <= 52; k++) {
      const sem = weekDates(addDaysIso(hoje, -7 * k));
      const feitosK = sem.filter((data) => f.workouts.some((w) => w.date === data)).length;
      if (feitosK >= previstos) seguidas++; else break;
    }
  }
  return { dias, previstos, feitos, seguidas, hojeDia: dias.find((x) => x.hoje)! };
}

/** Volume (kg × reps) e nº de treinos por semana, nas últimas `n` semanas. */
export function weeklyVolume(d: Data, n = 8, now = new Date()) {
  const hoje = localDay(now);
  return Array.from({ length: n }, (_, k) => {
    const sem = weekDates(addDaysIso(hoje, -7 * (n - 1 - k)));
    const ws = fitOf(d).workouts.filter((w) => w.date >= sem[0] && w.date <= sem[6]);
    return { label: `${sem[0].slice(8)}/${sem[0].slice(5, 7)}`, treinos: ws.length, volume: Math.round(ws.reduce((a, w) => a + w.sets.reduce((s, x) => s + x.kg * x.reps, 0), 0)) };
  });
}

export const GRUPOS = ["Peito", "Ombro", "Tríceps", "Costas", "Bíceps", "Perna", "Abdômen", "Outros"] as const;
// Ordem importa: "crucifixo inverso" é ombro, então vem antes de "crucifixo".
const REGRAS: [RegExp, string][] = [
  [/inverso|ombro|desenvolvimento|eleva[cç][aã]o|face pull|encolhimento/i, "Ombro"],
  [/tr[ií]ceps|mergulho|paralela/i, "Tríceps"],
  [/b[ií]ceps|rosca/i, "Bíceps"],
  [/supino|crucifixo|peck|flex[aã]o de bra|peito|voador/i, "Peito"],
  [/puxada|remada|barra fixa|pulldown|costas|serrote|levantamento terra/i, "Costas"],
  [/leg|cadeira|agachamento|panturrilha|stiff|afundo|g[eê]meos|gl[uú]teo|perna|avan[cç]o|hack/i, "Perna"],
  [/abdominal|prancha|core|abd[oô]men/i, "Abdômen"],
];
/** Grupo muscular de um exercício: o que você escolheu, senão pelo nome. */
export function grupoDe(d: Data, ex: string): string {
  const mine = fitOf(d).exGroups?.[ex];
  if (mine) return mine;
  return REGRAS.find(([re]) => re.test(ex))?.[1] ?? "Outros";
}
/** Grupo de uma rotina: o escolhido, senão o que mais aparece nos exercícios. */
export function grupoDaRotina(d: Data, r: Routine): string {
  if (r.group) return r.group;
  const n = new Map<string, number>();
  for (const e of r.exercises) n.set(grupoDe(d, e), (n.get(grupoDe(d, e)) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Outros";
}
export function setExGroup(d: Data, ex: string, g: string): Data {
  return setFit(d, { exGroups: { ...fitOf(d).exGroups, [ex]: g } });
}
/** Agrupa na ordem de GRUPOS, sem grupos vazios. */
export function agrupar<T>(itens: T[], grupo: (x: T) => string): { grupo: string; itens: T[] }[] {
  return [...GRUPOS, ...new Set(itens.map(grupo))].filter((g, i, a) => a.indexOf(g) === i)
    .map((g) => ({ grupo: g, itens: itens.filter((x) => grupo(x) === g) })).filter((x) => x.itens.length);
}

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const SUGESTOES = [
  // peito
  "Supino reto", "Supino inclinado", "Supino na máquina", "Crucifixo", "Crucifixo no cabo",
  // ombro
  "Desenvolvimento com halteres", "Desenvolvimento na máquina", "Elevação lateral na máquina", "Elevação lateral com halter",
  "Elevação frontal", "Crucifixo inverso", "Face pull",
  // tríceps
  "Tríceps corda", "Tríceps francês", "Tríceps testa", "Tríceps coice",
  // costas
  "Puxada na barra", "Puxada no triângulo", "Puxada na máquina", "Puxada frontal", "Remada baixa", "Remada curvada", "Remada na máquina",
  // bíceps
  "Rosca Scott na máquina", "Rosca martelo", "Rosca direta", "Rosca alternada",
  // perna
  "Leg press", "Cadeira extensora", "Cadeira flexora", "Agachamento hack", "Agachamento livre", "Panturrilha no hack", "Panturrilha em pé", "Stiff",
  "Abdominal",
];

/** Modelos para começar: você adiciona e muda do seu jeito. */
export const MODELOS: { name: string; focus: string; exercises: string[] }[] = [
  { name: "Peito, tríceps e ombro", focus: "Peito", exercises: ["Supino na máquina", "Crucifixo", "Tríceps corda", "Tríceps francês", "Elevação lateral na máquina"] },
  { name: "Costas e bíceps", focus: "Costas", exercises: ["Puxada na barra", "Puxada no triângulo", "Puxada na máquina", "Remada", "Rosca Scott na máquina", "Rosca martelo"] },
  { name: "Perna", focus: "Perna", exercises: ["Leg press", "Cadeira extensora", "Agachamento hack", "Panturrilha no hack"] },
];

// ---------- agenda (.ics) ----------

const ICS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/**
 * Calendário com um evento semanal por dia de treino (hora flutuante: o iPhone
 * usa o fuso dele). Abra o arquivo e escolha "Adicionar tudo".
 */
export function buildIcs(d: Data, now = new Date()): string {
  const f = fitOf(d);
  const hoje = localDay(now);
  const [hh, mm] = (f.time || "18:00").split(":").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (iso: string, h: number, m: number) => `${iso.replace(/-/g, "")}T${pad(h)}${pad(m)}00`;
  const ev = Object.entries(f.days).map(([wd, rid]) => {
    const w = Number(wd);
    const primeiro = Array.from({ length: 7 }, (_, i) => addDaysIso(hoje, i)).find((x) => new Date(t(x)).getDay() === w)!;
    const plano = planForDay(d, w);
    const nome = plano?.routine?.name;
    const dur = plano?.minutes ?? 75;
    const fim = (hh * 60 + mm + dur) % 1440;
    const linhas = plano ? [plano.focus ? `Ênfase: ${plano.focus}` : "", ...plano.exercises, plano.cardio ? `Cardio: ${plano.cardio.tipo} ${plano.cardio.min} min` : ""].filter(Boolean) : [];
    const desc = linhas.map((l) => l.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;")).join("\\n");
    return [
      "BEGIN:VEVENT",
      `UID:treino-${w}@orbita.app`,
      `DTSTAMP:${fmt(hoje, 0, 0)}Z`,
      `DTSTART:${fmt(primeiro, hh, mm)}`,
      `DTEND:${fmt(primeiro, Math.floor(fim / 60), fim % 60)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${ICS[w]}`,
      `SUMMARY:Treino${nome ? ` · ${nome}` : ""}`,
      ...(desc ? [`DESCRIPTION:${desc}`] : []),
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Hora do treino", "TRIGGER:-PT30M", "END:VALARM",
      "END:VEVENT",
    ].join("\r\n");
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Orbita//Treino//PT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", ...ev, "END:VCALENDAR", ""].join("\r\n");
}

// ---------- configuração inicial por arquivo ----------

/**
 * Junta num backup existente: data de nascimento e ajustes, metas, peso e agenda
 * de treino de um arquivo .json. Não mexe em transações nem em saldos.
 */
export function importSetup(d: Data, json: unknown): { data: Data; metas: number; pesos: number; aplicacoes: number } {
  const j = json as { cripto?: Cripto[]; prefs?: Partial<Data["config"]["prefs"]>; goals?: Goal[]; fit?: Partial<Fit>; clearInvoices?: boolean; cdb?: { replace?: boolean; tranches?: CdbTranche[]; pctCdi?: number } } | null;
  if (!j || typeof j !== "object") throw new Error("Arquivo inválido.");
  let out: Data = { ...d, config: { ...d.config, prefs: { ...d.config.prefs, ...(j.prefs ?? {}) } } };
  const ids = new Set((out.goals ?? []).map((g) => g.id));
  const novas = (j.goals ?? []).filter((g) => g?.id && g.title && !ids.has(g.id));
  out = { ...out, goals: [...(out.goals ?? []), ...novas] };
  const f = fitOf(out);
  const datas = new Set(f.weights.map((w) => w.date));
  const pesos = (j.fit?.weights ?? []).filter((w) => w?.date && w.kg > 0 && !datas.has(w.date));
  const rids = new Set(f.routines.map((r) => r.id));
  const novoFit = j.fit as (Partial<Fit> & { replace?: boolean; remap?: Record<string, string> }) | undefined;
  if (novoFit?.replace) {
    // reorganiza: troca rotinas, dias e ajustes do arquivo e leva os treinos já feitos para as rotinas novas
    const remap = novoFit.remap ?? {};
    out = setFit(out, {
      weights: [...f.weights, ...pesos].sort((a, b) => (a.date < b.date ? -1 : 1)),
      routines: novoFit.routines ?? [],
      days: { ...(novoFit.days ?? {}) },
      dayExtra: { ...(novoFit.dayExtra ?? {}) },
      workouts: f.workouts.map((w) => (w.routineId && remap[w.routineId] ? { ...w, routineId: remap[w.routineId] } : w)),
      time: novoFit.time ?? f.time,
    });
  } else {
    out = setFit(out, {
      weights: [...f.weights, ...pesos].sort((a, b) => (a.date < b.date ? -1 : 1)),
      routines: [...f.routines, ...(j.fit?.routines ?? []).filter((r) => r?.id && !rids.has(r.id))],
      days: { ...(j.fit?.days ?? {}), ...Object.fromEntries(Object.entries(f.days).filter(([k, v]) => v !== "" || !(j.fit?.days ?? {})[k])) },
      dayExtra: { ...(j.fit?.dayExtra ?? {}), ...(f.dayExtra ?? {}) },
      time: j.fit?.time && f.time === "18:00" ? j.fit.time : f.time,
    });
  }
  // fatura do cartão que já foi paga: tira a dívida de uma vez
  if (j.clearInvoices) out = { ...out, config: { ...out.config, invoices: [] } };
  // aplicações de renda fixa (como no C6): troca todas ou soma por id, sem perder uma conferência mais nova
  let aplicacoes = 0;
  const novasAp = (j.cdb?.tranches ?? []).filter((t) => t?.id && t.name && t.date && t.principal > 0 && t.pct > 0);
  if (novasAp.length) {
    const atuais = out.config.cdb.tranches ?? [];
    const merged = j.cdb?.replace
      ? novasAp.map((n) => {
          const velho = atuais.find((a) => a.id === n.id);
          return velho?.checkDate && (!n.checkDate || velho.checkDate > n.checkDate) ? { ...n, checkDate: velho.checkDate, checkValue: velho.checkValue } : n;
        })
      : [...atuais, ...novasAp.filter((n) => !atuais.some((a) => a.id === n.id))];
    aplicacoes = merged.length;
    out = { ...out, config: { ...out.config, cdb: { ...out.config.cdb, ...(j.cdb?.pctCdi ? { pctCdi: j.cdb.pctCdi } : {}), tranches: merged, moves: [] } } };
  }
  // moedas: soma por id, sem apagar o preço que você já atualizou
  const moedas = (j.cripto ?? []).filter((c) => c?.id && c.symbol && c.qty > 0 && c.avgCost > 0);
  if (moedas.length) {
    const atuais = out.cripto ?? [];
    out = { ...out, cripto: [...atuais, ...moedas.filter((m) => !atuais.some((a) => a.id === m.id))] };
  }
  return { data: out, metas: novas.length, pesos: pesos.length, aplicacoes };
}

// ---------- água, metas semanais e volume ----------

export const AGUA_PADRAO = { metaMl: 3000, horarios: ["12:00", "16:00", "20:00"], copoMl: 250 };
export const aguaOf = (d: Data) => ({ ...AGUA_PADRAO, log: {} as Record<string, number>, ...fitOf(d).agua });
export const setAgua = (d: Data, patch: Partial<NonNullable<Fit["agua"]>>): Data => setFit(d, { agua: { ...aguaOf(d), ...patch } });
/** Soma (ou tira, com ml negativo) água de um dia. Nunca fica abaixo de zero. */
export function addAgua(d: Data, ml: number, dia = localDay()): Data {
  const a = aguaOf(d);
  return setAgua(d, { log: { ...a.log, [dia]: Math.max(0, (a.log[dia] ?? 0) + ml) } });
}
/** Os pontos do dia: "1 L até 12:00", "2 L até 16:00"... (acumulado). */
export function aguaMarcos(d: Data) {
  const a = aguaOf(d);
  const hs = [...a.horarios].sort();
  return hs.map((h, i) => ({ ate: h, ml: Math.round((a.metaMl * (i + 1)) / hs.length), parte: Math.round(a.metaMl / hs.length) }));
}
export function aguaSemana(d: Data, hoje = localDay()) {
  const a = aguaOf(d);
  const dias = weekDates(hoje);
  return { ml: dias.reduce((s, x) => s + (a.log[x] ?? 0), 0), meta: a.metaMl * 7 };
}
const litros = (ml: number) => `${(ml / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L`;
export const fmtAgua = litros;

/** Lembretes diários de água para o calendário do iPhone: um alerta antes de cada horário. */
export function buildAguaIcs(d: Data, now = new Date()): string {
  const hoje = localDay(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  const ev = aguaMarcos(d).map((m, i) => {
    const [hh, mm] = m.ate.split(":").map(Number);
    const ini = hh * 60 + mm - 30;
    const ini0 = ((ini % 1440) + 1440) % 1440;
    const texto = `Tomar ${litros(m.parte)} de água até ${m.ate}`;
    return [
      "BEGIN:VEVENT",
      `UID:agua-${i}-${m.ate.replace(":", "")}@orbita.app`,
      `DTSTAMP:${hoje.replace(/-/g, "")}T000000Z`,
      `DTSTART:${hoje.replace(/-/g, "")}T${pad(Math.floor(ini0 / 60))}${pad(ini0 % 60)}00`,
      `DTEND:${hoje.replace(/-/g, "")}T${pad(hh)}${pad(mm)}00`,
      "RRULE:FREQ=DAILY",
      `SUMMARY:${texto}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${texto}`, "TRIGGER:PT0M", "END:VALARM",
      "END:VEVENT",
    ].join("\r\n");
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Orbita//Agua//PT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", ...ev, "END:VCALENDAR", ""].join("\r\n");
}

/**
 * Metas semanais. Padrões vêm da literatura e você muda tudo:
 * - cardio 150 min/semana: mínimo de atividade moderada da OMS (2020) para adultos;
 * - séries por grupo: a meta-análise de Schoenfeld, Ogborn e Krieger (2017) viu mais ganho de massa com 10 ou mais séries
 *   por semana por músculo, e Pelland et al. (2024, preprint) mostram retorno que cresce com o volume, cada vez menor.
 *   Bíceps e tríceps já trabalham nos exercícios de costas e peito, então precisam de menos séries diretas.
 */
export const ALVOS_PADRAO = { cardioMin: 150, series: { Peito: 12, Costas: 12, Ombro: 12, Bíceps: 10, Tríceps: 8, Perna: 12, Abdômen: 6 } as Record<string, number> };
export const alvosOf = (d: Data) => ({ ...ALVOS_PADRAO, ...fitOf(d).alvos, series: { ...ALVOS_PADRAO.series, ...(fitOf(d).alvos?.series ?? {}) } });
export const setAlvos = (d: Data, patch: Partial<NonNullable<Fit["alvos"]>>): Data => setFit(d, { alvos: { ...alvosOf(d), ...patch } });

/** O que você já fez na semana (segunda a domingo): minutos de cardio e séries por grupo. */
export function feitoNaSemana(d: Data, hoje = localDay()) {
  const dias = weekDates(hoje);
  const ws = fitOf(d).workouts.filter((w) => w.date >= dias[0] && w.date <= dias[6]);
  const series: Record<string, number> = {};
  for (const w of ws) for (const s of w.sets) series[grupoDe(d, s.ex)] = (series[grupoDe(d, s.ex)] ?? 0) + 1;
  return { cardio: ws.reduce((a, w) => a + (w.cardio?.min ?? 0), 0), series };
}

/** Peso total levantado (kg × repetições): hoje, semana, mês, ano e desde sempre. Só curiosidade. */
export function pesoLevantado(d: Data, hoje = localDay()) {
  const dias = weekDates(hoje);
  const vol = (w: Workout) => w.sets.reduce((a, s) => a + s.kg * s.reps, 0);
  const soma = (f: (w: Workout) => boolean) => Math.round(fitOf(d).workouts.filter(f).reduce((a, w) => a + vol(w), 0));
  return {
    dia: soma((w) => w.date === hoje),
    semana: soma((w) => w.date >= dias[0] && w.date <= dias[6]),
    mes: soma((w) => w.date.slice(0, 7) === hoje.slice(0, 7)),
    ano: soma((w) => w.date.slice(0, 4) === hoje.slice(0, 4)),
    total: soma(() => true),
  };
}
