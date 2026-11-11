# Órbita

Dinheiro, metas de vida, treino e CDB num app que roda no iPhone (PWA). Os dados ficam só no aparelho (`localStorage`). Não tem servidor nem conta.

## Rodar

```bash
npm install
npm run dev        # http://localhost:3100
npm run check      # testes das contas (dinheiro, CDB, metas, treino)
npm run build      # gera o site estático em out/
```

## Como funciona

- **Next.js 14** com exportação estática. Cada tela é um componente em `components/`; as contas ficam em `lib/` e não dependem da interface.
- **Dados:** um único objeto (`lib/types.ts`) guardado em `localStorage`. O backup em `.json` leva tudo.
- **PDF do banco** é lido no próprio aparelho com pdf.js. Nada é enviado.
- **CDI** do Banco Central é a única coisa que vem da internet automaticamente (só a taxa).
- **Assistente (opcional):** usa a chave do Gemini que você cola no app. A chave fica só no aparelho e fora do backup.
- **Sem dados pessoais no código.** Nome, nascimento, metas e treino entram por um arquivo `.json` importado em Mais > Dados.

## Testes

`checks/selfcheck.ts` cobre o que mexe em dinheiro: importação de extrato e fatura, saldo, CDB (CDI, IR, aplicações e resgates), metas de longo prazo, treino e agenda.

## Publicar

`npm run build` gera `out/`, que é um site estático e pode ir para qualquer hospedagem (Netlify, GitHub Pages, etc.).
