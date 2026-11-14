# AGENTS.md: regras para quem mexe neste projeto

Leia também o `HANDOFF.md` (contexto e pendências) e o `README.md` (como rodar).

## Regra de ouro: todo bug corrigido ganha um teste de regressão

1. Escreva o teste em `checks/selfcheck.ts`, no bloco "regressões" (ou perto do assunto). Ele tem que falhar sem a correção e passar com ela.
2. Rode `npm run check` e confirme que tudo passa.
3. Acrescente uma linha na tabela abaixo: data, o que quebrou, causa e o que o teste protege.
4. Só considere o bug resolvido depois dos três passos acima. Se for impossível automatizar, escreva aqui o motivo.

## Regras do projeto

- Nenhum dado pessoal no código nem no repositório (senha do PDF, nomes, CPF, nascimento, metas, treino, valores de CDB e cripto, locais de gasto). Esses dados ficam só em arquivos privados do usuário, importados no app.
- Só saem do aparelho: o CDI do Banco Central, a pergunta opcional ao Gemini e a cotação da Coinbase (só o símbolo da moeda, ligável em Mais).
- Tudo que for novo é personalizável e entra no backup (o backup é o objeto `Data` inteiro).
- Publicar com `npm run publicar` (GitHub Pages, endereço com prefixo `/rumo`). O Netlify não é mais usado.
- Sem caminhos absolutos para arquivos (`/fonts/...`): usar o prefixo `NEXT_PUBLIC_BASE_PATH`.
- Janelas (`Sheet`) vão para o `<body>` por portal; nunca prender uma janela fixa dentro de um cartão com animação.
- Antes de publicar: `npm run check` e `npm run build`.

## Registro de regressões

| Data | O que quebrou | Causa | Teste (em `checks/selfcheck.ts`) |
|---|---|---|---|
| 2026-11-14 | Fatura do C6 sem total e sem vencimento, e o pagamento da fatura entrava como compra | A fatura atual traz "Data do vencimento: 01 de Novembro" (sem ano), o total como "Pagamento total" e o pagamento como "Inclusao de Pagamento" | "fatura formato atual do C6" |
| 2026-11-14 | Extrato novo não atualizava o saldo da conta e ganhava uma entrada falsa com o valor do saldo | O C6 mudou o formato ("Saldo no dia da exportação" e "15/10/2026 a 14/11/2026 R$ …"); o leitor só conhecia "Saldo do dia •" e leu a linha do período como transação | "extrato formato novo do C6" (saldo, data, sem entrada falsa e limpeza de quem já importou) |
| 2026-11-14 | Janela da senha do PDF aparecia no meio da página e escurecia só um cartão (iPhone) | A janela `fixed` ficava presa ao cartão animado | "Sheet precisa ir para o <body> (portal)" |
| 2026-11-14 | Fonte do app não carregava no GitHub Pages | `url("/fonts/...")` sem o prefixo do endereço | "CSS não pode ter url() absoluta", "a fonte precisa usar o prefixo" |
| 2026-11-14 | Calendário do iPhone não importava os lembretes | `.ics` sem quebra de linha no fim e sem `METHOD` | ".ics termina com CRLF", ".ics com METHOD:PUBLISH" |
| 2026-11-14 | Importar PDF travava para sempre no iPhone | Leitura sem limite de tempo e dependente de Web Worker | "pdfToText precisa ter limite de tempo geral", "leitura sem Web Worker", "o aviso de erro mostra a etapa" |
| 2026-11-14 | Janelas ficavam abertas ou escuras depois do seletor de arquivos | O iOS pausa os temporizadores que fechavam a janela | "Sheet limpa o que sobrou ao voltar do seletor de arquivos" |
| 2026-11-11 | Texto preto nos gráficos no modo escuro | Tooltip do Recharts usa preto sem `itemStyle` | "tooltip dos gráficos usa a cor do tema" |
| 2026-11-13 | Barra de limite do mês não mudava com o cenário (Econômico, Ritmo) | A barra usava só o teto | "teto, ritmo e econômico têm limites diferentes", "Metas e Início leem o mesmo cenário escolhido" |
| 2026-11-12 | Treino salvo perdia os exercícios sem série anotada | `saveWorkout` descartava exercícios sem repetições | "pend" em "água, treino, metas e cripto" e em "regressões" |
| 2026-11-10 | CDI mostrava "sem internet" quando o Banco Central ainda não tinha o dia novo | O 404 do BCB era tratado como falta de internet | "cdi bcb" |
| 2026-11-10 | Saldo e total contavam fatura paga e confundiam o sinal do crédito do pai | Fatura sempre descontada; sinal do pai ambíguo | "saldo e partes", "pai pendente" |
