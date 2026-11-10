import type { ParsedTransaction, Rule } from "./types";

// Prefixos do extrato que não identificam ninguém. Saem antes de casar regras.
// Mais longos primeiro, senão "PIX ENVIADO" come parte de "PIX ENVIADO PARA".
const NOISE = [
  "RECORRENCIA PIX ENVIADA PARA", "DEVOL RECEBIDA PIX DE", "TRANSFERENCIA RECEBIDA",
  "TRANSFERENCIA ENVIADA", "PAGAMENTO DE BOLETO", "COMPRA NO CREDITO", "COMPRA NO DEBITO",
  "DEBITO DE CARTAO", "PIX RECEBIDO DE", "PIX ENVIADO PARA", "DEVOLUCAO PIX", "ENTRADA PIX",
  "SAIDA PIX", "PIX RECEBIDO", "PIX ENVIADO", "PAGAMENTO",
];

/** Descrição reduzida ao que identifica o estabelecimento/pessoa. */
export function normalize(desc: string): string {
  let s = desc
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\d{2}\/\d{2}(\/\d{2,4})?/g, " ") // datas embutidas
    .replace(/\d{3,}/g, " ") // documentos, códigos
    .replace(/[^A-Z0-9*.& ]/g, " ");
  for (const n of NOISE) s = s.replace(new RegExp("\\b" + n + "\\b", "g"), " ");
  const words = s.replace(/\s+/g, " ").trim().split(" ");
  // tira palavra repetida em sequência e o "BRA/BR" do fim
  const out = words.filter((w, i) => w && w !== words[i - 1]);
  while (out.length > 1 && /^BRA?$/.test(out[out.length - 1])) out.pop();
  return out.join(" ");
}

/** Nome bonito para a lista: "BREAD KING UBERABA" → "Bread King Uberaba". */
export function prettyName(desc: string): string {
  const n = normalize(desc);
  if (!n) return desc;
  return n.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

// Regras genéricas (sem dado pessoal). As suas ficam em Data.rules.
const BUILTIN: [RegExp, string][] = [
  [/PGTO FAT|PAGAMENTO FATURA|FATURA CARTAO|PAG FATURA/, "pay_card"],
  // assinaturas
  [/SPOTIFY|DEEZER/, "fixed_spotify"],
  [/SMARTFIT|SMART FIT|EVOLVE|ACADEMIA|GYMPASS|TOTALPASS/, "fixed_smartfit"],
  [/ANTHROPIC|CLAUDE\.AI|OPENAI|CHATGPT/, "fixed_claude"],
  [/NETFLIX|PRIME ?VIDEO|DISNEY|HBO|\bMAX\b|GLOBOPLAY|PARAMOUNT|CRUNCHYROLL|CINEMARK|KINOPLEX|CINEPOLIS|\bUCI\b/, "fixed_streaming"],
  // guardar
  [/TESOURO|\bXP\b|RICO INVEST|CLEAR|NUINVEST|\bBTG\b|INVESTIMENTO|CORRETORA/, "savings_invest"],
  [/\bCDB\b|RENDA FIXA|APLICACAO|LIM\.?GARANT/, "savings_cdb"],
  // casa e obrigações
  [/NEOENERGIA|\bCEB\b|CAESB|ENEL|COPEL|SANEAGO|SABESP|LIGHT SA|COMGAS|ULTRAGAZ|LIQUIGAS|SUPERGASBRAS|VIVO|CLARO|\bTIM\b|\bOI \b|INTERNET|FIBRA|CONDOMINIO|ALUGUEL/, "var_home"],
  [/LEROY|TELHANORTE|MADEIRA ?MADEIRA|TINTAS|ELETRICISTA|ENCANADOR|MATERIAL DE CONSTR|FERRAGEM/, "var_house_fix"],
  [/IPTU|IPVA|DETRAN|LICENCIAMENTO|RECEITA FEDERAL|\bDARF\b|\bGRU\b|SIMPLES NACIONAL|TRIBUTO|IMPOSTO/, "var_tax"],
  [/SEGURO|PORTO SEGURO|ODONTO|PREVIDENCIA|ASSIST FUNERAL/, "var_insurance"],
  [/TARIFA|ANUIDADE|\bIOF\b|JUROS|PACOTE (PJ|DE SERVICO)|CESTA DE SERVICO/, "var_bank"],
  // estudo e trabalho digital
  [/CEUB|UNICEUB|FACULDADE|UNIVERSIDADE|MENSALIDADE|UDEMY|ALURA|COURSERA|HOTMART|LIVRARIA|SEBO/, "var_education"],
  [/REGISTRO ?\.? ?BR|NIC\.? ?BR\b|GODADDY|HOSTINGER|HOSTGATOR|VERCEL|NETLIFY|CLOUDFLARE|CANVA|FIGMA|ADOBE|NOTION|GITHUB/, "var_digital"],
  // carro e locomoção
  [/POSTO|IPIRANGA|SHELL|PETROBRAS|BR MANIA|COMBUSTIV|PEDAGIO|SEM PARAR|CONECTCAR|VELOE/, "var_fuel"],
  [/MECANIC|AUTO ?PECAS|AUTO ?CENTER|PNEU|LAVA ?JATO|LAVA ?RAPIDO|SOM AUTOMOTIVO|RETIFICA|FUNILARIA/, "var_car"],
  [/UBER|99 ?APP|99 ?POP|BRB MOBILIDA|METRO|CABIFY|BUSER|RODOVIARIA/, "var_transport"],
  // dia a dia
  [/IFOOD|IFD\*|RAPPI|UBER ?EATS|ZE DELIVERY|AIQFOME|DELIVERY/, "var_delivery"],
  [/INGRESS[EO]|BILHETERIA|SYMPLA|TICKET|EVENTIM|ZIG/, "var_show"],
  [/\bBAR\b|BUTEKO|BOTECO|CHEERS|ADEGA|CHOPP|CERVEJ|PUB\b|DISTRIBUIDORA|DIST BEBIDA|BEBIDAS/, "var_bar"],
  [/BARBEAR|BARBER/, "var_barber"],
  [/BOTICARIO|NATURA|AVON|SEPHORA|PERFUM|COSMETIC|SKINCARE|MANICURE|SALAO/, "var_care"],
  [/PAROQUIA|MITRA|IGREJA|DIZIMO|SANTUARIO/, "var_church"],
  [/DROGA|FARMAC|MAXPHARMA|PAGUE MENOS|LABORATORIO|CLINICA|HOSPITAL|DENTISTA|PSICOL/, "var_health"],
  [/\bPETZ\b|COBASI|PETLOVE|VETERINAR|\bRACAO\b|PET ?SHOP|BANHO E TOSA/, "var_pets"],
  [/LATAM|\bGOL \b|\bAZUL \b|BOOKING|AIRBNB|DECOLAR|123 ?MILHAS|HOTEL|POUSADA|HOSTEL/, "var_travel"],
  [/RENNER|\bC ?& ?A\b|RIACHUELO|ZARA|NIKE|ADIDAS|CENTAURO|NETSHOES|ZATTINI|CALCADOS|MODA/, "var_clothes"],
  [/KABUM|PICHAU|TERABYTE|\bAPPLE\b|SAMSUNG|MULTILASER|INFORMATICA|ASSIST ?TEC|CELULAR/, "var_tech"],
  [/FLORICULTURA|PRESENTE|CACAU SHOW|KOPENHAGEN/, "var_gifts"],
  [/MC ?DONA|SUBWAY|BURGER|PIZZA|LANCHE|RESTAURANTE|PADARIA|PANIFICADORA|BREAD|CREPERIA|FRANGO|SORVET|BOLOS|SUPERMERCADO|ATACAD|ACOUGUE|CARNES|HORTIFRUTI|MERCADO(?! ?LIVRE)\b/, "var_food"],
  [/AMAZON|AMERICANAS|MERCADO ?LIVRE|SHOPEE|SHEIN|MAGALU|MARKETPLACE/, "var_shopping"],
];
// Só vale para entrada: devolução de Pix é dinheiro voltando.
const REFUND = /\bDEVOL/;

export interface Classification {
  category: string;
  review: boolean;
}

/** Suas regras primeiro (aprendidas vencem as de fábrica), depois as genéricas. */
export function classify(desc: string, amount: number, rules: Rule[]): Classification {
  const n = normalize(desc);
  const sign = amount >= 0 ? 1 : -1;
  // regra mais específica (padrão mais longo) ganha
  const hit = rules
    .filter((r) => (r.sign === 0 || r.sign === sign) && r.pattern && n.includes(r.pattern))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
  if (hit) return { category: hit.category, review: false };
  if (amount > 0 && REFUND.test(desc.toUpperCase())) return { category: "income_refund", review: false };
  for (const [re, cat] of BUILTIN) if (re.test(n)) return { category: cat, review: false };
  return { category: "uncategorized", review: true };
}

/**
 * Repasse: saída com o mesmo valor (±R$0,10) de uma entrada do mesmo dia ou
 * do dia anterior. Devolve os índices das duas pontas.
 */
export function detectPassthroughs(txs: ParsedTransaction[]): Set<number> {
  const flagged = new Set<number>();
  const day = (d: string) => Date.parse(d + "T00:00:00") / 86400000;
  txs.forEach((out, i) => {
    if (out.amount >= 0) return;
    const j = txs.findIndex(
      (inc, k) =>
        inc.amount > 0 && !flagged.has(k) &&
        Math.abs(day(out.date) - day(inc.date)) <= 1 &&
        Math.abs(-out.amount - inc.amount) <= 0.1
    );
    if (j >= 0) {
      flagged.add(i);
      flagged.add(j);
    }
  });
  return flagged;
}
