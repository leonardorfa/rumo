"use client";

import { PALETA, QUEM, type QuemCor } from "@/lib/cores";
import { update, useData } from "@/lib/store";
import { Button, Sheet } from "./ui";

/** Escolher a cor de cada parte do dinheiro (barra do Início e telas do pai e de quem te deve). */
export function CoresSheet({ onClose }: { onClose: () => void }) {
  const d = useData();
  const cores = d.config.prefs.cores ?? {};
  const salvar = (k: QuemCor, cor?: string) => update((dd) => {
    const novas = { ...(dd.config.prefs.cores ?? {}), [k]: cor };
    if (!cor) delete novas[k];
    return { ...dd, config: { ...dd.config, prefs: { ...dd.config.prefs, cores: novas } } };
  });
  return (
    <Sheet open onClose={onClose} title="Cores do dinheiro">
      {QUEM.map((q) => (
        <div key={q.k} className="card p-3 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-4 h-4 rounded-full" style={{ background: cores[q.k] ?? q.padrao }} aria-hidden />
            <span className="font-semibold flex-1">{q.nome}</span>
            {cores[q.k] && <button className="text-link text-[13px] font-semibold" onClick={() => salvar(q.k)}>Padrão</button>}
          </div>
          <div className="flex flex-wrap gap-2.5">
            {PALETA.map((c) => (
              <button key={c} aria-label={`${q.nome}: cor ${c}`} aria-pressed={cores[q.k] === c} onClick={() => salvar(q.k, c)}
                className="w-9 h-9 rounded-full border border-line" style={{ background: c, boxShadow: cores[q.k] === c ? "0 0 0 3px var(--sheet), 0 0 0 5px var(--ink)" : undefined }} />
            ))}
            <label className="w-9 h-9 rounded-full border border-line grid place-items-center overflow-hidden relative" aria-label={`${q.nome}: outra cor`}
              style={{ background: "conic-gradient(#ff6b7a, #f5c14e, #2de2b3, #22d3ee, #a78bfa, #ff6b7a)" }}>
              <input type="color" value={cores[q.k] ?? "#4f8cff"} onChange={(e) => salvar(q.k, e.target.value)} className="absolute inset-0 opacity-0 !p-0" />
            </label>
          </div>
        </div>
      ))}
      <Button tone="primary" className="w-full" onClick={onClose}>Pronto</Button>
    </Sheet>
  );
}
