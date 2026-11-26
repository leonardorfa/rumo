"use client";

import { useState } from "react";
import { shareFile } from "@/lib/backup";
import { localDay } from "@/lib/format";
import {
  addAgua, aplicarObjetivo, OBJETIVOS, ALVOS_PADRAO, alvosOf, aguaMarcos, aguaOf, aguaSemana, AGUA_PADRAO, buildAguaIcs, feitoNaSemana, fmtAgua, GRUPOS, pesoLevantado, setAgua, setAlvos,
} from "@/lib/life";
import { update, useData } from "@/lib/store";
import { Equivalencia, LinhaEquivalencia, MinhasComparacoes } from "./Equivalencia";
import { Button, Card, Expandir, Progress, Section, Sheet, toast } from "./ui";
import { fmtPeso } from "@/lib/pesos";

const parse = (v: string) => parseFloat(v.replace(/\./g, "").replace(",", "."));

/** Água do dia: barra, pontos "1 L até 12:00" e a semana. */
export function AguaCard() {
  const d = useData();
  const a = aguaOf(d);
  const hoje = localDay();
  const ml = a.log[hoje] ?? 0;
  const marcos = aguaMarcos(d);
  const sem = aguaSemana(d, hoje);
  const [cfg, setCfg] = useState(false);
  const agora = new Date().toTimeString().slice(0, 5);
  return (
    <>
      <Section action={<button onClick={() => setCfg(true)} className="text-link text-[15px] font-semibold">Ajustar</button>}>Água</Section>
      <Card>
        <div className="flex items-baseline justify-between">
          <span className="text-[24px] font-bold">{fmtAgua(ml)}</span>
          <span className="text-ink3">de {fmtAgua(a.metaMl)} hoje</span>
        </div>
        <div className="mt-2"><Progress value={Math.min(ml, a.metaMl)} max={a.metaMl} color="var(--meu)" /></div>
        <div className="mt-3 flex flex-col gap-1.5">
          {marcos.map((m) => {
            const ok = ml >= m.ml;
            const atrasado = !ok && agora > m.ate;
            return (
              <div key={m.ate} className="flex items-center gap-2 text-[14px]">
                <span aria-hidden className={ok ? "text-ok" : atrasado ? "text-alert" : "text-ink3"}>{ok ? "✓" : atrasado ? "!" : "○"}</span>
                <span className={ok ? "text-ink2" : ""}>{fmtAgua(m.ml)} até {m.ate}</span>
                {!ok && <span className="text-ink3 ml-auto">faltam {fmtAgua(m.ml - ml)}</span>}
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <Button className="!h-10" onClick={() => update((dd) => addAgua(dd, -a.copoMl))} disabled={ml <= 0}>− {a.copoMl} ml</Button>
          <Button tone="primary" className="!h-10" onClick={() => update((dd) => addAgua(dd, a.copoMl))}>+ {a.copoMl} ml</Button>
          <Button className="!h-10" onClick={() => update((dd) => addAgua(dd, 500))}>+ 500 ml</Button>
        </div>
        <div className="text-[12px] text-ink3 mt-3">Semana: {fmtAgua(sem.ml)} de {fmtAgua(sem.meta)}</div>
        <div className="mt-1"><Progress value={Math.min(sem.ml, sem.meta)} max={sem.meta} color="var(--s3)" /></div>
      </Card>
      {cfg && <AguaConfig onClose={() => setCfg(false)} />}
    </>
  );
}

function AguaConfig({ onClose }: { onClose: () => void }) {
  const d = useData();
  const a = aguaOf(d);
  const [meta, setMeta] = useState(String(a.metaMl / 1000).replace(".", ","));
  const [copo, setCopo] = useState(String(a.copoMl));
  const [hs, setHs] = useState<string[]>(a.horarios);
  const m = parse(meta), c = parse(copo);
  const ok = m > 0 && c > 0 && hs.length > 0;
  return (
    <Sheet open onClose={onClose} title="Meta de água">
      <div className="grid grid-cols-2 gap-2 mb-3">
        <label className="block min-w-0"><span className="block text-[13px] text-ink3 px-1 mb-1">Litros por dia</span>
          <input inputMode="decimal" className="num" value={meta} onChange={(e) => setMeta(e.target.value)} /></label>
        <label className="block min-w-0"><span className="block text-[13px] text-ink3 px-1 mb-1">Botão rápido (ml)</span>
          <input inputMode="numeric" className="num" value={copo} onChange={(e) => setCopo(e.target.value)} /></label>
      </div>
      <div className="text-[13px] text-ink3 px-1 mb-1">Horários dos lembretes (a meta é dividida igual entre eles)</div>
      <div className="card px-4 mb-3">
        {hs.map((h, i) => (
          <div key={i} className={`flex items-center gap-3 py-2 ${i ? "border-t border-line" : ""}`}>
            <span className="flex-1 text-ink2">{ok ? fmtAgua(Math.round(m * 1000 / hs.length)) : "—"} até</span>
            <input type="time" value={h} onChange={(e) => setHs(hs.map((x, y) => (y === i ? e.target.value : x)))} className="!w-[120px]" />
            <button className="text-ink3 px-2" aria-label="Tirar horário" disabled={hs.length <= 1} onClick={() => setHs(hs.filter((_, y) => y !== i))}>×</button>
          </div>
        ))}
        <button className="w-full text-left py-3 text-link font-semibold border-t border-line" onClick={() => setHs([...hs, "22:00"])}>+ Horário</button>
      </div>
      <Button tone="primary" className="w-full mb-2" disabled={!ok} onClick={() => { update((dd) => setAgua(dd, { metaMl: Math.round(m * 1000), copoMl: Math.round(c), horarios: hs.filter(Boolean) })); onClose(); }}>Salvar</Button>
      <Button className="w-full mb-2" disabled={!ok} onClick={async () => {
        update((dd) => setAgua(dd, { metaMl: Math.round(m * 1000), copoMl: Math.round(c), horarios: hs.filter(Boolean) }));
        const ok2 = await shareFile(new File([buildAguaIcs({ ...d, fit: { ...(d.fit ?? { weights: [], days: {}, time: "18:00", routines: [], workouts: [] }), agua: { ...a, metaMl: Math.round(m * 1000), horarios: hs.filter(Boolean) } } })], "lembretes-agua.ics", { type: "text/calendar" }));
        if (ok2) toast("Abra o arquivo e escolha “Adicionar tudo” para criar os lembretes");
      }}>Criar lembretes no calendário</Button>
      <Button className="w-full" onClick={() => { setMeta(String(AGUA_PADRAO.metaMl / 1000)); setCopo(String(AGUA_PADRAO.copoMl)); setHs(AGUA_PADRAO.horarios); }}>Voltar ao padrão (3 L, 3 horários)</Button>
      <p className="text-[12px] text-ink3 mt-3 px-1">O app não manda notificação sozinho: os lembretes vão para o Calendário do iPhone, que avisa no horário.</p>
    </Sheet>
  );
}

/** Metas da semana: minutos de cardio e séries por grupo muscular, cada uma com barra. */
export function MetasSemana() {
  const d = useData();
  const al = alvosOf(d);
  const feito = feitoNaSemana(d);
  const [cfg, setCfg] = useState(false);
  const grupos = Object.keys(al.series).filter((g) => al.series[g] > 0);
  return (
    <>
      <Section action={<button onClick={() => setCfg(true)} className="text-link text-[15px] font-semibold">Ajustar</button>}>Metas da semana</Section>
      <Card>
        <label className="block mb-3">
          <span className="block text-[13px] text-ink3 px-1 mb-1">Meu objetivo</span>
          <select value={al.objetivo} onChange={(e) => update((dd) => aplicarObjetivo(dd, e.target.value))}>
            {OBJETIVOS.map((o) => <option key={o.key} value={o.key}>{o.nome}</option>)}
            {al.objetivo === "personalizado" && <option value="personalizado">Personalizado (ajustado por mim)</option>}
          </select>
        </label>
        <div className="flex justify-between text-[15px]"><span className="font-semibold">Cardio</span><span className="text-ink2">{feito.cardio} de {al.cardioMin} min</span></div>
        <div className="mt-1.5 mb-4"><Progress value={Math.min(feito.cardio, al.cardioMin)} max={al.cardioMin} color="var(--s3)" /></div>
        {grupos.map((g) => (
          <div key={g} className="mb-3 last:mb-0">
            <div className="flex justify-between text-[14px]">
              <span>{g}</span>
              <span className={(feito.series[g] ?? 0) >= al.series[g] ? "text-ok font-semibold" : "text-ink2"}>{feito.series[g] ?? 0} de {al.series[g]} séries</span>
            </div>
            <div className="mt-1"><Progress value={Math.min(feito.series[g] ?? 0, al.series[g])} max={al.series[g]} color="var(--meu)" /></div>
          </div>
        ))}
        <Expandir className="mt-3 text-[14px]" titulo="De onde vêm esses números">
          <div className="text-[13px] text-ink2 mt-1 flex flex-col gap-2">
            {OBJETIVOS.find((o) => o.key === al.objetivo) && <p><b>{OBJETIVOS.find((o) => o.key === al.objetivo)!.nome}.</b> {OBJETIVOS.find((o) => o.key === al.objetivo)!.nota}</p>}
            <p>Bíceps e tríceps já são puxados e empurrados nos exercícios de costas e peito, por isso as metas deles são menores. Perto de 10 a 20 séries por músculo é a faixa útil para ganhar massa.</p>
            <p>São pontos de partida tirados da literatura, não prescrição: a resposta muda de pessoa para pessoa. Ajuste do seu jeito.</p>
          </div>
        </Expandir>
      </Card>
      {cfg && <AlvosConfig onClose={() => setCfg(false)} />}
    </>
  );
}

function AlvosConfig({ onClose }: { onClose: () => void }) {
  const d = useData();
  const al = alvosOf(d);
  const [cardio, setCardio] = useState(String(al.cardioMin));
  const nomes = [...new Set([...GRUPOS.filter((g) => g !== "Outros"), ...Object.keys(al.series)])];
  const [series, setSeries] = useState<Record<string, string>>(Object.fromEntries(nomes.map((g) => [g, String(al.series[g] ?? 0)])));
  return (
    <Sheet open onClose={onClose} title="Metas da semana">
      <label className="block mb-3"><span className="block text-[13px] text-ink3 px-1 mb-1">Cardio (minutos por semana)</span>
        <input inputMode="numeric" className="num" value={cardio} onChange={(e) => setCardio(e.target.value)} /></label>
      <div className="text-[13px] text-ink3 px-1 mb-1">Séries por semana (0 = não acompanhar)</div>
      <div className="card px-4 mb-3">
        {nomes.map((g, i) => (
          <div key={g} className={`flex items-center gap-3 py-2 ${i ? "border-t border-line" : ""}`}>
            <span className="flex-1">{g}</span>
            <input inputMode="numeric" className="num text-center !w-[88px]" value={series[g]} onChange={(e) => setSeries({ ...series, [g]: e.target.value })} aria-label={`Séries de ${g}`} />
          </div>
        ))}
      </div>
      <Button tone="primary" className="w-full mb-2" onClick={() => {
        const c = Math.round(parse(cardio));
        const novas = Object.fromEntries(nomes.map((g) => [g, Math.max(0, Math.round(parse(series[g]) || 0))]));
        const mudou = nomes.some((g) => novas[g] !== (al.series[g] ?? 0)) || (Number.isFinite(c) && c !== al.cardioMin);
        update((dd) => setAlvos(dd, { cardioMin: Number.isFinite(c) && c >= 0 ? c : al.cardioMin, series: novas, ...(mudou ? { objetivo: "personalizado" } : {}) }));
        onClose();
      }}>Salvar</Button>
      <Button className="w-full" onClick={() => { setCardio(String(ALVOS_PADRAO.cardioMin)); setSeries(Object.fromEntries(nomes.map((g) => [g, String(ALVOS_PADRAO.series[g] ?? 0)]))); }}>Voltar aos padrões</Button>
    </Sheet>
  );
}

/** Na aba Hoje: quanto você levantou na semana e desde o começo, com o desenho do equivalente. */
export function PesoResumo() {
  const d = useData();
  const p = pesoLevantado(d);
  if (!p.total) return null;
  return (
    <>
      <Section>Peso levantado</Section>
      <div className="flex flex-col gap-3">
        <Equivalencia titulo="Esta semana" kg={p.semana} />
        <Equivalencia titulo="Total, desde o começo" kg={p.total} />
      </div>
    </>
  );
}

/** Peso total levantado (kg × repetições) por período, só de curiosidade. */
export function PesoLevantado() {
  const d = useData();
  const p = pesoLevantado(d);
  const linhas: [string, number][] = [["Hoje", p.dia], ["Este mês", p.mes], ["Este ano", p.ano]];
  return (
    <>
      <Section>Peso total levantado</Section>
      <div className="flex flex-col gap-3">
        <Equivalencia titulo="Esta semana" kg={p.semana} />
        <Equivalencia titulo="Total, desde o começo" kg={p.total} />
        <Card>
          <div className="divide-y divide-line">
            {linhas.map(([n, v]) => (
              <div key={n} className="py-2">
                <div className="flex justify-between"><span className="text-ink2">{n}</span><span className="num font-semibold">{fmtPeso(v)}</span></div>
                <LinhaEquivalencia kg={v} className="block text-[13px] text-ink3" />
              </div>
            ))}
          </div>
          <div className="text-[12px] text-ink3 mt-2">Cada série vale carga × repetições. Os pesos das comparações são aproximados. É só curiosidade, não entra em meta.</div>
        </Card>
      </div>
      <MinhasComparacoes />
    </>
  );
}
