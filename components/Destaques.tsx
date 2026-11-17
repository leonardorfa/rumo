"use client";

import { useId } from "react";
import { useAnim } from "@/lib/anim";
import { Spark } from "./charts";
import { Money } from "./ui";

/** Ícone numa bolha de vidro com brilho na cor do assunto (como nos painéis da referência). */
export function Brilho({ cor, children, tam = 40 }: { cor: string; children: React.ReactNode; tam?: number }) {
  return (
    <span className="icone-brilho shrink-0" style={{ ["--cor" as string]: cor, width: tam, height: tam }}>
      <svg viewBox="0 0 24 24" width={tam * 0.5} height={tam * 0.5} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    </span>
  );
}

/** Selo de status ("Pago", "Revisar"...). */
export function Pill({ cor = "var(--meu)", children }: { cor?: string; children: React.ReactNode }) {
  return <span className="pill" style={{ ["--cor" as string]: cor }}>{children}</span>;
}

/** Anel de progresso com degradê e brilho. O conteúdo vai no centro. */
export function Ring({ value, max, size = 72, stroke = 8, cor = "var(--meu)", children }: {
  value: number; max: number; size?: number; stroke?: number; cor?: string; children?: React.ReactNode;
}) {
  const id = useId().replace(/:/g, "");
  const anim = useAnim();
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="progressbar" aria-valuenow={Math.round(pct * 100)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id={`rg${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: cor }} />
            <stop offset="100%" style={{ stopColor: "var(--s1)" }} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#rg${id})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          style={{ filter: `drop-shadow(0 0 5px color-mix(in srgb, ${cor} 60%, transparent))`, transition: anim ? "stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)" : undefined }} />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center leading-tight">{children}</div>
    </div>
  );
}

/** Cartão de destaque: ícone com brilho, valor, variação (ou nota) e mini gráfico. */
export function StatCard({ id, cor, label, valor, signed, delta, bomSeSobe = true, nota, spark, icone, texto }: {
  id: string; cor: string; label: string; valor?: number; signed?: boolean; delta?: number | null; bomSeSobe?: boolean; nota?: string;
  spark?: number[]; icone: React.ReactNode; texto?: string;
}) {
  const bom = delta == null ? true : bomSeSobe ? delta >= 0 : delta <= 0;
  return (
    <div className="card p-3.5 min-w-0">
      <div className="flex items-center gap-2.5">
        <Brilho cor={cor}>{icone}</Brilho>
        <span className="text-[12px] text-ink2 leading-tight">{label}</span>
      </div>
      {texto !== undefined
        ? <div className="num block text-[21px] font-bold mt-2.5 truncate">{texto}</div>
        : <Money v={valor ?? 0} signed={signed} className="block text-[21px] font-bold mt-2.5 truncate" />}
      <div className="text-[12px] mt-0.5 min-h-[18px]">
        {delta != null
          ? <span className={`font-semibold ${bom ? "var-up" : "var-down"}`}>{delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}% <span className="text-ink3 font-normal">vs mês passado</span></span>
          : <span className="text-ink3">{nota ?? ""}</span>}
      </div>
      {spark && <Spark data={spark} color={cor} id={id} />}
    </div>
  );
}

/** Ladrilho com anel de progresso: rótulo, valor no centro e uma frase de apoio. */
export function RingTile({ cor, label, value, max, centro, sub }: { cor: string; label: string; value: number; max: number; centro: string; sub?: string }) {
  return (
    <div className="card p-3.5 min-w-0 flex items-center gap-3">
      <Ring value={value} max={max} size={64} stroke={7} cor={cor}>
        <span className="text-[13px] font-bold num">{centro}</span>
      </Ring>
      <div className="min-w-0">
        <div className="text-[12px] text-ink2 leading-tight">{label}</div>
        {sub && <div className="text-[13px] font-semibold mt-0.5 leading-tight">{sub}</div>}
      </div>
    </div>
  );
}
