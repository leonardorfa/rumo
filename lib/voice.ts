// Entende frases como "gastei 50 reais em sorvete" sem IA: número, verbo e
// palavras-chave. O que você corrige vira regra e da próxima vez ele acerta.
import { type CustomCat } from "./categories";
import { classify, normalize } from "./classifier";
import { localDay } from "./format";
import type { Rule } from "./types";

export interface Fala {
  amount: number; // negativo = saída
  description: string;
  category: string | null; // null = não entendeu, você escolhe
  date: string;
  parcelas?: { n: number; total: number; parcela: number }; // "em 12 vezes"
  receber?: { tipo: "deve" | "emprestei" | "pagou"; person: string }; // alguém te deve / te pagou
}

const tira = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Palavra (sem acento, minúscula) → categoria. A primeira que aparecer na frase ganha.
const PALAVRAS: [RegExp, string][] = [
  [/\b(ifood|delivery|mc ?donalds?|mequi|burger king|bk|subway|hamburguer|hamburger|fast ?food|rappi)\b/, "var_delivery"],
  [/\b(sorvete|acai|lanche|lanchei|almoco|almocei|janta|jantar|jantei|comida|comi|mercado|supermercado|padaria|pao|cafe|pizza|salgado|doce|chocolate|fruta|feira|restaurante|marmita|sushi|churrasco|refri|refrigerante|agua|pastel|coxinha|esfirra|picole|bolo|biscoito|bolacha)\b/, "var_food"],
  [/\b(cerveja|breja|bar|chopp?|drink|drinks|balada|role|bebida|festa|boteco|pinga|vodka|whisky)\b/, "var_bar"],
  [/\b(show|ingresso|evento|festival|cinema|teatro|jogo do)\b/, "var_show"],
  [/\b(uber|99|onibus|metro|taxi|corrida|passagem de onibus|brt)\b/, "var_transport"],
  [/\b(gasolina|combustivel|etanol|posto|pedagio|abasteci)\b/, "var_fuel"],
  [/\b(oficina|mecanico|pneu|lava ?jato|revisao do carro|oleo do carro)\b/, "var_car"],
  [/\b(farmacia|remedio|medico|consulta|dentista|exame|hospital|drogaria)\b/, "var_health"],
  [/\b(barbeiro|barbearia|cabelo|corte|barba)\b/, "var_barber"],
  [/\b(perfume|shampoo|creme|skincare|desodorante|sabonete)\b/, "var_care"],
  [/\b(igreja|dizimo|oferta|doacao|doei)\b/, "var_church"],
  [/\b(roupa|camisa|camiseta|tenis|calca|bermuda|sapato|bone|jaqueta|moletom|chinelo)\b/, "var_clothes"],
  [/\b(celular|fone|carregador|computador|notebook|mouse|teclado|cabo|eletronico|monitor|videogame)\b/, "var_tech"],
  [/\b(presente|aniversario)\b/, "var_gifts"],
  [/\b(curso|livro|faculdade|apostila|escola|mensalidade da faculdade)\b/, "var_education"],
  [/\b(viagem|hotel|airbnb|voo|passagem aerea|hospedagem)\b/, "var_travel"],
  [/\b(racao|pet|veterinario|cachorro|gato)\b/, "var_pets"],
  [/\b(luz|energia|internet|aluguel|gas|condominio)\b/, "var_home"],
  [/\b(tarifa|anuidade|juros)\b/, "var_bank"],
  [/\b(imposto|ipva|iptu|multa|darf)\b/, "var_tax"],
  [/\b(dominio|site)\b/, "var_digital"],
  [/\b(amigo|amiga|emprestei)\b/, "var_friends"],
  [/\b(compra|comprei|shopping|loja|amazon|shopee|mercado livre|shein)\b/, "var_shopping"],
];

const ENTRADA = /\b(recebi|ganhei|entrou|caiu|me pagou|me pagaram|me mandou|me passou|me devolveu|devolveram|vendi)\b/;
const GUARDEI = /\b(apliquei|guardei|investi)\b/;
const PAI = /\b(meu pai|do pai|pro pai|pra meu pai|para o meu pai|para meu pai|pro meu pai)\b/;

/** "50", "50,90", "R$ 1.250,00", "50 reais e 90 centavos", "1,5 mil", "2 mil". */
function valor(t: string): { v: number; resto: string } | null {
  let m = t.match(/(\d+(?:[.,]\d+)?)\s*mil\b/);
  if (m) return { v: parseFloat(m[1].replace(",", ".")) * 1000, resto: t.replace(m[0], " ") };
  m = t.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?(?:\s*(?:reais|real|conto|pila|contos))?(?:\s*e\s*(\d{1,2})\s*centavos?)?/);
  if (!m) return null;
  const inteiro = parseInt(m[1].replace(/\./g, ""), 10);
  const cent = m[2] ? parseInt(m[2].padEnd(2, "0"), 10) : m[3] ? parseInt(m[3], 10) : 0;
  return { v: inteiro + cent / 100, resto: t.replace(m[0], " ") };
}

export function parseFala(texto: string, rules: Rule[], customs: CustomCat[] = [], hoje = new Date(), devedores: string[] = []): Fala | null {
  let t = tira(texto);
  // "em 12 vezes", "12x", "parcelado em 10": tira antes, senão o 12 vira o valor
  const pm = t.match(/(?:em\s+)?(\d{1,2})\s*(?:x\b|vezes|parcelas)/) || t.match(/parcelad[oa]\s+em\s+(\d{1,2})/);
  const nParc = pm ? parseInt(pm[1], 10) : 0;
  if (pm) t = t.replace(pm[0], " ");
  const porParcela = nParc > 1 && /\b(parcela de|parcelas de|por mes|cada)\b/.test(t);
  const val = valor(t);
  if (!val || !val.v) return null;

  const entrada = ENTRADA.test(t);
  const pai = PAI.test(t);
  const amount = entrada ? val.v : -val.v;

  const dia = new Date(hoje);
  if (/\banteontem\b/.test(t)) dia.setDate(dia.getDate() - 2);
  else if (/\bontem\b/.test(t)) dia.setDate(dia.getDate() - 1);

  // descrição = o que sobra depois de tirar verbo, valor, data e conectivos
  let desc = val.resto
    .replace(/\b(parcelado|parcelada|parcela de|parcelas de|por mes|cada|gastei|paguei|comprei|recebi|ganhei|entrou|caiu|apliquei|guardei|investi|vendi|me pagou|me pagaram|me mandou|me passou|me devolveu|devolveram|foi|deu|uns|umas|reais|real|conto|contos|pila|hoje|ontem|anteontem|r\$)\b/g, " ")
    .replace(PAI, " ")
    .replace(/^\s*(em|no|na|nos|nas|de|do|da|com|pra|pro|para|por|um|uma|o|a)\b\s*/g, "")
    .replace(/\s+(em|no|na|de|do|da|com|pra|pro|para)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  while (/^(em|no|na|nos|nas|de|do|da|com|pra|pro|para|por|um|uma|o|a)\s/.test(desc)) desc = desc.replace(/^\S+\s/, "");
  // devolve os acentos: cada palavra volta como foi dita ("remedio" → "remédio")
  const ditas = texto.toLowerCase().split(/[^\p{L}\d]+/u);
  desc = desc.split(" ").map((w) => ditas.find((x) => tira(x) === w) ?? w).join(" ");
  const description = desc ? desc[0].toUpperCase() + desc.slice(1) : entrada ? "Entrada" : "Gasto";

  // ---- quem te deve: "o joão me deve 50 da pizza", "emprestei 100 pro joão", "o joão me pagou 50" ----
  const nome = (w: string) => {
    const o = ditas.find((x) => tira(x) === w) ?? w;
    return o[0].toUpperCase() + o.slice(1);
  };
  const sobre = (w: string) => {
    let s = desc.split(" ").filter((x) => x && tira(x) !== w && !["me", "deve", "devendo", "ta", "esta", "emprestei"].includes(tira(x)));
    while (s.length && ["o", "a", "de", "do", "da", "pelo", "pela", "por", "referente", "ao", "pro", "pra", "para"].includes(tira(s[0]))) s = s.slice(1);
    const j = s.join(" ");
    return j ? j[0].toUpperCase() + j.slice(1) : "";
  };
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const dataIso = localDay(dia);
  const deve = val.resto.match(/(?:^|\s)([a-z]+)\s+(?:ta\s+|esta\s+)?(?:me deve|me devendo)\b/);
  if (deve && !["ele", "ela", "voce"].includes(deve[1])) {
    return { amount: r2(val.v), description: sobre(deve[1]), category: null, date: dataIso, receber: { tipo: "deve", person: nome(deve[1]) } };
  }
  if (/\bemprestei\b/.test(t)) {
    const p = val.resto.match(/\b(?:pro|pra|para|ao|a)\s+(?:o\s+|a\s+)?([a-z]+)/);
    if (p) return { amount: r2(val.v), description: sobre(p[1]) || "Empréstimo", category: "lend_out", date: dataIso, receber: { tipo: "emprestei", person: nome(p[1]) } };
  }
  if (entrada) {
    const quem = devedores.find((n) => new RegExp(`\\b${tira(n)}\\b`).test(t));
    if (quem) return { amount: r2(val.v), description: `${quem} pagou`, category: "income_debt", date: dataIso, receber: { tipo: "pagou", person: quem } };
  }

  let category: string | null = null;
  if (pai) category = entrada ? "income_fathers" : "fathers_expense";
  else if (GUARDEI.test(t)) category = "savings_cdb";
  else {
    // 1º o que o app já aprendeu com você e as regras de loja; 2º as palavras
    const c = classify(desc || texto, amount, rules);
    if (!c.review) category = c.category;
    if (!category) {
      const sua = customs.find((x) => {
        const n = tira(x.name);
        return n.length > 2 && t.includes(n);
      });
      if (sua && (entrada ? sua.key.startsWith("income_") : !sua.key.startsWith("income_"))) category = sua.key;
    }
    if (!category && entrada) category = /\bsalario\b/.test(t) ? "income_salary" : /devol|reembols|estorn/.test(t) ? "income_refund" : "income_other";
    if (!category) category = PALAVRAS.find(([re]) => re.test(val.resto))?.[1] ?? null; // sem o valor: "99 reais" não vira Uber 99
  }

  if (nParc > 1 && !entrada) {
    const parcela = porParcela ? val.v : val.v / nParc;
    return { amount: -r2(parcela), description: description.replace(/^(Parcela de|Parcelas de|Cada|Por mes)\s*/i, "") || "Compra parcelada", category, date: localDay(dia),
      parcelas: { n: nParc, total: r2(parcela * nParc), parcela: r2(parcela) } };
  }
  return { amount: r2(amount), description, category, date: localDay(dia) };
}

/** Você corrigiu a categoria: grava a regra pela descrição, como no extrato. */
export const learnFromFala = (rules: Rule[], description: string, amount: number, category: string): Rule[] => {
  const pattern = normalize(description);
  if (!pattern) return rules;
  const sign: 1 | -1 = amount >= 0 ? 1 : -1;
  return [...rules.filter((r) => !(r.pattern === pattern && r.sign === sign)), { pattern, category, sign, learned: true }];
};

/** Reconhecimento de voz do próprio iPhone, quando o navegador deixa usar. */
export function falarDisponivel() {
  return typeof window !== "undefined" && !!((window as never as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition ||
    (window as never as { SpeechRecognition?: unknown }).SpeechRecognition);
}

export function ouvir(onTexto: (t: string) => void, onFim: (erro?: string) => void) {
  const W = window as never as Record<string, new () => {
    lang: string; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void;
    onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
    onerror: (e: { error: string }) => void; onend: () => void;
  }>;
  const R = W.SpeechRecognition || W.webkitSpeechRecognition;
  const r = new R();
  r.lang = "pt-BR";
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onresult = (e) => onTexto(e.results[0][0].transcript);
  r.onerror = (e) => onFim(e.error);
  r.onend = () => onFim();
  r.start();
  return () => r.stop();
}
