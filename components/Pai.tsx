"use client";

import { useState } from "react";
import { isFathers } from "@/lib/categories";
import { monthName } from "@/lib/format";
import { fatherFlow, ofMonth } from "@/lib/stats";
import { fatherBalance, fatherDelete, fatherMove, fatherSet, monthKey, syncFather, update, useData } from "@/lib/store";
import type { Tx } from "@/lib/types";
import { FatherChart } from "./charts";
import { TxList, TxSheet } from "./Tx";
import { Button, Card, Money, MonthSwitcher, Section, Sheet, Title, toast } from "./ui";

type Mode = "in" | "out" | "set" | null;
const MODE_TEXT = {
  in: { title: "Pai me passou", hint: "Dinheiro dele que entrou na sua conta. Soma ao crédito." },
  out: { title: "Usei para o pai", hint: "Pagou algo dele. Se passar de zero, ele fica te devendo." },
  set: { title: "Definir saldo", hint: "Valor exato do crédito agora. Negativo = ele te deve." },
};

export default function Pai({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const d = useData();
  const bal = fatherBalance(d);
  const [mode, setMode] = useState<Mode>(null);
  const [open, setOpen] = useState<Tx | null>(null);
  const monthTxs = ofMonth(d.txs, month);
  const flow = fatherFlow(monthTxs);
  // Gasto do pai já desconta do crédito sozinho. Só sobra botão para o que é
  // antigo, de antes disso existir, e ainda não está no crédito.
  const noCredito = new Set(d.father.map((e) => e.txId));
  const soltas = monthTxs.filter((t) => isFathers(t.category) && !t.card && !noCredito.has(t.id));
  const sobraSolta = soltas.reduce((s, t) => s + t.amount, 0);
  const history = [...d.father].reverse();

  return (
    <div>
      <Title>Pai</Title>

      <Card>
        <div className="text-ink2 text-[15px]">
          {bal > 0 ? "Você está com dinheiro do pai" : bal < 0 ? "Seu pai te deve" : "Vocês estão quites"}
        </div>
        <Money v={Math.abs(bal)} className="block text-[40px] leading-tight font-bold text-pai" />
        <div className="text-[13px] text-ink3">
          {bal > 0 ? "Esse valor está na sua conta mas não é seu." : bal < 0 ? "Esse valor soma ao seu dinheiro." : "Crédito zerado."}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4">
          <Button onClick={() => setMode("in")}>+ Recebi</Button>
          <Button onClick={() => setMode("out")}>− Usei</Button>
          <Button onClick={() => setMode("set")}>Definir</Button>
        </div>
      </Card>

      <div className="flex items-center justify-between mt-6 mb-2 px-1">
        <h2 className="text-[20px] font-semibold">No extrato</h2>
        <MonthSwitcher month={month} onChange={setMonth} max={monthKey()} />
      </div>
      <Card>
        <Row label="Entrou do pai" v={flow.entrou} className="text-ok" />
        <Row label="Saiu em nome dele" v={flow.saiu} />
        {!!flow.repasse && <Row label="Repasses (entra e sai)" v={flow.repasse} signed />}
        <div className="flex justify-between border-t border-line mt-2 pt-2">
          <span className="font-semibold">{flow.sobrou >= 0 ? "Ficou com você" : "Você cobriu"}</span>
          <Money v={Math.abs(flow.sobrou)} className="font-semibold" />
        </div>
        {soltas.length > 0 ? (
          <Button className="w-full mt-3" onClick={() => {
            update((dd) => syncFather(dd, soltas));
            toast(`${soltas.length} lançamento(s) no crédito do pai`);
          }}>
            Lançar no crédito do pai
          </Button>
        ) : null}
        <p className="text-[13px] text-ink3 mt-2">
          {soltas.length > 0
            ? <>Tem {soltas.length} lançamento(s) deste mês fora do crédito (<Money v={sobraSolta} signed />). São de antes: o que entra agora já desconta sozinho.</>
            : "Tudo deste mês já está no crédito do pai."}
        </p>
      </Card>
      {monthTxs.some((t) => isFathers(t.category)) && (
        <div className="mt-3">
          <TxList txs={monthTxs.filter((t) => isFathers(t.category))} onOpen={setOpen} />
        </div>
      )}

      <Section>Histórico do crédito</Section>
      <Card>
        <FatherChart data={d.father.map((e) => ({ label: e.date.slice(8, 10) + "/" + e.date.slice(5, 7), value: e.balanceAfter }))} />
        {history.length === 0 && <div className="text-ink2">Nenhum lançamento ainda.</div>}
        <div className="divide-y divide-line">
          {history.slice(0, 30).map((e) => (
            <button key={e.id} className="w-full flex items-center gap-3 py-2.5 text-left"
              onClick={() => confirm(`Apagar “${e.description}”?`) && update((dd) => fatherDelete(dd, e.id))}>
              <span className="flex-1 min-w-0">
                <span className="block truncate">{e.description}</span>
                <span className="block text-[13px] text-ink3">{new Date(e.date + "T12:00:00").toLocaleDateString("pt-BR")} · saldo <Money v={e.balanceAfter} /></span>
              </span>
              <Money v={e.amount} signed className={e.amount > 0 ? "text-ok" : ""} />
            </button>
          ))}
        </div>
      </Card>

      {mode && <MoveSheet mode={mode} current={bal} onClose={() => setMode(null)} />}
      <TxSheet tx={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function Row({ label, v, className = "", signed }: { label: string; v: number; className?: string; signed?: boolean }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-ink2">{label}</span>
      <Money v={v} signed={signed} className={className} />
    </div>
  );
}

function MoveSheet({ mode, current, onClose }: { mode: Exclude<Mode, null>; current: number; onClose: () => void }) {
  const [value, setValue] = useState(mode === "set" ? String(current).replace(".", ",") : "");
  const [desc, setDesc] = useState("");
  const n = parseFloat(value.replace(/\./g, "").replace(",", "."));

  function save() {
    if (!Number.isFinite(n)) return;
    if (mode === "set") update((d) => fatherSet(d, n, desc || "Ajuste de saldo"));
    else update((d) => fatherMove(d, mode === "in" ? Math.abs(n) : -Math.abs(n), desc || MODE_TEXT[mode].title));
    toast("Crédito do pai atualizado");
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={MODE_TEXT[mode].title}>
      <p className="text-ink2 mb-3">{MODE_TEXT[mode].hint}</p>
      <input inputMode="decimal" autoFocus placeholder="Valor em R$" value={value} onChange={(e) => setValue(e.target.value)} className="mb-2 text-[20px]" />
      <input placeholder="Descrição (opcional)" value={desc} onChange={(e) => setDesc(e.target.value)} className="mb-4" />
      <Button tone="primary" className="w-full" disabled={!Number.isFinite(n)} onClick={save}>Salvar</Button>
    </Sheet>
  );
}
