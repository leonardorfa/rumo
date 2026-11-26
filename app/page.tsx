"use client";

import { useEffect, useState } from "react";
import Extrato, { type Filter } from "@/components/Extrato";
import Home from "@/components/Home";
import Lock from "@/components/Lock";
import Mais from "@/components/Mais";
import Metas from "@/components/Metas";
import NewTx from "@/components/NewTx";
import Pai from "@/components/Pai";
import Treino from "@/components/Treino";
import Investimentos from "@/components/Investimentos";
import { AcoesFab } from "@/components/Voz";
import { Card, FilePick, HideCtx, Icons, Toaster, toast } from "@/components/ui";
import { restoreFile } from "@/lib/backup";
import { setAnimOn } from "@/lib/anim";
import { refreshCdi } from "@/lib/cdi";
import { coresVars } from "@/lib/cores";
import { latestMonth } from "@/lib/stats";
import { getData, useData } from "@/lib/store";

type Tab = "home" | "extrato" | "pai" | "meta" | "treino" | "cdb" | "mais";
const TABS: { id: Tab; label: string; icon: JSX.Element }[] = [
  { id: "home", label: "Início", icon: Icons.home },
  { id: "extrato", label: "Extrato", icon: Icons.list },
  { id: "pai", label: "Pai", icon: Icons.pai },
  { id: "meta", label: "Metas", icon: Icons.meta },
  { id: "treino", label: "Treino", icon: Icons.treino },
  { id: "cdb", label: "Invest.", icon: Icons.cdb },
  { id: "mais", label: "Mais", icon: Icons.mais },
];

export default function App() {
  const d = useData();
  useEffect(() => { try { localStorage.setItem("orbita-splash", d.config.prefs.splash === false ? "0" : "1"); } catch { /* ok */ } }, [d.config.prefs.splash]);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [month, setMonth] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [hidden, setHidden] = useState(true); // sempre abre com os valores escondidos
  const [novo, setNovo] = useState(false);
  const [aberto, setAberto] = useState(false); // passou pela trava

  // animações: sua preferência e o "reduzir movimento" do iPhone
  // cores que você escolheu para o dinheiro (as não escolhidas seguem o tema)
  useEffect(() => {
    const raiz = document.documentElement.style;
    for (const [nome, valor] of Object.entries(coresVars(d.config.prefs.cores))) valor ? raiz.setProperty(nome, valor) : raiz.removeProperty(nome);
  }, [d.config.prefs.cores]);
  const animPref = d.config.prefs.anim;
  useEffect(() => {
    const reduz = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const on = animPref && !reduz;
    setAnimOn(on);
    document.documentElement.classList.toggle("anim", on);
  }, [animPref]);

  useEffect(() => {
    setHidden(getData().config.prefs.hideOnStart);
    setReady(true);
    refreshCdi();
    // Voltou para o app (ou saiu dele): esconde de novo e atualiza o CDI.
    const onVis = () => {
      if (document.visibilityState === "hidden") setHidden(getData().config.prefs.hideOnStart);
      else {
        refreshCdi();
        navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      // Já tinha versão antiga controlando? Quando a nova assumir, recarrega uma vez.
      const tinha = !!navigator.serviceWorker.controller;
      let recarregou = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (tinha && !recarregou) { recarregou = true; location.reload(); }
      });
      navigator.serviceWorker.register(`${base}/sw.js`, { updateViaCache: "none" }).then((r) => r.update()).catch(() => {});
    }
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  // Abre no mês mais recente que tem extrato.
  useEffect(() => {
    if (ready && !month) setMonth(latestMonth(d));
  }, [ready, month, d]);

  const go = (t: Tab) => { setTab(t); window.scrollTo(0, 0); };
  const goReview = () => { setFilter("review"); go("extrato"); };
  const toggleHide = (h: boolean) => setHidden(h);
  const empty = !d.txs.length && !d.father.length && !d.config.accountBalance;

  if (!ready || !month) return null;
  if (d.config.lock.on && !aberto) return <Lock onOpen={() => setAberto(true)} />;

  return (
    <HideCtx.Provider value={hidden}>
      <span className="fixed top-0.5 right-1.5 z-40 text-[10px] text-ink3 opacity-60 pointer-events-none select-none" aria-hidden>v{process.env.NEXT_PUBLIC_VERSION}</span>
      <main className="mx-auto max-w-[480px] px-4 pb-tab" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        {empty && tab === "home" ? (
          <Welcome onStart={() => go("mais")} />
        ) : (
          <>
            {tab === "home" && (
              <Home month={month} setMonth={setMonth} hidden={hidden} setHidden={toggleHide}
                goMeta={() => go("meta")} goCdb={() => go("cdb")} goPai={() => go("pai")} goExtrato={() => { setFilter("all"); go("extrato"); }} />
            )}
            {tab === "extrato" && <Extrato month={month} setMonth={setMonth} filter={filter} setFilter={setFilter} />}
            {tab === "pai" && <Pai month={month} setMonth={setMonth} />}
            {tab === "meta" && <Metas />}
            {tab === "treino" && <Treino />}
            {tab === "cdb" && <Investimentos />}
            {tab === "mais" && <Mais goReview={goReview} goCdb={() => go("cdb")} />}
          </>
        )}
      </main>

      {!empty && <AcoesFab onNovo={() => setNovo(true)} />}
      <NewTx open={novo} onClose={() => setNovo(false)} />

      <nav className="fixed bottom-0 inset-x-0 z-40 px-3 pointer-events-none" style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
        <div className="pointer-events-auto mx-auto max-w-[456px] grid grid-cols-7 px-1 py-1 rounded-[26px] border border-line backdrop-blur-xl"
          style={{ background: "color-mix(in srgb, var(--card) 82%, transparent)", boxShadow: "0 14px 40px rgba(0,0,0,.35), 0 0 26px rgba(56,130,255,.12)" }}>
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <button key={t.id} onClick={() => go(t.id)} aria-current={on ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-1.5 rounded-[20px] text-[10px] font-semibold transition-colors ${on ? "text-link" : "text-ink3"}`}
                style={on ? { background: "linear-gradient(160deg, rgba(100,150,255,.26), rgba(100,150,255,.08))", boxShadow: "0 0 18px rgba(80,150,255,.28), 0 0 0 1px rgba(130,180,255,.35) inset" } : undefined}>
                {t.icon}
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
      <Toaster />
    </HideCtx.Provider>
  );
}

function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="pt-14">
      <div className="hero card p-6">
        <h1 className="text-[30px] font-extrabold leading-tight">Órbita.<br />Dinheiro, metas e treino.</h1>
        <p className="text-white/75 mt-3 text-[16px]">Seus dados ficam só neste iPhone. Sem conta, sem IA.</p>
      </div>
      <Card className="mt-4">
        <div className="font-semibold">Já tem um backup?</div>
        <div className="text-[13px] text-ink3 mb-3">
          Escolha o arquivo .json e tudo volta: transações, saldos, regras e a senha do PDF.
        </div>
        <FilePick accept="application/json,.json" label="Restaurar backup" tone="primary" className="w-full"
          onFile={async (f) => {
            try {
              const n = await restoreFile(f);
              if (n >= 0) toast(`Backup restaurado: ${n} transações`);
            } catch (e) {
              alert((e as Error).message || "Arquivo inválido.");
            }
          }} />
      </Card>
      <Card className="mt-3" onClick={onStart}>
        <div className="font-semibold text-link">Começar do zero</div>
        <div className="text-[13px] text-ink3">Importar o PDF do extrato do C6</div>
      </Card>
    </div>
  );
}
