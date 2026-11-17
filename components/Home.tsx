"use client";

import { useMemo, useState } from "react";
import { catIcon, catName } from "@/lib/categories";
import { brl, brl0, daysInMonth, monthName, shiftMonth } from "@/lib/format";
import { computeScenarios } from "@/lib/projections";
import { typeOf } from "@/lib/categories";
import { byCategory, cumulative, envelopes, fluxoDoMes, isMyVariableSpend, ofMonth, variableSpend } from "@/lib/stats";
import { billPaid, categoryTable, priceChanges, recurringSuggestions, safeToSpend } from "@/lib/insights";
import { saveBackup } from "@/lib/backup";
import { billActive, cdbNet, changesSinceBackup, fatherPending, moneyParts, cdbPerDay, dismissPrice, dismissRecurring, fatherBalance, monthKey, myMoney, parcela, projectionInput, toggleBillPaid, update, useData } from "@/lib/store";
import type { Data, Tx } from "@/lib/types";
import { cdbRende, cdbSerie } from "@/lib/cdb";
import { Bars3D, CategoryBars, CategoryDonut, CumulativeChart, FluxoChart, type CatDatum } from "./charts";
import { StatCard } from "./Destaques";
import { noLucroAlvo, posicao } from "@/lib/cripto";
import { TxList, TxRow, TxSheet } from "./Tx";
import Revisar from "./Revisar";
import { ReceberCard } from "./Receber";
import { act, Button, Card, Icons, Money, MonthSwitcher, Progress, Section, Segmented, Sheet, Tilt, toast } from "./ui";

export default function Home({ month, setMonth, hidden, setHidden, goExtrato, goMeta, goCdb, goPai }: {
  month: string; setMonth: (m: string) => void; hidden: boolean; setHidden: (h: boolean) => void;
  goExtrato: () => void; goMeta: () => void; goCdb: () => void; goPai: () => void;
}) {
  const d = useData();
  const customs = d.config.customCats;
  const [cat, setCat] = useState<string | null>(null);
  const [open, setOpen] = useState<Tx | null>(null);
  const [todas, setTodas] = useState(false);
  const [revisar, setRevisar] = useState(false);
  const [explDist, setExplDist] = useState(false);
  const [explMeta, setExplMeta] = useState(false);

  const pai = fatherBalance(d);
  const account = d.config.accountBalance;
  const parts = moneyParts(d);
  const [grafico, setGrafico] = useState<"2d" | "3d">(() => { try { return (localStorage.getItem("grafico-cat") as "2d" | "3d") || "2d"; } catch { return "2d"; } });
  const mudaGrafico = (g: "2d" | "3d") => { setGrafico(g); try { localStorage.setItem("grafico-cat", g); } catch { /* ok */ } };
  const pendentes = fatherPending(d);
  const meu = parts.total;
  const cenarios = useMemo(() => computeScenarios(projectionInput(d)), [d]);
  const teto = Math.max(0, cenarios[0].monthlyVariable);
  // a barra de gasto segue o cenário escolhido em Metas (Teto, Seu ritmo ou Econômico)
  const escolhido = (() => { try { return localStorage.getItem("cenario-meta"); } catch { return null; } })();
  const cen = cenarios.find((c) => c.key === escolhido) ?? cenarios[0];
  const limite = Math.max(0, cen.monthlyVariable);
  const monthTxs = ofMonth(d.txs, month);
  const spent = variableSpend(monthTxs);
  const prev = shiftMonth(month, -1);
  const prevSpent = variableSpend(ofMonth(d.txs, prev));
  const isNow = month === monthKey();
  const daysLeft = isNow ? daysInMonth(month) - new Date().getDate() + 1 : 0;
  const review = d.txs.filter((t) => t.review).length;
  const staleDays = d.config.balanceDate ? Math.floor((Date.now() - Date.parse(d.config.balanceDate)) / 86400000) : null;
  const perDay = cdbPerDay(d);
  const cdb = cdbNet(d);
  const goalPct = Math.min(100, Math.round((meu / (d.config.goalAmount || 1)) * 100));

  // Top 5 categorias + "Outros", para as barras e a rosca.
  const cats: CatDatum[] = useMemo(() => {
    const all = byCategory(monthTxs).map((c) => ({ key: c.key, name: catName(c.key, customs), icon: catIcon(c.key, customs), value: Math.round(c.value) }));
    if (all.length <= 6) return all;
    const rest = all.slice(5).reduce((s, c) => s + c.value, 0);
    return [...all.slice(0, 5), { key: "__outros", name: "Outros", icon: "•••", value: Math.round(rest) }];
  }, [monthTxs, customs]);

  const tabela = useMemo(() => categoryTable(d.txs, month), [d.txs, month]);
  const fluxo = useMemo(() => fluxoDoMes(d.txs, month, isNow), [d.txs, month, isNow]);
  const fluxoAnt = useMemo(() => fluxoDoMes(d.txs, prev, false), [d.txs, prev]);
  const pctVs = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
  const cdbMes = useMemo(() => { try { return cdbRende(d)[2]?.liquido ?? 0; } catch { return 0; } }, [d]);
  const cdbSpark = useMemo(() => { try { return cdbSerie(d).slice(-30).map((s) => s.bruto); } catch { return []; } }, [d]);
  const abrirCat = (k: string) => (k === "__outros" ? setTodas(true) : setCat(k));
  const livre = isNow ? safeToSpend(d, teto) : null;
  const alteracoes = changesSinceBackup();
  const backupDias = d.lastBackup ? Math.floor((Date.now() - Date.parse(d.lastBackup)) / 86400000) : null;
  const alertas = isNow ? envelopes(d, month, teto).filter((e) => e.budget > 0 && e.spent >= e.budget * (d.config.prefs.alertPct / 100)) : [];

  const recent = [...d.txs].filter((t) => t.category !== "pay_card").sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
  const spentDiff = prevSpent ? Math.round(((spent - prevSpent) / prevSpent) * 100) : null;

  return (
    <div>
      {/* Saudação e saldo, centralizados, como na referência */}
      <header className="flex items-center justify-between pt-4 pb-3">
        <h1 className="text-[26px] font-extrabold leading-tight">
          Bem-vindo de volta,<br />{d.config.prefs.name || "você"}! <span aria-hidden>👋</span>
        </h1>
        <span className="w-11 h-11 shrink-0 rounded-full bg-brand text-onbrand grid place-items-center font-bold">{(d.config.prefs.name || "?").slice(0, 2).toUpperCase()}</span>
      </header>

      {d.txs.length > 0 && alteracoes > 0 && (backupDias === null || backupDias >= d.config.prefs.backupDays || alteracoes >= 10) && (
        <Card className="mb-3 flex items-center gap-3 !py-3">
          <span className="text-xl" aria-hidden>💾</span>
          <span className="flex-1 text-[14px]">
            <span className="block font-semibold">{backupDias === null ? "Você nunca salvou backup" : `Último backup há ${backupDias} dia${backupDias === 1 ? "" : "s"}`}</span>
            <span className="block text-ink3">{alteracoes} alteraç{alteracoes === 1 ? "ão" : "ões"} ainda fora do backup.</span>
          </span>
          <Button tone="primary" className="!h-9 !px-3 text-[14px]" onClick={async () => (await saveBackup()) && toast("Backup salvo")}>Salvar</Button>
        </Card>
      )}

      <Tilt><div className="hero card p-5 text-center">
        <div className="flex items-center justify-center gap-2 text-white/70 text-[14px]">
          Meu dinheiro total
          <button aria-label={hidden ? "Mostrar valores" : "Esconder valores"} onClick={() => setHidden(!hidden)} className="text-white/70">
            {hidden ? Icons.eyeOff : Icons.eye}
          </button>
        </div>
        <Money v={meu} count className="block text-[40px] leading-tight font-extrabold" />
        <div className="text-[13px] text-white/70">
          {staleDays === null ? "Importe um extrato para começar"
            : `Saldo do extrato de ${new Date(d.config.balanceDate + "T12:00:00").toLocaleDateString("pt-BR")}`}
          {staleDays !== null && staleDays > 7 ? " ⚠︎" : ""}
        </div>

        {/* A conta fatiada: quanto ali é seu e quanto é do pai */}
        <SplitBar account={account} pai={pai} />

        <div className="grid grid-cols-2 gap-3 mt-4 text-left">
          <div className="rounded-2xl bg-white/[.07] border border-white/[.14] p-3">
            <div className="text-[12px] text-white/70">Disponível agora</div>
            <Money v={parts.disponivel} className="font-bold" />
            <div className="text-[12px] text-white/70">
              na conta, só seu{parts.fatura > 0 ? <>, já sem a fatura de <Money v={parts.fatura} /></> : ""}
            </div>
          </div>
          <button onClick={goCdb} className="rounded-2xl bg-white/[.07] border border-white/[.14] p-3 text-left block w-full min-w-0">
            <div className="text-[12px] text-white/70">CDB {d.config.cdb.pctCdi ? `· ${d.config.cdb.pctCdi}% CDI` : ""}</div>
            <Money v={cdb.liquido} className="font-bold" />
            <div className="text-[12px] text-white/70">
              líquido de IR · bruto <Money v={cdb.bruto} />
            </div>
            {perDay > 0 && (
              <div className="text-[12px] text-white/70">
                rende <Money v={perDay} />/dia útil
              </div>
            )}
          </button>
          {parts.cripto > 0 && (
            <button onClick={goCdb} className="rounded-2xl bg-white/[.07] border border-white/[.14] p-3 col-span-2 text-left">
              <div className="text-[12px] text-white/70">Cripto</div>
              <Money v={parts.cripto} className="font-bold" />
              <div className="text-[12px] text-white/70">valor das moedas pelo último preço anotado</div>
            </button>
          )}
          {parts.paiGuardado > 0 && (
            <button onClick={goPai} className="rounded-2xl bg-white/[.07] border border-white/[.14] p-3 col-span-2 text-left">
              <div className="text-[12px] text-white/70">Você deve ao seu pai</div>
              <Money v={parts.paiGuardado} className="font-bold" />
              <div className="text-[12px] text-white/70">está na sua conta, mas é dele: fica fora do total</div>
            </button>
          )}
          {parts.aReceber > 0 && (
            <div className="rounded-2xl bg-white/[.07] border border-white/[.14] p-3 col-span-2">
              <div className="text-[12px] text-white/70">A receber</div>
              <Money v={parts.aReceber} className="font-bold" />
              <div className="text-[12px] text-white/70">
                {[parts.doPai > 0 ? <span key="p">seu pai te deve <Money v={parts.doPai} /></span> : null,
                  parts.pessoas > 0 ? <span key="o">outras pessoas <Money v={parts.pessoas} /></span> : null]
                  .filter(Boolean).reduce<React.ReactNode[]>((acc, x, i) => (i ? [...acc, " · ", x] : [x]), [])}
              </div>
            </div>
          )}
        </div>
        <div className="text-[12px] text-white/60 mt-3">
          Total = disponível + CDB líquido{parts.cripto > 0 ? " + cripto" : ""}{parts.aReceber > 0 ? " + a receber" : ""}.
        </div>
      </div></Tilt>

      {pendentes.length > 0 && (
        <Card className="mt-3 flex items-center gap-3" onClick={goPai}>
          <span className="w-10 h-10 rounded-full bg-fill grid place-items-center text-lg" aria-hidden>👨</span>
          <span className="flex-1 text-[14px]">
            <span className="block font-semibold">{pendentes.length} lançamento{pendentes.length === 1 ? "" : "s"} do seu pai fora do crédito dele</span>
            <span className="block text-ink3">Enquanto não entrarem, o que ele te deve (ou você guarda dele) não aparece no total. Toque para acertar.</span>
          </span>
          <span className="text-ink3 text-xl" aria-hidden>›</span>
        </Card>
      )}

      <div className="flex items-center justify-between mt-6 mb-2 px-1">
        <h2 className="text-[20px] font-semibold">No mês</h2>
        <MonthSwitcher month={month} onChange={setMonth} max={monthKey()} />
      </div>

      <Card>
        <div className="flex items-baseline justify-between">
          <span className="text-ink2 text-[15px]">Gasto variável</span>
          <span className="text-ink3 text-[13px]">teto {hidden ? "••••" : brl0(teto)}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <Money v={spent} className="text-[28px] font-extrabold" />
          {spentDiff !== null && !hidden && (
            <span className={`text-[13px] font-semibold ${spentDiff > 0 ? "text-alert" : "text-ok"}`}>
              {spentDiff > 0 ? "▲" : "▼"} {Math.abs(spentDiff)}% vs {monthName(prev).toLowerCase()}
            </span>
          )}
        </div>
        <div className="mt-2"><Progress value={spent} max={teto} /></div>
        <div className={`text-[13px] mt-2 ${spent > teto ? "text-alert font-medium" : "text-ink2"}`}>
          {spent > teto
            ? <>⚠︎ Passou do teto em <Money v={spent - teto} /></>
            : isNow
              ? <>Sobram <Money v={teto - spent} /> do teto · {daysLeft} dia{daysLeft === 1 ? "" : "s"} até o fim do mês</>
              : <>Ficou <Money v={teto - spent} /> abaixo do teto</>}
        </div>
      </Card>

      {livre && (
        <Card className="mt-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-ink2 text-[15px]">Dá para gastar hoje</span>
            <span className="text-ink3 text-[13px]">até <Money v={livre.livre} /> no mês</span>
          </div>
          <Money v={livre.porDia} className="block text-[28px] font-extrabold text-ok" />
          <div className="text-[13px] text-ink2">
            {livre.pelaConta
              ? <>Limitado pelo que tem na conta{livre.aPagar ? <>, já separando <Money v={livre.aPagar} /> de contas e parcelas</> : ""}.</>
              : livre.aPagar
                ? <>Contas e parcelas a pagar (<Money v={livre.aPagar} />) já estão separadas.</>
                : "Cabe no teto e na conta."}
          </div>
          {staleDays !== null && staleDays > 7 && (
            <div className="text-[13px] text-alert mt-1">⚠︎ O último extrato é de {staleDays} dias atrás: importe o novo para esse número valer.</div>
          )}
        </Card>
      )}

      {/* destaques do mês, no estilo dos painéis: ícone com brilho, valor, variação e mini gráfico */}
      <div className="grid grid-cols-2 gap-3 mt-3">
        <StatCard id="gastos" cor="var(--s2)" label={`Gastos em ${monthName(month).toLowerCase()}`} valor={fluxo.saidas} delta={pctVs(fluxo.saidas, fluxoAnt.saidas)} bomSeSobe={false}
          spark={fluxo.dias.map((x) => x.saidas)} icone={<path d="M12 5v14M6 13l6 6 6-6" />} />
        <StatCard id="entradas" cor="var(--s3)" label="Entradas do mês" valor={fluxo.entradas} delta={pctVs(fluxo.entradas, fluxoAnt.entradas)} bomSeSobe
          spark={fluxo.dias.map((x) => x.entradas)} icone={<path d="M12 19V5M6 11l6-6 6 6" />} />
        <StatCard id="sobra" cor="var(--s1)" label="Sobra do mês" valor={fluxo.sobra} signed delta={pctVs(fluxo.sobra, fluxoAnt.sobra)} bomSeSobe
          spark={fluxo.dias.map((x) => x.entradas - x.saidas)} icone={<path d="M5 20V10M12 20V4M19 20v-7" />} />
        <StatCard id="cdbmes" cor="var(--s4)" label="CDB rende por mês" valor={cdbMes} delta={null} nota="por mês, sem IR"
          spark={cdbSpark} icone={<path d="M3 17l6-6 4 4 8-8M15 7h6v6" />} />
      </div>

      {fluxo.dias.length > 1 && (
        <>
          <Section>Fluxo de caixa</Section>
          <Card>
            <FluxoChart data={fluxo.dias} />
            <div className="grid grid-cols-3 gap-2 mt-2 text-center text-[12px] text-ink3">
              <span>Entradas<br /><Money v={fluxo.entradas} className="text-ink font-semibold text-[14px]" /></span>
              <span>Saídas<br /><Money v={fluxo.saidas} className="text-ink font-semibold text-[14px]" /></span>
              <span>Sobra<br /><Money v={fluxo.sobra} signed className="text-ink font-semibold text-[14px]" /></span>
            </div>
          </Card>
        </>
      )}

      <ReceberCard />

      {noLucroAlvo(d).length > 0 && (
        <Card className="mt-3 flex items-center gap-3" onClick={goCdb}>
          <span className="w-10 h-10 rounded-full bg-fill grid place-items-center text-lg" aria-hidden>🎯</span>
          <span className="flex-1">
            <span className="block font-semibold">Meta de lucro batida</span>
            <span className="block text-[13px] text-ink3">{noLucroAlvo(d).map((c) => `${c.symbol} ${posicao(c).pct.toLocaleString("pt-BR")}%`).join(" · ")}</span>
          </span>
          <span className="text-ink3 text-xl" aria-hidden>›</span>
        </Card>
      )}

      {alertas.length > 0 && (
        <Card className="mt-3" onClick={goMeta}>
          <div className="text-[15px] font-semibold mb-2">Envelopes no limite</div>
          {alertas.map((e) => {
            const pct = Math.round((e.spent / e.budget) * 100);
            return (
              <div key={e.id} className="mb-2">
                <div className="flex justify-between text-[14px] mb-1">
                  <span>{e.label}</span>
                  <span className={pct >= 100 ? "text-alert font-semibold" : "text-ink2"}>{pct >= 100 ? "⚠︎ " : ""}{pct}%</span>
                </div>
                <Progress value={e.spent} max={e.budget} />
              </div>
            );
          })}
          <div className="text-[13px] text-link font-semibold">Remanejar em Meta ›</div>
        </Card>
      )}

      {cats.length > 0 && (
        <>
          <Section action={<Segmented value={grafico} onChange={mudaGrafico} options={[{ value: "2d", label: "Barras" }, { value: "3d", label: "3D" }]} />}>Gasto por categoria</Section>
          <Card>
            {grafico === "3d"
              ? <Bars3D name="Gasto por categoria" fmt={brl0} explica="Gasto do dia a dia no mês: cada barra é uma categoria (o ícone embaixo) e a altura é quanto você gastou nela." data={cats.map((c) => ({ label: c.icon, nome: c.name, value: c.value }))} />
              : <CategoryBars data={cats} onSelect={abrirCat} />}
            <CatRows rows={tabela.slice(0, 5)} customs={customs} hidden={hidden} onOpen={setCat} />
            {tabela.length > 5 && (
              <button onClick={() => setTodas(true)} className="w-full text-link font-semibold text-[15px] pt-2">
                Ver todas as {tabela.length} categorias ›
              </button>
            )}
          </Card>

          <div className="flex flex-col gap-3 mt-3">
            <Card onClick={() => setExplDist(true)}>
              <div className="text-[15px] font-semibold mb-1 flex justify-between">Distribuição <span className="text-ink3" aria-hidden>›</span></div>
              <CategoryDonut data={cats} onSelect={() => setExplDist(true)} />
            </Card>
            <Card onClick={() => setExplMeta(true)}>
              <div className="text-[15px] font-semibold mb-3 flex justify-between">Metas <span className="text-ink3" aria-hidden>›</span></div>
              <Goal label="Meta de dezembro" pct={goalPct} color="var(--meta)" />
              <Goal label={cen.key === "teto" ? "Teto do mês" : `Limite · ${cen.label}`} pct={limite ? Math.min(100, Math.round((spent / limite) * 100)) : spent > 0 ? 100 : 0} color="var(--meu)" over={spent > limite} />
              <div className="text-[13px] text-ink3 mt-3">
                Faltam <Money v={Math.max(0, d.config.goalAmount - meu)} /> para a meta.
              </div>
            </Card>
          </div>
        </>
      )}

      {review > 0 && (
        <Card className="mt-3 flex items-center gap-3" onClick={() => setRevisar(true)}>
          <span className="w-10 h-10 rounded-full bg-fill grid place-items-center text-lg" aria-hidden>❔</span>
          <span className="flex-1">
            <span className="block font-semibold">{review} para revisar</span>
            <span className="block text-[13px] text-ink3">Uma por vez, arrastando. O app aprende.</span>
          </span>
          <span className="text-ink3 text-xl" aria-hidden>›</span>
        </Card>
      )}

      <Section action={<button onClick={goExtrato} className="text-link text-[15px] font-semibold">Ver tudo</button>}>
        Últimas transações
      </Section>
      {recent.length ? (
        <div className="card px-4">
          {recent.map((t) => <TxRow key={t.id} t={t} onOpen={setOpen} />)}
        </div>
      ) : (
        <Card className="text-ink2">Nada lançado ainda. Use o + ou importe o extrato em Mais.</Card>
      )}

      <Section>Gasto acumulado</Section>
      <Card>
        <CumulativeChart data={cumulative(d.txs, month, prev, isNow)} teto={teto} labels={[monthName(month), monthName(prev)]} />
      </Card>

      <FixedBills d={d} month={month} />
      {isNow && <Sugestoes d={d} />}

      <Sheet open={!!cat} onClose={() => setCat(null)} title={cat ? `${catName(cat, customs)} · ${monthName(month)}` : ""}>
        {cat && <TxList txs={monthTxs.filter((t) => t.category === cat && t.amount < 0)} onOpen={(t) => { setCat(null); setOpen(t); }} />}
      </Sheet>
      <Sheet open={todas} onClose={() => setTodas(false)} title={`Categorias · ${monthName(month)}`}>
        <div className="card px-4">
          <CatRows rows={tabela} customs={customs} hidden={hidden} onOpen={(k) => { setTodas(false); setCat(k); }} />
        </div>
        <p className="text-[13px] text-ink3 mt-2 px-1">Toque numa categoria para ver o que tem nela e reclassificar.</p>
      </Sheet>
      <Sheet open={explDist} onClose={() => setExplDist(false)} title={`Para onde foi · ${monthName(month)}`}>
        <ExplicaGastos d={d} month={month} cats={tabela} spent={spent} prevSpent={prevSpent} hidden={hidden}
          onCat={(k) => { setExplDist(false); setCat(k); }} />
      </Sheet>
      <Sheet open={explMeta} onClose={() => setExplMeta(false)} title="Suas metas">
        <ExplicaMetas meu={meu} alvo={d.config.goalAmount} teto={limite} nome={cen.key === "teto" ? "Teto do mês" : `Limite do mês · ${cen.label}`} spent={spent} isNow={isNow} daysLeft={daysLeft}
          onVer={() => { setExplMeta(false); goMeta(); }} />
      </Sheet>
      <TxSheet tx={open} onClose={() => setOpen(null)} />
      {revisar && <Revisar onClose={() => setRevisar(false)} />}
    </div>
  );
}

/** Linhas de categoria: valor e comparação com o mês anterior. */
function CatRows({ rows, customs, hidden, onOpen }: {
  rows: { key: string; value: number; prev: number }[]; customs: Data["config"]["customCats"]; hidden: boolean; onOpen: (k: string) => void;
}) {
  return (
    <div className="divide-y divide-line">
      {rows.map((c) => {
        const diff = c.prev ? Math.round(((c.value - c.prev) / c.prev) * 100) : null;
        return (
          <button key={c.key} onClick={() => onOpen(c.key)} className="w-full flex items-center gap-3 py-2.5 text-left">
            <span className="w-9 h-9 shrink-0 rounded-full bg-fill grid place-items-center" aria-hidden>{catIcon(c.key, customs)}</span>
            <span className="flex-1 min-w-0">
              <span className="block truncate">{catName(c.key, customs)}</span>
              <span className={`block text-[12px] ${diff !== null && diff > 0 ? "text-alert" : "text-ink3"}`}>
                {hidden ? "" : diff === null ? "novo este mês" : diff === 0 ? "igual ao mês passado" : `${diff > 0 ? "▲" : "▼"} ${Math.abs(diff)}% vs mês passado`}
              </span>
            </span>
            <Money v={c.value} className="shrink-0" />
            <span className="text-ink3" aria-hidden>›</span>
          </button>
        );
      })}
    </div>
  );
}

/** "Parece conta fixa" e "sua assinatura mudou de preço": um toque resolve. */
function Sugestoes({ d }: { d: Data }) {
  const rec = recurringSuggestions(d).slice(0, 3);
  const mudou = priceChanges(d);
  if (!rec.length && !mudou.length) return null;
  return (
    <>
      <Section>Sugestões</Section>
      <div className="flex flex-col gap-2">
        {mudou.map(({ bill, novo }) => (
          <Card key={bill.id} className="!py-3">
            <div className="text-[15px]"><b>{bill.name}</b> veio {novo > bill.amount ? "mais caro" : "mais barato"}: {brl(bill.amount)} → {brl(novo)}</div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Button className="!h-9" onClick={() => act("Não aviso mais desse valor", (dd) => dismissPrice(dd, bill.id, novo))}>Ignorar</Button>
              <Button tone="primary" className="!h-9" onClick={() => act(`${bill.name} atualizada`, (dd) => ({
                ...dd, config: { ...dd.config, bills: dd.config.bills.map((b) => (b.id === bill.id ? { ...b, amount: novo } : b)) },
              }))}>Atualizar para {brl(novo)}</Button>
            </div>
          </Card>
        ))}
        {rec.map((r) => (
          <Card key={r.key} className="!py-3">
            <div className="text-[15px]"><b>{r.name}</b> aparece todo mês (~{brl(r.amount)}, dia {r.day}). É conta fixa?</div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Button className="!h-9" onClick={() => act("Não sugiro mais", (dd) => dismissRecurring(dd, r.key))}>Não é</Button>
              <Button tone="primary" className="!h-9" onClick={() => act(`${r.name} virou conta fixa`, (dd) => ({
                ...dd, config: { ...dd.config, bills: [...dd.config.bills, { id: Math.random().toString(36).slice(2), name: r.name, amount: r.amount, match: r.key, atSource: false }] },
              }))}>Adicionar</Button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

function Goal({ label, pct, color, over }: { label: string; pct: number; color: string; over?: boolean }) {
  return (
    <div className="mb-3">
      <div className="flex justify-between text-[13px] mb-1">
        <span className="text-ink2 truncate">{label}</span>
        <span className={over ? "text-alert font-semibold" : "text-ink3"}>{pct}%</span>
      </div>
      <Progress value={pct} max={100} color={over ? "var(--alert)" : color} />
    </div>
  );
}

/** A conta inteira como uma barra: parte azul é sua, parte laranja é do pai. */
function SplitBar({ account, pai }: { account: number; pai: number }) {
  const owed = pai < 0; // pai te deve: tudo na conta é seu, e ainda tem a receber
  const total = owed ? account - pai : Math.max(account, 1);
  const w = (v: number) => `${Math.max(0, Math.min(100, (v / total) * 100))}%`;
  return (
    <div className="mt-4">
      <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px] bg-white/15" aria-hidden>
        <div style={{ width: w(owed ? account : account - pai), background: "var(--meu)" }} />
        {owed
          ? <div style={{ width: w(-pai), background: "repeating-linear-gradient(135deg, var(--pai) 0 4px, transparent 4px 8px)" }} />
          : <div style={{ width: w(pai), background: "var(--pai)" }} />}
      </div>
      <div className="flex justify-between text-[12px] text-white/70 mt-1.5">
        <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full" style={{ background: "var(--meu)" }} />Seu</span>
        <span>Conta: <Money v={account} className="text-white" /></span>
        <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full" style={{ background: "var(--pai)" }} />{owed ? "Pai te deve" : "Do pai"}</span>
      </div>
    </div>
  );
}

/** Conta fixa fica paga sozinha quando aparece no extrato, ou no toque. */
function FixedBills({ d, month }: { d: Data; month: string }) {
  const bills = d.config.bills.filter((b) => billActive(b, month));
  const marcadas = d.config.billsPaid[month] || [];
  if (!bills.length) return null;
  return (
    <>
      <Section>{bills.some((b) => b.until) ? "Contas e parcelas" : "Contas fixas"}</Section>
      <div className="card px-4">
        {bills.map((b, i) => {
          const paid = billPaid(d, b, month);
          const noExtrato = paid && !marcadas.includes(b.id);
          return (
            <button key={b.id} onClick={() => update((dd) => toggleBillPaid(dd, month, b.id))}
              className={`w-full flex items-center gap-3 py-3 text-left ${i ? "border-t border-line" : ""}`}>
              <span className={`w-6 h-6 shrink-0 rounded-full grid place-items-center text-[13px] ${paid ? "bg-ok text-[#031a14]" : "border-2 border-line text-transparent"}`} aria-hidden>✓</span>
              <span className="flex-1 min-w-0">
                <span className="block truncate">{b.name}</span>
                {(() => {
                  const p = parcela(b, month);
                  const txt = [p && `parcela ${p.n} de ${p.total}`, noExtrato && "apareceu no extrato"].filter(Boolean).join(" · ");
                  return txt ? <span className="block text-[12px] text-ink3">{txt}</span> : null;
                })()}
              </span>
              <Money v={b.amount} className="text-ink2" />
              <span className={`text-[13px] w-16 text-right ${paid ? "text-ok" : "text-ink3"}`}>{paid ? "pago" : "a pagar"}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[13px] text-ink3 px-1 mt-1.5">Toque para marcar ou desmarcar como paga.</p>
    </>
  );
}

/** Janela da Distribuição: tudo o que saiu no mês, separado pelo que conta no teto e o que não conta. */
function ExplicaGastos({ d, month, cats, spent, prevSpent, hidden, onCat }: {
  d: Data; month: string; cats: { key: string; value: number; prev: number }[]; spent: number; prevSpent: number; hidden: boolean; onCat: (k: string) => void;
}) {
  const customs = d.config.customCats;
  const saidas = ofMonth(d.txs, month).filter((t) => t.amount < 0);
  const soma = (f: (t: Tx) => boolean) => saidas.filter(f).reduce((s, t) => s - t.amount, 0);
  const fixas = soma((t) => typeOf(t.category) === "fixed");
  const pai = soma((t) => typeOf(t.category) === "fathers");
  const outros = soma((t) => ["savings", "receivable"].includes(typeOf(t.category)));
  const total = spent + fixas + pai + outros;
  const partes = [
    { nome: "Gastos do dia a dia", v: spent, cor: "var(--meu)", nota: "Conta no teto do mês" },
    { nome: "Contas fixas", v: fixas, cor: "var(--meta)", nota: "Aluguel, parcelas e afins. Já descontadas no teto" },
    { nome: "Pelo seu pai", v: pai, cor: "var(--alert)", nota: "Dinheiro dele, fora do seu gasto" },
    { nome: "Guardado ou emprestado", v: outros, cor: "var(--ink3)", nota: "Saiu da conta mas não é gasto" },
  ].filter((p) => p.v > 0);
  const top = saidas.filter(isMyVariableSpend).sort((a, b) => a.amount - b.amount).slice(0, 5);
  const diff = prevSpent ? Math.round(((spent - prevSpent) / prevSpent) * 100) : null;
  return (
    <div>
      <div className="card p-4 mb-3">
        <div className="text-ink2 text-[14px]">Saiu da conta em {monthName(month)}</div>
        <Money v={total} className="text-[28px] font-bold" />
        <div className="flex h-3 rounded-full overflow-hidden bg-fill mt-3" aria-hidden>
          {partes.map((p) => <span key={p.nome} style={{ width: `${(p.v / (total || 1)) * 100}%`, background: p.cor }} />)}
        </div>
        {partes.map((p) => (
          <div key={p.nome} className="flex items-start gap-2 mt-3">
            <span className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ background: p.cor }} aria-hidden />
            <span className="flex-1 min-w-0">
              <span className="block">{p.nome}</span>
              <span className="block text-[12px] text-ink3">{p.nota}</span>
            </span>
            <Money v={p.v} className="font-semibold" />
          </div>
        ))}
      </div>

      <div className="text-[13px] text-ink3 px-1 mb-1">Do dia a dia, por categoria{diff !== null && !hidden ? ` · ${diff > 0 ? "▲" : "▼"} ${Math.abs(diff)}% vs mês passado` : ""}</div>
      <div className="card px-4 mb-3">
        {cats.length ? <CatRows rows={cats} customs={customs} hidden={hidden} onOpen={onCat} /> : <div className="py-3 text-ink2">Nada gasto neste mês.</div>}
      </div>

      {top.length > 0 && (
        <>
          <div className="text-[13px] text-ink3 px-1 mb-1">Maiores gastos</div>
          <div className="card px-4">
            {top.map((t) => <TxRow key={t.id} t={t} onOpen={() => onCat(t.category)} />)}
          </div>
        </>
      )}
    </div>
  );
}

/** Janela das Metas: duas barras e de onde vem cada número. */
function ExplicaMetas({ meu, alvo, teto, nome, spent, isNow, daysLeft, onVer }: {
  meu: number; alvo: number; teto: number; nome: string; spent: number; isNow: boolean; daysLeft: number; onVer: () => void;
}) {
  const pctMeta = alvo ? Math.min(100, Math.round((meu / alvo) * 100)) : 0;
  const pctTeto = teto ? Math.round((spent / teto) * 100) : spent > 0 ? 100 : 0;
  const sobra = teto - spent;
  return (
    <div>
      <div className="card p-4 mb-3">
        <div className="font-semibold">Meta de dezembro</div>
        <div className="text-[13px] text-ink3 mb-2">Seu dinheiro total hoje contra o que você quer ter</div>
        <Progress value={pctMeta} max={100} color="var(--meta)" />
        <div className="flex justify-between mt-2 text-[15px]"><span>Tem <Money v={meu} /></span><span className="text-ink2">{pctMeta}% de <Money v={alvo} /></span></div>
        <div className="text-ink2 text-[14px] mt-1">Faltam <Money v={Math.max(0, alvo - meu)} />.</div>
      </div>
      <div className="card p-4 mb-3">
        <div className="font-semibold">{nome}</div>
        <div className="text-[13px] text-ink3 mb-2">O quanto pode gastar no dia a dia neste cenário. Troque o cenário em Metas.</div>
        <Progress value={Math.min(100, pctTeto)} max={100} color={spent > teto ? "var(--alert)" : "var(--meu)"} />
        <div className="flex justify-between mt-2 text-[15px]"><span>Gastou <Money v={spent} /></span><span className={spent > teto ? "text-alert font-semibold" : "text-ink2"}>{pctTeto}% de <Money v={teto} /></span></div>
        <div className={`text-[14px] mt-1 ${sobra < 0 ? "text-alert" : "text-ink2"}`}>
          {sobra >= 0 ? <>Ainda pode gastar <Money v={sobra} />{isNow && daysLeft > 0 ? <> (<Money v={sobra / daysLeft} /> por dia)</> : null}.</> : <>Passou do teto em <Money v={-sobra} />.</>}
        </div>
      </div>
      <Button className="w-full" onClick={onVer}>Ver contas e cenários</Button>
    </div>
  );
}
