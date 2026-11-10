"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { brl, brlSigned, monthName, shiftMonth } from "@/lib/format";
import { getData, setData, update } from "@/lib/store";
import type { Data } from "@/lib/types";

// ---------- esconder valores (olho, estilo Nubank) ----------
export const HideCtx = createContext(false);

export function Money({ v, signed, className = "" }: { v: number; signed?: boolean; className?: string }) {
  const hidden = useContext(HideCtx);
  return <span className={`num ${className}`}>{hidden ? "R$ ••••" : signed ? brlSigned(v) : brl(v)}</span>;
}

// ---------- blocos ----------
export function Card({ children, className = "", onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`card block w-full text-left p-4 ${className}`}>
      {children}
    </Tag>
  );
}

export function Title({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between pt-3 pb-3">
      <h1 className="text-[34px] leading-tight font-bold tracking-tight">{children}</h1>
      {right}
    </div>
  );
}

export function Section({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between mt-6 mb-2 px-1">
      <h2 className="text-[20px] font-semibold">{children}</h2>
      {action}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="flex bg-fill rounded-[10px] p-[2px] text-[13px] font-medium" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`flex-auto px-2 whitespace-nowrap py-[7px] rounded-[8px] transition-colors ${o.value === value ? "bg-card text-ink shadow-sm font-semibold" : "text-ink2"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Barra de progresso; passou de 100% vira alerta. */
export function Progress({ value, max, color = "var(--meu)" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const over = max > 0 && value > max;
  return (
    <div className="h-2 rounded-full bg-fill overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: over ? "var(--alert)" : color }} />
    </div>
  );
}

export function MonthSwitcher({ month, onChange, max }: { month: string; onChange: (m: string) => void; max?: string }) {
  const atMax = !!max && month >= max;
  return (
    <div className="flex items-center gap-1">
      <button aria-label="Mês anterior" className="w-9 h-9 rounded-full text-link text-xl" onClick={() => onChange(shiftMonth(month, -1))}>‹</button>
      <span className="min-w-[96px] text-center font-semibold">{monthName(month)}</span>
      <button aria-label="Próximo mês" disabled={atMax} className="w-9 h-9 rounded-full text-link text-xl disabled:opacity-25" onClick={() => onChange(shiftMonth(month, 1))}>›</button>
    </div>
  );
}

export function Button({ children, onClick, tone = "fill", className = "", disabled }: {
  children: React.ReactNode; onClick?: () => void; tone?: "fill" | "primary" | "danger"; className?: string; disabled?: boolean;
}) {
  const t = tone === "primary" ? "bg-brand text-onbrand" : tone === "danger" ? "bg-fill text-alert" : "bg-fill text-link";
  return (
    <button disabled={disabled} onClick={onClick} className={`h-11 px-4 rounded-xl font-semibold disabled:opacity-40 ${t} ${className}`}>
      {children}
    </button>
  );
}

// ---------- folha que sobe de baixo ----------
export function Sheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  // O teclado do iPhone não encolhe a página: a folha ficava por trás dele e escondia o campo.
  // Acompanha a área realmente visível (visualViewport) e leva o campo focado para o meio.
  const [vv, setVv] = useState<{ h: number; top: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const v = window.visualViewport;
    const sync = () => v && setVv({ h: v.height, top: v.offsetTop });
    sync();
    v?.addEventListener("resize", sync);
    v?.addEventListener("scroll", sync);
    return () => {
      window.removeEventListener("keydown", k);
      v?.removeEventListener("resize", sync);
      v?.removeEventListener("scroll", sync);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed left-0 right-0 z-50 flex items-end justify-center" role="dialog" aria-modal aria-label={title}
      style={vv ? { top: vv.top, height: vv.h } : { top: 0, bottom: 0 }}
      onFocusCapture={(e) => {
        const el = e.target as HTMLElement;
        if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
      }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="sheet-in relative w-full max-w-[480px] overflow-y-auto bg-bg rounded-t-3xl px-4 pt-2"
        style={{ maxHeight: vv ? `${Math.min(vv.h - 8, vv.h * 0.94)}px` : "88vh", paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}>
        <div className="mx-auto mt-1 mb-3 h-1.5 w-10 rounded-full bg-line" />
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[20px] font-semibold">{title}</h2>
          <button onClick={onClose} className="text-link font-semibold h-9 px-2">Fechar</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- aviso rápido (com "Desfazer" quando dá para voltar) ----------
type ToastMsg = { text: string; undo?: () => void };
let pushToast: (m: ToastMsg) => void = () => {};
export const toast = (text: string, undo?: () => void) => pushToast({ text, undo });

/** Muda os dados e oferece "Desfazer" por 5 segundos (volta tudo como estava). */
export function act(text: string | (() => string), fn: (d: Data) => Data) {
  const antes = getData();
  update(fn);
  toast(typeof text === "string" ? text : text(), () => setData(antes));
}
export function Toaster() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    pushToast = (m) => { setMsg(m); clearTimeout(t); t = setTimeout(() => setMsg(null), m.undo ? 5000 : 2600); };
  }, []);
  if (!msg) return null;
  return (
    <div role="status" className="fixed left-1/2 -translate-x-1/2 z-[60] bg-ink text-bg text-[15px] pl-4 pr-2 py-1.5 rounded-full shadow-lg max-w-[92vw] flex items-center gap-2"
      style={{ bottom: "calc(96px + env(safe-area-inset-bottom))" }}>
      <span className="py-1 truncate">{msg.text}</span>
      {msg.undo ? (
        <button className="shrink-0 font-bold underline underline-offset-2 px-2 py-1" onClick={() => { msg.undo!(); setMsg(null); }}>
          Desfazer
        </button>
      ) : <span className="w-2" />}
    </div>
  );
}

/** Botão que abre o seletor de arquivos do iPhone. */
export function FilePick({ accept, label, onFile, tone = "fill", className = "" }: {
  accept: string; label: string; onFile: (f: File) => void; tone?: "fill" | "primary"; className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button tone={tone} className={className} onClick={() => ref.current?.click()}>{label}</Button>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) onFile(f);
      }} />
    </>
  );
}


// ---------- ícones da barra de abas (traço simples, estilo iOS) ----------
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const Icons = {
  home: <svg viewBox="0 0 24 24" width="26" height="26" {...P}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></svg>,
  list: <svg viewBox="0 0 24 24" width="26" height="26" {...P}><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>,
  pai: <svg viewBox="0 0 24 24" width="26" height="26" {...P}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 11l2 2 4-4" /></svg>,
  meta: <svg viewBox="0 0 24 24" width="26" height="26" {...P}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></svg>,
  cdb: <svg viewBox="0 0 24 24" width="26" height="26" {...P}><path d="M3 17l6-6 4 4 8-8M15 7h6v6" /></svg>,
  treino: <svg viewBox="0 0 24 24" width="26" height="26" {...P}><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" /></svg>,
  mais: <svg viewBox="0 0 24 24" width="26" height="26" {...P}><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></svg>,
  eye: <svg viewBox="0 0 24 24" width="24" height="24" {...P}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>,
  eyeOff: <svg viewBox="0 0 24 24" width="24" height="24" {...P}><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.2 6.3C3.6 8 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.3-1" /></svg>,
};
