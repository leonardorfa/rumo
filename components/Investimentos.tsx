"use client";

import { useEffect, useState } from "react";
import { brl, brl0, localDay } from "@/lib/format";
import { alvosAtingidos, apagarCripto, buscarPrecos, comprarCripto, criptoOf, definirPreco, historicoDe, posicao, salvarCripto, totais, venderCripto } from "@/lib/cripto";
import { getData } from "@/lib/store";
import { update, useData } from "@/lib/store";
import type { Cripto } from "@/lib/types";
import Cdb from "./Cdb";
import { Bars3D, TrendChart } from "./charts";
import { act, Button, Card, Money, Section, Segmented, Sheet, Title, toast } from "./ui";

const parse = (v: string) => parseFloat(v.replace(/\./g, "").replace(",", "."));
const ptNum = (n: number, max = 8) => n.toLocaleString("pt-BR", { maximumFractionDigits: max });
const sinal = (v: number) => (v > 0 ? "+" : "");

type Aba = "renda" | "cripto";

/** Aviso na tela e, se você liberou, também como notificação (só funciona com o app aberto). */
function avisar(msg: string) {
  toast(msg);
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      navigator.serviceWorker?.ready.then((r) => r.showNotification("Órbita", { body: msg })).catch(() => new Notification("Órbita", { body: msg }));
    }
  } catch { /* o aviso na tela já saiu */ }
}
const dataBR = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "data não informada");

export default function Investimentos() {
  const [aba, setAba] = useState<Aba>(() => { try { return (localStorage.getItem("aba-invest") as Aba) || "renda"; } catch { return "renda"; } });
  const troca = (v: Aba) => { setAba(v); try { localStorage.setItem("aba-invest", v); } catch { /* ok */ } };
  return (
    <div>
      <Title>Investimentos</Title>
      <div className="sticky top-0 z-20 -mx-4 px-4 pt-1 pb-2 bg-bg" style={{ paddingTop: "max(4px, env(safe-area-inset-top))" }}>
        <Segmented value={aba} onChange={troca} options={[{ value: "renda", label: "Renda fixa (CDB)" }, { value: "cripto", label: "Cripto" }]} />
      </div>
      {aba === "renda" ? <Cdb /> : <CriptoTab />}
    </div>
  );
}

function CriptoTab() {
  const d = useData();
  const lista = criptoOf(d);
  const t = totais(d);
  const [sheet, setSheet] = useState<{ c: Cripto | null } | null>(null);
  const [aberta, setAberta] = useState<Cripto | null>(null);
  const [buscando, setBuscando] = useState(false);
  const perdeu = t.resultado < 0;
  const ultima = lista.map((c) => c.priceAt).filter(Boolean).sort().pop();

  async function atualizar(silencioso = false) {
    setBuscando(true);
    const p = await buscarPrecos(lista.map((c) => c.symbol));
    setBuscando(false);
    const n = Object.keys(p).length;
    if (!n) { if (!silencioso) toast("Não consegui as cotações agora. Você pode digitar o preço em cada moeda."); return; }
    const antes = getData();
    update((dd) => criptoOf(dd).reduce((acc, c) => (p[c.symbol] ? definirPreco(acc, c.id, p[c.symbol]) : acc), dd));
    for (const a of alvosAtingidos(antes, getData())) avisar(a.tipo === "lucro" ? `${a.symbol} bateu a meta de lucro: ${a.pct.toLocaleString("pt-BR")}%` : `${a.symbol} passou do limite de perda: ${a.pct.toLocaleString("pt-BR")}%`);
    if (!silencioso) toast(`${n} cotaç${n === 1 ? "ão atualizada" : "ões atualizadas"}`);
  }
  // ao abrir a aba, atualiza sozinho (se ligado em Mais e se os preços têm mais de 5 min)
  useEffect(() => {
    if (!lista.length || d.config.prefs.autoCotacao === false) return;
    if (ultima && Date.now() - Date.parse(ultima) < 5 * 60 * 1000) return;
    atualizar(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // "em tempo real": com a aba aberta, confere os preços a cada minuto
  useEffect(() => {
    if (!lista.length || d.config.prefs.autoCotacao === false) return;
    const t = setInterval(() => { if (!document.hidden) atualizar(true); }, 60000);
    return () => clearInterval(t);
  }, [lista.length, d.config.prefs.autoCotacao]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lista.length) {
    return (
      <>
        <Card className="text-ink2 mt-1">
          Anote cada moeda como aparece na corretora: quantidade, custo médio e preço de agora. O app mostra quanto você ganhou ou perdeu em cada uma e no total.
        </Card>
        <Button tone="primary" className="w-full mt-3" onClick={() => setSheet({ c: null })}>+ Adicionar moeda</Button>
        {sheet && <CriptoForm c={sheet.c} onClose={() => setSheet(null)} />}
      </>
    );
  }

  return (
    <>
      <Card className="mt-1">
        <div className="text-ink2 text-[14px]">Valor hoje</div>
        <Money v={t.valor} className="text-[32px] font-bold block" />
        <div className="grid grid-cols-2 gap-3 mt-2 text-[14px]">
          <div><div className="text-ink3 text-[12px]">Investido</div><Money v={t.investido} className="font-semibold" /></div>
          <div>
            <div className="text-ink3 text-[12px]">{perdeu ? "Você perdeu" : "Você ganhou"}</div>
            <span className={`font-semibold ${perdeu ? "text-alert" : "text-ok"}`}><Money v={Math.abs(t.resultado)} /> ({sinal(t.pct)}{ptNum(t.pct, 2)}%)</span>
          </div>
        </div>
        <Button tone="primary" className="w-full mt-3" onClick={() => atualizar()} disabled={buscando}>{buscando ? "Buscando…" : "Atualizar cotações"}</Button>
        {typeof Notification !== "undefined" && Notification.permission === "default" && (
          <button className="text-link text-[14px] font-semibold mt-2" onClick={() => Notification.requestPermission().then(() => toast("Avisos liberados neste aparelho"))}>Liberar avisos do aparelho para as metas de lucro</button>
        )}
        <div className="text-[12px] text-ink3 mt-2">
          {ultima ? `Preços de ${new Date(ultima).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}. ` : "Sem preço ainda: o app usa o custo médio até você atualizar. "}
          Com esta aba aberta o app consulta a cada minuto. Ao abrir, ele consulta a Coinbase e só envia o símbolo da moeda (SOL, BTC…). Dá para desligar em Mais, ou digitar o preço em cada moeda.
        </div>
      </Card>

      <Section action={<button onClick={() => setSheet({ c: null })} className="text-link text-[15px] font-semibold">+ Moeda</button>}>Suas moedas</Section>
      <div className="flex flex-col gap-3">
        {lista.map((c) => {
          const p = posicao(c);
          const neg = p.resultado < 0;
          return (
            <Card key={c.id} onClick={() => setAberta(c)}>
              <div className="flex justify-between items-baseline gap-2">
                <span className="font-semibold">{c.name} <span className="text-ink3 font-normal">{c.symbol}</span></span>
                <Money v={p.valor} className="font-bold" />
              </div>
              <div className="flex justify-between text-[13px] mt-0.5">
                <span className="text-ink3">{ptNum(c.qty)} {c.symbol}</span>
                <span className={neg ? "text-alert" : "text-ok"}>{neg ? "perdeu " : "ganhou "}<Money v={Math.abs(p.resultado)} /> ({sinal(p.pct)}{ptNum(p.pct, 2)}%)</span>
              </div>
              <div className="text-[12px] text-ink3 mt-1">Custo médio {brl(c.avgCost)} · {p.semPreco ? "sem preço atual" : `agora ${brl(c.price!)}`}</div>
            </Card>
          );
        })}
      </div>

      <Section>Investido e valor de cada uma</Section>
      <Card>
                <Bars3D name="Investido e valor atual" explica="Para cada moeda, duas barras: quanto você pôs (azul) e quanto vale hoje (laranja). Laranja menor que azul é prejuízo." fmt={brl0} data={lista.flatMap((c) => {
          const p = posicao(c);
          return [{ label: `${c.symbol} pôs`, value: Math.round(p.investido), color: "var(--s1)" }, { label: `${c.symbol} vale`, value: Math.round(p.valor), color: "var(--s2)" }];
        })} />
      </Card>

      {lista.some((c) => (c.hist?.length ?? 0) >= 2) && (
        <>
          <Section>Valor ao longo do tempo</Section>
          <Card>
            <TrendChart name="Valor das moedas" fmt={brl0} data={historico(lista)} />
            <div className="text-[12px] text-ink3 mt-1">Um ponto por dia em que você atualizou os preços.</div>
          </Card>
        </>
      )}

      {sheet && <CriptoForm c={sheet.c} onClose={() => setSheet(null)} />}
      {aberta && <CriptoDetalhe c={lista.find((x) => x.id === aberta.id) ?? aberta} onClose={() => setAberta(null)} onEditar={(c) => { setAberta(null); setSheet({ c }); }} />}
    </>
  );
}

/** Soma o valor de todas as moedas em cada dia que tem histórico (usa o último valor conhecido de cada uma). */
function historico(lista: Cripto[]) {
  const dias = [...new Set(lista.flatMap((c) => (c.hist ?? []).map((h) => h.date)))].sort();
  return dias.map((dia) => ({
    label: dia.slice(8) + "/" + dia.slice(5, 7),
    value: Math.round(lista.reduce((s, c) => s + ((c.hist ?? []).filter((h) => h.date <= dia).pop()?.value ?? 0), 0)),
  }));
}

function CriptoForm({ c, onClose }: { c: Cripto | null; onClose: () => void }) {
  const [simbolo, setSimbolo] = useState(c?.symbol ?? "");
  const [nome, setNome] = useState(c?.name ?? "");
  const [qtd, setQtd] = useState(c ? String(c.qty).replace(".", ",") : "");
  const [custo, setCusto] = useState(c ? String(c.avgCost).replace(".", ",") : "");
  const [preco, setPreco] = useState(c?.price ? String(c.price).replace(".", ",") : "");
  const [desde, setDesde] = useState(c?.desde ?? (c ? "" : localDay()));
  const [lucro, setLucro] = useState(c?.alvo?.lucroPct ? String(c.alvo.lucroPct).replace(".", ",") : "");
  const [perda, setPerda] = useState(c?.alvo?.perdaPct ? String(c.alvo.perdaPct).replace(".", ",") : "");
  const q = parse(qtd), m = parse(custo), p = preco ? parse(preco) : undefined;
  const ok = simbolo.trim() && q > 0 && m > 0 && (p === undefined || p > 0);
  return (
    <Sheet open onClose={onClose} title={c ? `Editar ${c.symbol}` : "Nova moeda"}>
      <div className="grid grid-cols-[96px_1fr] gap-2 mb-3">
        <label className="block min-w-0"><span className="block text-[13px] text-ink3 px-1 mb-1">Símbolo</span>
          <input value={simbolo} onChange={(e) => setSimbolo(e.target.value)} placeholder="SOL" autoCapitalize="characters" /></label>
        <label className="block min-w-0"><span className="block text-[13px] text-ink3 px-1 mb-1">Nome</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Solana" /></label>
      </div>
      <label className="block mb-3"><span className="block text-[13px] text-ink3 px-1 mb-1">Quantidade que você tem</span>
        <input inputMode="decimal" className="num" value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="0,024023172" /></label>
      <label className="block mb-3"><span className="block text-[13px] text-ink3 px-1 mb-1">Custo médio por unidade (R$)</span>
        <input inputMode="decimal" className="num" value={custo} onChange={(e) => setCusto(e.target.value)} placeholder="1.373,26" /></label>
      <label className="block mb-3"><span className="block text-[13px] text-ink3 px-1 mb-1">Preço de agora por unidade (R$, opcional)</span>
        <input inputMode="decimal" className="num" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="441,20" /></label>
      <label className="block mb-3"><span className="block text-[13px] text-ink3 px-1 mb-1">Quando você pôs</span>
        <input type="date" value={desde} max={localDay()} onChange={(e) => setDesde(e.target.value)} /></label>
      <div className="text-[13px] text-ink3 px-1 mb-1">Avisar quando o resultado chegar em (opcional)</div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <label className="block min-w-0"><span className="block text-[12px] text-ink3 px-1 mb-1">Lucro de (%)</span>
          <input inputMode="decimal" className="num" value={lucro} onChange={(e) => setLucro(e.target.value)} placeholder="20" /></label>
        <label className="block min-w-0"><span className="block text-[12px] text-ink3 px-1 mb-1">Perda de (%)</span>
          <input inputMode="decimal" className="num" value={perda} onChange={(e) => setPerda(e.target.value)} placeholder="70" /></label>
      </div>
      <div className="flex gap-2">
        {c && <Button tone="danger" className="flex-1" onClick={() => { act("Moeda apagada", (dd) => apagarCripto(dd, c.id)); onClose(); }}>Apagar</Button>}
        <Button tone="primary" className="flex-[2]" disabled={!ok} onClick={() => {
          act("Moeda salva", (dd) => {
            const out = salvarCripto(dd, { id: c?.id, symbol: simbolo, name: nome, qty: q, avgCost: m, price: c?.price, priceAt: c?.priceAt, hist: c?.hist, compras: c?.compras, desde: desde || undefined,
              alvo: { lucroPct: parse(lucro) > 0 ? parse(lucro) : undefined, perdaPct: parse(perda) > 0 ? parse(perda) : undefined } });
            const id = c?.id ?? criptoOf(out).find((x) => !criptoOf(dd).some((y) => y.id === x.id))?.id;
            return p !== undefined && id ? definirPreco(out, id, p) : out;
          });
          onClose();
        }}>Salvar</Button>
      </div>
    </Sheet>
  );
}

function CriptoDetalhe({ c, onClose, onEditar }: { c: Cripto; onClose: () => void; onEditar: (c: Cripto) => void }) {
  const p = posicao(c);
  const [modo, setModo] = useState<"comprei" | "vendi">("comprei");
  const [qtd, setQtd] = useState("");
  const [pago, setPago] = useState("");
  const [preco, setPreco] = useState("");
  const q = parse(qtd), g = parse(pago), np = parse(preco);
  const hist = (c.hist ?? []).map((h) => ({ label: h.date.slice(8) + "/" + h.date.slice(5, 7), value: h.value }));
  return (
    <Sheet open onClose={onClose} title={`${c.name} · ${c.symbol}`}>
      <div className="card p-4 mb-3">
        <div className="grid grid-cols-2 gap-3 text-[15px]">
          <div><div className="text-ink3 text-[12px]">Pagou no total</div><Money v={p.investido} className="font-semibold" /></div>
          <div><div className="text-ink3 text-[12px]">Vale hoje</div><Money v={p.valor} className="font-semibold" /></div>
        </div>
        <div className={`mt-2 font-semibold ${p.resultado < 0 ? "text-alert" : "text-ok"}`}>
          {p.resultado < 0 ? "Perdeu" : "Ganhou"} <Money v={Math.abs(p.resultado)} /> ({sinal(p.pct)}{ptNum(p.pct, 2)}%)
        </div>
        <div className="text-[12px] text-ink3 mt-1">{ptNum(c.qty)} {c.symbol} × custo médio {brl(c.avgCost)}</div>
        {hist.length >= 2 && <div className="mt-2"><TrendChart name={`Valor de ${c.symbol}`} fmt={brl0} data={hist} /></div>}
      </div>

      <div className="text-[13px] text-ink3 px-1 mb-1">Histórico: quando pôs e quanto valorizou</div>
      <div className="card px-4 mb-3">
        {historicoDe(c).map((l, i) => (
          <div key={l.id} className={`py-2.5 ${i ? "border-t border-line" : ""}`}>
            <div className="flex justify-between text-[14px]">
              <span>{l.id === "ini" ? "Posição inicial" : "Compra"} · {dataBR(l.date)}</span>
              <span className={l.resultado < 0 ? "text-alert font-semibold" : "text-ok font-semibold"}>{sinal(l.pct)}{ptNum(l.pct, 2)}%</span>
            </div>
            <div className="flex justify-between text-[12px] text-ink3">
              <span>{ptNum(l.qty)} {c.symbol} por <Money v={l.pago} /></span>
              <span>vale <Money v={l.valor} /> ({sinal(l.resultado)}<Money v={Math.abs(l.resultado)} />)</span>
            </div>
          </div>
        ))}
        {c.alvo && (c.alvo.lucroPct || c.alvo.perdaPct) && (
          <div className="py-2 border-t border-line text-[12px] text-ink3">
            Avisa em {[c.alvo.lucroPct && `lucro de ${c.alvo.lucroPct}%`, c.alvo.perdaPct && `perda de ${c.alvo.perdaPct}%`].filter(Boolean).join(" e ")}
          </div>
        )}
      </div>

      <label className="block mb-2"><span className="block text-[13px] text-ink3 px-1 mb-1">Atualizar o preço por unidade (R$)</span>
        <div className="flex gap-2">
          <input inputMode="decimal" className="num" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder={c.price ? String(c.price).replace(".", ",") : "0,00"} />
          <Button disabled={!(np > 0)} onClick={() => { update((dd) => definirPreco(dd, c.id, np)); setPreco(""); }}>Salvar</Button>
        </div>
      </label>

      <div className="mt-4 mb-2"><Segmented value={modo} onChange={setModo} options={[{ value: "comprei", label: "Comprei mais" }, { value: "vendi", label: "Vendi" }]} /></div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <label className="block min-w-0"><span className="block text-[13px] text-ink3 px-1 mb-1">Quantidade</span>
          <input inputMode="decimal" className="num" value={qtd} onChange={(e) => setQtd(e.target.value)} /></label>
        {modo === "comprei" && (
          <label className="block min-w-0"><span className="block text-[13px] text-ink3 px-1 mb-1">Quanto pagou (R$)</span>
            <input inputMode="decimal" className="num" value={pago} onChange={(e) => setPago(e.target.value)} /></label>
        )}
      </div>
      <Button className="w-full mb-2" disabled={!(q > 0) || (modo === "comprei" && !(g > 0)) || (modo === "vendi" && q > c.qty + 1e-12)} onClick={() => {
        act(modo === "comprei" ? "Compra anotada" : "Venda anotada", (dd) => (modo === "comprei" ? comprarCripto(dd, c.id, q, g) : venderCripto(dd, c.id, q)));
        setQtd(""); setPago("");
      }}>{modo === "comprei" ? "Anotar compra (refaz o custo médio)" : "Anotar venda"}</Button>
      <Button className="w-full" onClick={() => onEditar(c)}>Editar ou apagar</Button>
    </Sheet>
  );
}
