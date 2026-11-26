// As cores que você escolhe para o dinheiro: o seu, o que te devem e o do seu pai.
import type { Prefs } from "./types";

export type QuemCor = "meu" | "devem" | "pai";
export const QUEM: { k: QuemCor; nome: string; padrao: string }[] = [
  { k: "meu", nome: "Seu dinheiro", padrao: "var(--meu)" },
  { k: "devem", nome: "Quem te deve", padrao: "var(--s3)" },
  { k: "pai", nome: "Seu pai", padrao: "var(--pai)" },
];
export const PALETA = ["#4f8cff", "#22d3ee", "#2de2b3", "#84cc16", "#f5c14e", "#ff8a4c", "#ff6b7a", "#f472b6", "#a78bfa", "#e2e8f0"];
const valida = (c?: string) => !!c && /^#[0-9a-f]{6}$/i.test(c);

/** Variáveis de CSS a aplicar. Sem escolha (ou com valor inválido) vale o padrão do tema. */
export function coresVars(cores: Prefs["cores"]): Record<string, string | null> {
  const v = (k: QuemCor) => (valida(cores?.[k]) ? cores![k]! : null);
  return { "--barra-meu": v("meu"), "--barra-devem": v("devem"), "--barra-pai": v("pai"), "--pai": v("pai") };
}

export interface Fatia { k: "meu" | "pai" | "paiDeve" | "devem"; rotulo: string; valor: number; quem: QuemCor }

/** A barra do dinheiro: o que na conta é seu, o que é do pai e o que ainda vão te pagar. */
export function fatiasDoDinheiro(conta: number, pai: number, pessoas: number): Fatia[] {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const lista: Fatia[] = [
    { k: "meu", rotulo: "Seu", valor: r2(Math.max(0, conta - Math.max(0, pai))), quem: "meu" },
    { k: "pai", rotulo: "Do pai", valor: r2(Math.max(0, pai)), quem: "pai" },
    { k: "paiDeve", rotulo: "Pai te deve", valor: r2(Math.max(0, -pai)), quem: "pai" },
    { k: "devem", rotulo: "Te devem", valor: r2(Math.max(0, pessoas)), quem: "devem" },
  ];
  return lista.filter((f) => f.valor > 0 || f.k === "meu");
}
