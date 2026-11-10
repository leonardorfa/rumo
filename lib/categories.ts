/** Categorias de fábrica. As suas ficam em config.customCats. */
export const CATEGORIES = {
  // entradas
  income_salary: "Salário",
  income_fathers: "Entrada do pai",
  income_refund: "Devolução",
  income_other: "Outras entradas",
  // assinaturas e mensalidades
  fixed_spotify: "Spotify",
  fixed_claude: "Claude Pro",
  fixed_smartfit: "Academia",
  fixed_streaming: "Streaming e cinema",
  fixed_recurring: "Pix recorrente",
  // gastos
  var_bar: "Bar e saídas",
  var_show: "Shows e eventos",
  var_barber: "Barbearia",
  var_care: "Cuidados pessoais",
  var_church: "Igreja e doações",
  var_friends: "Transferência p/ amigos",
  var_shopping: "Compras",
  var_clothes: "Roupas e calçados",
  var_tech: "Eletrônicos e informática",
  var_food: "Mercado e comida",
  var_delivery: "Delivery e fast-food",
  var_transport: "Transporte",
  var_fuel: "Combustível e pedágio",
  var_car: "Carro: manutenção",
  var_health: "Saúde e farmácia",
  var_home: "Contas de casa",
  var_house_fix: "Manutenção da casa",
  var_education: "Educação e cursos",
  var_digital: "Domínios e sites",
  var_travel: "Viagens e hospedagem",
  var_pets: "Pets",
  var_gifts: "Presentes e datas",
  var_tax: "Impostos e tributos",
  var_insurance: "Seguros",
  var_bank: "Taxas e anuidades",
  var_emergency: "Imprevistos",
  var_annual: "Despesa anual",
  // guardar
  savings_cdb: "Aplicação CDB",
  savings_invest: "Investimentos",
  // especiais
  pay_card: "Pagamento da fatura",
  passthrough: "Repasse (entra e sai)",
  fathers_expense: "Gasto do pai",
  lend_out: "Emprestei / paguei por alguém",
  income_debt: "Me pagaram de volta",
  uncategorized: "Sem categoria",
} as const;

export type CategoryKey = keyof typeof CATEGORIES;

export const ICONS: Record<CategoryKey, string> = {
  income_salary: "💼", income_fathers: "👨", income_refund: "↩️", income_other: "📥",
  fixed_spotify: "🎧", fixed_claude: "🤖", fixed_smartfit: "🏋️", fixed_streaming: "🎬", fixed_recurring: "🔁",
  var_bar: "🍻", var_show: "🎤", var_barber: "💈", var_care: "🧴", var_church: "⛪",
  var_friends: "🤝", var_shopping: "🛍️", var_clothes: "👕", var_tech: "💻",
  var_food: "🛒", var_delivery: "🛵", var_transport: "🚌", var_fuel: "⛽", var_car: "🔧",
  var_health: "💊", var_home: "🏠", var_house_fix: "🛠️", var_education: "🎓", var_digital: "🌐",
  var_travel: "✈️", var_pets: "🐾", var_gifts: "🎁", var_tax: "🏛️", var_insurance: "🛡️",
  var_bank: "💳", var_emergency: "🚨", var_annual: "📅",
  savings_cdb: "🏦", savings_invest: "📈",
  pay_card: "💳", passthrough: "🔀", fathers_expense: "🧾", lend_out: "🫴", income_debt: "💸", uncategorized: "❔",
};

/** Categoria criada por você. O prefixo da chave define o tipo. */
export interface CustomCat {
  key: string; // var_u123 | income_u123 | fixed_u123 | savings_u123
  name: string;
  icon: string;
}

export type TxType = "income" | "fixed" | "variable" | "savings" | "passthrough" | "fathers" | "receivable";

/** O tipo sai do prefixo da categoria: não existe campo "tipo" para editar. */
export function typeOf(cat: string): TxType {
  if (cat === "income_fathers" || cat === "fathers_expense") return "fathers";
  // dinheiro que vai e volta de alguém que te deve: não é gasto nem renda
  if (cat === "lend_out" || cat === "income_debt") return "receivable";
  // Pagar a fatura não é gasto novo: o gasto são as compras dentro dela.
  if (cat === "passthrough" || cat === "pay_card") return "passthrough";
  if (cat.startsWith("savings_")) return "savings";
  if (cat.startsWith("income_")) return "income";
  if (cat.startsWith("fixed_")) return "fixed";
  return "variable";
}

/** Dinheiro do pai ou repasse: não é seu, não entra nos seus gastos. */
export const isFathers = (cat: string) => {
  const t = typeOf(cat);
  return t === "fathers" || t === "passthrough";
};

export const catName = (key: string, customs: CustomCat[] = []) =>
  CATEGORIES[key as CategoryKey] ?? customs.find((c) => c.key === key)?.name ?? "Sem categoria";

export const catIcon = (key: string, customs: CustomCat[] = []) =>
  ICONS[key as CategoryKey] ?? customs.find((c) => c.key === key)?.icon ?? "❔";

export const KINDS = [
  { prefix: "var_", label: "Saída" },
  { prefix: "income_", label: "Entrada" },
  { prefix: "fixed_", label: "Conta fixa" },
  { prefix: "savings_", label: "Guardar" },
] as const;

const BUILTIN_KEYS = Object.keys(CATEGORIES) as CategoryKey[];

/** Grade do seletor: de fábrica + as suas, agrupadas por tipo. */
export function pickerGroups(customs: CustomCat[] = []) {
  const all = [...BUILTIN_KEYS.map(String), ...customs.map((c) => c.key)];
  const by = (p: string) => all.filter((k) => k.startsWith(p) && k !== "income_fathers");
  return [
    { label: "Gastos", keys: by("var_") },
    { label: "Contas fixas", keys: by("fixed_") },
    { label: "Entradas", keys: by("income_") },
    { label: "Guardar", keys: by("savings_") },
    { label: "Do pai", keys: ["income_fathers", "fathers_expense", "passthrough"] },
    { label: "A receber", keys: ["lend_out", "income_debt"] },
    { label: "Cartão", keys: ["pay_card"] },
    { label: "Outros", keys: ["uncategorized"] },
  ].filter((g) => g.keys.length);
}

export const allCategoryKeys = (customs: CustomCat[] = []) => [
  ...BUILTIN_KEYS.map(String),
  ...customs.map((c) => c.key),
];
