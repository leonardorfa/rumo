import { execSync } from "node:child_process";
/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
// Carimbo da versão, mostrado em Mais (para saber se o iPhone pegou a nova).
const build = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
// Número da versão = quantas alterações já foram salvas no git (mais 1 se há algo ainda sem salvar).
let versao = "0";
try {
  const n = Number(execSync("git rev-list --count HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim());
  const sujo = execSync("git status --porcelain", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() !== "";
  versao = String(n + (sujo ? 1 : 0));
} catch { /* sem git: fica 0 */ }
export default {
  env: { NEXT_PUBLIC_BUILD: build, NEXT_PUBLIC_VERSION: versao },
  output: "export", // site estático: roda inteiro no iPhone, sem servidor
  basePath,
  images: { unoptimized: true },
};
