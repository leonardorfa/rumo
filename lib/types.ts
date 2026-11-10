import type { SpecialExpense } from "./projections";
import type { CustomCat } from "./categories";

export interface Tx {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // negativo = saída
  category: string;
  review: boolean; // precisa da sua revisão
  manual?: boolean; // lançado por você, não veio do extrato
  card?: boolean; // compra da fatura do cartão (não mexe no saldo da conta)
  installment?: string; // "3/10" quando é parcelado
  note?: string; // anotação sua
  splitFrom?: string; // pedaço de uma transação dividida (chave da original, para o extrato não duplicar)
}

export interface FatherEntry {
  id: string;
  txId?: string; // veio de um lançamento: o crédito acompanha o gasto dele
  date: string;
  description: string;
  amount: number; // + pai te passou crédito, − você usou em nome dele
  balanceAfter: number; // negativo = pai te deve
}

/** Regra de classificação. `pattern` já normalizado; `sign` 0 = qualquer. */
export interface Rule {
  pattern: string;
  category: string;
  sign: 1 | -1 | 0;
  learned?: boolean;
}

/** Conta fixa editável. `match` = palavra que aparece no extrato quando paga. */
export interface Bill {
  id: string;
  name: string;
  amount: number;
  match: string;
  atSource: boolean; // já sai do salário: não entra na projeção
  day?: number; // dia do vencimento (sem isso, o app descobre pelo extrato)
  from?: string; // YYYY-MM: parcelamento começa aqui
  until?: string; // YYYY-MM: última parcela (sem isso é conta fixa para sempre)
}

/** Tudo que é gosto seu: nada disso fica fixo no código. */
export interface Prefs {
  name: string; // como o app te chama
  hideOnStart: boolean; // abrir com os valores escondidos
  avgMonths: number; // meses usados nas médias ("seu ritmo", áreas)
  economyPct: number; // cenário Econômico: % abaixo do teto
  areasCount: number; // quantas áreas "Pela minha média" cria
  alertPct: number; // avisar quando a área passar desse % do plano
  backupDays: number; // lembrar do backup depois de tantos dias
  countReceivables: boolean; // o que te devem conta no "meu dinheiro"
  birth: string; // data de nascimento (YYYY-MM-DD), para as metas por idade
  returnPct: number; // retorno esperado ao ano, para as metas de longo prazo
  payday: number; // dia do salário (0 = descobrir pelo extrato)
}

export interface Config {
  prefs: Prefs;
  salary: number;
  bills: Bill[];
  goalAmount: number;
  goalDeadline: string; // YYYY-MM
  accountBalance: number; // saldo da conta (inclui o crédito do pai)
  balanceDate: string; // de quando é o saldo acima
  rendaFixa: number; // valor acumulado do CDB na data abaixo
  rendaFixaDate: string; // quando esse valor foi conferido no app do C6
  cdb: {
    pctCdi: number; cdiAnnual: number; principal: number; since?: string; // principal e since valem na data da última conferência
    moves?: CdbMove[]; // aplicações e resgates depois da conferência, cada um rende a partir da sua data
    checks?: { date: string; app: number; c6: number }[]; // o que o app calculou vs o que o C6 mostrou
  };
  cdiDaily: Record<string, number>; // CDI de cada dia útil (% ao dia), do Banco Central
  fatherCreditStart: number;
  salaryReceivedMonth: string; // YYYY-MM em que o salário já caiu
  specialExpenses: SpecialExpense[];
  customCats: CustomCat[]; // categorias que você criou
  envelopes: Envelope[]; // divisão do teto por categoria
  envelopeOverrides: Record<string, Record<string, number>>; // mês -> id -> valor
  billsPaid: Record<string, string[]>; // mês -> ids de contas marcadas como pagas
  lock: { on: boolean; pinHash: string; credId: string }; // trava do app
  dismissedRecurring: string[]; // sugestões de conta fixa que você recusou
  invoices: Invoice[]; // faturas do cartão importadas
}

/** Fatura do cartão: o total vira dívida até o pagamento aparecer no extrato. */
export interface Invoice {
  id: string;
  due: string; // vencimento YYYY-MM-DD
  total: number;
  paidManual?: boolean; // você marcou como paga
}

/** Envelope do teto: um pedaço do quanto dá para gastar no mês. */
export interface Envelope {
  id: string;
  label: string;
  cats: string[]; // vazio = tudo que não está em outro envelope
  share: number; // fatia do teto (0 a 1), usada quando não há ajuste do mês
}

/** Meta com prazo. `net` acompanha o "meu dinheiro", `weight` o peso, `count` um número que você atualiza. */
export interface Goal {
  id: string;
  title: string;
  icon: string;
  kind: "net" | "weight" | "count";
  unit: string; // "R$", "kg", "páginas"…
  start: number;
  startDate: string; // YYYY-MM-DD
  target: number;
  deadline: string; // YYYY-MM-DD
  log?: { date: string; value: number }[]; // count: progresso acumulado a cada atualização
  returnPct?: number; // net: retorno esperado ao ano (senão o padrão de Ajustes)
}

export interface Cardio { tipo: string; min: number }
export interface Routine {
  id: string;
  name: string;
  exercises: string[];
  focus?: string; // ênfase do dia (ex.: peito)
  minutes?: number; // tempo que você tem para treinar
  cardio?: Cardio; // cardio previsto (ex.: bike 20 min)
}
export interface Workout {
  id: string;
  date: string;
  routineId?: string;
  note?: string;
  cardio?: Cardio; // o que você fez de cardio
  sets: { ex: string; kg: number; reps: number }[];
}
/** Treino: peso, agenda da semana, rotinas e o que você fez em cada dia. */
export interface Fit {
  weights: { date: string; kg: number }[];
  days: Record<string, string>; // "0" domingo … "6" sábado → id da rotina ("" = treino sem rotina); ausente = descanso
  time: string; // "18:00", só para a agenda
  routines: Routine[];
  workouts: Workout[];
}

/** Dinheiro que entrou (+) ou saiu (−) do CDB numa data. */
export interface CdbMove { date: string; amount: number; txId?: string; principal?: number } // principal: quanto muda o total aplicado (no resgate é proporcional)

/** Alguém te deve. Os pagamentos vão abatendo até zerar. */
export interface Receivable {
  id: string;
  person: string;
  description: string;
  amount: number; // total devido
  date: string; // quando começou a dever
  payments: { date: string; amount: number; txId?: string }[];
}

export interface Data {
  version: 1;
  txs: Tx[];
  father: FatherEntry[];
  receivables?: Receivable[]; // quem te deve (backup antigo não tem)
  goals?: Goal[]; // metas de vida
  fit?: Fit; // treino
  rules: Rule[];
  config: Config;
  lastBackup: string | null;
}

// Formato devolvido pelo parser de texto.
export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
}
