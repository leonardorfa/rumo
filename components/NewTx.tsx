"use client";

import { useState } from "react";
import { catIcon, catName, pickerGroups } from "@/lib/categories";
import { brl, localDay, monthName } from "@/lib/format";
import { typeOf } from "@/lib/categories";
import { addManual, addParcelamento, fatherBalance, getData, monthKey, update, useData } from "@/lib/store";
import { Button, Money, Segmented, Sheet, toast } from "./ui";
import { VozSheet } from "./Voz";
import { NovoReceber } from "./Receber";

/**
 * Lançar um gasto ou entrada na mão. Já mexe no saldo da conta, sem esperar
 * o extrato. Quando o extrato do período for importado, este some e o de
 * verdade entra no lugar.
 */
export default function NewTx({ open, onClose }: { open: boolean; onClose: () => void }) {
  const d = useData();
  const customs = d.config.customCats;
  const [dir, setDir] = useState<"out" | "in" | "parc" | "receber">("out");
  const [value, setValue] = useState("");
  const [desc, setDesc] = useState("");
  const [date, setDate] = useState(() => localDay());
  const [cat, setCat] = useState("");
  const [voz, setVoz] = useState(false);

  const n = parseFloat(value.replace(/\./g, "").replace(",", "."));
  const amount = Number.isFinite(n) ? (dir === "out" ? -Math.abs(n) : Math.abs(n)) : NaN;
  const groups = pickerGroups(customs).filter((g) =>
    dir === "out" ? g.label !== "Entradas" : g.label === "Entradas" || g.label === "Do pai"
  );

  function save() {
    if (!Number.isFinite(amount) || !cat) return;
    update((dd) => addManual(dd, { date, description: desc.trim() || catName(cat, customs), amount, category: cat }));
    if (typeOf(cat) === "fathers") {
      const b = fatherBalance(getData());
      toast(b >= 0 ? `Saiu do crédito do pai: sobram ${brl(b)}` : `Seu pai passou a te dever ${brl(-b)}`);
    } else {
      toast("Lançado e descontado do saldo");
    }
    setValue(""); setDesc(""); setCat("");
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Novo lançamento">
      <button onClick={() => setVoz(true)}
        className="w-full mb-3 h-12 rounded-xl bg-meu text-white font-semibold flex items-center justify-center gap-2">
        <span aria-hidden>🎤</span> Lançar falando
      </button>
      {voz && <VozSheet onClose={() => { setVoz(false); onClose(); }} />}
      <Segmented value={dir} onChange={(v) => { setDir(v); setCat(""); }}
        options={[{ value: "out", label: "Gasto" }, { value: "in", label: "Entrada" }, { value: "parc", label: "Parcelado" }, { value: "receber", label: "Me devem" }]} />

      {dir === "receber" ? <div className="mt-3"><NovoReceber onDone={onClose} /></div> : dir === "parc" ? <Parcelado onDone={onClose} /> : <>

      <div className="card p-4 my-3 text-center">
        <span className="text-[13px] text-ink3">{dir === "out" ? "Sai da conta" : "Entra na conta"}</span>
        <div className="flex items-center justify-center gap-1 mt-1">
          <span className="text-[24px] text-ink2">{dir === "out" ? "−" : "+"} R$</span>
          <input inputMode="decimal" autoFocus placeholder="0,00" value={value} onChange={(e) => setValue(e.target.value)}
            className="num !w-36 text-[34px] font-bold !bg-transparent text-left" />
        </div>
      </div>

      <label className="block mb-3">
        <span className="block text-[13px] text-ink3 px-1 mb-1">Descrição (opcional)</span>
        <input placeholder="Ex.: almoço com a galera" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </label>
      <label className="block mb-4">
        <span className="block text-[13px] text-ink3 px-1 mb-1">Data</span>
        <input type="date" value={date} max={localDay()} onChange={(e) => setDate(e.target.value)} />
      </label>

      {groups.map((g) => (
        <div key={g.label} className="mb-4">
          <div className="text-[13px] text-ink3 px-1 mb-1.5">{g.label}</div>
          <div className="grid grid-cols-3 gap-2">
            {g.keys.map((k) => (
              <button key={k} onClick={() => setCat(k)}
                className={`rounded-xl px-2 py-2.5 text-[13px] leading-tight flex flex-col items-center gap-1 ${cat === k ? "bg-brand text-onbrand" : "bg-card"}`}>
                <span className="text-xl" aria-hidden>{catIcon(k, customs)}</span>
                {catName(k, customs)}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="sticky bottom-0 bg-bg pt-2 pb-1">
        <Button tone="primary" className="w-full" disabled={!Number.isFinite(amount) || !cat} onClick={save}>
          {Number.isFinite(amount) ? <>Lançar <Money v={amount} signed /></> : "Lançar"}
        </Button>
        <p className="text-[13px] text-ink3 text-center mt-2">
          {typeOf(cat) === "fathers" && "Gasto do pai sai do crédito dele; se não tiver, ele fica te devendo. "}
          O saldo muda na hora. Quando você importar o extrato desse período, o lançamento manual é substituído pelo real.
        </p>
      </div>
      </>}
    </Sheet>
  );
}

const nMeses = (a: string, b: string) => {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am) + 1;
};
const mesAno = (m: string) => `${monthName(m).split(" ")[0].toLowerCase()}/${m.slice(0, 4)}`;

/** Compra parcelada: valor total (ou da parcela) e até quando vai pagar. */
function Parcelado({ onDone }: { onDone: () => void }) {
  const [tipo, setTipo] = useState<"total" | "parcela">("total");
  const [value, setValue] = useState("");
  const [desc, setDesc] = useState("");
  const [from, setFrom] = useState(() => monthKey());
  const [until, setUntil] = useState("");
  const [match, setMatch] = useState("");

  const v = parseFloat(value.replace(/\./g, "").replace(",", "."));
  const n = until && until >= from ? nMeses(from, until) : 0;
  const parcela = Number.isFinite(v) && v > 0 && n ? (tipo === "total" ? v / n : v) : NaN;
  const ok = Number.isFinite(parcela) && !!desc.trim();

  return (
    <div className="mt-3">
      <div className="card p-4 mb-3">
        <Segmented value={tipo} onChange={setTipo} options={[{ value: "total", label: "Valor total" }, { value: "parcela", label: "Valor da parcela" }]} />
        <div className="flex items-center justify-center gap-1 mt-3">
          <span className="text-[24px] text-ink2">R$</span>
          <input inputMode="decimal" placeholder="0,00" value={value} onChange={(e) => setValue(e.target.value)}
            className="num !w-40 text-[34px] font-bold !bg-transparent text-left" />
        </div>
      </div>

      <label className="block mb-3">
        <span className="block text-[13px] text-ink3 px-1 mb-1">O que comprou</span>
        <input placeholder="Ex.: celular" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <label className="block min-w-0">
          <span className="block text-[13px] text-ink3 px-1 mb-1">Primeira parcela</span>
          <input type="month" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block min-w-0">
          <span className="block text-[13px] text-ink3 px-1 mb-1">Última parcela</span>
          <input type="month" value={until} min={from} onChange={(e) => setUntil(e.target.value)} />
        </label>
      </div>
      {until && until < from && <p className="text-alert text-[13px] mb-3">A última parcela vem antes da primeira.</p>}
      {ok && (
        <div className="card p-4 mb-3 text-center">
          <div className="text-[22px] font-bold num">{n}x de {brl(parcela)}</div>
          <div className="text-[13px] text-ink2">
            total {brl(parcela * n)} · de {mesAno(from)} a {mesAno(until)}
          </div>
        </div>
      )}
      <label className="block mb-4">
        <span className="block text-[13px] text-ink3 px-1 mb-1">Como aparece na fatura ou extrato (opcional)</span>
        <input placeholder="Ex.: MAGALU" value={match} onChange={(e) => setMatch(e.target.value)} />
        <span className="block text-[13px] text-ink3 px-1 mt-1">Com isso a parcela fica paga sozinha quando aparecer.</span>
      </label>


      <div className="sticky bottom-0 bg-bg pt-2 pb-1">
        <Button tone="primary" className="w-full" disabled={!ok} onClick={() => {
          update((dd) => addParcelamento(dd, { name: desc.trim(), parcela, from, until, match }));
          toast(`${desc.trim()}: ${n}x de ${brl(parcela)}`);
          onDone();
        }}>
          Criar parcelamento
        </Button>
        <p className="text-[13px] text-ink3 text-center mt-2">
          Nada sai do saldo agora. Cada parcela aparece nas contas do mês até a última, já conta na projeção e no “dá para gastar”.
        </p>
      </div>
    </div>
  );
}
