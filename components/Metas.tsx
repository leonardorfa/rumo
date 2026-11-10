"use client";

import { useMemo, useState } from "react";
import { brl0, dayLabel, daysInMonth, monthName, shiftMonth } from "@/lib/format";
import { forecast30, netWorthHistory, runway, savingsRate } from "@/lib/insights";
import { buildMonthlyProjection, computeScenarios, monthsToGoal, type ProjectionInput, type ScenarioResult } from "@/lib/projections";
import { envelopes } from "@/lib/stats";
import { catIcon, catName, pickerGroups } from "@/lib/categories";
import { categoryAverages, deleteEnvelope, envelopeBudgets, envelopesFromHistory, saveEnvelope, setAreaFromNow, monthKey, myMoney, projectionInput, resetEnvelopes, setEnvelopeAmount, update, useData } from "@/lib/store";
import type { Data, Envelope } from "@/lib/types";
import { ForecastChart, ProjectionChart } from "./charts";
import Vida from "./Vida";
import { Partes } from "./Partes";
import { act, Button, Card, Money, MonthSwitcher, Progress, Section, Segmented, Sheet, Title, toast } from "./ui";

export default function Metas() {
  const d = useData();
  const [key, setKey] = useState<ScenarioResult["key"]>("teto");
  const input = useMemo(() => projectionInput(d), [d]);
  const scenarios = useMemo(() => computeScenarios(input), [input]);
  const s = scenarios.find((x) => x.key === key)!;
  const teto = Math.max(0, scenarios[0].monthlyVariable);
  const meu = myMoney(d);
  const goal = d.config.goalAmount;
  const [gy, gm] = d.config.goalDeadline.split("-").map(Number);
  const deadline = monthName(`${gy}-${String(gm).padStart(2, "0")}`).toLowerCase();
  const now = monthKey();
  const caiuNoExtrato = d.txs.some((t) => t.category === "income_salary" && t.amount > 0 && t.date.startsWith(now));
  const received = caiuNoExtrato || d.config.salaryReceivedMonth === now;
  const [envMonth, setEnvMonth] = useState(now);
  const [remanejar, setRemanejar] = useState(false);
  const [editar, setEditar] = useState(false);
  const [aba, setAba] = useState<"vida" | "meta" | "areas" | "previsao">(() => {
    try { return (localStorage.getItem("aba-meta") as "vida" | "meta" | "areas" | "previsao") || "vida"; } catch { return "vida"; }
  });
  const trocarAba = (v: "vida" | "meta" | "areas" | "previsao") => {
    setAba(v);
    try { localStorage.setItem("aba-meta", v); } catch { /* sem storage: só não lembra */ }
  };
  const [periodo, setPeriodo] = useState(String(d.config.prefs.avgMonths));
  // Meta que não cabe deixa o teto em zero: as áreas usam a sua média para a simulação não ficar vazia.
  const inviavel = scenarios[0].monthlyVariable <= 0;
  const base = inviavel ? input.recentAvg || 0 : teto;
  const env = envelopes(d, envMonth, base);
  const mesSemDados = !d.txs.some((t) => t.date.startsWith(envMonth));
  const totalEnv = env.reduce((a, e) => a + e.budget, 0);
  const avg = useMemo(() => categoryAverages(d), [d]);
  const nomeados = d.config.envelopes.flatMap((e) => e.cats);
  const mediaDe = (cats: string[]) =>
    Object.entries(avg).filter(([k]) => (cats.length ? cats.includes(k) : !nomeados.includes(k))).reduce((a, [, v]) => a + v, 0);
  const sim = useMemo(() => simular(d, base), [d, base]);
  const diasRest = envMonth === now ? daysInMonth(now) - new Date().getDate() + 1 : 0;

  const chart = [{ label: "Hoje", value: Math.round(meu) }, ...s.months.map((m) => ({ label: m.label.split("/")[0], value: m.projectedBalance }))];
  const f30 = useMemo(() => forecast30(d, teto), [d, teto]);
  const historia = useMemo(() => netWorthHistory(d, 6).map((p) => ({ label: monthName(p.month).slice(0, 3), value: p.value })), [d]);
  const reserva = runway(d);
  const mesPassado = shiftMonth(now, -1);
  const poupanca = savingsRate(d.txs, mesPassado);

  return (
    <div>
      <Title>Metas</Title>

      <div className="sticky top-0 z-20 -mx-4 px-4 pt-1 pb-2 bg-bg" style={{ paddingTop: "max(4px, env(safe-area-inset-top))" }}>
        <Segmented value={aba} onChange={trocarAba}
          options={[{ value: "vida", label: "Vida" }, { value: "meta", label: "Atual" }, { value: "areas", label: "Áreas" }, { value: "previsao", label: "Previsão" }]} />
      </div>

      {aba === "vida" && <Vida />}

      {aba === "meta" && (
        <>
          {inviavel && <MetaInviavel input={input} ritmo={input.recentAvg || 0} deadline={deadline} />}
      <Card>
        <div className="text-ink2 text-[15px]">{brl0(goal)} até {deadline}</div>
        <div className="flex items-baseline gap-2 mt-0.5">
          <Money v={meu} className="text-[28px] font-bold" />
          <span className="text-ink3">de {brl0(goal)}</span>
        </div>
        <div className="mt-2"><Progress value={Math.min(meu, goal)} max={goal} color="var(--meta)" /></div>
        <div className="text-[13px] text-ink2 mt-2">
          {meu >= goal ? "Meta batida hoje." : <>Faltam <Money v={goal - meu} /></>}
        </div>
        <Partes />
      </Card>

      <Section>Quanto posso gastar</Section>
      <Segmented
        value={key}
        onChange={setKey}
        options={scenarios.map((x) => ({ value: x.key, label: x.label }))}
      />
      <Card className="mt-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[13px] text-ink3">Por mês</div>
            <Money v={s.monthlyVariable} className="text-[22px] font-bold block truncate" />
          </div>
          <div>
            <div className="text-[13px] text-ink3">Por semana</div>
            <Money v={s.weeklyBudget} className="text-[22px] font-bold block truncate" />
          </div>
        </div>
        <div className="text-[13px] text-ink2 mt-1">{s.description}</div>
        <div className="mt-3"><ProjectionChart data={chart} goal={goal} /></div>
        <div className={`flex items-center gap-2 mt-2 text-[15px] ${s.hitsGoal ? "text-ok" : "text-alert"}`}>
          <span aria-hidden>{s.hitsGoal ? "✓" : "⚠︎"}</span>
          <span>{s.hitsGoal ? "Bate a meta" : "Não bate a meta"}: fecha {deadline} com <Money v={s.finalBalance} /></span>
        </div>
        <details className="mt-3 text-[15px]">
          <summary className="text-meu cursor-pointer">Ver mês a mês</summary>
          <div className="divide-y divide-line mt-2">
            {s.months.map((m) => (
              <div key={m.label} className="flex justify-between py-2">
                <span className="text-ink2">{m.label}{m.special ? ` · extra ${brl0(m.special)}` : ""}</span>
                <Money v={m.projectedBalance} />
              </div>
            ))}
          </div>
        </details>
      </Card>

      <label className="flex items-center justify-between bg-card rounded-2xl px-4 py-3 mt-3 gap-3">
        <span>
          <span className="block">O salário de {monthName(now).toLowerCase()} já caiu</span>
          <span className="block text-[13px] text-ink3">{caiuNoExtrato ? "Achei no extrato: já está no saldo" : "Se já caiu, ele já está no saldo e não conta de novo"}</span>
        </span>
        <input type="checkbox" checked={received} disabled={caiuNoExtrato} className="!w-6 !h-6 shrink-0 accent-[var(--meu)]"
          onChange={(e) => update((dd) => ({ ...dd, config: { ...dd.config, salaryReceivedMonth: e.target.checked ? now : "" } }))} />
      </label>

      {historia.length > 1 && (
        <>
          <Section>Evolução do meu dinheiro</Section>
          <Card>
            <ProjectionChart data={historia} goal={goal} name="Meu dinheiro" />
            <div className="text-[13px] text-ink3 mt-1">
              Fim de cada mês, refeito pelo extrato. O CDB antigo é aproximado.
            </div>
          </Card>
        </>
      )}

        </>
      )}

      {aba === "areas" && (
        <>
          {inviavel && <MetaInviavel input={input} ritmo={input.recentAvg || 0} deadline={deadline} curto />}
      <div className="flex items-center justify-between mt-4 mb-2 px-1 gap-2">
        <h2 className="text-[20px] font-semibold leading-tight">Plano por área</h2>
        <MonthSwitcher month={envMonth} onChange={setEnvMonth} />
      </div>
      <Card>
        <div className="flex justify-between text-[15px]">
          <span className="text-ink2">Plano de {monthName(envMonth).toLowerCase()}</span>
          <Money v={totalEnv} className="font-semibold" />
        </div>
        <div className="flex justify-between text-[13px] text-ink3">
          <span>{inviavel ? "sua média (a meta não cabe no prazo)" : "teto para bater a meta"}</span>
          <Money v={base} />
        </div>
        <div className={`mt-2 text-[15px] font-medium ${sim.fim >= goal ? "text-ok" : "text-alert"}`}>
          {sim.fim >= goal ? "✓ " : "⚠︎ "}Com esse plano você fecha {deadline} com <Money v={sim.fim} />
        </div>
        <div className="text-[13px] text-ink2">
          {sim.fim >= goal
            ? <>Bate a meta{sim.fim - goal >= 1 ? <> e sobram <Money v={sim.fim - goal} /></> : ""}.</>
            : <>Faltam <Money v={goal - sim.fim} /> para a meta: tire de alguma área.</>}
        </div>
      </Card>

      {mesSemDados && (
        <p className="text-[13px] text-alert px-1 mt-2">
          Ainda não tem nada de {monthName(envMonth).toLowerCase()} no app: o “gastou” fica em zero até você importar o extrato (Mais → Importar) ou lançar no +.
        </p>
      )}
      <div className="card px-4 mt-3">
        {env.map((e, i) => {
          const media = mediaDe(d.config.envelopes.find((x) => x.id === e.id)?.cats ?? []);
          const sobra = e.budget - e.spent;
          return (
            <div key={e.id} className={`py-3 ${i ? "border-t border-line" : ""}`}>
              <div className="flex justify-between items-baseline gap-2">
                <span className="text-[16px] font-medium truncate">{e.label}</span>
                <Money v={e.budget} className="text-[16px] font-semibold shrink-0" />
              </div>
              <div className="flex justify-between text-[12px] text-ink3 mb-1.5 gap-2">
                <span>{media ? <>sua média <Money v={media} />/mês</> : "sem histórico"}</span>
                <span className="shrink-0"><Money v={e.budget / 4.33} />/semana</span>
              </div>
              <Progress value={e.spent} max={e.budget} />
              <div className={`text-[12px] mt-1 ${sobra < 0 ? "text-alert font-medium" : "text-ink2"}`}>
                gastou <Money v={e.spent} /> ·{" "}
                {sobra < 0
                  ? <>passou <Money v={-sobra} /></>
                  : <>sobram <Money v={sobra} />{diasRest ? <> (<Money v={sobra / diasRest} />/dia)</> : ""}</>}
              </div>
            </div>
          );
        })}
      </div>
      <Button tone="primary" className="w-full mt-3" onClick={() => setRemanejar(true)}>Simular / remanejar este mês</Button>
      <Button className="w-full mt-2" onClick={() => setEditar(true)}>Editar áreas (nomes, categorias, valores)</Button>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <Button onClick={() => act("Áreas montadas pela sua média", (dd) => envelopesFromHistory(dd, monthKey(), teto))}>Pela minha média</Button>
        <Button onClick={() => { update((dd) => resetEnvelopes(dd, envMonth)); toast("Teto do mês dividido entre as áreas"); }}>
          Usar o teto todo
        </Button>
      </div>
      <p className="text-[13px] text-ink3 px-1 mt-2">
        “Pela minha média” põe em cada área o quanto você gasta nela (média dos últimos 3 meses) e o resto do teto fica
        guardado. “Usar o teto todo” divide o teto inteiro do mês entre as áreas. Ao remanejar, o resultado de {deadline} muda na hora.
      </p>

      <MediaPorCategoria d={d} periodo={periodo} setPeriodo={setPeriodo} />

        </>
      )}

      {aba === "previsao" && (
        <>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <Card>
          <div className="text-[13px] text-ink3">Reserva</div>
          <div className="text-[24px] font-bold leading-tight">{reserva.meses === null ? "—" : `${reserva.meses.toLocaleString("pt-BR")} meses`}</div>
          <div className="text-[12px] text-ink3">vivendo com <Money v={reserva.custo} />/mês</div>
        </Card>
        <Card>
          <div className="text-[13px] text-ink3">Guardou em {monthName(mesPassado).toLowerCase()}</div>
          <div className={`text-[24px] font-bold leading-tight ${poupanca.pct !== null && poupanca.pct < 0 ? "text-alert" : ""}`}>
            {poupanca.pct === null ? "—" : `${poupanca.pct}%`}
          </div>
          <div className="text-[12px] text-ink3">da sua renda{poupanca.pct === null ? " (sem entrada no mês)" : ""}</div>
        </Card>
      </div>

      <Section>Próximos 30 dias</Section>
      <Card>
        <div className="text-[13px] text-ink2 mb-1">
          Seu dinheiro na conta, gastando no ritmo do teto. Salário ~dia {f30.payday}.
        </div>
        <ForecastChart data={f30.points} />
        <div className={`text-[14px] mt-1 ${f30.menor.value < 0 ? "text-alert font-semibold" : "text-ink2"}`}>
          {f30.menor.value < 0
            ? <>⚠︎ Fica negativo em {dayLabel(f30.menor.date).toLowerCase()} (<Money v={f30.menor.value} />)</>
            : <>Ponto mais baixo: <Money v={f30.menor.value} /> em {dayLabel(f30.menor.date).toLowerCase()}</>}
        </div>
        {f30.events.length > 0 && (
          <div className="divide-y divide-line mt-2">
            {f30.events.map((e, i) => (
              <div key={i} className="flex justify-between py-2 text-[15px]">
                <span className="text-ink2">{dayLabel(e.date)} · {e.label}</span>
                <Money v={e.amount} signed className={e.amount > 0 ? "text-ok" : ""} />
              </div>
            ))}
          </div>
        )}
      </Card>

        </>
      )}

      {editar && <EditarAreas teto={base} onClose={() => setEditar(false)} />}
      {remanejar && (
        <Remanejar month={envMonth} teto={base} onClose={() => setRemanejar(false)} />
      )}
    </div>
  );
}

/** Mover dinheiro entre envelopes de um mês, sem mexer nos outros meses. */
function Remanejar({ month, teto, onClose }: { month: string; teto: number; onClose: () => void }) {
  const d = useData();
  const env = envelopes(d, month, teto);
  const total = env.reduce((a, e) => a + e.budget, 0);
  const sobra = Math.abs(teto - total) < 1 ? 0 : teto - total; // centavos do teto não contam
  const sim = simular(d, teto);
  const goal = d.config.goalAmount;

  return (
    <Sheet open onClose={onClose} title={`Envelopes de ${monthName(month).toLowerCase()}`}>
      <p className="text-ink2 mb-1">
        Mude o valor de cada área e veja na hora onde você chega no fim do prazo. Vale só para este mês.
      </p>
      <div className="card p-3 mb-4 sticky top-0 z-10">
        <div className={`font-semibold ${sobra === 0 ? "text-ok" : sobra < 0 ? "text-alert" : "text-ink2"}`}>
          {sobra === 0 ? "✓ Bate com o teto" : sobra > 0 ? <>Abaixo do teto em <Money v={sobra} /></> : <>Passou do teto em <Money v={-sobra} /></>}
        </div>
        <div className={`text-[14px] ${sim.fim >= goal ? "text-ok" : "text-alert"}`}>
          Fecha o prazo com <Money v={sim.fim} /> {sim.fim >= goal ? "· bate a meta" : <>· faltam <Money v={goal - sim.fim} /></>}
        </div>
      </div>

      <div className="card px-4 mb-4">
        {env.map((e, i) => (
          <EnvRow key={e.id} e={e} month={month} teto={teto} first={!i} />
        ))}
      </div>
      <Button tone="primary" className="w-full" onClick={() => { toast("Envelopes do mês salvos"); onClose(); }}>
        Pronto
      </Button>
    </Sheet>
  );
}

/** Uma linha do remanejamento. Guarda o que foi digitado para dar para escrever centavos. */
function EnvRow({ e, month, teto, first }: { e: { id: string; label: string; spent: number; budget: number }; month: string; teto: number; first: boolean }) {
  const [draft, setDraft] = useState(String(e.budget));

  return (
    <label className={`flex items-center gap-3 py-2.5 ${first ? "" : "border-t border-line"}`}>
      <span className="flex-1 min-w-0">
        <span className="block truncate">{e.label}</span>
        <span className="block text-[13px] text-ink3">gasto: <Money v={e.spent} /></span>
      </span>
      {/* salva a cada digitação: no iPhone dá para tocar em Pronto sem sair do campo */}
      <input
        inputMode="decimal"
        className="num !w-28 text-right"
        value={draft}
        onChange={(ev) => {
          setDraft(ev.target.value);
          const n = parseFloat(ev.target.value.replace(/\./g, "").replace(",", ".") || "0");
          if (Number.isFinite(n)) update((dd) => setEnvelopeAmount(dd, month, e.id, n, teto));
        }}
      />
    </label>
  );
}

/**
 * Onde você chega no fim do prazo gastando o plano de cada mês (a soma das
 * áreas). Mês sem ajuste usa a divisão padrão, que soma o teto.
 */
function simular(d: Data, teto: number) {
  const input = projectionInput(d);
  const meses = Array.from({ length: input.remainingMonths }, (_, i) => monthKey(new Date(input.startYear, input.startMonth - 1 + i, 1)));
  const perMonth = d.config.envelopes.length
    ? meses.map((m) => Object.values(envelopeBudgets(d, m, teto)).reduce((a, b) => a + b, 0))
    : undefined;
  const proj = buildMonthlyProjection(input, teto, perMonth);
  return { fim: proj.length ? proj[proj.length - 1].projectedBalance : Math.round(input.effectiveBalance) };
}

/** Quanto você gasta, em média, em cada categoria — no período que escolher. */
function MediaPorCategoria({ d, periodo, setPeriodo }: { d: Data; periodo: string; setPeriodo: (p: string) => void }) {
  const avg = Object.entries(categoryAverages(d, monthKey(), Number(periodo))).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = avg.reduce((a, [, v]) => a + v, 0);
  const customs = d.config.customCats;
  return (
    <>
      <Section>Sua média por categoria</Section>
      <Segmented value={periodo} onChange={setPeriodo}
        options={[...new Set(["3", "6", "12", String(d.config.prefs.avgMonths)])].sort((a, b) => +a - +b).map((v) => ({ value: v, label: `${v} meses` }))} />
      <Card className="mt-3">
        {avg.length === 0 ? (
          <div className="text-ink2">Sem gastos nesse período. Importe os extratos em Mais.</div>
        ) : (
          <>
            <div className="flex justify-between font-semibold mb-1">
              <span>Total por mês</span><Money v={total} />
            </div>
            <div className="divide-y divide-line">
              {avg.map(([k, v]) => (
                <div key={k} className="flex items-center gap-3 py-2">
                  <span aria-hidden>{catIcon(k, customs)}</span>
                  <span className="flex-1 min-w-0 truncate">{catName(k, customs)}</span>
                  <span className="text-[12px] text-ink3 w-10 text-right">{Math.round((v / total) * 100)}%</span>
                  <Money v={v} className="w-24 text-right" />
                </div>
              ))}
            </div>
            {avg.some(([k]) => k === "uncategorized") && (
              <p className="text-[13px] text-ink3 mt-2">“Sem categoria” some quando você classifica as transações (Início → revisar).</p>
            )}
          </>
        )}
      </Card>
    </>
  );
}

/** Criar, renomear, escolher categorias, definir valor e apagar áreas. */
function EditarAreas({ teto, onClose }: { teto: number; onClose: () => void }) {
  const d = useData();
  const [aberta, setAberta] = useState<Envelope | null>(null);
  const customs = d.config.customCats;
  const gastos = pickerGroups(customs).find((g) => g.label === "Gastos")?.keys ?? [];
  const budgets = envelopeBudgets(d, monthKey(), teto);

  if (aberta) return <AreaForm area={aberta} gastos={gastos} teto={teto} valor={budgets[aberta.id]} onClose={() => setAberta(null)} />;
  return (
    <Sheet open onClose={onClose} title="Editar áreas">
      <p className="text-ink2 mb-3">Toque numa área para mudar nome, categorias ou valor. Área sem categoria vira “o resto”.</p>
      <div className="card px-4 mb-3">
        {d.config.envelopes.map((e, i) => (
          <button key={e.id} onClick={() => setAberta(e)} className={`w-full flex items-center gap-3 py-3 text-left ${i ? "border-t border-line" : ""}`}>
            <span className="flex-1 min-w-0">
              <span className="block truncate">{e.label}</span>
              <span className="block text-[13px] text-ink3 truncate">
                {e.cats.length ? e.cats.map((c) => catName(c, customs)).join(", ") : "tudo que não está em outra área"}
              </span>
            </span>
            <Money v={budgets[e.id] ?? 0} className="text-ink2" />
            <span className="text-ink3 text-xl" aria-hidden>›</span>
          </button>
        ))}
      </div>
      <Button className="w-full" onClick={() => setAberta({ id: "", label: "", cats: [], share: 0 })}>+ Nova área</Button>
    </Sheet>
  );
}

function AreaForm({ area, gastos, teto, valor, onClose }: { area: Envelope; gastos: string[]; teto: number; valor?: number; onClose: () => void }) {
  const d = useData();
  const customs = d.config.customCats;
  const [nome, setNome] = useState(area.label);
  const [cats, setCats] = useState<string[]>(area.cats);
  const [quanto, setQuanto] = useState(valor !== undefined ? String(valor) : "");
  const dono = (c: string) => d.config.envelopes.find((e) => e.id !== area.id && e.cats.includes(c))?.label;

  function salvar() {
    if (!nome.trim()) return alert("Dê um nome para a área.");
    const id = area.id || Math.random().toString(36).slice(2, 8);
    act(`Área “${nome.trim()}” salva`, (dd) => {
      // categoria só pode estar numa área: sai das outras
      let out: Data = { ...dd, config: { ...dd.config, envelopes: dd.config.envelopes.map((e) => (e.id === id ? e : { ...e, cats: e.cats.filter((c) => !cats.includes(c)) })) } };
      out = saveEnvelope(out, { ...area, id, label: nome.trim(), cats });
      const n = parseFloat(quanto.replace(/\./g, "").replace(",", "."));
      return Number.isFinite(n) && n >= 0 ? setAreaFromNow(out, id, n, teto) : out;
    });
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={area.id ? "Editar área" : "Nova área"}>
      <label className="block mb-3">
        <span className="block text-[13px] text-ink3 px-1 mb-1">Nome</span>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Lazer" />
      </label>
      <label className="block mb-3">
        <span className="block text-[13px] text-ink3 px-1 mb-1">Quanto por mês (deste mês até o prazo da meta)</span>
        <input inputMode="decimal" value={quanto} onChange={(e) => setQuanto(e.target.value)} placeholder="0,00" className="num" />
      </label>
      <div className="text-[13px] text-ink3 px-1 mb-1.5">Categorias desta área {cats.length ? "" : "(nenhuma = tudo que sobra)"}</div>
      <div className="card px-4 mb-4">
        {gastos.map((c, i) => (
          <label key={c} className={`flex items-center gap-3 py-2.5 ${i ? "border-t border-line" : ""}`}>
            <span aria-hidden>{catIcon(c, customs)}</span>
            <span className="flex-1 min-w-0">
              <span className="block truncate">{catName(c, customs)}</span>
              {dono(c) && !cats.includes(c) && <span className="block text-[12px] text-ink3">hoje em “{dono(c)}”</span>}
            </span>
            <input type="checkbox" checked={cats.includes(c)} className="!w-6 !h-6 accent-[var(--meu)]"
              onChange={(e) => setCats(e.target.checked ? [...cats, c] : cats.filter((x) => x !== c))} />
          </label>
        ))}
      </div>
      <div className="sticky bottom-0 bg-bg pt-2 pb-1 flex gap-2">
        {area.id && (
          <Button tone="danger" className="flex-1" onClick={() => { act(`Área “${area.label}” apagada`, (dd) => deleteEnvelope(dd, area.id)); onClose(); }}>
            Apagar
          </Button>
        )}
        <Button tone="primary" className="flex-[2]" onClick={salvar}>Salvar</Button>
      </div>
    </Sheet>
  );
}

/** A meta não cabe no prazo: mostra quanto dá e quando chega, em vez de um teto zerado. */
function MetaInviavel({ input, ritmo, deadline, curto }: { input: ProjectionInput; ritmo: number; deadline: string; curto?: boolean }) {
  const semGastar = buildMonthlyProjection(input, 0);
  const maximo = semGastar.length ? semGastar[semGastar.length - 1].projectedBalance : Math.round(input.effectiveBalance);
  const noRitmo = buildMonthlyProjection(input, ritmo);
  const fimRitmo = noRitmo.length ? noRitmo[noRitmo.length - 1].projectedBalance : Math.round(input.effectiveBalance);
  const meses = monthsToGoal(input, ritmo);
  const quando = meses === null ? null : monthName(monthKey(new Date(input.startYear, input.startMonth - 1 + meses - 1, 1))).toLowerCase();
  return (
    <div className="card p-4 mb-3 border border-alert">
      <div className="font-semibold text-alert">⚠︎ A meta não cabe até {deadline}</div>
      <p className="text-[14px] text-ink2 mt-1">
        Mesmo sem gastar nada, você chegaria em {deadline} com <Money v={maximo} />, abaixo de <Money v={input.goalAmount} />.
        Por isso o teto aparece zerado.
      </p>
      {!curto && (
        <ul className="text-[14px] text-ink2 mt-2 flex flex-col gap-1">
          <li>• No seu ritmo (<Money v={ritmo} />/mês) você fecha {deadline} com <Money v={fimRitmo} />.</li>
          <li>• {quando ? <>Nesse ritmo, chega em <Money v={input.goalAmount} /> em <b>{quando}</b>.</> : "Nesse ritmo o saldo não cresce: precisa gastar menos ou ganhar mais."}</li>
        </ul>
      )}
      <p className="text-[13px] text-ink3 mt-2">Ajuste a meta ou o prazo em Mais → Ajustes → Renda e meta.</p>
    </div>
  );
}
