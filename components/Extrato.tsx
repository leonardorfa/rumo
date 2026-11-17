"use client";

import { useState } from "react";
import { catIcon, catName, isFathers } from "@/lib/categories";
import { normalize } from "@/lib/classifier";
import { brl, monthName } from "@/lib/format";
import { ofMonth } from "@/lib/stats";
import { monthKey, useData } from "@/lib/store";
import type { Tx } from "@/lib/types";
import { Brilho } from "./Destaques";
import { TxList, TxSheet } from "./Tx";
import { Card, Money, MonthSwitcher, Segmented, Title } from "./ui";

export type Filter = "all" | "mine" | "pai" | "card" | "review";

export default function Extrato({ month, setMonth, filter, setFilter }: {
  month: string; setMonth: (m: string) => void; filter: Filter; setFilter: (f: Filter) => void;
}) {
  const d = useData();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [open, setOpen] = useState<Tx | null>(null);
  const review = d.txs.filter((t) => t.review).length;

  // Buscando, procura em todos os meses: o que importa é achar.
  const busca = q.trim();
  const todosMeses = filter === "review" || !!busca || !!cat;
  let txs = filter === "review" ? d.txs.filter((t) => t.review) : todosMeses ? d.txs : ofMonth(d.txs, month);
  // Compra no cartão não saiu da conta: o que saiu foi o pagamento da fatura. Para não parecer
  // cobrança dupla, as compras ficam só no filtro Cartão (e na busca e na revisão).
  const soConta = filter !== "card" && filter !== "review" && !busca && !cat;
  const doCartao = (filter === "review" || filter === "card" ? [] : ofMonth(d.txs, month)).filter((t) => t.card);
  if (soConta) txs = txs.filter((t) => !t.card);
  if (filter === "mine") txs = txs.filter((t) => !isFathers(t.category));
  if (filter === "pai") txs = txs.filter((t) => isFathers(t.category));
  if (filter === "card") txs = txs.filter((t) => t.card);
  if (cat) txs = txs.filter((t) => t.category === cat);
  if (busca) {
    const n = normalize(busca);
    // "40,90" ou "40" também acha pelo valor
    const valor = /^[\d.,]+$/.test(busca) ? busca.replace(/\./g, "") : null;
    txs = txs.filter((t) =>
      (n && (normalize(t.description).includes(n) || normalize(t.note ?? "").includes(n))) ||
      (valor !== null && Math.abs(t.amount).toFixed(2).replace(".", ",").includes(valor)));
  }
  const usadas = [...new Set(d.txs.map((t) => t.category))].sort((a, b) => catName(a, d.config.customCats).localeCompare(catName(b, d.config.customCats)));
  const inflow = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const outflow = txs.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);

  return (
    <div>
      <Title right={!todosMeses ? <MonthSwitcher month={month} onChange={setMonth} max={monthKey()} /> : undefined}>Extrato</Title>
      <div className="flex gap-2 mb-3">
        <input type="search" placeholder="Nome ou valor" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 min-w-0" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria" className={`!w-[40%] shrink-0 text-[14px] ${cat ? "!text-link font-semibold" : ""}`}>
          <option value="">Categoria</option>
          {usadas.map((k) => <option key={k} value={k}>{catIcon(k, d.config.customCats)} {catName(k, d.config.customCats)}</option>)}
        </select>
      </div>
      {(busca || cat) && filter !== "review" && (
        <div className="text-[13px] text-ink3 px-1 -mt-1 mb-2 flex justify-between">
          <span>Em todos os meses · {txs.length} resultado{txs.length === 1 ? "" : "s"}</span>
          <button className="text-link font-semibold" onClick={() => { setQ(""); setCat(""); }}>Limpar</button>
        </div>
      )}
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "Tudo" },
          { value: "mine", label: "Meus" },
          { value: "pai", label: "Pai" },
          { value: "card", label: "Cartão" },
          { value: "review", label: review ? `Revisar ${review}` : "Revisar" },
        ]}
      />

      {filter === "card" ? (
        <Card className="mt-3">
          <div className="text-[13px] text-ink3">Compras no cartão</div>
          <Money v={-outflow} className="text-[22px] font-bold" />
          <div className="text-[13px] text-ink2 mt-1">
            Elas já estão na fatura. O que sai da conta é o pagamento da fatura, que aparece em Tudo. Aqui você só classifica cada compra.
          </div>
        </Card>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { k: "Entrou", v: inflow, cor: "var(--s3)", signed: false, i: <path d="M12 19V5M6 11l6-6 6 6" /> },
            { k: "Saiu", v: -outflow, cor: "var(--s2)", signed: false, i: <path d="M12 5v14M6 13l6 6 6-6" /> },
            { k: "Resultado", v: inflow + outflow, cor: "var(--s1)", signed: true, i: <path d="M5 20V10M12 20V4M19 20v-7" /> },
          ].map((x) => (
            <div key={x.k} className="card p-2.5 min-w-0 text-center flex flex-col items-center gap-1">
              <Brilho cor={x.cor} tam={32}>{x.i}</Brilho>
              <div className="text-[12px] text-ink3">{x.k}</div>
              <Money v={x.v} signed={x.signed} className="font-bold text-[clamp(12px,3.6vw,15px)] max-w-full truncate" />
            </div>
          ))}
        </div>
      )}
      {soConta && doCartao.length > 0 && (
        <button onClick={() => setFilter("card")} className="w-full text-left text-[13px] text-ink3 px-1 mt-2">
          {doCartao.length} compra{doCartao.length === 1 ? "" : "s"} no cartão ({brl(-doCartao.reduce((s, t) => s + t.amount, 0))}) não entram nas somas: já estão no pagamento da fatura. <span className="text-link font-semibold">Ver em Cartão ›</span>
        </button>
      )}

      <div className="mt-4">
        {txs.length ? (
          <TxList txs={txs} onOpen={setOpen} />
        ) : (
          <Card className="text-ink2">
            {filter === "review" ? "Nada para revisar. Tudo classificado." : todosMeses ? "Nada encontrado." : `Nada em ${monthName(month).toLowerCase()} com esse filtro.`}
          </Card>
        )}
      </div>
      <TxSheet tx={open} onClose={() => setOpen(null)} />
    </div>
  );
}
