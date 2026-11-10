"use client";

import { useContext } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { brl, brl0 } from "@/lib/format";
import { HideCtx } from "./ui";

const axis = { fill: "var(--ink3)", fontSize: 11 };
const tip = {
  contentStyle: { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 13, color: "var(--ink)" },
  labelStyle: { color: "var(--ink2)" },
};
const short = (v: number) =>
  Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k` : String(v);

/** Cores de série (validadas para daltonismo), em ordem fixa. */
export const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)"];

export interface CatDatum { key: string; name: string; icon: string; value: number }

/** Barras por categoria, estilo "Gasto Mensal". Toque abre o detalhe. */
export function CategoryBars({ data, onSelect }: { data: CatDatum[]; onSelect?: (key: string) => void }) {
  const hidden = useContext(HideCtx);
  if (!data.length) return null;
  return (
    <div className="h-52 -ml-2">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="icon" tick={{ fontSize: 16 }} tickLine={false} axisLine={false} interval={0} />
          <YAxis tick={hidden ? false : axis} tickLine={false} axisLine={false} width={hidden ? 4 : 42} tickFormatter={short} />
          {!hidden && <Tooltip {...tip} cursor={{ fill: "var(--fill)" }} formatter={(v: number, _n, p) => [brl(v), (p?.payload as CatDatum)?.name]} labelFormatter={() => ""} />}
          <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={false} cursor="pointer"
            onClick={(d: { key?: string }) => d?.key && onSelect?.(d.key)}>
            {data.map((d, i) => <Cell key={d.key} fill={SERIES[i % SERIES.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Rosca de distribuição, com legenda escrita (identidade nunca só pela cor). */
export function CategoryDonut({ data, onSelect }: { data: CatDatum[]; onSelect?: (key: string) => void }) {
  const hidden = useContext(HideCtx);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <p className="text-[13px] text-ink3">Sem gastos no mês.</p>;
  return (
    <div>
      <div className="h-36">
        <ResponsiveContainer>
          <PieChart>
            {!hidden && <Tooltip {...tip} formatter={(v: number, _n, p) => [brl(v), (p?.payload as CatDatum)?.name]} />}
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={2}
              stroke="var(--card)" strokeWidth={2} isAnimationActive={false}
              onClick={(d: { key?: string }) => d?.key && onSelect?.(d.key)}>
              {data.map((d, i) => <Cell key={d.key} fill={SERIES[i % SERIES.length]} cursor="pointer" />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {data.map((d, i) => (
          <li key={d.key} className="flex items-center gap-2 text-[13px]">
            <i className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: SERIES[i % SERIES.length] }} />
            <span className="flex-1 truncate text-ink2">{d.name}</span>
            <span className="text-ink3">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Duas linhas no mesmo eixo de dias + teto como referência. Um eixo só. */
export function CumulativeChart({ data, teto, labels }: {
  data: { day: number; atual: number | null; anterior: number | null }[]; teto: number; labels: [string, string];
}) {
  const hidden = useContext(HideCtx);
  return (
    <div>
      <div className="flex gap-4 text-[13px] text-ink2 mb-1">
        <span className="flex items-center gap-1.5"><i className="inline-block w-3 h-[3px] rounded" style={{ background: "var(--meu)" }} />{labels[0]}</span>
        <span className="flex items-center gap-1.5"><i className="inline-block w-3 border-t-2 border-dashed border-ink3" />{labels[1]}</span>
      </div>
      <div className="h-44 -ml-2">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={false} ticks={[1, 10, 20, 30]} />
            <YAxis tick={hidden ? false : axis} tickLine={false} axisLine={false} width={hidden ? 4 : 44} tickFormatter={short} />
            {!hidden && (
              <Tooltip {...tip} labelFormatter={(d) => `Dia ${d}`}
                formatter={(v: number, k) => [brl(v), k === "atual" ? labels[0] : labels[1]]} />
            )}
            {teto > 0 && (
              <ReferenceLine y={teto} stroke="var(--alert)" strokeDasharray="4 4"
                label={{ value: hidden ? "Teto" : `Teto ${brl0(teto)}`, position: "insideTopRight", fill: "var(--alert)", fontSize: 11 }} />
            )}
            <Line dataKey="anterior" stroke="var(--ink3)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls={false} isAnimationActive={false} />
            <Line dataKey="atual" stroke="var(--meu)" strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Saldo projetado mês a mês até o prazo, com a meta como linha de chegada. */
export function ProjectionChart({ data, goal, name = "Saldo projetado" }: { data: { label: string; value: number }[]; goal: number; name?: string }) {
  const hidden = useContext(HideCtx);
  const max = Math.max(goal, ...data.map((d) => d.value)) * 1.08;
  return (
    <div className="h-52 -ml-2">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
          <YAxis domain={[0, max]} tick={hidden ? false : axis} tickLine={false} axisLine={false} width={hidden ? 4 : 44} tickFormatter={short} />
          {!hidden && <Tooltip {...tip} formatter={(v: number) => [brl(v), name]} />}
          <ReferenceLine y={goal} stroke="var(--meta)" strokeWidth={2} strokeDasharray="6 4"
            label={{ value: hidden ? "Meta" : `Meta ${brl0(goal)}`, position: "insideTopLeft", fill: "var(--ink2)", fontSize: 11 }} />
          <Line dataKey="value" stroke="var(--meu)" strokeWidth={2.5} isAnimationActive={false}
            dot={{ r: 4, fill: "var(--meu)", stroke: "var(--card)", strokeWidth: 2 }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Seu dinheiro na conta nos próximos 30 dias. Abaixo de zero fica vermelho. */
export function ForecastChart({ data }: { data: { label: string; value: number }[] }) {
  const hidden = useContext(HideCtx);
  const min = Math.min(0, ...data.map((d) => d.value));
  return (
    <div className="h-44 -ml-2">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval={6} />
          <YAxis domain={[min, "auto"]} tick={hidden ? false : axis} tickLine={false} axisLine={false} width={hidden ? 4 : 44} tickFormatter={short} />
          {!hidden && <Tooltip {...tip} formatter={(v: number) => [brl(v), "Seu na conta"]} />}
          <ReferenceLine y={0} stroke={min < 0 ? "var(--alert)" : "var(--ink3)"} strokeDasharray={min < 0 ? "4 4" : undefined} />
          <Line type="monotone" dataKey="value" stroke={min < 0 ? "var(--alert)" : "var(--meu)"} strokeWidth={2.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Crédito do pai ao longo do tempo; abaixo de zero = ele te deve. */
export function FatherChart({ data }: { data: { label: string; value: number }[] }) {
  const hidden = useContext(HideCtx);
  if (data.length < 2) return null;
  return (
    <div className="h-36 -ml-2">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tick={hidden ? false : axis} tickLine={false} axisLine={false} width={hidden ? 4 : 44} tickFormatter={short} />
          {!hidden && <Tooltip {...tip} formatter={(v: number) => [brl(v), "Crédito do pai"]} />}
          <ReferenceLine y={0} stroke="var(--ink3)" />
          <Line type="stepAfter" dataKey="value" stroke="var(--pai)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Linha simples com linha de meta opcional. `dom` ajusta o eixo ao que importa (peso não começa em zero). */
export function TrendChart({ data, goal, name, fmt, goalLabel, dom }: {
  data: { label: string; value: number | null; extra?: number | null }[]; goal?: number; name: string; fmt?: (v: number) => string;
  goalLabel?: string; dom?: [number | "auto", number | "auto"];
}) {
  const hidden = useContext(HideCtx);
  const f = fmt ?? ((v: number) => String(v));
  const vals = data.flatMap((d) => [d.value, d.extra]).filter((v): v is number => typeof v === "number");
  const lo = Math.min(...vals, goal ?? Infinity), hi = Math.max(...vals, goal ?? -Infinity);
  const pad = (hi - lo || 1) * 0.12;
  return (
    <div className="h-48 -ml-2">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
          <YAxis domain={dom ?? [Math.floor(lo - pad), Math.ceil(hi + pad)]} tick={hidden ? false : axis} tickLine={false} axisLine={false}
            width={hidden ? 4 : 46} tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? short(v) : String(v))} />
          {!hidden && <Tooltip {...tip} formatter={(v: number, k) => [f(v), k === "extra" ? "Plano" : name]} />}
          {goal !== undefined && (
            <ReferenceLine y={goal} stroke="var(--meta)" strokeWidth={2} strokeDasharray="6 4"
              label={{ value: hidden ? "Meta" : `${goalLabel ?? "Meta"} ${f(goal)}`, position: "insideTopLeft", fill: "var(--ink2)", fontSize: 11 }} />
          )}
          <Line dataKey="extra" stroke="var(--ink3)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />
          <Line dataKey="value" stroke="var(--meu)" strokeWidth={2.5} connectNulls isAnimationActive={false}
            dot={{ r: 3.5, fill: "var(--meu)", stroke: "var(--card)", strokeWidth: 2 }} activeDot={{ r: 5.5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras simples (treinos por semana, volume). */
export function BarsChart({ data, name, color = "var(--meu)" }: { data: { label: string; value: number }[]; name: string; color?: string }) {
  const hidden = useContext(HideCtx);
  return (
    <div className="h-40 -ml-2">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="25%">
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={hidden ? false : axis} tickLine={false} axisLine={false} width={hidden ? 4 : 40} tickFormatter={(v: number) => (v >= 1000 ? short(v) : String(v))} allowDecimals={false} />
          {!hidden && <Tooltip {...tip} cursor={{ fill: "var(--fill)" }} formatter={(v: number) => [v.toLocaleString("pt-BR"), name]} />}
          <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
