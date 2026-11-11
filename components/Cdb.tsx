"use client";

import { useMemo, useState } from "react";
import { aplicarCdb, apagarAplicacao, cdbProjecao, cdbRende, cdbSerie, conferirAplicacao, proximaFaixa, resgatarAplicacao, salvarAplicacao } from "@/lib/cdb";
import { cdiStatus, refreshCdi } from "@/lib/cdi";
import { brl, brl0, localDay } from "@/lib/format";
import { cdbItens, cdbNet, cdbPerDay, cdbPrincipalNow, lastCdi, usaTranches, useData, type TrancheInfo } from "@/lib/store";
import { Bars3D, TrendChart } from "./charts";
import { act, Button, Card, Money, Section, Segmented, Sheet, Tilt, Title, toast } from "./ui";

const parse = (v: string) => parseFloat(v.replace(/\./g, "").replace(",", "."));
const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const num = (v: number, max = 2) => v.toLocaleString("pt-BR", { maximumFractionDigits: max });
const campo = (v: number) => String(v).replace(".", ",");
const ontem = () => localDay(new Date(Date.now() - 86400000));

export default function Cdb() {
  const d = useData();
  const c = d.config;
  const itens = cdbItens(d);
  const n = cdbNet(d);
  const [sheet, setSheet] = useState<null | "conferir" | "resgatar" | "nova">(null);
  const [aberta, setAberta] = useState<TrancheInfo | null>(null);
  const [meses, setMeses] = useState("12");
  const [aporte, setAporte] = useState("");
  const [buscando, setBuscando] = useState(false);
  const ult = cdiStatus();
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
  const checks = [...(c.cdb.checks || [])].reverse();

  if (!usaTranches(d)) {
    return (
      <div>
        <Title>CDB</Title>
        <Card className="text-ink2 mt-1">
          Cadastre cada aplicação do jeito que aparece no C6: data, valor aplicado e % do CDI. O app rende cada uma com a taxa dela e calcula o IR de cada uma. Quando fizer outra aplicação, é só adicionar aqui.
        </Card>
        <Button tone="primary" className="w-full mt-3" onClick={() => setSheet("nova")}>+ Cadastrar aplicação</Button>
        {sheet === "nova" && <AplicacaoSheet info={null} onClose={() => setSheet(null)} />}
      </div>
    );
  }

  return (
    <div>
      <Title>CDB</Title>

      <Tilt><div className="hero card p-5">
        <div className="text-white/70 text-[14px]">Valor acumulado</div>
        <Money v={n.bruto} count className="block text-[38px] leading-tight font-extrabold" />
        <div className="text-[13px] text-white/75">calculado até {dataBR(ontem()).slice(0, 5)} · {itens.length} aplicaç{itens.length === 1 ? "ão" : "ões"}</div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="rounded-xl bg-white/10 p-3">
            <div className="text-[12px] text-white/70">Líquido para resgate</div>
            <Money v={n.liquido} className="font-bold" />
            <div className="text-[12px] text-white/70">IR <Money v={n.ir} /> ({num(n.aliquota, 1)}%)</div>
          </div>
          <div className="rounded-xl bg-white/10 p-3">
            <div className="text-[12px] text-white/70">Total investido</div>
            <Money v={principal} className="font-bold" />
            <div className="text-[12px] text-white/70">rendeu <Money v={n.bruto - principal} /></div>
          </div>
        </div>
      </div></Tilt>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <Button tone="primary" onClick={() => setSheet("nova")}>+ Nova aplicação</Button>
        <Button onClick={() => setSheet("conferir")}>Conferir com o C6</Button>
      </div>

      <Section action={<button onClick={() => setSheet("resgatar")} className="text-link text-[15px] font-semibold">Resgatar</button>}>Aplicações</Section>
      <div className="flex flex-col gap-3">
        {itens.map((i) => (
          <Card key={i.t.id} onClick={() => setAberta(i)}>
            <div className="flex justify-between items-baseline gap-2">
              <span className="font-semibold truncate">{i.t.name}</span>
              <span className="text-[12px] text-ink3 shrink-0">{dataBR(i.t.date)}</span>
            </div>
            <Money v={i.value} className="block text-[24px] font-bold" />
            <div className="mt-1 divide-y divide-line">
              <Linha t="Aplicado" v={i.t.principal} />
              <Linha t="Rendimento bruto" v={i.rendimento} cor="text-ok" sinal />
              <Linha t={i.t.isento ? "IR (isento)" : `IR ${num(i.aliquota, 1)}%`} v={-i.ir} sinal />
              <Linha t="Disponível para resgate" v={i.liquido} forte />
            </div>
            <div className="text-[12px] text-ink3 mt-2 flex flex-wrap gap-x-3">
              <span>{num(i.t.pct, 1)}% CDI</span>
              {i.t.due && <span>vence {dataBR(i.t.due)}</span>}
              {i.proxima && <span>IR cai para {num(i.proxima.nova, 1)}% em {i.proxima.em} dias</span>}
            </div>
          </Card>
        ))}
      </div>

      <Section>Confira com o C6</Section>
      <Card>
        <div className="text-[13px] text-ink2 mb-2">Os mesmos números da tela “Detalhes” do C6, somando todas as aplicações:</div>
        <div className="divide-y divide-line">
          <Linha t="Valor líq. para resgate" v={n.liquido} forte />
          <Linha t="Total investido" v={principal} />
          <Linha t="Rendimento" v={n.bruto - principal} cor="text-ok" sinal />
          <Linha t="IOF sobre rendimento" v={0} />
          <Linha t="IR sobre rendimento" v={-n.ir} sinal />
        </div>
        <p className="text-[12px] text-ink3 mt-2">O app conta o CDI até ontem. Se o C6 mostrar outro valor, use “Conferir com o C6”: ele recomeça do valor do C6 e guarda a diferença.</p>
      </Card>

      {itens.length > 1 && (
        <>
          <Section>Valor por aplicação</Section>
          <Card>
            <Bars3D name="Valor" fmt={brl0} data={itens.map((i) => ({ label: dataBR(i.t.date).slice(0, 5), value: Math.round(i.value) }))} />
          </Card>
        </>
      )}

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
        <p className="text-[12px] text-ink3 mt-2">Com a taxa de hoje ({num(lastCdi(d), 4)}% ao dia útil), cada aplicação com a sua % do CDI. Hoje rende <Money v={cdbPerDay(d)} /> por dia útil.</p>
      </Card>

      {serie.length > 1 && (
        <>
          <Section>Últimos dias</Section>
          <Card>
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-[12px] text-ink3 pb-1 border-b border-line"><span>Dia</span><span className="text-right">Valor bruto</span><span className="text-right">Subiu</span></div>
            <div className="divide-y divide-line">
              {serie.slice(-9).map((p, i, arr) => {
                const ant = i ? arr[i - 1].bruto : serie[Math.max(0, serie.length - 10)].bruto;
                const sub = p.bruto - ant;
                return (
                  <div key={p.date} className="grid grid-cols-[1fr_auto_auto] gap-x-4 py-2 text-[14px]">
                    <span className="text-ink2">{dataBR(p.date).slice(0, 5)}{p.date === hoje ? " · hoje" : ""}</span>
                    <Money v={p.bruto} className="text-right" />
                    <span className={`text-right num ${sub > 0 ? "text-ok" : "text-ink3"}`}>{sub > 0 ? "+" : ""}{brl(sub)}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-[12px] text-ink3 mt-2">O CDB só rende em dia útil, e o CDI de um dia entra no dia seguinte: sábado, domingo e feriado ficam sem subir.</p>
          </Card>
        </>
      )}

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
        <p className="text-[12px] text-ink3 mt-2">Em {meses} meses, mantendo a taxa de hoje e o IR da faixa em que cada aplicação estará. É estimativa: o CDI muda.</p>
      </Card>

      <Section>Imposto de renda</Section>
      <Card>
        {faixa ? (
          faixa.ultima ? <div className="text-[14px] text-ok">Todas as aplicações já estão na menor faixa (15%) ou são isentas.</div> : (
            <div className="text-[14px]">
              A próxima mudança é em <b>{faixa.em} dias</b> ({dataBR(faixa.data)}): {faixa.nome ? <b>{faixa.nome}</b> : "uma aplicação"} cai para <b>{num(faixa.nova, 1)}%</b>, o que economiza cerca de <b><Money v={faixa.ganho} /></b> do rendimento de hoje.
            </div>
          )
        ) : <div className="text-ink2">Cadastre a data de cada aplicação para ver as faixas.</div>}
        <div className="text-[12px] text-ink3 mt-2">Cada aplicação conta o prazo desde a sua data: até 180 dias 22,5% · até 360 20% · até 720 17,5% · depois 15%. LCI e LCA são isentas.</div>
      </Card>

      <Section>Taxas</Section>
      <div className="card px-4">
        <div className="py-3 flex items-center justify-between gap-3">
          <span><span className="block">CDI hoje</span><span className="block text-[13px] text-ink3">{num(c.cdb.cdiAnnual)}% ao ano</span></span>
          <span className="text-ink2">{num(lastCdi(d), 4)}% ao dia</span>
        </div>
        <div className="py-3 border-t border-line flex items-start justify-between gap-3">
          <span>
            <span className="block">Banco Central</span>
            <span className="block text-[13px] text-ink3">{ultimoCdi ? `CDI atualizado até ${dataBR(ultimoCdi).slice(0, 5)}${cdiOk ? "" : ". Faz dias que não chega taxa nova: usando a última."}` : "Ainda não buscou: abra o app com internet."}</span>
            {ult && <span className={`block text-[12px] ${ult.ok ? "text-ink3" : "text-alert"}`}>Última busca {new Date(ult.t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}: {ult.msg}</span>}
          </span>
          <span className={cdiOk ? "text-ok" : "text-alert"}>{cdiOk ? "✓" : "⚠︎"}</span>
        </div>
        <button className="w-full text-left py-3 border-t border-line text-link font-semibold" disabled={buscando} onClick={async () => { setBuscando(true); const r = await refreshCdi(true); setBuscando(false); toast(r.msg); }}>{buscando ? "Buscando…" : "Buscar o CDI agora"}</button>
      </div>

      {checks.length > 0 && (
        <>
          <Section>Conferências</Section>
          <div className="card px-4">
            {checks.slice(0, 12).map((k, i) => (
              <div key={k.date + i} className={`py-2.5 ${i ? "border-t border-line" : ""}`}>
                <div className="flex justify-between gap-2"><span className="text-ink2 truncate">{dataBR(k.date).slice(0, 5)} · {k.name ?? "CDB"}</span><Money v={k.c6} /></div>
                <div className="text-[12px] text-ink3">O app calculava <Money v={k.app} />: diferença {k.c6 - k.app >= 0 ? "+" : "−"}<Money v={Math.abs(k.c6 - k.app)} />.</div>
              </div>
            ))}
          </div>
        </>
      )}

      {sheet === "conferir" && <ConferirTodas onClose={() => setSheet(null)} />}
      {sheet === "resgatar" && <Resgatar onClose={() => setSheet(null)} />}
      {sheet === "nova" && <AplicacaoSheet info={null} onClose={() => setSheet(null)} />}
      {aberta && <AplicacaoSheet info={aberta} onClose={() => setAberta(null)} onResgatar={() => { setAberta(null); setSheet("resgatar"); }} />}
    </div>
  );
}

const Linha = ({ t, v, forte, cor = "", sinal }: { t: string; v: number; forte?: boolean; cor?: string; sinal?: boolean }) => (
  <div className="flex justify-between py-1.5 text-[14px]"><span className="text-ink2">{t}</span><Money v={v} signed={sinal} className={`${forte ? "font-bold" : ""} ${cor}`} /></div>
);

/** Criar ou editar uma aplicação. */
function AplicacaoSheet({ info, onClose, onResgatar }: { info: TrancheInfo | null; onClose: () => void; onResgatar?: () => void }) {
  const d = useData();
  const t = info?.t;
  const ult = [...(d.config.cdb.tranches ?? [])].sort((x, y) => (x.date < y.date ? 1 : -1))[0];
  const [nome, setNome] = useState(t?.name ?? ult?.name ?? "CDB");
  const [data, setData] = useState(t?.date ?? localDay());
  const [valor, setValor] = useState(t ? campo(t.principal) : "");
  const [pct, setPct] = useState(campo(t?.pct ?? ult?.pct ?? d.config.cdb.pctCdi));
  const [venc, setVenc] = useState(t?.due ?? "");
  const [isento, setIsento] = useState(!!t?.isento);
  const [agora, setAgora] = useState(info ? campo(info.value) : "");
  const [saiu, setSaiu] = useState(true);
  const v = parse(valor), p = parse(pct), ag = parse(agora);
  const ok = Number.isFinite(v) && v > 0 && Number.isFinite(p) && p > 0 && /^\d{4}-\d{2}-\d{2}$/.test(data);
  return (
    <Sheet open onClose={onClose} title={t ? "Aplicação" : "Nova aplicação"}>
      <label className="block mb-3"><span className="block text-[13px] text-ink3 px-1 mb-1">Nome</span>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: CDB C6 Limite Garantido" /></label>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <label className="block min-w-0"><span className="block text-[13px] text-ink3 px-1 mb-1">Valor aplicado</span>
          <input inputMode="decimal" className="num" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" autoFocus={!t} /></label>
        <label className="block min-w-0"><span className="block text-[13px] text-ink3 px-1 mb-1">% do CDI</span>
          <input inputMode="decimal" className="num" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="101,5" /></label>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <label className="block min-w-0"><span className="block text-[13px] text-ink3 px-1 mb-1">Dia da aplicação</span>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
        <label className="block min-w-0"><span className="block text-[13px] text-ink3 px-1 mb-1">Vencimento</span>
          <input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} /></label>
      </div>
      <label className="flex items-center justify-between bg-card rounded-2xl px-4 py-3 mb-3 gap-3">
        <span><span className="block">Isento de IR</span><span className="block text-[13px] text-ink3">LCI e LCA não pagam imposto de renda</span></span>
        <input type="checkbox" checked={isento} onChange={(e) => setIsento(e.target.checked)} className="!w-6 !h-6 shrink-0 accent-[var(--meu)]" />
      </label>
      {t ? (
        <label className="block mb-3"><span className="block text-[13px] text-ink3 px-1 mb-1">Valor que o C6 mostra hoje (opcional)</span>
          <input inputMode="decimal" className="num" value={agora} onChange={(e) => setAgora(e.target.value)} />
          <span className="block text-[13px] text-ink3 px-1 mt-1">O app calcula {brl(info!.value)}. Se digitar outro, ele recomeça daí e guarda a diferença.</span></label>
      ) : (
        <label className="flex items-center justify-between bg-card rounded-2xl px-4 py-3 mb-3 gap-3">
          <span><span className="block">Saiu da minha conta agora</span><span className="block text-[13px] text-ink3">Lança a saída no saldo. Desmarque se o dinheiro já saiu e já está no extrato.</span></span>
          <input type="checkbox" checked={saiu} onChange={(e) => setSaiu(e.target.checked)} className="!w-6 !h-6 shrink-0 accent-[var(--meu)]" />
        </label>
      )}
      <div className="sticky bottom-0 bg-bg pt-2 pb-1 flex flex-col gap-2">
        <Button tone="primary" className="w-full" disabled={!ok} onClick={() => {
          if (t) {
            const mudouValor = Number.isFinite(ag) && Math.abs(ag - info!.value) >= 0.005;
            act("Aplicação salva", (dd) => salvarAplicacao(dd, { id: t.id, name: nome, date: data, principal: v, pct: p, due: venc, isento, ...(mudouValor ? { valorAgora: ag } : {}) }));
          } else {
            act(`${nome.trim() || "CDB"}: ${brl(v)} aplicados`, (dd) => aplicarCdb(dd, { name: nome, date: data, valor: v, pct: p, due: venc, isento, saiuDaConta: saiu }));
          }
          onClose();
        }}>Salvar</Button>
        {t && (
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => onResgatar?.()}>Resgatar</Button>
            <Button tone="danger" onClick={() => { if (confirm(`Apagar a aplicação de ${dataBR(t.date)}? Isso só tira do app, não do C6.`)) { act("Aplicação apagada", (dd) => apagarAplicacao(dd, t.id)); onClose(); } }}>Apagar</Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** Todas as aplicações de uma vez, com os valores que o C6 mostra. */
function ConferirTodas({ onClose }: { onClose: () => void }) {
  const d = useData();
  const itens = cdbItens(d);
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(itens.map((i) => [i.t.id, campo(i.value)])));
  const dif = itens.map((i) => (Number.isFinite(parse(v[i.t.id])) ? parse(v[i.t.id]) - i.value : 0));
  const total = dif.reduce((s, x) => s + x, 0);
  return (
    <Sheet open onClose={onClose} title="Conferir com o C6">
      <p className="text-ink2 mb-3">No C6: Posição, Aplicações. Digite o valor de cada uma. Pode deixar como está as que já batem.</p>
      <div className="card px-4 mb-3">
        {itens.map((i, k) => (
          <label key={i.t.id} className={`flex items-center gap-3 py-3 ${k ? "border-t border-line" : ""}`}>
            <span className="flex-1 min-w-0">
              <span className="block truncate">{i.t.name}</span>
              <span className="block text-[12px] text-ink3">{dataBR(i.t.date)} · o app calcula {brl(i.value)}{Math.abs(dif[k]) >= 0.005 ? ` · ${dif[k] > 0 ? "+" : "−"}${brl(Math.abs(dif[k]))}` : ""}</span>
            </span>
            <input inputMode="decimal" className="num !w-32 text-right" value={v[i.t.id]} onChange={(e) => setV({ ...v, [i.t.id]: e.target.value })} aria-label={`Valor de ${i.t.name}`} />
          </label>
        ))}
      </div>
      <Button tone="primary" className="w-full" onClick={() => {
        act(Math.abs(total) < 0.005 ? "Já estava batendo" : `Diferença total: ${total > 0 ? "+" : "−"}${brl(Math.abs(total))}`, (dd) =>
          itens.reduce((acc, i) => (Number.isFinite(parse(v[i.t.id])) && Math.abs(parse(v[i.t.id]) - i.value) >= 0.005 ? conferirAplicacao(acc, i.t.id, parse(v[i.t.id])) : acc), dd));
        refreshCdi(true);
        onClose();
      }}>Salvar</Button>
    </Sheet>
  );
}

function Resgatar({ onClose }: { onClose: () => void }) {
  const d = useData();
  const itens = cdbItens(d);
  const [id, setId] = useState(itens[0]?.t.id ?? "");
  const [tudo, setTudo] = useState(true);
  const [bruto, setBruto] = useState("");
  const [liq, setLiq] = useState("");
  const [dia, setDia] = useState(localDay());
  const [entrou, setEntrou] = useState(true);
  const i = itens.find((x) => x.t.id === id) ?? itens[0];
  if (!i) return null;
  const b = tudo ? i.value : parse(bruto);
  // IR proporcional ao que sai (o banco retém sobre a parte do rendimento que está saindo)
  const irEst = Number.isFinite(b) ? Math.floor(i.rendimento * Math.min(1, b / i.value) * (i.aliquota / 100) * 100 + 1e-6) / 100 : 0;
  const liquidoEst = Number.isFinite(b) ? Math.round((b - irEst) * 100) / 100 : NaN;
  const l = liq === "" ? liquidoEst : parse(liq);
  const ok = Number.isFinite(b) && b > 0 && b <= i.value + 0.005 && Number.isFinite(l) && l > 0;
  return (
    <Sheet open onClose={onClose} title="Resgatar">
      <label className="block mb-3"><span className="block text-[13px] text-ink3 px-1 mb-1">De qual aplicação</span>
        <select value={i.t.id} onChange={(e) => { setId(e.target.value); setLiq(""); }}>
          {itens.map((x) => <option key={x.t.id} value={x.t.id}>{x.t.name} · {dataBR(x.t.date)} · {brl(x.value)}</option>)}
        </select></label>
      <Segmented value={tudo ? "tudo" : "parte"} onChange={(x) => { setTudo(x === "tudo"); setLiq(""); }} options={[{ value: "tudo", label: "Tudo" }, { value: "parte", label: "Uma parte" }]} />
      {!tudo && (
        <label className="block mt-3"><span className="block text-[13px] text-ink3 px-1 mb-1">Quanto sai do CDB (bruto)</span>
          <input inputMode="decimal" className="num" value={bruto} onChange={(e) => { setBruto(e.target.value); setLiq(""); }} autoFocus /></label>
      )}
      <label className="block mt-3"><span className="block text-[13px] text-ink3 px-1 mb-1">Quanto cai na conta (líquido de IR)</span>
        <input inputMode="decimal" className="num" value={liq} placeholder={Number.isFinite(liquidoEst) ? campo(liquidoEst) : ""} onChange={(e) => setLiq(e.target.value)} />
        <span className="block text-[13px] text-ink3 px-1 mt-1">Estimado: IR de {brl(irEst)} retido. Se o C6 mostrar outro valor, digite.</span></label>
      <label className="block mt-3"><span className="block text-[13px] text-ink3 px-1 mb-1">Dia</span>
        <input type="date" value={dia} max={localDay()} onChange={(e) => setDia(e.target.value)} /></label>
      <label className="flex items-center justify-between bg-card rounded-2xl px-4 py-3 my-3 gap-3">
        <span><span className="block">Entrou na minha conta agora</span><span className="block text-[13px] text-ink3">Lança a entrada no saldo. Desmarque se já veio no extrato.</span></span>
        <input type="checkbox" checked={entrou} onChange={(e) => setEntrou(e.target.checked)} className="!w-6 !h-6 shrink-0 accent-[var(--meu)]" />
      </label>
      <Button tone="primary" className="w-full" disabled={!ok} onClick={() => {
        act(`Resgatado ${brl(b)}`, (dd) => resgatarAplicacao(dd, i.t.id, { bruto: b, liquido: l, date: dia, entrouNaConta: entrou }));
        onClose();
      }}>Resgatar</Button>
    </Sheet>
  );
}

