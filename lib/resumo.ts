// Resumo em texto da sua situação, para colar numa IA de sua escolha (ChatGPT, Gemini, Claude).
// Sai só quando você pede, sem nome nem dado de banco.
import { brl, localDay, monthName } from "./format";
import { ageText, fitOf, goalStatus, moneyPlan, spanText, weekStats, weightTrend } from "./life";
import { categoryAverages, cdbNet, fatherBalance, myMoney, receivablesOpen } from "./store";
import { catName } from "./categories";
import type { Data } from "./types";

export function buildResumo(d: Data, now = new Date()): string {
  const hoje = localDay(now);
  const p = d.config.prefs;
  const L: string[] = [];
  L.push(`Hoje é ${hoje.split("-").reverse().join("/")}.${p.birth ? ` Tenho ${ageText(p.birth, now)}.` : ""}`);
  L.push("", "DINHEIRO");
  L.push(`- Meu dinheiro (já tirando o que é do meu pai e a fatura do cartão): ${brl(myMoney(d))}`);
  L.push(`- Saldo bruto da conta: ${brl(d.config.accountBalance)}; crédito do meu pai: ${brl(fatherBalance(d))}`);
  const c = cdbNet(d, now);
  if (c.bruto) L.push(`- CDB: ${brl(c.bruto)} bruto, ${brl(c.liquido)} líquido de IR (${d.config.cdb.pctCdi}% do CDI)`);
  if (receivablesOpen(d)) L.push(`- Me devem: ${brl(receivablesOpen(d))}`);
  L.push(`- Salário líquido: ${brl(d.config.salary)}`);
  const fixas = d.config.bills.filter((b) => !b.atSource);
  if (fixas.length) L.push(`- Contas fixas e parcelas: ${fixas.map((b) => `${b.name} ${brl(b.amount)}${b.until ? ` (até ${b.until})` : ""}`).join(", ")}`);
  const med = Object.entries(categoryAverages(d, hoje.slice(0, 7))).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (med.length) L.push(`- Gasto médio por mês (últimos ${p.avgMonths} meses): ${med.map(([k, v]) => `${catName(k, d.config.customCats)} ${brl(v)}`).join("; ")}`);
  const metas = d.goals ?? [];
  if (metas.length) {
    L.push("", "METAS");
    for (const g of metas) {
      const s = goalStatus(d, g, now);
      const un = (v: number) => (g.unit === "R$" ? brl(v) : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${g.unit}`);
      L.push(`- ${g.title}: estou em ${un(s.atual)}, meta ${un(g.target)} até ${g.deadline.split("-").reverse().join("/")} (faltam ${spanText(hoje, g.deadline)}).${g.kind === "net" ? "" : s.naFrente ? " Estou no ritmo." : " Estou atrasado."}`);
      if (g.kind === "net") {
        const pl = moneyPlan(d, g, now);
        L.push(`  Para chegar lá, a ${pl.taxa}% ao ano, preciso guardar ${brl(pl.aporte)} por mês. ${pl.ritmo ? ` Meu patrimônio vem crescendo ${brl(pl.ritmo)} por mês.` : ""}`);
      }
    }
  }
  const f = fitOf(d);
  if (f.weights.length || f.workouts.length || Object.keys(f.days).length) {
    L.push("", "TREINO");
    const w = f.weights[f.weights.length - 1];
    if (w) L.push(`- Último peso: ${w.kg} kg em ${w.date.split("-").reverse().join("/")}${weightTrend(d, now) !== null ? `; tendência ${weightTrend(d, now)} kg por semana` : ""}`);
    const ws = weekStats(d, now);
    const dias = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
    if (ws.previstos) L.push(`- Treino ${ws.previstos}x por semana (${Object.keys(f.days).map((k) => dias[Number(k)]).join(", ")}); nesta semana fiz ${ws.feitos}`);
    const ult = f.workouts.slice(-3).reverse();
    for (const t of ult) L.push(`- ${t.date.split("-").reverse().join("/")}: ${[...new Set(t.sets.map((s) => s.ex))].join(", ")}`);
  }
  L.push("", `(${monthName(hoje.slice(0, 7))} de ${hoje.slice(0, 4)}.) Minha pergunta: `);
  return L.join("\n");
}
