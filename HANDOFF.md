# Órbita: contexto para continuar o trabalho

PWA de finanças, metas de vida, treino e investimentos (Next.js 14 com exportação estática, TypeScript, Tailwind, Recharts). Os dados ficam só no iPhone (`localStorage`). Veja o `README.md` para rodar.

## Regras fixas

- Nenhum dado pessoal no código nem no repositório: senha do PDF, nomes, CPF, nascimento, metas, treino, valores de CDB e de cripto ficam só em arquivos privados do usuário, importados no app em Mais > Dados.
- Só saem do aparelho: o CDI do Banco Central, a pergunta opcional ao Gemini (a chave fica só no aparelho) e a cotação da Coinbase na aba Cripto (só o símbolo da moeda; dá para desligar em Mais).
- Tudo que for novo deve ser personalizável e entrar no backup (o backup é o objeto `Data` inteiro).
- Não fazer deploy manual no Netlify: só `git push origin main`.
- Responder em português, direto e curto, sem travessão retórico, com maiúscula no começo das frases.
- Antes de publicar: `npm run check` (tsc + testes das contas) e `npm run build`.

## Pendências abertas

1. **Importar PDF do extrato trava no iPhone 15 com iOS 27.** No computador o PDF real do e-mail lê em menos de 1 s. Já feito: pdf.js "legacy" em `public/pdfjs-legacy`, leitura sem Web Worker (`globalThis.pdfjsWorker`), limite de 45 s e alerta que mostra a etapa em que parou (`etapaPdf` em `lib/pdf.ts`). Falta o texto do alerta no iPhone. Suspeitas: app aberto pela tela de início, o service worker (`public/sw.js`) interceptando, arquivo ainda no iCloud ou Drive.
2. **Lembretes de água** (arquivo `.ics` para o Calendário): o usuário adicionou, falta confirmar que tocam (30 min antes de cada horário; padrão 11:30, 15:30 e 19:30).
3. **Ler o e-mail automaticamente:** não é possível sem servidor e sem acesso à conta; alternativas já explicadas ao usuário.

## O que já existe

Janelas com animação de abrir e fechar; Distribuição e Metas explicadas no Início; limite do mês que segue o cenário (Teto, Seu ritmo, Econômico); CDB na projeção; treinos agrupados por grupo muscular; treino que guarda exercícios sem série; água; metas semanais de cardio e séries; peso total levantado; aba Investimentos (renda fixa e cripto, com histórico de entradas, preço ao vivo, alvos de lucro e perda); gráficos 3D explicados; contraste no escuro.
