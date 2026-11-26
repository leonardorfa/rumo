// "Quanto é isso?": compara o peso levantado com coisas conhecidas. Pesos aproximados, só curiosidade.
import type { Coisa, Data } from "./types";

export const COISAS: Coisa[] = [
  { nome: "gato", plural: "gatos", emoji: "🐈", kg: 4.5 },
  { nome: "cachorro grande", plural: "cachorros grandes", emoji: "🐕", kg: 35 },
  { nome: "panda gigante", plural: "pandas gigantes", emoji: "🐼", kg: 100 },
  { nome: "leão", plural: "leões", emoji: "🦁", kg: 190 },
  { nome: "piano de cauda", plural: "pianos de cauda", emoji: "🎹", kg: 400 },
  { nome: "cavalo", plural: "cavalos", emoji: "🐎", kg: 500 },
  { nome: "vaca", plural: "vacas", emoji: "🐄", kg: 700 },
  { nome: "carro popular", plural: "carros populares", emoji: "🚗", kg: 1000 },
  { nome: "hipopótamo", plural: "hipopótamos", emoji: "🦛", kg: 1500 },
  { nome: "rinoceronte", plural: "rinocerontes", emoji: "🦏", kg: 2300 },
  { nome: "elefante africano", plural: "elefantes africanos", emoji: "🐘", kg: 6000 },
  { nome: "tiranossauro rex", plural: "tiranossauros rex", emoji: "🦖", kg: 8000 },
  { nome: "ônibus", plural: "ônibus", emoji: "🚌", kg: 12000 },
  { nome: "baleia jubarte", plural: "baleias jubarte", emoji: "🐋", kg: 30000 },
  { nome: "avião de passageiros (vazio)", plural: "aviões de passageiros", emoji: "✈️", kg: 41000 },
  { nome: "baleia azul", plural: "baleias azuis", emoji: "🐳", kg: 150000 },
  { nome: "Estátua da Liberdade", plural: "Estátuas da Liberdade", emoji: "🗽", kg: 204000 },
  { nome: "foguete Saturno V (cheio)", plural: "foguetes Saturno V", emoji: "🚀", kg: 2900000 },
];

/** As coisas do app mais as que você criou, da mais leve para a mais pesada. */
export const coisasOf = (d: Data): Coisa[] => [...COISAS, ...(d.fit?.coisas ?? [])].sort((a, b) => a.kg - b.kg);

export const fmtPeso = (kg: number) =>
  kg >= 1000 ? `${(kg / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} t` : `${Math.round(kg).toLocaleString("pt-BR")} kg`;

/** A maior coisa que "cabe" no peso, quantas delas e qual é a próxima. null = ainda não chega na mais leve. */
export function equivalente(coisas: Coisa[], kg: number) {
  let i = -1;
  for (let k = 0; k < coisas.length; k++) if (coisas[k].kg <= kg) i = k;
  const prox = coisas[i + 1] ?? null;
  const falta = prox ? Math.max(0, prox.kg - kg) : 0;
  if (i < 0) return { coisa: null, qtd: 0, frase: "", prox, falta };
  const coisa = coisas[i];
  const qtd = Math.round((kg / coisa.kg) * 10) / 10;
  // em português o plural começa em 2: "1,5 elefante", "2 elefantes"
  const frase = `${qtd.toLocaleString("pt-BR")} ${qtd < 2 ? coisa.nome : coisa.plural}`;
  return { coisa, qtd, frase, prox, falta };
}

export const salvarCoisa = (d: Data, c: Coisa): Data => ({
  ...d, fit: { ...(d.fit ?? { weights: [], days: {}, time: "18:00", routines: [], workouts: [] }), coisas: [...(d.fit?.coisas ?? []).filter((x) => x.nome !== c.nome), c] },
});
export const apagarCoisa = (d: Data, nome: string): Data => ({
  ...d, fit: { ...(d.fit ?? { weights: [], days: {}, time: "18:00", routines: [], workouts: [] }), coisas: (d.fit?.coisas ?? []).filter((x) => x.nome !== nome) },
});
