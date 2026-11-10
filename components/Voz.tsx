"use client";

import { useEffect, useRef, useState } from "react";
import { catName, typeOf } from "@/lib/categories";
import { brl, dayLabel, shiftMonth } from "@/lib/format";
import { addManual, addParcelamento, addReceivable, fatherBalance, getData, monthKey, openReceivableOf, payPerson, receivableLeft, update, useData } from "@/lib/store";
import { falarDisponivel, learnFromFala, ouvir, parseFala, type Fala } from "@/lib/voice";
import Assistente from "./Assistente";
import { CategoryGrid } from "./Tx";
import { act, Button, Sheet, toast } from "./ui";

const Mic = (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

/**
 * Um botão só no canto: tocou, abrem dois flutuantes — lançar na mão (+) e
 * lançar falando (microfone). Fica em todas as abas.
 */
export function AcoesFab({ onNovo }: { onNovo: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [voz, setVoz] = useState(false);
  const [ia, setIa] = useState(false);
  const base = "calc(86px + env(safe-area-inset-bottom))";
  const item = (i: number) => `calc(${86 + 72 * i}px + env(safe-area-inset-bottom))`;
  return (
    <>
      {aberto && <div className="fixed inset-0 z-30 bg-black/40" onClick={() => setAberto(false)} />}
      {aberto && (
        <>
          <button onClick={() => { setAberto(false); setIa(true); }}
            className="fixed right-4 z-40 h-14 pl-4 pr-1.5 rounded-full bg-card text-ink shadow-lg flex items-center gap-3 font-semibold"
            style={{ bottom: item(3) }}>
            Perguntar
            <span className="w-11 h-11 rounded-full bg-[var(--s4)] text-white grid place-items-center text-xl" aria-hidden>✨</span>
          </button>
          <button onClick={() => { setAberto(false); setVoz(true); }}
            className="fixed right-4 z-40 h-14 pl-4 pr-1.5 rounded-full bg-card text-ink shadow-lg flex items-center gap-3 font-semibold"
            style={{ bottom: item(2) }}>
            Falar
            <span className="w-11 h-11 rounded-full bg-meu text-white grid place-items-center">{Mic}</span>
          </button>
          <button onClick={() => { setAberto(false); onNovo(); }}
            className="fixed right-4 z-40 h-14 pl-4 pr-1.5 rounded-full bg-card text-ink shadow-lg flex items-center gap-3 font-semibold"
            style={{ bottom: item(1) }}>
            Lançar
            <span className="w-11 h-11 rounded-full bg-brand text-onbrand grid place-items-center text-2xl leading-none">+</span>
          </button>
        </>
      )}
      <button onClick={() => setAberto(!aberto)} aria-label={aberto ? "Fechar" : "Novo lançamento"} aria-expanded={aberto}
        className="fixed right-4 z-40 w-14 h-14 rounded-full bg-brand text-onbrand text-3xl leading-none shadow-lg grid place-items-center transition-transform"
        style={{ bottom: base, transform: aberto ? "rotate(45deg)" : undefined }}>
        +
      </button>
      {voz && <VozSheet onClose={() => setVoz(false)} />}
      {ia && <Assistente onClose={() => setIa(false)} />}
    </>
  );
}

/**
 * Fala (ou dita pelo microfone do teclado) → o app entende → você confere e
 * lança com um toque. Trocar a categoria ensina para a próxima.
 */
export function VozSheet({ onClose }: { onClose: () => void }) {
  const d = useData();
  const customs = d.config.customCats;
  const [texto, setTexto] = useState("");
  const [ouvindo, setOuvindo] = useState(false);
  const [aviso, setAviso] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const parar = useRef<(() => void) | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  const devedores = [...new Set((d.receivables || []).filter((r) => receivableLeft(r) > 0).map((r) => r.person))];
  const f: Fala | null = texto.trim() ? parseFala(texto, d.rules, customs, new Date(), devedores) : null;
  const deveHoje = f?.receber ? openReceivableOf(d, f.receber.person).reduce((s, r) => s + receivableLeft(r), 0) : 0;
  const categoria = cat ?? f?.category ?? null;

  function escutar() {
    if (!falarDisponivel()) {
      setAviso("Toque no 🎤 do teclado e fale.");
      campo.current?.focus();
      return;
    }
    setAviso("");
    setOuvindo(true);
    try {
      parar.current = ouvir(
        (t) => { setTexto(t); setCat(null); },
        (erro) => {
          setOuvindo(false);
          if (erro && erro !== "no-speech" && erro !== "aborted") {
            setAviso("O microfone não abriu aqui. Toque no 🎤 do teclado e fale.");
            campo.current?.focus();
          }
        }
      );
    } catch {
      setOuvindo(false);
      setAviso("Toque no 🎤 do teclado e fale.");
      campo.current?.focus();
    }
  }
  // já abre ouvindo
  useEffect(() => { escutar(); return () => parar.current?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function lancar() {
    if (f?.receber) {
      const { tipo, person } = f.receber;
      if (tipo === "pagou") act(`${person} pagou ${brl(f.amount)}`, (dd) => payPerson(dd, person, { amount: f.amount, date: f.date, entrouNaConta: true }));
      else act(`${person} te deve ${brl(f.amount)}`, (dd) => addReceivable(dd, { person, description: f.description, amount: f.amount, date: f.date, saiuDaConta: tipo === "emprestei" }));
      onClose();
      return;
    }
    if (!f || !categoria) return;
    const ensinar = categoria !== f.category;
    if (f.parcelas) {
      const from = monthKey();
      update((dd) => addParcelamento(dd, { name: f.description, parcela: f.parcelas!.parcela, from, until: shiftMonth(from, f.parcelas!.n - 1), match: "" }));
      toast(`${f.description}: ${f.parcelas.n}x de ${brl(f.parcelas.parcela)}`);
    } else {
      update((dd) => {
        const novo = addManual(dd, { date: f.date, description: f.description, amount: f.amount, category: categoria });
        return ensinar ? { ...novo, rules: learnFromFala(novo.rules, f.description, f.amount, categoria) } : novo;
      });
      if (typeOf(categoria) === "fathers") {
        const b = fatherBalance(getData());
        toast(b >= 0 ? `Lançado. Crédito do pai: ${brl(b)}` : `Lançado. Seu pai te deve ${brl(-b)}`);
      } else {
        toast(`${f.amount < 0 ? "Gasto" : "Entrada"} de ${brl(Math.abs(f.amount))} lançado${ensinar ? " (aprendido)" : ""}`);
      }
    }
    onClose();
  }

  const entrada = !!f && f.amount > 0;
  return (
    <Sheet open onClose={onClose} title="Lançar falando">
      <div className="flex gap-2 mb-2">
        <input ref={campo} value={texto} onChange={(e) => { setTexto(e.target.value); setCat(null); }}
          placeholder="Ex.: gastei 50 reais em sorvete" className="flex-1 min-w-0" />
        <button onClick={ouvindo ? () => parar.current?.() : escutar} aria-label={ouvindo ? "Parar" : "Falar"}
          className={`w-12 h-12 shrink-0 rounded-xl grid place-items-center ${ouvindo ? "bg-alert text-white animate-pulse" : "bg-brand text-onbrand"}`}>
          {Mic}
        </button>
      </div>
      <p className="text-[13px] text-ink3 px-1 mb-3">
        {ouvindo ? "Ouvindo… fale o valor e o que foi." : aviso || "Fale do jeito que quiser: “recebi 200 do meu pai”, “paguei 80 de remédio pro meu pai”, “comprei um tênis de 400 em 4 vezes”, “o João me deve 50 da pizza”, “o João me pagou 50”."}
      </p>

      {texto.trim() && !f && <p className="text-alert mb-3">Não achei o valor. Fale o número, ex.: “50 reais”.</p>}

      {f?.receber && (
        <>
          <div className="card p-4 mb-3">
            <div className={`text-[30px] font-bold num ${f.receber.tipo === "pagou" ? "text-ok" : ""}`}>{brl(f.amount)}</div>
            <div className="text-[17px] font-medium">
              {f.receber.tipo === "pagou" ? `${f.receber.person} te pagou` : `${f.receber.person} te deve`}
              {f.description && f.receber.tipo !== "pagou" ? ` · ${f.description}` : ""}
            </div>
            <div className="text-[13px] text-ink3">
              {f.receber.tipo === "deve" && "Só anota: nada sai da sua conta."}
              {f.receber.tipo === "emprestei" && "Sai da sua conta como “emprestei” (não conta como gasto) e fica anotado que ele te deve."}
              {f.receber.tipo === "pagou" && <>Entra na sua conta e abate do que ele devia ({brl(deveHoje)}).</>}
            </div>
          </div>
          <div className="sticky bottom-0 bg-bg pt-2 pb-1">
            <Button tone="primary" className="w-full" onClick={lancar}>
              {f.receber.tipo === "pagou" ? "Registrar pagamento" : "Anotar"}
            </Button>
          </div>
        </>
      )}

      {f && !f.receber && (
        <>
          <div className="card p-4 mb-3">
            <div className={`text-[30px] font-bold num ${entrada ? "text-ok" : ""}`}>
              {f.parcelas ? `${f.parcelas.n}x de ${brl(f.parcelas.parcela)}` : `${entrada ? "+" : "−"}${brl(Math.abs(f.amount))}`}
            </div>
            <div className="text-[17px] font-medium">{f.description}</div>
            <div className="text-[13px] text-ink3">
              {f.parcelas ? `total ${brl(f.parcelas.total)} · parcelamento a partir deste mês` : dayLabel(f.date)}
              {categoria ? ` · ${catName(categoria, customs)}` : ""}
            </div>
          </div>

          {!f.parcelas && (
            <>
              <div className={`text-[13px] px-1 mb-1.5 ${categoria ? "text-ink3" : "text-alert font-medium"}`}>
                {categoria ? "Categoria (toque para trocar — o app aprende)" : "Não reconheci a categoria: escolha uma (o app aprende)"}
              </div>
              <CategoryGrid customs={customs} current={categoria ?? undefined} onPick={setCat}
                only={(g) => (entrada ? ["Entradas", "Do pai", "Guardar"] : ["Gastos", "Contas fixas", "Do pai", "Guardar"]).includes(g)} />
            </>
          )}

          <div className="sticky bottom-0 bg-bg pt-2 pb-1">
            <Button tone="primary" className="w-full" disabled={!f.parcelas && !categoria} onClick={lancar}>
              {f.parcelas ? "Criar parcelamento" : "Lançar"}
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}
