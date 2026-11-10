"use client";

import { useState } from "react";
import { brl, brl0, localDay, shiftMonth } from "@/lib/format";
import {
  ageAt, ageText, birthdayAt, deleteGoal, fitOf, goalStatus, logGoal, moneyPlan, saveGoal, spanText, weightTrend,
} from "@/lib/life";
import { buildResumo } from "@/lib/resumo";
import { myMoney as myMoneyNow, update, useData } from "@/lib/store";
import type { Goal } from "@/lib/types";
import { TrendChart } from "./charts";
import Assistente from "./Assistente";
import { PesoSheet } from "./Treino";
import { act, Button, Card, Money, Progress, Section, Segmented, Sheet, toast } from "./ui";

const parse = (v: string) => parseFloat(v.replace(/\./g, "").replace(",", "."));
const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const num = (v: number, max = 1) => v.toLocaleString("pt-BR", { maximumFractionDigits: max });
const fmtG = (g: Goal, v: number) => (g.unit === "R$" ? brl0(v) : `${num(v)} ${g.unit}`);

/** Aba "Vida": metas de longo prazo e de outras áreas, todas suas. */
export default function Vida() {
  const d = useData();
  const [form, setForm] = useState<Goal | "novo" | null>(null);
  const [pesoOpen, setPesoOpen] = useState(false);
  const [valorOf, setValorOf] = useState<Goal | null>(null);
  const [nasc, setNasc] = useState(false);
  const [ia, setIa] = useState(false);
  const birth = d.config.prefs.birth;
  const goals = [...(d.goals ?? [])].sort((a, b) => (a.kind === "net" ? -1 : 0) - (b.kind === "net" ? -1 : 0) || (a.deadline < b.deadline ? -1 : 1));

  return (
    <>
      <Card className="mt-1">
        {birth ? (
          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-[13px] text-ink3">Você tem</span>
              <span className="block text-[22px] font-bold leading-tight">{ageText(birth)}</span>
            </span>
            <button className="text-link text-[13px] font-semibold" onClick={() => setNasc(true)}>nasc. {dataBR(birth)}</button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink2">Informe sua data de nascimento para criar metas “até os X anos”.</span>
            <Button tone="primary" className="shrink-0" onClick={() => setNasc(true)}>Informar</Button>
          </div>
        )}
      </Card>

      {goals.length === 0 && (
        <Card className="mt-3 text-ink2">
          Nenhuma meta ainda. Crie a primeira: dinheiro até certa idade, peso, páginas lidas, o que você quiser.
        </Card>
      )}
      {goals.map((g) => (
        <GoalCard key={g.id} g={g} onEdit={() => setForm(g)} onPeso={() => setPesoOpen(true)} onValor={() => setValorOf(g)} />
      ))}

      <Button tone="primary" className="w-full mt-4" onClick={() => setForm("novo")}>+ Nova meta</Button>
      <Button className="w-full mt-2" onClick={() => setIa(true)}>✨ Perguntar à IA (Gemini)</Button>
      <Button className="w-full mt-2" onClick={async () => {
        const txt = buildResumo(d);
        try { await navigator.clipboard.writeText(txt); toast("Resumo copiado: cole na sua IA e faça a pergunta"); }
        catch { prompt("Copie este resumo e cole na sua IA:", txt); }
      }}>Copiar meu resumo para perguntar a uma IA</Button>
      <p className="text-[13px] text-ink3 px-1 mt-2">
        O resumo tem seus números e metas, sem nome nem dados de banco. Só sai do app quando você cola em outro lugar.
      </p>

      {form && <GoalForm g={form === "novo" ? null : form} onClose={() => setForm(null)} />}
      {pesoOpen && <PesoSheet onClose={() => setPesoOpen(false)} />}
      {valorOf && <ValorSheet g={valorOf} onClose={() => setValorOf(null)} />}
      {nasc && <NascForm onClose={() => setNasc(false)} />}
      {ia && <Assistente onClose={() => setIa(false)} />}
    </>
  );
}

function GoalCard({ g, onEdit, onPeso, onValor }: { g: Goal; onEdit: () => void; onPeso: () => void; onValor: () => void }) {
  const d = useData();
  const s = goalStatus(d, g);
  const birth = d.config.prefs.birth;
  const hoje = localDay();
  const tend = g.kind === "weight" ? weightTrend(d) : null;
  const idade = birth ? ageAt(birth, g.deadline) : null;
  return (
    <>
      <Section action={<button onClick={onEdit} className="text-link text-[15px] font-semibold">Editar</button>}>
        <span aria-hidden>{g.icon}</span> {g.title}
      </Section>
      <Card>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[26px] font-bold num truncate">{fmtG(g, s.atual)}</span>
          <span className="text-ink3 shrink-0">de {fmtG(g, g.target)}</span>
        </div>
        <div className="mt-2"><Progress value={s.pct} max={100} color={s.naFrente ? "var(--ok)" : "var(--meta)"} /></div>
        <div className="flex justify-between text-[13px] text-ink2 mt-2 gap-2">
          <span>{s.batida ? "✓ Meta batida" : `${s.pct}% · faltam ${fmtG(g, Math.abs(g.target - s.atual))}`}</span>
          <span className="shrink-0">{g.deadline > hoje ? `faltam ${spanText(hoje, g.deadline)}` : "prazo chegou"}</span>
        </div>
        <div className="text-[13px] text-ink3 mt-1">
          até {dataBR(g.deadline)}{idade !== null ? ` · aos ${idade} anos` : ""}
        </div>
        {!s.batida && g.kind !== "net" && g.deadline > hoje && (
          <div className={`mt-2 text-[14px] ${s.naFrente ? "text-ok" : "text-alert"}`}>
            {s.naFrente ? "✓ No ritmo" : "⚠︎ Atrasado"}: pelo prazo você deveria estar em {fmtG(g, s.esperado)}.
            {" "}Precisa de {num(Math.abs(s.porSemana), 2)} {g.unit}/semana.
          </div>
        )}
        {tend !== null && <div className="text-[13px] text-ink2 mt-1">Seu ritmo nas últimas semanas: {tend > 0 ? "+" : ""}{num(tend, 2)} kg/semana.</div>}
        {g.kind === "weight" && <Button className="w-full mt-3" onClick={onPeso}>Registrar peso</Button>}
        {g.kind === "count" && <Button className="w-full mt-3" onClick={onValor}>Atualizar progresso</Button>}
      </Card>
      {g.kind === "net" && <PlanoDinheiro g={g} />}
      {g.kind === "weight" && <PesoGrafico g={g} />}
      {g.kind === "count" && (g.log?.length ?? 0) > 1 && (
        <Card className="mt-3">
          <TrendChart name={g.title} fmt={(v) => `${num(v)} ${g.unit}`} goal={g.target}
            data={[{ label: dataBR(g.startDate).slice(0, 5), value: g.start }, ...[...(g.log ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1)).map((l) => ({ label: dataBR(l.date).slice(0, 5), value: l.value }))]} />
        </Card>
      )}
    </>
  );
}

function PesoGrafico({ g }: { g: Goal }) {
  const d = useData();
  const ws = fitOf(d).weights;
  if (ws.length < 2) return null;
  return (
    <Card className="mt-3">
      <TrendChart name="Peso" fmt={(v) => `${num(v)} kg`} goal={g.target} goalLabel="Meta"
        data={ws.map((w) => ({ label: dataBR(w.date).slice(0, 5), value: w.kg }))} />
    </Card>
  );
}

/** Quanto guardar por mês, onde estar a cada ano e o "e se" com aporte e retorno que você escolher. */
function PlanoDinheiro({ g }: { g: Goal }) {
  const d = useData();
  const pl = moneyPlan(d, g);
  const hoje = localDay();
  const [aporte, setAporte] = useState<string>("");
  const [ret, setRet] = useState<string>("");
  const rNum = ret === "" ? pl.taxa : parse(ret);
  const aNum = aporte === "" ? pl.aporte : parse(aporte);
  const ok = Number.isFinite(rNum) && Number.isFinite(aNum) && rNum >= 0 && aNum >= 0;
  // e se: aporte e retorno que você escolher
  const i = ok ? (1 + rNum / 100) ** (1 / 12) - 1 : 0;
  const valor = (m: number) => pl.v0 * (1 + i) ** m + (i > 1e-9 ? aNum * (((1 + i) ** m - 1) / i) : aNum * m);
  const final = ok ? valor(pl.n) : 0;
  let meses: number | null = null;
  if (ok) for (let m = 0; m <= 600; m++) if (valor(m) >= g.target) { meses = m; break; }
  const chega = meses === null ? null : shiftMonth(hoje.slice(0, 7), meses);
  const vezes = d.config.salary > 0 ? pl.aporte / d.config.salary : 0;
  return (
    <>
      <Card className="mt-3">
        <div className="text-[13px] text-ink3">Para chegar lá, a {num(pl.taxa)}% ao ano</div>
        <div className="flex items-baseline gap-2">
          <Money v={pl.aporte} className="text-[26px] font-bold" /><span className="text-ink2">por mês</span>
        </div>
        <div className="text-[13px] text-ink2">
          em {pl.n} meses, guardando e deixando render{vezes >= 1.05 ? <>. É {num(vezes)}x o seu salário líquido (<Money v={d.config.salary} />): só fecha com renda maior.</> : "."}
        </div>
        {pl.ritmo !== null && pl.ritmo !== 0 && (
          <div className="text-[13px] text-ink2 mt-2">
            Seu patrimônio cresceu em média <Money v={pl.ritmo} /> por mês nos últimos meses.
            {pl.noRitmo !== null && <> Nesse ritmo você chega em <Money v={pl.noRitmo} /> no prazo{pl.noRitmo >= g.target ? ": bate a meta." : `, faltando ${brl0(g.target - pl.noRitmo)}.`}</>}
          </div>
        )}
        <div className="mt-3">
          <TrendChart name="Caminho" fmt={brl0} goal={g.target} dom={[0, "auto"]}
            data={pl.curva.map((c) => ({ label: `${shiftMonth(hoje.slice(0, 7), c.m).slice(5)}/${shiftMonth(hoje.slice(0, 7), c.m).slice(2, 4)}`, value: c.valor }))} />
        </div>
      </Card>

      <Card className="mt-3">
        <div className="font-semibold mb-2">Onde estar a cada ano</div>
        <div className="divide-y divide-line">
          {pl.marcos.map((m) => {
            const atual = m.ano === Number(hoje.slice(0, 4));
            return (
              <div key={m.data} className="flex justify-between py-2">
                <span className="text-ink2">{dataBR(m.data)}{d.config.prefs.birth ? ` · ${ageAt(d.config.prefs.birth, m.data)} anos` : ""}{atual ? " · este ano" : ""}</span>
                <Money v={m.valor} className="font-semibold" />
              </div>
            );
          })}
        </div>
        <p className="text-[13px] text-ink3 mt-2">Valores no caminho do aporte acima; mude o retorno ou o aporte no “e se” para ver outro.</p>
      </Card>

      <Card className="mt-3">
        <div className="font-semibold mb-2">E se…</div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className="block text-[13px] text-ink3 px-1 mb-1">Guardar por mês (R$)</span>
            <input inputMode="decimal" className="num" value={aporte} placeholder={String(pl.aporte)} onChange={(e) => setAporte(e.target.value)} />
          </label>
          <label className="block min-w-0">
            <span className="block text-[13px] text-ink3 px-1 mb-1">Retorno ao ano (%)</span>
            <input inputMode="decimal" className="num" value={ret} placeholder={String(num(pl.taxa))} onChange={(e) => setRet(e.target.value)} />
          </label>
        </div>
        {ok && (
          <div className="mt-3 text-[15px]">
            No prazo você chega em <b><Money v={final} /></b>
            {final >= g.target ? <span className="text-ok"> · bate a meta (sobram <Money v={final - g.target} />)</span> : <span className="text-alert"> · faltam <Money v={g.target - final} /></span>}.
            <div className="text-[13px] text-ink2 mt-1">
              {chega ? <>Com esse aporte, você chega em <Money v={g.target} /> em {chega.slice(5)}/{chega.slice(0, 4)}.</> : "Com esse aporte não chega nos próximos 50 anos."}
            </div>
          </div>
        )}
        <div className="flex gap-2 mt-3">
          <Button className="flex-1 !h-9" onClick={() => { setAporte(""); setRet(""); }}>Limpar</Button>
          <Button className="flex-1 !h-9" disabled={!ok || rNum === pl.taxa}
            onClick={() => act("Retorno da meta salvo", (dd) => saveGoal(dd, { ...g, returnPct: rNum }))}>Usar este retorno</Button>
        </div>
      </Card>
    </>
  );
}

function NascForm({ onClose }: { onClose: () => void }) {
  const d = useData();
  const [v, setV] = useState(d.config.prefs.birth);
  return (
    <Sheet open onClose={onClose} title="Data de nascimento">
      <p className="text-ink2 mb-3">Usada só para mostrar sua idade e calcular metas “até os X anos”. Fica no seu iPhone.</p>
      <input type="date" value={v} max={localDay()} onChange={(e) => setV(e.target.value)} className="mb-4" />
      <Button tone="primary" className="w-full" disabled={!v}
        onClick={() => { update((dd) => ({ ...dd, config: { ...dd.config, prefs: { ...dd.config.prefs, birth: v } } })); onClose(); }}>Salvar</Button>
    </Sheet>
  );
}

function ValorSheet({ g, onClose }: { g: Goal; onClose: () => void }) {
  const d = useData();
  const s = goalStatus(d, g);
  const [v, setV] = useState(String(s.atual).replace(".", ","));
  const n = parse(v);
  return (
    <Sheet open onClose={onClose} title={g.title}>
      <label className="block mb-3">
        <span className="block text-[13px] text-ink3 px-1 mb-1">Quanto você já fez no total ({g.unit})</span>
        <input inputMode="decimal" autoFocus value={v} onChange={(e) => setV(e.target.value)} className="num text-[22px]" />
        <span className="block text-[13px] text-ink3 px-1 mt-1">O total acumulado, não só o de hoje. Agora: {fmtG(g, s.atual)}.</span>
      </label>
      <Button tone="primary" className="w-full" disabled={!Number.isFinite(n) || n < 0}
        onClick={() => { act(`${g.title}: ${fmtG(g, n)}`, (dd) => logGoal(dd, g.id, n)); onClose(); }}>Salvar</Button>
    </Sheet>
  );
}

const TIPOS = [
  { value: "net", label: "Dinheiro" },
  { value: "weight", label: "Peso" },
  { value: "count", label: "Número" },
] as const;

/** Criar ou editar qualquer meta: nome, tipo, ponto de partida, alvo e prazo (data ou idade). */
function GoalForm({ g, onClose }: { g: Goal | null; onClose: () => void }) {
  const d = useData();
  const bday = d.config.prefs.birth;
  const f = fitOf(d);
  const [tipo, setTipo] = useState<Goal["kind"]>(g?.kind ?? "net");
  const [titulo, setTitulo] = useState(g?.title ?? "");
  const [icone, setIcone] = useState(g?.icon ?? "🎯");
  const [unid, setUnid] = useState(g?.unit ?? "");
  const [ini, setIni] = useState(g ? String(g.start).replace(".", ",") : "");
  const [alvo, setAlvo] = useState(g ? String(g.target).replace(".", ",") : "");
  const [desde, setDesde] = useState(g?.startDate ?? localDay());
  const [prazo, setPrazo] = useState(g?.deadline ?? "");
  const [idade, setIdade] = useState("");
  const [ret, setRet] = useState(g?.returnPct !== undefined ? String(g.returnPct) : "");
  const unidade = tipo === "net" ? "R$" : tipo === "weight" ? "kg" : unid.trim() || "un.";
  const a = parse(alvo), s0 = parse(ini);
  const ok = titulo.trim() && Number.isFinite(a) && a > 0 && /^\d{4}-\d{2}-\d{2}$/.test(prazo) && prazo > desde && (ini === "" || Number.isFinite(s0));
  // o ponto de partida padrão: hoje (dinheiro e peso) ou zero
  const inicial = ini !== "" ? s0 : tipo === "net" ? Math.round(myMoneyNow(d)) : tipo === "weight" ? (f.weights[f.weights.length - 1]?.kg ?? 0) : 0;

  return (
    <Sheet open onClose={onClose} title={g ? "Editar meta" : "Nova meta"}>
      <Segmented value={tipo} onChange={(v) => setTipo(v)} options={TIPOS.map((t) => ({ value: t.value, label: t.label }))} />
      <p className="text-[13px] text-ink3 px-1 mt-2 mb-3">
        {tipo === "net" ? "Acompanha o seu “meu dinheiro” sozinho." : tipo === "weight" ? "Acompanha o peso que você registra na aba Treino." : "Um número que você atualiza (páginas, cursos, horas…)."}
      </p>
      <div className="grid grid-cols-[72px_1fr] gap-2 mb-3">
        <label className="block"><span className="block text-[13px] text-ink3 px-1 mb-1">Ícone</span>
          <input value={icone} onChange={(e) => setIcone(e.target.value)} className="text-center text-[22px]" maxLength={4} /></label>
        <label className="block min-w-0"><span className="block text-[13px] text-ink3 px-1 mb-1">Nome da meta</span>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={tipo === "net" ? "R$ 500 mil aos 25" : tipo === "weight" ? "Chegar a 70 kg" : "Ler 12 livros"} /></label>
      </div>
      {tipo === "count" && (
        <label className="block mb-3"><span className="block text-[13px] text-ink3 px-1 mb-1">Unidade</span>
          <input value={unid} onChange={(e) => setUnid(e.target.value)} placeholder="páginas, livros, horas…" /></label>
      )}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <label className="block min-w-0"><span className="block text-[13px] text-ink3 px-1 mb-1">Começo ({unidade})</span>
          <input inputMode="decimal" className="num" value={ini} onChange={(e) => setIni(e.target.value)} placeholder={tipo === "count" ? "0" : "hoje"} /></label>
        <label className="block min-w-0"><span className="block text-[13px] text-ink3 px-1 mb-1">Alvo ({unidade})</span>
          <input inputMode="decimal" className="num" value={alvo} onChange={(e) => setAlvo(e.target.value)} /></label>
      </div>
      <label className="block mb-3"><span className="block text-[13px] text-ink3 px-1 mb-1">Valendo desde</span>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
      <label className="block mb-1"><span className="block text-[13px] text-ink3 px-1 mb-1">Prazo</span>
        <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} /></label>
      {bday ? (
        <label className="flex items-center gap-2 mb-3 mt-1">
          <span className="text-[13px] text-ink3 px-1 shrink-0">ou aos</span>
          <input inputMode="numeric" className="!w-20 text-center" value={idade} placeholder="25"
            onChange={(e) => { setIdade(e.target.value); const n = parseInt(e.target.value, 10); if (n > 0 && n < 120) setPrazo(birthdayAt(bday, n)); }} />
          <span className="text-[13px] text-ink3">anos (no aniversário)</span>
        </label>
      ) : <p className="text-[13px] text-ink3 px-1 mb-3">Informe a data de nascimento na aba Vida para usar “aos X anos”.</p>}
      {tipo === "net" && (
        <label className="block mb-3"><span className="block text-[13px] text-ink3 px-1 mb-1">Retorno esperado ao ano (%) — vazio usa o padrão de Ajustes ({d.config.prefs.returnPct}%)</span>
          <input inputMode="decimal" className="num" value={ret} onChange={(e) => setRet(e.target.value)} /></label>
      )}
      <div className="sticky bottom-0 bg-bg pt-2 pb-1 flex gap-2">
        {g && <Button tone="danger" className="flex-1" onClick={() => { act(`Meta “${g.title}” apagada`, (dd) => deleteGoal(dd, g.id)); onClose(); }}>Apagar</Button>}
        <Button tone="primary" className="flex-[2]" disabled={!ok} onClick={() => {
          const r = parse(ret);
          act(`Meta “${titulo.trim()}” salva`, (dd) => saveGoal(dd, {
            id: g?.id ?? "", title: titulo.trim(), icon: icone || "🎯", kind: tipo, unit: unidade, start: inicial, startDate: desde, target: a, deadline: prazo,
            ...(g?.log ? { log: g.log } : {}), ...(tipo === "net" && ret !== "" && Number.isFinite(r) ? { returnPct: r } : {}),
          }));
          onClose();
        }}>Salvar</Button>
      </div>
    </Sheet>
  );
}

