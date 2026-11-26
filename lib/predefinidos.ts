// O app não traz mais treinos prontos: ficam só o treino livre e as rotinas que você criar.
// Este arquivo tira dos dados os três treinos pré-definidos antigos (inclusive os que vieram por arquivo).
import type { Data, Routine } from "./types";

const IDS = new Set(["rot-peito", "rot-costas", "rot-perna"]);
const NOMES = new Set(["peito, tríceps e ombro", "costas e bíceps", "perna"]);
export const ehPredefinido = (r: Routine) => IDS.has(r.id) || NOMES.has(r.name.trim().toLowerCase());

/**
 * Remove os treinos pré-definidos uma única vez. Os dias de treino continuam marcados (como treino livre),
 * e os treinos já feitos guardam o nome antigo para o histórico.
 */
export function semPredefinidos(d: Data): Data {
  const f = d.fit;
  if (!f || f.semPredefinidos) return d;
  const fora = new Map((f.routines ?? []).filter(ehPredefinido).map((r) => [r.id, r.name]));
  const dias = Object.entries(f.days ?? {});
  const afetados = new Set(dias.filter(([, v]) => fora.has(v)).map(([k]) => k));
  return {
    ...d,
    fit: {
      ...f,
      routines: (f.routines ?? []).filter((r) => !fora.has(r.id)),
      days: Object.fromEntries(dias.map(([k, v]) => [k, fora.has(v) ? "" : v])),
      dayExtra: Object.fromEntries(Object.entries(f.dayExtra ?? {}).filter(([k]) => !afetados.has(k))),
      workouts: (f.workouts ?? []).map((w) => (w.routineId && fora.has(w.routineId) ? { ...w, routineId: undefined, nome: fora.get(w.routineId) } : w)),
      semPredefinidos: true,
    },
  };
}
