"use client";

import { useState } from "react";
import { brl, localDay } from "@/lib/format";
import { addReceivable, deleteReceivable, payReceivable, receivableLeft, receivablesOpen, useData } from "@/lib/store";
import type { Receivable } from "@/lib/types";
import { act, Button, Card, Money, Sheet } from "./ui";

const parse = (v: string) => parseFloat(v.replace(/\./g, "").replace(",", "."));
const dataBR = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");

/** Card do Início: quanto te devem. Toque abre a lista. */
export function ReceberCard() {
  const d = useData();
  const [open, setOpen] = useState(false);
  const total = receivablesOpen(d);
  const pessoas = new Set((d.receivables || []).filter((r) => receivableLeft(r) > 0).map((r) => r.person.toLowerCase())).size;
  if (!total) return null;
  return (
    <>
      <Card className="mt-3 flex items-center gap-3" onClick={() => setOpen(true)}>
        <span className="w-10 h-10 rounded-full bg-fill grid place-items-center text-lg" aria-hidden>🫴</span>
        <span className="flex-1">
          <span className="block font-semibold">Te devem <Money v={total} /></span>
          <span className="block text-[13px] text-ink3">{pessoas} pessoa{pessoas === 1 ? "" : "s"} · toque para ver ou marcar pago</span>
        </span>
        <span className="text-ink3 text-xl" aria-hidden>›</span>
      </Card>
      {open && <ReceberSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** Lista de quem te deve, por pessoa, com "recebi" em cada item. */
export function ReceberSheet({ onClose }: { onClose: () => void }) {
  const d = useData();
  const [novo, setNovo] = useState(false);
  const [pagando, setPagando] = useState<Receivable | null>(null);
  const todos = d.receivables || [];
  const abertos = todos.filter((r) => receivableLeft(r) > 0);
  const pagos = todos.filter((r) => receivableLeft(r) <= 0);
  const porPessoa = new Map<string, Receivable[]>();
  for (const r of abertos) porPessoa.set(r.person, [...(porPessoa.get(r.person) || []), r]);

  if (novo) return <Sheet open onClose={() => setNovo(false)} title="Alguém te deve"><NovoReceber onDone={() => setNovo(false)} /></Sheet>;
  if (pagando) return <Recebi r={pagando} onClose={() => setPagando(null)} />;

  return (
    <Sheet open onClose={onClose} title="A receber">
      <div className="card p-4 mb-3 flex justify-between items-baseline">
        <span className="text-ink2">Total que te devem</span>
        <Money v={receivablesOpen(d)} className="text-[22px] font-bold" />
      </div>
      {[...porPessoa.entries()].map(([pessoa, lista]) => (
        <div key={pessoa} className="mb-3">
          <div className="flex justify-between px-1 pb-1 text-[13px] text-ink3">
            <span className="font-semibold text-ink2">{pessoa}</span>
            <Money v={lista.reduce((s, r) => s + receivableLeft(r), 0)} />
          </div>
          <div className="card px-4">
            {lista.map((r, i) => (
              <div key={r.id} className={`flex items-center gap-2 py-2.5 ${i ? "border-t border-line" : ""}`}>
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{r.description || "Sem descrição"}</span>
                  <span className="block text-[12px] text-ink3">
                    desde {dataBR(r.date)}
                    {r.payments.length ? <> · pagou <Money v={r.amount - receivableLeft(r)} /> de <Money v={r.amount} /></> : null}
                  </span>
                </span>
                <Money v={receivableLeft(r)} className="font-semibold shrink-0" />
                <Button tone="primary" className="!h-9 !px-3 text-[14px] shrink-0" onClick={() => setPagando(r)}>Recebi</Button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {!abertos.length && <Card className="text-ink2 mb-3">Ninguém te deve nada agora.</Card>}
      <Button className="w-full" onClick={() => setNovo(true)}>+ Anotar que alguém te deve</Button>

      {pagos.length > 0 && (
        <details className="mt-4">
          <summary className="text-link font-semibold cursor-pointer px-1">Já pagos ({pagos.length})</summary>
          <div className="card px-4 mt-2">
            {[...pagos].reverse().map((r, i) => (
              <div key={r.id} className={`flex items-center gap-2 py-2.5 ${i ? "border-t border-line" : ""}`}>
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{r.person} · {r.description || "Sem descrição"}</span>
                  <span className="block text-[12px] text-ok">pago em {dataBR(r.payments[r.payments.length - 1]?.date ?? r.date)}</span>
                </span>
                <Money v={r.amount} className="text-ink2" />
                <button aria-label="Apagar" className="text-ink3 px-1" onClick={() => act("Apagado", (dd) => deleteReceivable(dd, r.id))}>×</button>
              </div>
            ))}
          </div>
        </details>
      )}
    </Sheet>
  );
}

/** A pessoa pagou: quanto e se o dinheiro entrou na conta agora. */
function Recebi({ r, onClose }: { r: Receivable; onClose: () => void }) {
  const falta = receivableLeft(r);
  const [valor, setValor] = useState(String(falta).replace(".", ","));
  const [entrou, setEntrou] = useState(true);
  const n = parse(valor);
  const ok = Number.isFinite(n) && n > 0 && n <= falta + 0.001;
  return (
    <Sheet open onClose={onClose} title={`${r.person} pagou`}>
      <p className="text-ink2 mb-3">{r.description || "Sem descrição"} · falta <Money v={falta} /></p>
      <label className="block mb-3">
        <span className="block text-[13px] text-ink3 px-1 mb-1">Quanto pagou</span>
        <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className="num text-[22px]" />
      </label>
      <label className="flex items-center justify-between bg-card rounded-2xl px-4 py-3 mb-2 gap-3">
        <span>
          <span className="block">Entrou na minha conta agora</span>
          <span className="block text-[13px] text-ink3">Lança a entrada “{r.person} pagou” já no saldo. Desmarque se já veio no extrato.</span>
        </span>
        <input type="checkbox" checked={entrou} onChange={(e) => setEntrou(e.target.checked)} className="!w-6 !h-6 shrink-0 accent-[var(--meu)]" />
      </label>
      {Number.isFinite(n) && n > falta + 0.001 && <p className="text-alert text-[13px] mb-2">É mais do que falta ({brl(falta)}).</p>}
      <Button tone="primary" className="w-full mt-2" disabled={!ok} onClick={() => {
        act(n >= falta - 0.001 ? `${r.person}: quitado` : `${r.person}: faltam ${brl(falta - n)}`,
          (dd) => payReceivable(dd, r.id, { amount: n, date: localDay(), entrouNaConta: entrou }));
        onClose();
      }}>
        {Number.isFinite(n) && n < falta - 0.001 ? "Registrar pagamento parcial" : "Marcar como pago"}
      </Button>
    </Sheet>
  );
}

/** Anotar uma dívida nova (também usado no botão +). */
export function NovoReceber({ onDone }: { onDone: () => void }) {
  const d = useData();
  const [quem, setQuem] = useState("");
  const [valor, setValor] = useState("");
  const [oque, setOque] = useState("");
  const [data, setData] = useState(() => localDay());
  const [saiu, setSaiu] = useState(false);
  const n = parse(valor);
  const ok = quem.trim() && Number.isFinite(n) && n > 0;
  const conhecidos = [...new Set((d.receivables || []).map((r) => r.person))];
  return (
    <div>
      <label className="block mb-3">
        <span className="block text-[13px] text-ink3 px-1 mb-1">Quem te deve</span>
        <input value={quem} onChange={(e) => setQuem(e.target.value)} placeholder="Nome" list="pessoas-receber" />
        <datalist id="pessoas-receber">{conhecidos.map((p) => <option key={p} value={p} />)}</datalist>
      </label>
      <label className="block mb-3">
        <span className="block text-[13px] text-ink3 px-1 mb-1">Quanto</span>
        <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" className="num text-[22px]" />
      </label>
      <label className="block mb-3">
        <span className="block text-[13px] text-ink3 px-1 mb-1">Do quê (opcional)</span>
        <input value={oque} onChange={(e) => setOque(e.target.value)} placeholder="Ex.: pizza de sábado" />
      </label>
      <label className="block mb-3">
        <span className="block text-[13px] text-ink3 px-1 mb-1">Desde quando</span>
        <input type="date" value={data} max={localDay()} onChange={(e) => setData(e.target.value)} />
      </label>
      <label className="flex items-center justify-between bg-card rounded-2xl px-4 py-3 mb-4 gap-3">
        <span>
          <span className="block">Saiu da minha conta agora</span>
          <span className="block text-[13px] text-ink3">Marque se emprestou ou pagou por ele agora (lança a saída como “emprestei”, que não conta como gasto).</span>
        </span>
        <input type="checkbox" checked={saiu} onChange={(e) => setSaiu(e.target.checked)} className="!w-6 !h-6 shrink-0 accent-[var(--meu)]" />
      </label>
      <Button tone="primary" className="w-full" disabled={!ok} onClick={() => {
        act(`${quem.trim()} te deve ${brl(n)}`, (dd) => addReceivable(dd, { person: quem, description: oque, amount: n, date: data, saiuDaConta: saiu }));
        onDone();
      }}>
        Anotar
      </Button>
    </div>
  );
}
