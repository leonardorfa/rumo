export interface SpecialExpense {
  month: number; // 1-12
  amount: number;
  description: string;
}

export interface ProjectionInput {
  effectiveBalance: number; // meu dinheiro (conta - pai + renda fixa)
  salary: number;
  fixedCosts: number;
  remainingMonths: number;
  specialExpenses: SpecialExpense[];
  goalAmount: number;
  startYear: number;
  startMonth: number; // 1-12, first projected month
  // Se o salário do mês atual já caiu (já está no effectiveBalance), não conta
  // salário no 1º mês projetado — evita contar a mesma entrada duas vezes.
  skipFirstMonthSalary: boolean;
  // O que já saiu este mês está no saldo: não pode ser descontado de novo.
  spentThisMonth?: number; // gasto variável já feito no mês atual
  paidFixedThisMonth?: number; // contas fixas do mês atual já pagas
  recentAvg?: number; // seu gasto variável médio dos últimos meses
  economyPct?: number; // cenário Econômico: % abaixo do teto
}

export interface MonthProjection {
  year: number;
  month: number; // 1-12
  label: string; // "Jul/26"
  special: number;
  projectedBalance: number;
}

export interface ScenarioResult {
  key: "teto" | "ritmo" | "economico";
  label: string;
  color: string;
  description: string;
  monthlyVariable: number;
  weeklyBudget: number;
  months: MonthProjection[];
  finalBalance: number;
  hitsGoal: boolean;
}

const MONTH_NAMES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

export const SCENARIOS = {
  teto: { label: "Teto", color: "#EF9F27", description: "O máximo por mês que ainda bate a meta" },
  ritmo: { label: "Seu ritmo", color: "#1D9E75", description: "Gastando como nos últimos 3 meses" },
  economico: { label: "Econômico", color: "#378ADD", description: "Abaixo do teto: sobra para guardar" },
} as const;

/** Nº de salários futuros: se o do mês atual já caiu, conta um a menos. */
function salaryMonths(input: ProjectionInput): number {
  return input.remainingMonths - (input.skipFirstMonthSalary ? 1 : 0);
}

/** Teto: max monthly variable spend that still lands on the goal in December. */
export function calculateCeilingVariable(input: ProjectionInput): number {
  const totalAvailable =
    input.effectiveBalance + salaryMonths(input) * input.salary;
  const totalFixed = input.remainingMonths * input.fixedCosts - (input.paidFixedThisMonth ?? 0);
  const totalSpecial = input.specialExpenses.reduce((s, e) => s + e.amount, 0);
  // o gasto deste mês já saiu do saldo: volta para a conta para o teto do mês ser o mês inteiro
  const maxVariable =
    (totalAvailable - totalFixed - totalSpecial - input.goalAmount + (input.spentThisMonth ?? 0)) /
    input.remainingMonths;
  return Math.floor(maxVariable);
}

function monthList(input: ProjectionInput): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  let y = input.startYear;
  let m = input.startMonth;
  for (let i = 0; i < input.remainingMonths; i++) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function buildMonthlyProjection(
  input: ProjectionInput,
  monthlyVariable: number,
  perMonth?: number[] // plano de cada mês (simulador por área); sem ele, o mesmo valor todo mês
): MonthProjection[] {
  let balance = input.effectiveBalance;
  return monthList(input).map(({ year, month }, i) => {
    const special = input.specialExpenses
      .filter((e) => e.month === month)
      .reduce((s, e) => s + e.amount, 0);
    // 1º mês não recebe salário se ele já caiu (já está no saldo inicial).
    const salaryThisMonth =
      i === 0 && input.skipFirstMonthSalary ? 0 : input.salary;
    const plano = perMonth?.[i] ?? monthlyVariable;
    // no mês atual só sai o que falta: o já gasto e as contas já pagas estão no saldo
    const variable = i === 0 ? Math.max(0, plano - (input.spentThisMonth ?? 0)) : plano;
    const fixed = i === 0 ? input.fixedCosts - (input.paidFixedThisMonth ?? 0) : input.fixedCosts;
    balance = balance + salaryThisMonth - fixed - special - variable;
    return {
      year,
      month,
      label: `${MONTH_NAMES[month - 1]}/${String(year).slice(-2)}`,
      special,
      projectedBalance: Math.round(balance),
    };
  });
}

/** Compute all three scenarios for the dashboard. */
export function computeScenarios(input: ProjectionInput): ScenarioResult[] {
  const teto = calculateCeilingVariable(input);

  const build = (
    key: ScenarioResult["key"],
    variable: number
  ): ScenarioResult => {
    const months = buildMonthlyProjection(input, variable);
    const finalBalance = months.length
      ? months[months.length - 1].projectedBalance
      : Math.round(input.effectiveBalance);
    const meta = SCENARIOS[key];
    return {
      key,
      label: meta.label,
      color: meta.color,
      description: meta.description,
      monthlyVariable: variable,
      weeklyBudget: Math.round(variable / 4.33),
      months,
      finalBalance,
      hitsGoal: finalBalance >= input.goalAmount,
    };
  };

  return [
    build("teto", Math.max(0, teto)), // meta que não cabe: gastar zero é o máximo possível (nunca gasto negativo)
    build("ritmo", Math.round(input.recentAvg ?? teto)),
    build("economico", Math.max(0, Math.round(teto * (1 - (input.economyPct ?? 30) / 100)))),
  ];
}

/**
 * Em quantos meses (a partir do atual) o saldo chega na meta gastando
 * `monthly` por mês. null = nunca (o que entra não cobre o que sai).
 */
export function monthsToGoal(input: ProjectionInput, monthly: number, max = 120): number | null {
  let balance = input.effectiveBalance;
  if (balance >= input.goalAmount) return 0;
  const fixedNow = input.fixedCosts - (input.paidFixedThisMonth ?? 0);
  for (let i = 0; i < max; i++) {
    const salary = i === 0 && input.skipFirstMonthSalary ? 0 : input.salary;
    const variable = i === 0 ? Math.max(0, monthly - (input.spentThisMonth ?? 0)) : monthly;
    const special = i < input.remainingMonths
      ? input.specialExpenses.filter((e) => e.month === ((input.startMonth - 1 + i) % 12) + 1).reduce((s, e) => s + e.amount, 0)
      : 0;
    balance += salary - (i === 0 ? fixedNow : input.fixedCosts) - special - variable;
    if (balance >= input.goalAmount) return i + 1;
  }
  return null;
}

/** Months remaining from a start (year,month) through December of goal year. */
export function remainingMonthsUntil(
  startYear: number,
  startMonth: number,
  goalYear: number,
  goalMonth: number
): number {
  return (goalYear - startYear) * 12 + (goalMonth - startMonth) + 1;
}
