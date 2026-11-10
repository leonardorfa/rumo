"use client";

import { useMemo, useState } from "react";
import { cdbProjecao, cdbRende, cdbSerie, proximaFaixa, registrarCdb } from "@/lib/cdb";
import { refreshCdi } from "@/lib/cdi";
import { brl, brl0, localDay } from "@/lib/format";
import { cdbNet, cdbPrincipalNow, conferirCdb, lastCdi, rendaFixaNow, useData } from "@/lib/store";
import { TrendChart } from "./charts";
import { act, Button, Card, Money, Section, Segmented, Sheet, Title, toast } from "./ui";

const parse = (v: string) => parseFloat(v.replace(/\./g, "").replace(",", "."));
const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const num = (v: number, max = 2) => v.toLocaleString("pt-BR", { maximumFractionDigits: max });

export default function Cdb() {
  const d = useData();
  const c = d.config;
  const n = cdbNet(d);
  const [sheet, setSheet] = useState<null | "conferir" | "aplicar" | "resgatar" | "pct" | "data">(null);
  const [meses, setMeses] = useState("12");
  const [aporte, setAporte] = useState("");
  const hoje = localDay();
  const principal = cdbPrincipalNow(d);
  const rende = cdbRende(d);
  const faixa = proximaFaixa(d);
  const diasCdi = Object.keys(c.cdiDaily || {}).sort();
  const ultimoCdi = diasCdi[diasCdi.length - 1];
  const cdiOk = !!ultimoCdi && (Date.now() - Date.parse(ultimoCdi)) / 86400000 < 6;
  const a = aporte === "" ? 0 : parse(aporte);
  const proj = useMemo(() => cdbProjecao(d, Number(meses), Number.isFinite(a) ? a : 0), [d, meses, a]);
  const fim = proj[proj.length - 1];
  const serie = useMemo(() => cdbSerie(d), [d]);
  const passo = Math.max(1, Math.ceil(serie.length / 45));
  const grafico = [
    ...serie.filter((_, i) => i % passo === 0 || i === serie.length - 1).map((s, i, arr) => ({
      label: dataBR(s.date).slice(0, 5), value: s.bruto as number | null, extra: (i === arr.length - 1 ? s.bruto : null) as number | null,
    })),
    ...proj.slice(1).map((p) => ({ label: `+${p.m}m`, value: null as number | null, extra: p.bruto as number | null })),
  ];
  const moves = [...(c.cdb.moves || [])].sort((x, y) => (x.date < y.date ? 1 : -1));
  const checks = [...(c.cdb.checks || [])].reverse();

  if (!c.rendaFixa && !(c.cdb.moves || []).length) {
    return (
      <div>
        <Title>CDB</Title>
        <Card className="text-ink2 mt-1">
          Ainda não tem CDB no app. Digite o valor que aparece no C6 e quanto você já aplicou, e o app passa a render sozinho todo dia útil.
        </Card>
        <Button tone="primary" className="w-full mt-3" onClick={() => setSheet("conferir")}>Conferir com o C6</Button>
        {sheet === "conferir" && <Conferir onClose={() => setSheet(null)} />}
      </div>
    );
  }

  return (
    <div>
      <Title>CDB</Title>

      <div className="hero card p-5">
        <div className="text-white/70 text-[14px]">Valor bruto hoje</div>
        <Money v={n.bruto} className="block text-[38px] leading-tight font-extrabold" />
        <div className="text-[13px] text-white/75">
          {c.rendaFixaDate ? `Conferido no C6 em ${dataBR(c.rendaFixaDate)}: ${brl(c.rendaFixa)}` : "Nunca conferido com o C6"}
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="rounded-xl bg-white/10 p-3">
            <div className="text-[12px] text-white/70">Líquido de IR</div>
            <Money v={n.liquido} className="font-bold" />
            <div className="text-[12px] text-white/70">IR {num(n.aliquota)}% sobre <Money v={n.rendimento} /></div>
          </div>
          <div className="rounded-xl bg-white/10 p-3">
            <div className="text-[12px] text-white/70">Investido</div>
            <Money v={principal} className="font-bold" />
            <div className="text-[12px] text-white/70">rendeu <Money v={n.bruto - principal} /></div>
          </div>
        </div>
      </div>

      <Button tone="primary" className="w-full mt-3" onClick={() => setSheet("conferir")}>Conferir com o C6</Button>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <Button onClick={() => setSheet("aplicar")}>+ Aplicar</Button>
        <Button onClick={() => setSheet("resgatar")}>− Resgatar</Button>
      </div>

      <Section>Quanto rende</Section>
      <Card>
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-[12px] text-ink3 pb-1 border-b border-line"><span /><span className="text-right">Bruto</span><span className="text-right">Líquido</span></div>
        <div className="divide-y divide-line">
          {rende.map((r) => (
            <div key={r.rotulo} className="grid grid-cols-[1fr_auto_auto] gap-x-4 py-2.5">
              <span className="text-ink2">{r.rotulo}</span>
              <Money v={r.bruto} className="text-right" />
              <Money v={r.liquido} className="text-right font-semibold" />
            </div>
          ))}
        </div>
        <p className="text-[12px] text-ink3 mt-2">Com a taxa de hoje: {num(c.cdb.pctCdi)}% do CDI, {num(lastCdi(d), 4)}% ao dia útil.</p>
      </Card>

      <Section>Crescimento</Section>
      <Segmented value={meses} onChange={setMeses} options={[{ value: "6", label: "6 meses" }, { value: "12", label: "1 ano" }, { value: "24", label: "2 anos" }, { value: "60", label: "5 anos" }]} />
      <Card className="mt-3">
        {grafico.length > 1 && <TrendChart name="CDB bruto" fmt={brl0} data={grafico} />}
        <label className="block mt-2">
          <span className="block text-[13px] text-ink3 px-1 mb-1">E se eu aplicar por mês (R$)</span>
          <input inputMode="decimal" className="num" value={aporte} placeholder="0" onChange={(e) => setAporte(e.target.value)} />
        </label>
        <div className="mt-3 divide-y divide-line">
          <Linha t="Valor bruto" v={fim.bruto} />
          <Linha t="Líquido de IR" v={fim.liquido} forte />
          <Linha t="Você terá aplicado" v={fim.principal} />
          <Linha t="Rendimento bruto" v={fim.bruto - fim.principal} />
        </div>
        <p className="text-[12px] text-ink3 mt-2">Em {meses} meses, mantendo a taxa de hoje e o IR da faixa em que você estará. É estimativa: o CDI muda.</p>
      </Card>

      <Section>Imposto de renda</Section>
      <Card>
        {faixa ? (
          <>
            <div className="flex justify-between"><span className="text-ink2">Hoje</span><span className="font-semibold">{num(faixa.aliquota)}% · {faixa.dias} dias</span></div>
            {faixa.ultima ? <div className="text-[14px] text-ok mt-1">Você já está na menor faixa (15%).</div> : (
              <div className="text-[14px] mt-1">
                Em <b>{faixa.em} dias</b> ({dataBR(faixa.data)}) o IR cai para <b>{num(faixa.nova)}%</b>, o que economiza cerca de <b><Money v={faixa.ganho} /></b> do rendimento de hoje.
              </div>
            )}
          </>
        ) : <div className="text-ink2">Informe a data da aplicação para ver a faixa do IR. Sem ela o app usa 22,5%.</div>}
        <div className="text-[12px] text-ink3 mt-2">Tabela: até 180 dias 22,5% · até 360 20% · até 720 17,5% · depois 15%. Se resgatar hoje, você recebe cerca de <Money v={n.liquido} />.</div>
        <Button className="w-full mt-3 !h-9" onClick={() => setSheet("data")}>{c.cdb.since ? `Aplicação em ${dataBR(c.cdb.since)}: mudar` : "Informar a data da aplicação"}</Button>
      </Card>

      <Section>Taxas</Section>
      <div className="card px-4">
        <Linha2 t="% do CDI" v={`${num(c.cdb.pctCdi)}%`} onClick={() => setSheet("pct")} />
        <Linha2 t="CDI hoje" v={`${num(lastCdi(d), 4)}% ao dia`} sub={`${num(c.cdb.cdiAnnual)}% ao ano`} />
        <div className="py-3 border-t border-line flex items-start justify-between gap-3">
          <span>
            <span className="block">Banco Central</span>
            <span className="block text-[13px] text-ink3">{ultimoCdi ? `CDI atualizado até ${dataBR(ultimoCdi).slice(0, 5)}${cdiOk ? "" : ". Sem conexão há dias: usando a última taxa."}` : "Ainda não buscou: abra o app com internet."}</span>
          </span>
          <span className={cdiOk ? "text-ok" : "text-alert"}>{cdiOk ? "✓" : "⚠︎"}</span>
        </div>
        <button className="w-full text-left py-3 border-t border-line text-link font-semibold" onClick={async () => { toast((await refreshCdi(true)) ? "CDI atualizado" : "Não consegui buscar agora"); }}>Buscar o CDI agora</button>
      </div>

      {(moves.length > 0 || checks.length > 0) && (
        <>
          <Section>Histórico</Section>
          <div className="card px-4">
            {moves.map((m, i) => (
              <div key={m.date + i} className={`flex justify-between py-2.5 ${i ? "border-t border-line" : ""}`}>
                <span className="text-ink2">{dataBR(m.date)} · {m.amount >= 0 ? "Aplicação" : "Resgate"}</span>
                <Money v={m.amount} signed className={m.amount >= 0 ? "text-ok" : ""} />
              </div>
            ))}
            {checks.map((k, i) => (
              <div key={k.date + i} className={`py-2.5 ${moves.length || i ? "border-t border-line" : ""}`}>
                <div className="flex justify-between"><span className="text-ink2">{dataBR(k.date)} · Conferência</span><Money v={k.c6} /></div>
                <div className="text-[12px] text-ink3">O app calculava <Money v={k.app} />: diferença {k.c6 - k.app >= 0 ? "+" : "−"}<Money v={Math.abs(k.c6 - k.app)} />.</div>
              </div>
            ))}
          </div>
        </>
      )}

      {sheet === "conferir" && <Conferir onClose={() => setSheet(null)} />}
      {(sheet === "aplicar" || sheet === "resgatar") && <Mov tipo={sheet} onClose={() => setSheet(null)} />}
      {sheet === "pct" && (
        <Um title="% do CDI" label="Quanto o seu CDB paga do CDI" valor={num(c.cdb.pctCdi)} hint="Ex.: 101,5. Está na tela do investimento, no C6."
          onSave={(v) => act("Taxa salva", (dd) => ({ ...dd, config: { ...dd.config, cdb: { ...dd.config.cdb, pctCdi: v } } }))} onClose={() => setSheet(null)} />
      )}
      {sheet === "data" && (
        <Um title="Data da aplicação" label="Quando você aplicou (o mais antigo, se foram vários)" valor={c.cdb.since ?? ""} tipo="date" hint={`Define a faixa do IR. Hoje é ${dataBR(hoje)}.`}
          onSave={(v, txt) => act("Data salva", (dd) => ({ ...dd, config: { ...dd.config, cdb: { ...dd.config.cdb, since: txt } } }))} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}

const Linha = ({ t, v, forte }: { t: string; v: number; forte?: boolean }) => (
  <div className="flex justify-between py-2"><span className="text-ink2">{t}</span><Money v={v} className={forte ? "font-bold" : ""} /></div>
);
const Linha2 = ({ t, v, sub, onClick }: { t: string; v: string; sub?: string; onClick?: () => void }) => {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className="w-full flex items-center justify-between gap-3 py-3 text-left border-t border-line first:border-t-0">
      <span><span className="block">{t}</span>{sub && <span className="block text-[13px] text-ink3">{sub}</span>}</span>
      <span className="text-ink2">{v}{onClick ? " ›" : ""}</span>
    </Tag>
  );
};

/** Um campo só: número ou data. */
function Um({ title, label, valor, hint, tipo = "num", onSave, onClose }: {
  title: string; label: string; valor: string; hint?: string; tipo?: "num" | "date"; onSave: (v: number, txt: string) => void; onClose: () => void;
}) {
  const [v, setV] = useState(valor);
  const ok = tipo === "date" ? /^\d{4}-\d{2}-\d{2}$/.test(v) : Number.isFinite(parse(v)) && parse(v) >= 0;
  return (
    <Sheet open onClose={onClose} title={title}>
      <label className="block mb-4">
        <span className="block text-[13px] text-ink3 px-1 mb-1">{label}</span>
        <input autoFocus type={tipo === "date" ? "date" : "text"} inputMode={tipo === "num" ? "decimal" : undefined} className={tipo === "num" ? "num text-[22px]" : ""} value={v} onChange={(e) => setV(e.target.value)} />
        {hint && <span className="block text-[13px] text-ink3 px-1 mt-1">{hint}</span>}
      </label>
      <Button tone="primary" className="w-full" disabled={!ok} onClick={() => { onSave(tipo === "num" ? parse(v) : 0, v); onClose(); }}>Salvar</Button>
    </Sheet>
  );
}

/** Digita o que o C6 mostra: o app recomeça daí e guarda a diferença. */
function Conferir({ onClose }: { onClose: () => void }) {
  const d = useData();
  const calc = rendaFixaNow(d);
  const [v, setV] = useState(calc ? String(calc).replace(".", ",") : "");
  const [ap, setAp] = useState(cdbPrincipalNow(d) ? String(cdbPrincipalNow(d)).replace(".", ",") : "");
  const ok = Number.isFinite(parse(v)) && parse(v) > 0 && Number.isFinite(parse(ap || "0"));
  return (
    <Sheet open onClose={onClose} title="Conferir com o C6">
      <p className="text-ink2 mb-3">Abra o investimento no C6 e copie os dois valores. {calc ? <>O app calcula hoje <b>{brl(calc)}</b>.</> : null}</p>
      <label className="block mb-3"><span className="block text-[13px] text-ink3 px-1 mb-1">Valor acumulado hoje (bruto)</span>
        <input inputMode="decimal" autoFocus className="num text-[22px]" value={v} onChange={(e) => setV(e.target.value)} /></label>
      <label className="block mb-4"><span className="block text-[13px] text-ink3 px-1 mb-1">Total investido (soma dos aportes)</span>
        <input inputMode="decimal" className="num text-[22px]" value={ap} onChange={(e) => setAp(e.target.value)} /></label>
      <Button tone="primary" className="w-full" disabled={!ok} onClick={() => {
        const novo = parse(v);
        act(calc ? `Diferença: ${novo - calc >= 0 ? "+" : "−"}${brl(Math.abs(novo - calc))}` : "CDB conferido", (dd) => conferirCdb(dd, novo, parse(ap || "0")));
        refreshCdi(true);
        onClose();
      }}>Salvar</Button>
      <p className="text-[13px] text-ink3 mt-2">O que você digitar vira o novo ponto de partida. Aplicações e resgates anteriores a hoje já estão nesse valor.</p>
    </Sheet>
  );
}

function Mov({ tipo, onClose }: { tipo: "aplicar" | "resgatar"; onClose: () => void }) {
  const d = useData();
  const aplicar = tipo === "aplicar";
  const [cdb, setCdb] = useState("");
  const [conta, setConta] = useState("");
  const [dia, setDia] = useState(localDay());
  const vc = parse(cdb), vn = parse(conta === "" ? cdb : conta);
  const ok = Number.isFinite(vc) && vc > 0 && Number.isFinite(vn) && vn > 0;
  return (
    <Sheet open onClose={onClose} title={aplicar ? "Aplicar no CDB" : "Resgatar do CDB"}>
      <label className="block mb-3"><span className="block text-[13px] text-ink3 px-1 mb-1">{aplicar ? "Quanto você aplicou" : "Quanto saiu do CDB (bruto)"}</span>
        <input inputMode="decimal" autoFocus className="num text-[22px]" value={cdb} onChange={(e) => setCdb(e.target.value)} /></label>
      {!aplicar && (
        <label className="block mb-3"><span className="block text-[13px] text-ink3 px-1 mb-1">Quanto caiu na conta (líquido de IR)</span>
          <input inputMode="decimal" className="num" value={conta} placeholder={cdb} onChange={(e) => setConta(e.target.value)} />
          <span className="block text-[13px] text-ink3 px-1 mt-1">A diferença é o IR retido pelo banco.</span></label>
      )}
      <label className="block mb-4"><span className="block text-[13px] text-ink3 px-1 mb-1">Dia</span>
        <input type="date" value={dia} max={localDay()} onChange={(e) => setDia(e.target.value)} /></label>
      <Button tone="primary" className="w-full" disabled={!ok}
        onClick={() => { act(aplicar ? `Aplicado ${brl(vc)}` : `Resgatado ${brl(vc)}`, (dd) => registrarCdb(dd, { tipo, valorCdb: vc, valorConta: vn, date: dia })); onClose(); }}>
        {aplicar ? "Aplicar" : "Resgatar"}
      </Button>
      <p className="text-[13px] text-ink3 mt-2">Lança também na conta ({aplicar ? "sai" : "entra"} do saldo) e o CDB passa a render {aplicar ? "a partir" : "só até"} desse dia.</p>
    </Sheet>
  );
}
