"use client";

import { useMemo, useState } from "react";
import { CATEGORIES, KINDS, catIcon, catName, pickerGroups } from "@/lib/categories";
import { LeituraDemorou, NeedsPassword, pdfToText } from "@/lib/pdf";
import { parseInvoiceText, type ParsedInvoice } from "@/lib/invoice";
import { faceIdSupported, hashPin, registerFaceId } from "@/lib/lock";
import { prettyName } from "@/lib/classifier";
import { addCategory, cdbNet, cdbPrincipalNow, conferirCdb, deleteInvoice, invoiceOpen, toggleInvoicePaid, deleteCategory, deleteRule, editCategory, importInvoice, importParsed, changesSinceBackup, getData, lastCdi, listSnapshots, rendaFixaNow, restoreSnapshot, setData, setLock, update, useData, type ImportStats } from "@/lib/store";
import { refreshCdi } from "@/lib/cdi";
import { importSetup } from "@/lib/life";
import { aiConfig, apagarChave, chaveMascarada, MODELO_PADRAO, saveAiConfig } from "@/lib/ai";
import { parseStatementText } from "@/lib/text-parser";
import type { Bill, Config } from "@/lib/types";
import { exportCsv, restoreFile, saveBackup } from "@/lib/backup";
import { brl, localDay } from "@/lib/format";
import { Button, Card, FilePick, Money, Section, Segmented, Sheet, Title, toast } from "./ui";

const PW_KEY = "pdf-password";

/** Joga fora a versão guardada no iPhone e baixa a nova. Os dados não são tocados. */
async function atualizarApp() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const ks = (await caches?.keys()) ?? [];
    await Promise.all(ks.map((k) => caches.delete(k)));
  } catch {
    /* sem service worker: só recarrega */
  }
  location.replace(location.pathname + "?v=" + Date.now());
}

export default function Mais({ goReview, goCdb }: { goReview: () => void; goCdb: () => void }) {
  const d = useData();
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [paste, setPaste] = useState(false);
  const [rules, setRules] = useState(false);
  const [cats, setCats] = useState(false);
  const days = d.lastBackup ? Math.floor((Date.now() - Date.parse(d.lastBackup)) / 86400000) : null;
  const [aba, setAba] = useState<"importar" | "ajustes" | "dados">(() => {
    try { return (localStorage.getItem("aba-mais") as "importar" | "ajustes" | "dados") || "importar"; } catch { return "importar"; }
  });
  const trocarAba = (v: "importar" | "ajustes" | "dados") => {
    setAba(v);
    try { localStorage.setItem("aba-mais", v); } catch { /* ok */ }
  };

  function runImport(text: string) {
    const p = parseStatementText(text);
    if (!p.transactions.length && p.closingBalance === null) {
      toast("Não achei transações nesse texto.");
      return;
    }
    let s!: ImportStats;
    update((dd) => {
      const r = importParsed(dd, p.transactions, p.closingBalance, p.statementDate);
      s = r.stats;
      return r.data;
    });
    setStats(s);
    if (s) toast(`Extrato lido: ${s.imported} nova${s.imported === 1 ? "" : "s"}, ${s.duplicates} já tinha${s.duplicates === 1 ? "" : "m"}`);
  }

  return (
    <div>
      <Title>Mais</Title>
      <div className="sticky top-0 z-20 -mx-4 px-4 pb-2 bg-bg" style={{ paddingTop: "max(4px, env(safe-area-inset-top))" }}>
        <Segmented value={aba} onChange={trocarAba}
          options={[{ value: "importar", label: "Importar" }, { value: "ajustes", label: "Ajustes" }, { value: "dados", label: "Dados" }]} />
      </div>

      {aba === "importar" && <>
      <Section>Extrato da conta</Section>
      <Card>
        <p className="text-ink2 mb-3">
          No app do C6: Extrato › Exportar › PDF. Depois escolha o arquivo aqui. O saldo do dia atualiza sozinho.
        </p>
        <PdfPicker onText={runImport} />
        <Button className="w-full mt-2" onClick={() => setPaste(true)}>Colar texto do extrato</Button>
      </Card>
      {stats && (
        <Card className="mt-3">
          <div className="font-semibold mb-2">✓ Importado</div>
          <div className="grid grid-cols-3 text-center gap-2">
            <Stat n={stats.imported} label="novas" />
            <Stat n={stats.duplicates} label="já tinha" />
            <Stat n={stats.review} label="revisar" />
          </div>
          {stats.closingBalance !== null && (
            <div className="text-[15px] text-ink2 mt-3">
              {stats.closingApplied
                ? <>Saldo da conta atualizado: <Money v={stats.closingBalance} className="text-ink" /></>
                : "Extrato mais antigo que o seu saldo atual: entrou só como histórico, o saldo foi mantido."}
            </div>
          )}
          {stats.replacedManual > 0 && (
            <div className="text-[13px] text-ink3 mt-2">
              {stats.replacedManual} lançamento{stats.replacedManual > 1 ? "s" : ""} manual substituído pelo extrato de verdade.
            </div>
          )}
          {stats.review > 0 && <Button tone="primary" className="w-full mt-3" onClick={goReview}>Revisar agora</Button>}
        </Card>
      )}

      <Section>Fatura do cartão</Section>
      <InvoiceImport goReview={goReview} />
      </>}

      {aba === "dados" && <>
      <Section>Backup</Section>
      <Card>
        <p className={days === null || days > d.config.prefs.backupDays ? "text-alert mb-3" : "text-ink2 mb-3"}>
          {days === null ? "⚠︎ Você nunca salvou um backup. " : `Último backup há ${days} dia${days === 1 ? "" : "s"}. `}
          Os dados vivem só neste iPhone: se apagar o app, somem. Salve no iCloud Drive ou OneDrive.
        </p>
        <p className="text-[13px] text-ink3 mb-3">
          {changesSinceBackup() > 0 ? `${changesSinceBackup()} alteração(ões) feita(s) depois do último backup. ` : "Nada novo desde o último backup. "}
          O arquivo leva tudo: transações, categorias, metas, treino, parcelas, CDB, contas e ajustes. Só a chave do Gemini fica de fora, de propósito. Atualizar o app nunca apaga nem pede para refazer nada; só reinstalar o ícone apaga.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button tone="primary" onClick={async () => (await saveBackup()) && toast("Backup salvo")}>Salvar backup</Button>
          <FilePick accept="application/json,.json" label="Restaurar" onFile={async (f) => {
            try {
              const n = await restoreFile(f);
              if (n >= 0) toast(`Backup restaurado: ${n} transações`);
            } catch (e) {
              alert((e as Error).message || "Arquivo inválido.");
            }
          }} />
        </div>
        <Button className="w-full mt-2" onClick={exportCsv}>Exportar planilha (Excel)</Button>
        <FilePick accept="application/json,.json" label="Importar metas e treino (arquivo)" className="w-full mt-2" onFile={async (f) => {
          try {
            const r = importSetup(getData(), JSON.parse(await f.text()));
            setData(r.data);
            toast(`Importado: ${r.metas} meta${r.metas === 1 ? "" : "s"}, ${r.pesos} peso${r.pesos === 1 ? "" : "s"}${r.aplicacoes ? `, ${r.aplicacoes} aplicações do CDB` : ""}`);
          } catch (e) {
            alert((e as Error).message || "Arquivo inválido.");
          }
        }} />
        <p className="text-[13px] text-ink3 mt-2">“Importar metas e treino” soma ao que você já tem (metas, pesos, agenda). Não mexe em transações nem em saldos.</p>
      </Card>

      <Section>Estados anteriores</Section>
      <Anteriores />

      <Section>Segurança</Section>
      <Security />

      <Section>Aparência</Section>
      <Theme />

      <Section>Versão</Section>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="block">Versão de {process.env.NEXT_PUBLIC_BUILD}</span>
            <span className="block text-[13px] text-ink3">Se algo novo não apareceu, toque em atualizar.</span>
          </span>
          <Button className="shrink-0" onClick={atualizarApp}>Atualizar</Button>
        </div>
      </Card>
      <p className="text-[13px] text-ink3 text-center mt-8 mb-2 px-6">
        Seus dados ficam só neste aparelho e nenhuma IA é usada. Da internet vem só a taxa do CDI (Banco Central).
      </p>
      </>}

      {aba === "ajustes" && <>
      <Settings cfg={d.config} goCdb={goCdb} />

      <Section>Categorias</Section>
      <Card onClick={() => setCats(true)} className="flex justify-between items-center">
        <span>
          <span className="block">Minhas categorias</span>
          <span className="block text-[13px] text-ink3">
            {Object.keys(CATEGORIES).length} de fábrica + {d.config.customCats.length} suas
          </span>
        </span>
        <span className="text-ink3 text-xl" aria-hidden>›</span>
      </Card>

      <Section>O que o app aprendeu</Section>
      <Card onClick={() => setRules(true)} className="flex justify-between items-center">
        <span>{d.rules.length} regras de classificação</span>
        <span className="text-ink3 text-xl" aria-hidden>›</span>
      </Card>

      </>}

      <Sheet open={cats} onClose={() => setCats(false)} title="Categorias">
        <Categories />
      </Sheet>
      <Sheet open={paste} onClose={() => setPaste(false)} title="Colar extrato">
        <PasteForm onDone={(t) => { setPaste(false); runImport(t); }} />
      </Sheet>
      <Sheet open={rules} onClose={() => setRules(false)} title="Regras">
        <p className="text-ink2 mb-3 text-[15px]">Criadas quando você corrige uma categoria. Toque para apagar.</p>
        <div className="bg-card rounded-2xl px-4 divide-y divide-line">
          {[...d.rules].reverse().map((r) => (
            <button key={r.pattern + r.sign} className="w-full flex items-center gap-3 py-2.5 text-left"
              onClick={() => confirm(`Esquecer a regra “${r.pattern}”?`) && update((dd) => deleteRule(dd, r))}>
              <span className="flex-1 min-w-0">
                <span className="block truncate">{r.pattern}</span>
                <span className="block text-[13px] text-ink3">{r.sign > 0 ? "entrada" : r.sign < 0 ? "saída" : "entrada ou saída"}</span>
              </span>
              <span className="text-[13px] text-ink2 shrink-0">{catIcon(r.category, d.config.customCats)} {catName(r.category, d.config.customCats)}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function PdfPicker({ onText }: { onText: (t: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [pw, setPw] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  async function read(f: File, password?: string) {
    setBusy(true);
    try {
      onText(await pdfToText(f, password));
      if (password && remember) localStorage.setItem(PW_KEY, password);
      setFile(null);
    } catch (e) {
      if (e instanceof NeedsPassword) {
        if (password) toast("Senha errada");
        setFile(f);
      } else alert(e instanceof LeituraDemorou ? "A leitura do PDF demorou demais e foi cancelada. Tente de novo; se repetir, use “Colar texto do extrato”." : "Não consegui ler esse PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <FilePick accept="application/pdf,.pdf" label={busy ? "Lendo…" : "Escolher PDF"} tone="primary" className="w-full"
        onFile={(f) => read(f, localStorage.getItem(PW_KEY) || undefined)} />
      <Sheet open={!!file} onClose={() => setFile(null)} title="PDF com senha">
        <p className="text-ink2 mb-3">O C6 protege o extrato com senha. Use a mesma que o app do C6 mostra na exportação.</p>
        <input type="password" autoFocus placeholder="Senha do PDF" value={pw} onChange={(e) => setPw(e.target.value)} className="mb-3" />
        <label className="flex items-center gap-2 mb-4 text-[15px]">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="!w-5 !h-5 accent-[var(--meu)]" />
          Lembrar neste iPhone
        </label>
        <Button tone="primary" className="w-full" disabled={!pw || busy} onClick={() => file && read(file, pw)}>
          {busy ? "Lendo…" : "Abrir extrato"}
        </Button>
      </Sheet>
    </>
  );
}

function PasteForm({ onDone }: { onDone: (t: string) => void }) {
  const [t, setT] = useState("");
  return (
    <>
      <p className="text-ink2 mb-3 text-[15px]">Uma linha por transação, com data, descrição e valor. Se tiver a linha “Saldo do dia”, o saldo atualiza.</p>
      <textarea rows={10} value={t} onChange={(e) => setT(e.target.value)} className="font-mono text-[13px] mb-3" placeholder="16/09 Pix enviado para FULANO -R$ 20,00" />
      <Button tone="primary" className="w-full" disabled={!t.trim()} onClick={() => onDone(t)}>Importar</Button>
    </>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return <div><div className="num text-[24px] font-bold">{n}</div><div className="text-[13px] text-ink3">{label}</div></div>;
}

// ---------- ajustes: toda linha abre uma folha para editar ----------

type Kind = "money" | "text" | "month" | "date" | "monthNum" | "bool";
interface Field { key: string; label: string; kind: Kind; value: string | number | boolean; hint?: string }
interface Form { title: string; fields: Field[]; onSave: (v: Record<string, string | number | boolean>) => void; onDelete?: () => void }

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const parseBR = (v: string) => parseFloat(v.replace(/\./g, "").replace(",", "."));
const moneyText = (n: number) => n.toFixed(2).replace(".", ",");

function Settings({ cfg, goCdb }: { cfg: Config; goCdb: () => void }) {
  const [form, setForm] = useState<Form | null>(null);
  const set = (patch: Partial<Config>) => update((d) => ({ ...d, config: { ...d.config, ...patch } }));
  const money = (key: "salary" | "goalAmount" | "accountBalance" | "rendaFixa", label: string, hint?: string) => () =>
    setForm({ title: label, fields: [{ key, label, kind: "money", value: cfg[key], hint }], onSave: (v) => set({ [key]: v[key] as number }) });

  const billForm = (b?: Bill, parcelado = !!b?.until) => setForm({
    title: b ? b.name : parcelado ? "Novo parcelamento" : "Nova conta fixa",
    fields: [
      { key: "name", label: "Nome", kind: "text", value: b?.name ?? "" },
      { key: "amount", label: parcelado ? "Valor da parcela" : "Valor por mês", kind: "money", value: b?.amount ?? 0 },
      ...(parcelado ? [
        { key: "from", label: "Primeira parcela", kind: "month" as Kind, value: b?.from ?? localDay().slice(0, 7) },
        { key: "until", label: "Última parcela", kind: "month" as Kind, value: b?.until ?? "" },
      ] : []),
      { key: "match", label: "Como aparece no extrato", kind: "text", value: b?.match ?? "", hint: "Uma palavra do extrato ou da fatura, ex.: EVOLVE. Serve para marcar como pago sozinho." },
      { key: "day", label: "Dia do vencimento", kind: "money", value: b?.day ?? 0, hint: "0 = o app descobre pelo extrato." },
      ...(parcelado ? [] : [{ key: "atSource", label: "Já sai do salário (não conta na projeção)", kind: "bool" as Kind, value: b?.atSource ?? false }]),
    ],
    onSave: (v) => {
      if (parcelado && (!v.until || String(v.until) < String(v.from))) return alert("A última parcela precisa ser depois da primeira.");
      const next: Bill = {
        id: b?.id ?? Math.random().toString(36).slice(2), name: String(v.name).trim(), amount: v.amount as number,
        match: String(v.match).trim().toUpperCase(), atSource: !!v.atSource,
        ...(Number(v.day) >= 1 && Number(v.day) <= 31 ? { day: Math.round(Number(v.day)) } : {}),
        ...(parcelado ? { from: String(v.from), until: String(v.until) } : {}),
      };
      if (!next.name) return;
      set({ bills: b ? cfg.bills.map((x) => (x.id === b.id ? next : x)) : [...cfg.bills, next] });
    },
    onDelete: b ? () => set({ bills: cfg.bills.filter((x) => x.id !== b.id) }) : undefined,
  });

  const extraForm = (i?: number) => {
    const e = i === undefined ? undefined : cfg.specialExpenses[i];
    setForm({
      title: e ? e.description : "Gasto extra previsto",
      fields: [
        { key: "description", label: "O que é", kind: "text", value: e?.description ?? "" },
        { key: "month", label: "Mês", kind: "monthNum", value: e?.month ?? new Date().getMonth() + 1 },
        { key: "amount", label: "Valor", kind: "money", value: e?.amount ?? 0 },
      ],
      onSave: (v) => {
        const next = { description: String(v.description).trim(), month: Number(v.month), amount: v.amount as number };
        if (!next.description) return;
        set({ specialExpenses: i === undefined ? [...cfg.specialExpenses, next] : cfg.specialExpenses.map((x, j) => (j === i ? next : x)) });
      },
      onDelete: i === undefined ? undefined : () => set({ specialExpenses: cfg.specialExpenses.filter((_, j) => j !== i) }),
    });
  };

  const [gy, gm] = cfg.goalDeadline.split("-").map(Number);
  const d = useData();
  const p = cfg.prefs;
  const [iaTick, setIaTick] = useState(0);
  const ia = useMemo(() => aiConfig(), [iaTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const setP = (patch: Partial<Config["prefs"]>) => set({ prefs: { ...p, ...patch } });
  const num = (key: "returnPct" | "avgMonths" | "economyPct" | "areasCount" | "alertPct" | "backupDays" | "payday", label: string, hint: string, min: number, max: number, suf: string) => (
    <Row label={label} value={key === "payday" && !p.payday ? "automático" : `${p[key]}${suf}`} onClick={() => setForm({
      title: label, fields: [{ key: "v", label, kind: "money", value: p[key], hint: `${hint} (de ${min} a ${max})` }],
      onSave: (v) => { const n = Math.round(Number(v.v)); if (n >= min && n <= max) setP({ [key]: n }); else alert(`Use um número de ${min} a ${max}.`); },
    })} />
  );
  const ir = cdbNet(d);
  const dias = Object.keys(cfg.cdiDaily || {}).sort();
  const ultimoCdi = dias[dias.length - 1];
  const cdiOk = !!ultimoCdi && (Date.now() - Date.parse(ultimoCdi)) / 86400000 < 6;
  const cdiStatus = ultimoCdi
    ? `atualizado até ${ultimoCdi.slice(8)}/${ultimoCdi.slice(5, 7)} · ${lastCdi(d).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}% ao dia${cdiOk ? "" : " · sem conexão há dias: usando a última taxa"}`
    : "ainda não buscou: abra o app com internet (usando estimativa por enquanto)";
  return (
    <>
      <Group title="Personalizar" note="Tudo aqui é gosto seu: mude quando quiser.">
        <Row label="Seu nome" value={p.name || "—"} onClick={() => setForm({
          title: "Seu nome", fields: [{ key: "v", label: "Como o app te chama (as 2 primeiras letras viram o ícone)", kind: "text", value: p.name }],
          onSave: (v) => setP({ name: String(v.v).trim() }),
        })} />
        <Row label="Abrir com valores escondidos" value={p.hideOnStart ? "sim" : "não"} onClick={() => setP({ hideOnStart: !p.hideOnStart })} />
        <Row label="O que te devem conta no meu dinheiro" value={p.countReceivables ? "sim" : "não"} onClick={() => setP({ countReceivables: !p.countReceivables })} />
        <Row label="Fatura do cartão em aberto desconta do meu dinheiro" sub={p.countInvoices ? "ligado: a fatura importada e não paga sai do disponível" : "desligado: a fatura não mexe em nada (o pagamento aparece no extrato)"} value={p.countInvoices ? "sim" : "não"} onClick={() => setP({ countInvoices: !p.countInvoices })} />
        <Row label="Atualizar cotações ao abrir Cripto" sub="consulta a Coinbase e envia só o símbolo da moeda (SOL, BTC…)" value={p.autoCotacao ? "sim" : "não"} onClick={() => setP({ autoCotacao: !p.autoCotacao })} />
        <Row label="Cripto conta no meu dinheiro" value={p.countCripto ? "sim" : "não"} onClick={() => setP({ countCripto: !p.countCripto })} />
        <Row label="Animações e gráficos 3D" value={p.anim ? "sim" : "não"} onClick={() => setP({ anim: !p.anim })} />
        <Row label="Data de nascimento" value={p.birth ? new Date(p.birth + "T12:00:00").toLocaleDateString("pt-BR") : "informar"} onClick={() => setForm({
          title: "Data de nascimento", fields: [{ key: "v", label: "Para as metas “até os X anos”", kind: "date", value: p.birth }],
          onSave: (v) => v.v && setP({ birth: String(v.v) }),
        })} />
        {num("returnPct", "Retorno esperado ao ano", "Para as metas de dinheiro de longo prazo (a poupança perde da inflação; CDB fica perto do CDI).", 0, 40, "%")}
        {num("avgMonths", "Meses para as médias", "Usados no “seu ritmo” e no “pela minha média”. Ex.: 3, 6 ou 12.", 1, 24, " meses")}
        {num("economyPct", "Cenário Econômico", "Quanto abaixo do teto (%).", 0, 90, "% abaixo")}
        {num("areasCount", "Áreas pela minha média", "Quantas categorias viram área própria; o resto vai para Outros.", 1, 15, " áreas")}
        {num("alertPct", "Avisar área no limite", "Aviso no Início quando uma área passar desse % do plano.", 10, 200, "%")}
        {num("backupDays", "Lembrar do backup a cada", "Dias sem backup até o aviso aparecer.", 1, 90, " dias")}
        {num("payday", "Dia do salário", "0 = o app descobre pelo extrato.", 0, 31, "")}
      </Group>

      <Group title="Assistente (Gemini)" note="Chave grátis do Google, guardada só neste aparelho e fora do backup. Pergunte pelo botão +, em Perguntar.">
        <Row label="Chave" sub={ia.key ? "guardada neste iPhone" : "não configurada: abra o botão +, Perguntar"} value={chaveMascarada(ia.key) || "—"}
          onClick={() => setForm({
            title: "Chave do Gemini",
            fields: [{ key: "v", label: "Cole a chave (aistudio.google.com/apikey)", kind: "text", value: ia.key }],
            onSave: (v) => { saveAiConfig({ key: String(v.v), entendi: true }); setIaTick((n) => n + 1); },
          })} />
        <Row label="Modelo" sub="se der erro de modelo, troque por um mais novo" value={ia.model}
          onClick={() => setForm({
            title: "Modelo do Gemini",
            fields: [{ key: "v", label: "Nome do modelo", kind: "text", value: ia.model, hint: `Padrão: ${MODELO_PADRAO}. Veja os nomes atuais em ai.google.dev, Models.` }],
            onSave: (v) => { saveAiConfig({ model: String(v.v) }); setIaTick((n) => n + 1); },
          })} />
        <Row label="Enviar resumo dos meus números" value={ia.enviarResumo ? "sim" : "não"}
          onClick={() => { saveAiConfig({ enviarResumo: !ia.enviarResumo }); setIaTick((n) => n + 1); }} />
        {ia.key && <Row label="Apagar a chave deste iPhone" value="" onClick={() => { if (confirm("Apagar a chave?")) { apagarChave(); setIaTick((n) => n + 1); } }} />}
      </Group>

      <Group title="Renda e meta">
        <Row label="Salário líquido" value={<Money v={cfg.salary} />} onClick={money("salary", "Salário líquido")} />
        <Row label="Meta" value={<Money v={cfg.goalAmount} />} onClick={money("goalAmount", "Meta")} />
        <Row label="Prazo da meta" value={`${MONTHS[gm - 1]} ${gy}`} onClick={() => setForm({
          title: "Prazo da meta", fields: [{ key: "goalDeadline", label: "Mês", kind: "month", value: cfg.goalDeadline }],
          onSave: (v) => v.goalDeadline && set({ goalDeadline: String(v.goalDeadline) }),
        })} />
      </Group>

      <Group title="Contas fixas">
        {cfg.bills.filter((b) => !b.until).map((b) => (
          <Row key={b.id} label={b.name} sub={b.atSource ? "Já sai do salário" : undefined} value={<Money v={b.amount} />} onClick={() => billForm(b)} />
        ))}
        <AddRow label="Adicionar conta fixa" onClick={() => billForm()} />
      </Group>

      <Group title="Parcelamentos" note="Cada parcela entra nas contas do mês, na projeção e no “dá para gastar” até a última.">
        {cfg.bills.filter((b) => b.until).map((b) => {
          const acabou = b.until! < localDay().slice(0, 7);
          return (
            <Row key={b.id} label={b.name}
              sub={`${acabou ? "terminou em" : "até"} ${MONTHS[Number(b.until!.slice(5)) - 1].slice(0, 3).toLowerCase()}/${b.until!.slice(0, 4)}`}
              value={<Money v={b.amount} />} onClick={() => billForm(b)} />
          );
        })}
        <AddRow label="Adicionar parcelamento" onClick={() => billForm(undefined, true)} />
      </Group>

      <Group title="Gastos extras previstos">
        {cfg.specialExpenses.map((e, i) => (
          <Row key={i} label={e.description} sub={MONTHS[e.month - 1]} value={<Money v={e.amount} />} onClick={() => extraForm(i)} />
        ))}
        <AddRow label="Adicionar gasto extra" onClick={() => extraForm()} />
      </Group>

      <Group title="Saldos" note="O extrato atualiza a conta sozinho. Mexa só para corrigir.">
        <Row label="Saldo da conta" value={<Money v={cfg.accountBalance} />} onClick={money("accountBalance", "Saldo da conta", "Saldo bruto da conta, com o dinheiro do pai junto.")} />
      </Group>

      <Group title="CDB" note="Tem uma aba só para o CDB, com conferência, aplicações, IR e projeção.">
        <Row label="Abrir a aba CDB" value="" onClick={goCdb} />
      </Group>

      {form && <FormSheet form={form} onClose={() => setForm(null)} />}
    </>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-[13px] text-ink3 px-4 mb-1.5">{title}</div>
      <div className="bg-card rounded-2xl pl-4 divide-y divide-line">{children}</div>
      {note && <div className="text-[13px] text-ink3 px-4 mt-1.5">{note}</div>}
    </div>
  );
}

function Row({ label, sub, value, onClick }: { label: string; sub?: string; value: React.ReactNode; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className="w-full flex items-center gap-3 py-3 pr-4 text-left min-h-[48px]">
      <span className="flex-1 min-w-0">
        <span className="block truncate">{label}</span>
        {sub && <span className="block text-[13px] text-ink3">{sub}</span>}
      </span>
      <span className="text-ink2">{value}</span>
      {onClick && <span className="text-ink3 text-xl leading-none" aria-hidden>›</span>}
    </Tag>
  );
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} className="w-full py-3 pr-4 text-left text-meu min-h-[48px]">+ {label}</button>;
}

function FormSheet({ form, onClose }: { form: Form; onClose: () => void }) {
  const [v, setV] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(form.fields.map((f) => [f.key, f.kind === "money" ? moneyText(f.value as number) : f.kind === "bool" ? !!f.value : String(f.value)]))
  );
  const bad = form.fields.some((f) => f.kind === "money" && !Number.isFinite(parseBR(String(v[f.key]))));

  function save() {
    form.onSave(Object.fromEntries(form.fields.map((f) => [f.key, f.kind === "money" ? parseBR(String(v[f.key])) : v[f.key]])));
    toast("Salvo");
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={form.title}>
      <div className="flex flex-col gap-4 mb-5">
        {form.fields.map((f, i) => (
          <label key={f.key} className="block">
            {f.kind === "bool" ? (
              <span className="flex items-center justify-between gap-3 bg-card rounded-2xl px-4 py-3">
                <span>{f.label}</span>
                <input type="checkbox" checked={!!v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.checked })} className="!w-6 !h-6 shrink-0 accent-[var(--meu)]" />
              </span>
            ) : (
              <>
                <span className="block text-[13px] text-ink3 px-1 mb-1">{f.label}</span>
                {f.kind === "monthNum" ? (
                  <select value={String(v[f.key])} onChange={(e) => setV({ ...v, [f.key]: e.target.value })}>
                    {MONTHS.map((m, j) => <option key={m} value={j + 1}>{m}</option>)}
                  </select>
                ) : (
                  <input
                    autoFocus={i === 0}
                    type={f.kind === "month" ? "month" : f.kind === "date" ? "date" : "text"}
                    inputMode={f.kind === "money" ? "decimal" : undefined}
                    value={String(v[f.key])}
                    onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
                    className={f.kind === "money" ? "num text-[22px]" : ""}
                  />
                )}
              </>
            )}
            {f.hint && <span className="block text-[13px] text-ink3 px-1 mt-1">{f.hint}</span>}
          </label>
        ))}
      </div>
      <Button tone="primary" className="w-full" disabled={bad} onClick={save}>Salvar</Button>
      {form.onDelete && (
        <Button tone="danger" className="w-full mt-2" onClick={() => {
          if (confirm(`Apagar “${form.title}”?`)) { form.onDelete!(); toast("Apagado"); onClose(); }
        }}>Apagar</Button>
      )}
    </Sheet>
  );
}

/**
 * Fatura do cartão: lê o PDF, mostra o que entendeu e só salva depois que
 * você confere. As compras não mexem no saldo da conta.
 */
function InvoiceImport({ goReview }: { goReview: () => void }) {
  const d = useData();
  const [parsed, setParsed] = useState<ParsedInvoice | null>(null);
  const [drop, setDrop] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [pwFile, setPwFile] = useState<File | null>(null);
  const [pw, setPw] = useState("");

  async function read(f: File, password?: string) {
    setBusy(true);
    try {
      const inv = parseInvoiceText(await pdfToText(f, password));
      if (!inv.purchases.length) toast("Não achei compras nessa fatura.");
      setParsed(inv);
      setDrop([]);
      setPwFile(null);
    } catch (e) {
      if (e instanceof NeedsPassword) setPwFile(f);
      else alert(e instanceof LeituraDemorou ? "A leitura do PDF demorou demais e foi cancelada. Tente de novo; se repetir, use “Colar texto do extrato”." : "Não consegui ler esse PDF.");
    } finally {
      setBusy(false);
    }
  }

  function confirmar() {
    const list = parsed!.purchases.filter((_, i) => !drop.includes(i));
    let r = { imported: 0, review: 0, duplicates: 0 };
    update((dd) => {
      const out = importInvoice(dd, list, { due: parsed!.dueDate, total: parsed!.total });
      r = out;
      return out.data;
    });
    toast(`Fatura: ${r.imported} compras novas (${r.duplicates} já tinha) · já descontada do seu dinheiro`);
    setParsed(null);
    if (r.review) goReview();
  }

  const totalLido = parsed?.purchases.filter((_, i) => !drop.includes(i)).reduce((s, p) => s + Math.abs(p.amount), 0) ?? 0;

  return (
    <>
      <Card>
        <p className="text-ink2 mb-3">
          Importe a fatura só para classificar as compras. {d.config.prefs.countInvoices
            ? "Ela desconta do seu dinheiro até o pagamento aparecer no extrato (opção ligada em Ajustes)."
            : "Ela não desconta do seu dinheiro: o que sai da conta é o pagamento da fatura, que vem no extrato. Se quiser descontar a fatura em aberto, ligue em Ajustes, Personalizar."}
        </p>
        {d.config.invoices.length > 0 && (
          <div className="divide-y divide-line mb-3">
            {[...d.config.invoices].reverse().slice(0, 6).map((inv) => {
              const falta = invoiceOpen(d, inv);
              return (
                <div key={inv.id} className="flex items-center gap-2 py-2">
                  <span className="flex-1 min-w-0">
                    <span className="block">Vence {new Date(inv.due + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                    <span className={`block text-[13px] ${falta ? "text-alert" : "text-ok"}`}>
                      {falta ? <>em aberto: <Money v={falta} /></> : inv.paidManual ? "marcada como paga" : "paga (veio no extrato)"}
                    </span>
                  </span>
                  <Money v={inv.total} className="text-ink2" />
                  {(inv.paidManual || falta > 0) && (
                    <button className="text-link text-[13px] font-semibold px-1" onClick={() => update((dd) => toggleInvoicePaid(dd, inv.id))}>
                      {inv.paidManual ? "reabrir" : "paga"}
                    </button>
                  )}
                  <button aria-label="Apagar fatura" className="text-ink3 px-1" onClick={() => confirm("Tirar essa fatura da dívida do cartão? As compras continuam no extrato.") && update((dd) => deleteInvoice(dd, inv.id))}>×</button>
                </div>
              );
            })}
          </div>
        )}
        <FilePick accept="application/pdf,.pdf" label={busy ? "Lendo…" : "Escolher fatura em PDF"} tone="primary" className="w-full"
          onFile={(f) => read(f, localStorage.getItem(PW_KEY) || undefined)} />
      </Card>

      <Sheet open={!!pwFile} onClose={() => setPwFile(null)} title="Fatura com senha">
        <input type="password" autoFocus placeholder="Senha do PDF" value={pw} onChange={(e) => setPw(e.target.value)} className="mb-3" />
        <Button tone="primary" className="w-full" disabled={!pw} onClick={() => pwFile && read(pwFile, pw)}>Abrir</Button>
      </Sheet>

      <Sheet open={!!parsed} onClose={() => setParsed(null)} title="Confira a fatura">
        {parsed && (
          <>
            <div className="card p-4 mb-3">
              <div className="flex justify-between"><span className="text-ink2">Compras lidas</span><span className="font-semibold">{parsed.purchases.length - drop.length}</span></div>
              <div className="flex justify-between"><span className="text-ink2">Soma</span><Money v={totalLido} className="font-semibold" /></div>
              {parsed.total !== null && (
                <div className="flex justify-between"><span className="text-ink2">Total da fatura</span><Money v={parsed.total} className="font-semibold" /></div>
              )}
              {parsed.dueDate && (
                <div className="flex justify-between"><span className="text-ink2">Vencimento</span>
                  <span>{new Date(parsed.dueDate + "T12:00:00").toLocaleDateString("pt-BR")}</span></div>
              )}
              {parsed.total !== null && Math.abs(totalLido - parsed.total) > 1 && (
                <p className="text-[13px] text-alert mt-2">
                  ⚠︎ A soma não bate com o total. Tire o que não for compra antes de salvar.
                </p>
              )}
            </div>

            <div className="card px-4 mb-4">
              {parsed.purchases.map((p, i) => (
                <div key={i} className={`flex items-center gap-3 py-2.5 ${i ? "border-t border-line" : ""} ${drop.includes(i) ? "opacity-40" : ""}`}>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-[15px]">{prettyName(p.description)}</span>
                    <span className="block text-[13px] text-ink3">
                      {new Date(p.date + "T12:00:00").toLocaleDateString("pt-BR")}
                      {p.installment ? ` · parcela ${p.installment}` : ""}
                    </span>
                  </span>
                  <Money v={p.amount} signed className="text-[15px]" />
                  <button className="text-alert px-2 text-[13px]"
                    onClick={() => setDrop((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))}>
                    {drop.includes(i) ? "voltar" : "tirar"}
                  </button>
                </div>
              ))}
            </div>
            <Button tone="primary" className="w-full" disabled={parsed.purchases.length === drop.length} onClick={confirmar}>
              Salvar {parsed.purchases.length - drop.length} compras
            </Button>
            <p className="text-[13px] text-ink3 text-center mt-2">
              Depois é só tocar em cada uma no Extrato para dizer o que foi.
            </p>
          </>
        )}
      </Sheet>
    </>
  );
}

/** Trava do app: Face ID do iPhone e PIN. */
function Security() {
  const d = useData();
  const { lock } = d.config;
  const [pinSheet, setPinSheet] = useState(false);
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");

  async function ligarFaceId() {
    try {
      const credId = await registerFaceId();
      update((dd) => setLock(dd, { credId, on: true }));
      toast("Face ID ligado");
    } catch {
      alert("Não consegui cadastrar o Face ID neste aparelho. O PIN continua valendo.");
    }
  }

  return (
    <>
      <div className="card px-4">
        <label className="flex items-center gap-3 py-3">
          <span className="flex-1">
            <span className="block">Pedir senha ao abrir</span>
            <span className="block text-[13px] text-ink3">Face ID quando ligado, PIN sempre como reserva</span>
          </span>
          <input type="checkbox" checked={lock.on} className="!w-6 !h-6 shrink-0 accent-[var(--meu)]"
            onChange={(e) => update((dd) => setLock(dd, { on: e.target.checked }))} />
        </label>
        <button onClick={ligarFaceId} disabled={!faceIdSupported()}
          className="w-full flex items-center gap-3 py-3 text-left border-t border-line disabled:opacity-40">
          <span className="flex-1">
            <span className="block">{lock.credId ? "Face ID ligado" : "Ligar Face ID"}</span>
            <span className="block text-[13px] text-ink3">
              {faceIdSupported() ? "Usa o Face ID do próprio iPhone" : "Só funciona no app instalado na Tela de Início"}
            </span>
          </span>
          <span className="text-ink3 text-xl" aria-hidden>›</span>
        </button>
        <button onClick={() => setPinSheet(true)} className="w-full flex items-center gap-3 py-3 text-left border-t border-line">
          <span className="flex-1">Trocar PIN</span>
          <span className="text-ink3 text-xl" aria-hidden>›</span>
        </button>
      </div>

      <Sheet open={pinSheet} onClose={() => setPinSheet(false)} title="Trocar PIN">
        <input type="password" inputMode="numeric" autoFocus placeholder="Novo PIN (4 a 8 números)" value={p1}
          onChange={(e) => setP1(e.target.value.replace(/\D/g, "").slice(0, 8))} className="num mb-3" />
        <input type="password" inputMode="numeric" placeholder="Repita o PIN" value={p2}
          onChange={(e) => setP2(e.target.value.replace(/\D/g, "").slice(0, 8))} className="num mb-4" />
        <Button tone="primary" className="w-full" disabled={p1.length < 4 || p1 !== p2}
          onClick={async () => {
            const pinHash = await hashPin(p1);
            update((dd) => setLock(dd, { pinHash }));
            setP1(""); setP2(""); setPinSheet(false);
            toast("PIN trocado");
          }}>
          Salvar PIN
        </Button>
      </Sheet>
    </>
  );
}

/** Ver as categorias e criar as suas. Só as suas podem ser editadas. */
function Categories() {
  const d = useData();
  const customs = d.config.customCats;
  const [edit, setEdit] = useState<{ key?: string; name: string; icon: string; prefix: string } | null>(null);

  return (
    <>
      <p className="text-ink2 mb-3 text-[15px]">
        Toque em “Nova categoria” para criar a sua. As de fábrica não podem ser apagadas.
      </p>
      <Button tone="primary" className="w-full mb-4" onClick={() => setEdit({ name: "", icon: "🏷️", prefix: "var_" })}>
        + Nova categoria
      </Button>

      {pickerGroups(customs).map((g) => (
        <div key={g.label} className="mb-4">
          <div className="text-[13px] text-ink3 px-1 mb-1.5">{g.label}</div>
          <div className="card px-4">
            {g.keys.map((k, i) => {
              const mine = customs.find((c) => c.key === k);
              return (
                <button key={k} disabled={!mine} onClick={() => mine && setEdit({ key: k, name: mine.name, icon: mine.icon, prefix: "" })}
                  className={`w-full flex items-center gap-3 py-2.5 text-left ${i ? "border-t border-line" : ""}`}>
                  <span className="text-xl" aria-hidden>{catIcon(k, customs)}</span>
                  <span className="flex-1">{catName(k, customs)}</span>
                  <span className="text-[13px] text-ink3">{mine ? "sua ›" : ""}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {edit && (
        <Sheet open onClose={() => setEdit(null)} title={edit.key ? "Editar categoria" : "Nova categoria"}>
          <label className="block mb-3">
            <span className="block text-[13px] text-ink3 px-1 mb-1">Nome</span>
            <input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Ex.: Uber do trabalho" />
          </label>
          <label className="block mb-3">
            <span className="block text-[13px] text-ink3 px-1 mb-1">Emoji</span>
            <input value={edit.icon} onChange={(e) => setEdit({ ...edit, icon: e.target.value.slice(0, 3) })} className="!w-24 text-[22px]" />
          </label>
          {!edit.key && (
            <div className="mb-4">
              <span className="block text-[13px] text-ink3 px-1 mb-1">Tipo</span>
              <Segmented value={edit.prefix} onChange={(p) => setEdit({ ...edit, prefix: p })}
                options={KINDS.map((k) => ({ value: k.prefix, label: k.label }))} />
            </div>
          )}
          <Button tone="primary" className="w-full" disabled={!edit.name.trim()}
            onClick={() => {
              update((dd) => edit.key
                ? editCategory(dd, edit.key, edit.name.trim(), edit.icon || "🏷️")
                : addCategory(dd, edit.prefix, edit.name.trim(), edit.icon || "🏷️"));
              toast("Categoria salva");
              setEdit(null);
            }}>
            Salvar
          </Button>
          {edit.key && (
            <Button tone="danger" className="w-full mt-2" onClick={() => {
              if (!confirm("Apagar? As transações dela voltam para “Sem categoria”.")) return;
              update((dd) => deleteCategory(dd, edit.key!));
              toast("Categoria apagada");
              setEdit(null);
            }}>
              Apagar categoria
            </Button>
          )}
        </Sheet>
      )}
    </>
  );
}

function Theme() {
  const [t, setT] = useState(() => (typeof localStorage !== "undefined" && localStorage.getItem("theme")) || "system");
  return (
    <Segmented value={t} onChange={(v) => {
      setT(v);
      if (v === "system") { localStorage.removeItem("theme"); delete document.documentElement.dataset.theme; }
      else { localStorage.setItem("theme", v); document.documentElement.dataset.theme = v; }
    }} options={[{ value: "system", label: "Automático" }, { value: "light", label: "Claro" }, { value: "dark", label: "Escuro" }]} />
  );
}

/** Pontos de volta que o app guarda sozinho no aparelho (até 6, um a cada 20 minutos de uso). */
function Anteriores() {
  useData(); // atualiza a lista quando algo muda
  const [tick, setTick] = useState(0);
  const lista = useMemo(() => listSnapshots(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card>
      <p className="text-ink2 mb-2 text-[14px]">
        O app guarda sozinho, neste iPhone, os últimos estados dos seus dados. Se algo der errado, volte a um deles. Isso <b>não</b> substitui o backup em arquivo: some junto se o ícone for apagado.
      </p>
      {lista.length === 0 && <div className="text-ink3 text-[14px]">Ainda não há nenhum. Aparece depois de alguns minutos de uso.</div>}
      <div className="divide-y divide-line">
        {lista.map((x, i) => (
          <div key={x.t} className="flex items-center gap-3 py-2.5">
            <span className="flex-1 min-w-0">
              <span className="block">{new Date(x.t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              <span className="block text-[12px] text-ink3">{x.tx} transações</span>
            </span>
            <Button className="!h-9 !px-3 text-[14px]" onClick={() => {
              if (confirm("Voltar a este estado? O de agora também fica guardado, e dá para desfazer.")) {
                restoreSnapshot(i);
                setTick((n) => n + 1);
                toast("Voltou ao estado anterior");
              }
            }}>Voltar</Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
