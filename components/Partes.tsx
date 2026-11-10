"use client";

import { moneyParts, useData } from "@/lib/store";
import { Money } from "./ui";

/** De onde vem o "meu dinheiro" que as metas contam: conta, CDB e o que te devem. */
export function Partes() {
  const m = moneyParts(useData());
  const itens: [string, number][] = [["Disponível", m.disponivel], ["CDB líquido", m.cdb]];
  if (m.doPai > 0) itens.push(["Pai te deve", m.doPai]);
  if (m.pessoas > 0) itens.push(["Outros te devem", m.pessoas]);
  return (
    <div className="mt-2 pt-2 border-t border-line text-[13px] text-ink2 flex flex-col gap-0.5">
      {itens.map(([t, v]) => (
        <div key={t} className="flex justify-between gap-2"><span>{t}</span><Money v={v} /></div>
      ))}
    </div>
  );
}
