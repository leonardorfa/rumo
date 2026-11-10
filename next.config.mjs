/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
// Carimbo da versão, mostrado em Mais (para saber se o iPhone pegou a nova).
const build = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
export default {
  env: { NEXT_PUBLIC_BUILD: build },
  output: "export", // site estático: roda inteiro no iPhone, sem servidor
  basePath,
  images: { unoptimized: true },
};
