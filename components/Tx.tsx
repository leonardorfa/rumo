"use client";

import { useState } from "react";
import { catIcon, catName, pickerGroups, type CustomCat } from "@/lib/categories";
import { normalize, prettyName } from "@/lib/classifier";
import { brl, dayLabel, localDay } from "@/lib/format";
import { confirmTx, deleteTx, editManual, recategorize, setNote, splitTx, update, useData } from "@/lib/store";
import type { Tx } from "@/lib/types";
import { act, Button, Money, Sheet } from "./ui";

const parse = (v: string) => parseFloat(v.replace(/\./g, "").replace(",", "."));

export function TxRow({ t, onOpen }: { t: Tx; onOpen: (t: Tx) => void }) {
  const customs = useData().config.customCats;
  return (
    <button onClick={() => onOpen(t)} className="w-full flex items-center gap-3 py-2.5 text-left">
      <span className="w-10 h-10 shrink-0 rounded-full bg-fill grid place-items-center text-lg" aria-hidden>{catIcon(t.category, customs)}</span>
      <span className="flex-1 min-w-0">
        <span className="block truncate text-[16px]">{prettyName(t.description)}</span>
        <span className="block text-[13px] text-ink3 truncate">
          {t.review ? <span className="text-alert font-medium">Revisar · </span> : null}
          {t.card ? "💳 " : ""}{t.manual ? "✍️ " : ""}{t.splitFrom ? "✂️ " : ""}
          {catName(t.category, customs)}
          {t.installment ? ` · parcela ${t.installment}` : ""}
          {t.note ? ` · ${t.note}` : ""}
        </span>
      </span>
      <Money v={t.amount} signed className={`shrink-0 text-[16px] ${t.amount > 0 ? "text-ok" : ""}`} />
    </button>
  );
}

/** Lista agrupada por dia, com o total de cada dia. */
export function TxList({ txs, onOpen }: { txs: Tx[]; onOpen: (t: Tx) => void }) {
  const days = new Map<string, Tx[]>();
  for (const t of [...txs].sort((a, b) => (a.date < b.date ? 1 : -1))) {
    days.set(t.date, [...(days.get(t.date) || []), t]);
  }
  return (
    <div className="flex flex-col gap-3">
      {[...days.entries()].map(([day, list]) => (
        <div key={day}>
          <div className="flex justify-between px-1 pb-1 text-[13px] text-ink3">
            <span>{dayLabel(day)}{day.slice(0, 4) !== String(new Date().getFullYear()) ? ` ${day.slice(0, 4)}` : ""}</span>
            <Money v={list.reduce((s, t) => s + t.amount, 0)} signed />
          </div>
          <div className="bg-card rounded-2xl px-4 divide-y divide-line">
            {list.map((t) => <TxRow key={t.id} t={t} onOpen={onOpen} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Grade de categorias (a mesma no lançamento, na transação e na revisão). */
export function CategoryGrid({ customs, current, onPick, only }: {
  customs: CustomCat[]; current?: string; onPick: (k: string) => void; only?: (label: string) => boolean;
}) {
  return (
    <>
      {pickerGroups(customs).filter((g) => !only || only(g.label)).map((g) => (
        <div key={g.label} className="mb-4">
          <div className="text-[13px] text-ink3 px-1 mb-1.5">{g.label}</div>
          <div className="grid grid-cols-3 gap-2">
            {g.keys.map((k) => (
              <button key={k} onClick={() => onPick(k)}
                className={`rounded-xl px-2 py-2.5 text-[13px] leading-tight flex flex-col items-center gap-1 ${current === k ? "bg-brand text-onbrand" : "bg-card"}`}>
                <span className="text-xl" aria-hidden>{catIcon(k, customs)}</span>
                {catName(k, customs)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/** Seletor nativo (roda do iPhone) para quando a grade não cabe. */
export function CategorySelect({ customs, value, onChange }: { customs: CustomCat[]; value: string; onChange: (k: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0 flex-1">
      {pickerGroups(customs).map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.keys.map((k) => <option key={k} value={k}>{catIcon(k, customs)} {catName(k, customs)}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

/** Editar uma transação. Trocar a categoria ensina o app (regra pelo nome). */
export function TxSheet({ tx, onClose }: { tx: Tx | null; onClose: () => void }) {
  const d = useData();
  const [learn, setLearn] = useState(true);
  const [modo, setModo] = useState<"ver" | "editar" | "dividir">("ver");
  if (!tx) return null;
  const t = d.txs.find((x) => x.id === tx.id);
  if (!t) return null; // apagada ou dividida
  const customs = d.config.customCats;
  const name = prettyName(t.description);
  const same = d.txs.filter((x) => x.id !== t.id && normalize(x.description) === normalize(t.description)).length;
  const fechar = () => { setModo("ver"); onClose(); };

  function pick(cat: string) {
    let applied = 0;
    act(
      () => (learn ? `${name} → ${catName(cat, customs)}${applied ? ` (+${applied} iguais)` : ""}` : `Agora é ${catName(cat, customs)}`),
      (dd) => {
        const r = recategorize(dd, t!.id, cat, learn);
        applied = r.applied;
        return r.data;
      }
    );
    fechar();
  }

  if (modo === "editar") return <EditSheet t={t} onClose={fechar} />;
  if (modo === "dividir") return <SplitSheet t={t} customs={customs} onClose={fechar} />;

  return (
    <Sheet open onClose={fechar} title="Transação">
      <div className="bg-card rounded-2xl p-4 mb-3">
        <Money v={t.amount} signed className={`block text-[32px] font-bold ${t.amount > 0 ? "text-ok" : ""}`} />
        <div className="text-[17px] font-medium mt-1">{name}</div>
        <div className="text-[13px] text-ink3 mt-1 break-words">{t.description}</div>
        <div className="text-[13px] text-ink3 mt-1">
          {dayLabel(t.date)} {t.date.slice(0, 4)}
          {t.card ? " · fatura do cartão" : t.manual ? " · lançado por você" : " · extrato"}
          {t.splitFrom ? " · dividida" : ""}
        </div>
        <input placeholder="Anotação (com quem, por quê…)" defaultValue={t.note ?? ""} className="mt-3"
          onChange={(e) => update((dd) => setNote(dd, t.id, e.target.value))} />
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        {t.manual && <Button onClick={() => setModo("editar")}>Editar valor</Button>}
        <Button className={t.manual ? "" : "col-span-2"} onClick={() => setModo("dividir")}>✂️ Dividir</Button>
      </div>

      <label className="flex items-center justify-between bg-card rounded-2xl px-4 py-3 mb-4 gap-3">
        <span>
          <span className="block">Lembrar para as próximas</span>
          <span className="block text-[13px] text-ink3">
            Tudo de “{name}” cai nessa categoria{same ? ` (${same} já no extrato)` : ""}
          </span>
        </span>
        <input type="checkbox" checked={learn} onChange={(e) => setLearn(e.target.checked)} className="!w-6 !h-6 shrink-0 accent-[var(--meu)]" />
      </label>

      <CategoryGrid customs={customs} current={t.category} onPick={pick} />

      <div className="flex gap-2">
        {t.review && (
          <Button tone="primary" className="flex-1" onClick={() => { act("Confirmada", (dd) => confirmTx(dd, t.id)); fechar(); }}>
            Está certo
          </Button>
        )}
        <Button tone="danger" className="flex-1" onClick={() => {
          act(t.manual ? "Apagada e devolvida ao saldo" : "Transação apagada", (dd) => deleteTx(dd, t.id));
          fechar();
        }}>
          Apagar
        </Button>
      </div>
    </Sheet>
  );
}

/** Lançamento manual: corrigir valor, data e descrição (o saldo acompanha). */
function EditSheet({ t, onClose }: { t: Tx; onClose: () => void }) {
  const [valor, setValor] = useState(String(Math.abs(t.amount)).replace(".", ","));
  const [desc, setDesc] = useState(t.description);
  const [date, setDate] = useState(t.date);
  const n = parse(valor);
  return (
    <Sheet open onClose={onClose} title="Editar lançamento">
      <label className="block mb-3">
        <span className="block text-[13px] text-ink3 px-1 mb-1">Valor ({t.amount < 0 ? "saída" : "entrada"})</span>
        <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className="text-[20px]" />
      </label>
      <label className="block mb-3">
        <span className="block text-[13px] text-ink3 px-1 mb-1">Descrição</span>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} />
      </label>
      <label className="block mb-4">
        <span className="block text-[13px] text-ink3 px-1 mb-1">Data</span>
        <input type="date" value={date} max={localDay()} onChange={(e) => setDate(e.target.value)} />
      </label>
      <Button tone="primary" className="w-full" disabled={!Number.isFinite(n) || n <= 0} onClick={() => {
        act("Lançamento corrigido", (dd) => editManual(dd, t.id, {
          date, description: desc.trim() || t.description, amount: t.amount < 0 ? -n : n, category: t.category, note: t.note,
        }));
        onClose();
      }}>
        Salvar
      </Button>
    </Sheet>
  );
}

/** Divide em pedaços (ex.: parte sua e parte do pai). O último pedaço é o que sobra. */
function SplitSheet({ t, customs, onClose }: { t: Tx; customs: CustomCat[]; onClose: () => void }) {
  const total = Math.abs(t.amount);
  const sinal = t.amount < 0 ? -1 : 1;
  const [parts, setParts] = useState([
    { valor: "", cat: t.category === "uncategorized" ? (sinal < 0 ? "var_shopping" : "income_other") : t.category },
    { valor: "", cat: sinal < 0 ? "fathers_expense" : "income_fathers" },
  ]);
  const vals = parts.slice(0, -1).map((p) => parse(p.valor));
  const resto = Math.round((total - vals.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)) * 100) / 100;
  const ok = vals.every((v) => Number.isFinite(v) && v > 0) && resto > 0;
  const set = (i: number, patch: Partial<(typeof parts)[number]>) => setParts(parts.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <Sheet open onClose={onClose} title="Dividir transação">
      <p className="text-ink2 mb-3">
        {prettyName(t.description)}: <Money v={total} />. Divida entre categorias — por exemplo, uma parte sua e outra do pai
        (essa já sai do crédito dele).
      </p>
      <div className="card px-4 mb-3">
        {parts.map((p, i) => {
          const ultimo = i === parts.length - 1;
          return (
            <div key={i} className={`py-3 flex flex-col gap-2 ${i ? "border-t border-line" : ""}`}>
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-ink3 w-16 shrink-0">Parte {i + 1}</span>
                {ultimo
                  ? <span className="num flex-1 text-right text-[17px] font-semibold">{resto > 0 ? brl(resto) : "—"}</span>
                  : <input inputMode="decimal" placeholder="0,00" value={p.valor} onChange={(e) => set(i, { valor: e.target.value })} className="num flex-1 text-right" />}
              </div>
              <CategorySelect customs={customs} value={p.cat} onChange={(cat) => set(i, { cat })} />
            </div>
          );
        })}
      </div>
      {parts.length < 5 && (
        <Button className="w-full mb-3" onClick={() => setParts([...parts.slice(0, -1), { valor: "", cat: parts[0].cat }, parts[parts.length - 1]])}>
          + Mais um pedaço
        </Button>
      )}
      {!ok && vals.some((v) => Number.isFinite(v)) && <p className="text-alert text-[13px] mb-2">Os pedaços passam do total.</p>}
      <Button tone="primary" className="w-full" disabled={!ok} onClick={() => {
        const pedacos = [...vals, resto].map((v, i) => ({ amount: sinal * v, category: parts[i].cat }));
        act(`Dividida em ${pedacos.length}`, (dd) => splitTx(dd, t.id, pedacos));
        onClose();
      }}>
        Dividir
      </Button>
    </Sheet>
  );
}
