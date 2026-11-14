// npm run check — falha alto se a lógica de dinheiro quebrar.
import assert from "assert";
import { parseStatementText } from "../lib/text-parser";
import { classify, normalize, prettyName } from "../lib/classifier";
import { parseInvoiceText } from "../lib/invoice";
import { typeOf } from "../lib/categories";
import { forecast30, netWorthHistory, priceChanges, recurringSuggestions, safeToSpend, savingsRate, categoryTable } from "../lib/insights";
import { toCsv } from "../lib/backup";
import { addParcelamento, billActive, cdbNet, irRate, parcela, projectionInput, rendaFixaNow } from "../lib/store";
import { DEFAULT_CONFIG, addManual, deleteTx, editManual, splitTx, envelopeBudgets, fatherBalance, fatherMove, fatherSet, importInvoice, importParsed, myMoney, parseBackup, recategorize, resetEnvelopes, setEnvelopeAmount, toggleBillPaid } from "../lib/store";
import type { Data } from "../lib/types";

// Trecho no formato do PDF do C6 (nomes inventados).
const C6 = `Período • 11 de dezembro de 2025 até 10 de janeiro de 2026
Saldo do dia • 10 de janeiro de 2026 • R$ 6.684,70
Dezembro 2025 ( 11/12/2025 - 31/12/2025 ) Entradas: R$ 5.195,00 • Saídas: R$ 2.620,14
Data Data
lançamento contábil Tipo Descrição Valor
11/12 11/12 Saída PIX Pix enviado para ACADEMIA X -R$ 303,07
Saldo do dia 11/12/25 R$ 6.981,93
12/12 12/12 Entrada PIX Pix recebido de FULANO PAI R$ 3.000,00
16/12 18/12 Débito de Cartão EBN*SPOTIFY CURITIBA BRA -R$ 40,90
20/12 20/12 Saída PIX Pix enviado para AMIGA Y -R$ 360,00
20/12 20/12 Devolução PIX Devol recebida pix de AMIGA Y R$ 360,00
Janeiro 2026 ( 01/01/2026 - 10/01/2026 ) Entradas: R$ 0,00 • Saídas: R$ 155,00
05/01 05/01 Débito de Cartão BAR DO ZE BRASILIA BRA -R$ 85,00
06/01 06/01 Débito de Cartão LOJA NOVA LTDA BRASILIA BRA -R$ 50,00
07/01 07/01 Débito de Cartão LOJA NOVA LTDA BRASILIA BRA -R$ 20,00`;

const p = parseStatementText(C6);
assert.equal(p.closingBalance, 6684.7, "saldo do dia do cabeçalho");
assert.equal(p.statementDate, "2026-01-10", "data do fim do período");
assert.equal(p.transactions.length, 8, "resumo e saldos diários não viram transação");
assert.equal(p.transactions[0].date, "2025-12-11", "dezembro fica no ano anterior ao fim do período");
assert.equal(p.transactions[5].date, "2026-01-05");
assert.equal(p.transactions[0].amount, -303.07);
assert.equal(p.transactions[1].amount, 3000);
assert.ok(!/\d{2}\/\d{2}/.test(p.transactions[2].description), "segunda data some da descrição");

assert.equal(normalize("16/12 Débito de Cartão EBN*SPOTIFY CURITIBA BRA"), "EBN*SPOTIFY CURITIBA");
assert.equal(prettyName("Débito de Cartão BREAD KING UBERABA UBERABA BRA"), "Bread King Uberaba");
assert.equal(classify("Pix enviado para PAROQUIA SAO JOSE", -9, []).category, "var_church");
assert.equal(classify("Devol recebida pix de AMIGA", 360, []).category, "income_refund");
const pai = { pattern: "FULANO PAI", category: "income_fathers", sign: 1 as const };
assert.equal(classify("Pix recebido de FULANO PAI", 3000, [pai]).category, "income_fathers");
assert.equal(classify("Pix enviado para FULANO PAI", -10, [pai]).review, true, "regra respeita o sinal");

// Importação: saldo do dia vira o saldo da conta; reimportar não duplica.
let d: Data = { version: 1, txs: [], father: [], rules: [pai], config: { ...DEFAULT_CONFIG }, lastBackup: null };
let r = importParsed(d, p.transactions, p.closingBalance, p.statementDate);
d = r.data;
assert.equal(d.config.accountBalance, 6684.7);
assert.equal(d.config.balanceDate, "2026-01-10");
// Extrato mais antigo não rebaixa o saldo mais novo.
const old = importParsed(d, [{ date: "2025-11-03", description: "Pix enviado para X", amount: -10 }], 100, "2025-11-05");
assert.equal(old.data.config.accountBalance, 6684.7, "extrato antigo não sobrescreve saldo");
assert.equal(old.stats.closingApplied, false);
assert.equal(old.stats.imported, 1, "mas entra como histórico");
assert.equal(r.stats.imported, 8);
assert.equal(d.txs.find((t) => t.amount === 3000)!.category, "income_fathers");
assert.equal(d.txs.filter((t) => t.category === "passthrough").length, 2, "360 enviado e devolvido = repasse");
r = importParsed(d, parseStatementText(C6).transactions, null);
assert.equal(r.stats.imported, 0, "reimportar o mesmo extrato não duplica");

// Autodidata: corrigir uma aplica nas iguais e vale para a próxima.
const loja = d.txs.find((t) => t.amount === -50)!;
const rc = recategorize(d, loja.id, "var_shopping", true);
assert.equal(rc.applied, 1, "aplicou na outra compra da mesma loja");
assert.equal(classify("08/01 Débito de Cartão LOJA NOVA LTDA BRASILIA BRA", -9, rc.data.rules).category, "var_shopping");

// Crédito do pai negativo soma ao meu dinheiro.
d = { ...d, config: { ...d.config, accountBalance: 1000, rendaFixa: 500 } };
d = fatherSet(d, 300);
assert.equal(myMoney(d), 1000 - 300 + 500);
d = fatherMove(d, -800, "Usei em nome dele");
assert.equal(myMoney(d), 1000 + 500 + 500, "pai deve 500: soma");

// Senha do PDF no backup volta à parte e não fica dentro dos dados.
const b = parseBackup(JSON.stringify({ ...d, pdfPassword: "123" }));
assert.equal(b.pdfPassword, "123");
assert.ok(!("pdfPassword" in b.data), "senha não entra nos dados nem em backups futuros");

// ---- fatura do cartão ----
const FATURA = `Fatura do cartão C6
Vencimento 10/10/2026
Total da fatura R$ 1.234,56
Limite disponível R$ 3.000,00
Data Descrição Valor
12 SET UBER *TRIP SAO PAULO R$ 24,50
15/09 IFD*IFOOD R$ 38,90
18 SET AMAZON BR 3/10 R$ 120,00
20 SET ESTORNO COMPRA -R$ 10,00
PAGAMENTO RECEBIDO -R$ 500,00`;
const inv = parseInvoiceText(FATURA);
assert.equal(inv.dueDate, "2026-10-10", "vencimento");
assert.equal(inv.total, 1234.56, "total da fatura");
assert.equal(inv.purchases.length, 4, "resumo e pagamento recebido não são compra");
assert.equal(inv.purchases[0].date, "2026-09-12", "data 12 SET");
assert.equal(inv.purchases[0].amount, -24.5, "compra é saída");
assert.equal(inv.purchases[2].installment, "3/10", "parcela lida");
assert.equal(inv.purchases[3].amount, 10, "estorno é entrada");

// Compras da fatura entram sem mexer no saldo da conta.
const antes = d.config.accountBalance;
const inv2 = importInvoice(d, inv.purchases);
assert.equal(inv2.data.config.accountBalance, antes, "fatura não mexe no saldo");
assert.equal(inv2.imported, 4);
assert.ok(inv2.data.txs.every((t) => !t.card || t.amount !== 0));
assert.equal(importInvoice(inv2.data, inv.purchases).imported, 0, "reimportar fatura não duplica");
// Pagar a fatura não conta como gasto novo (senão contava duas vezes).
assert.equal(classify("PGTO FAT CARTAO C6", -1234.56, []).category, "pay_card");
assert.equal(typeOf("pay_card"), "passthrough");

// ---- envelopes ----
let e = inv2.data;
const teto = 600;
assert.equal(Object.values(envelopeBudgets(e, "2026-09", teto)).reduce((a, b) => a + b, 0), 600, "fatias somam o teto");
e = setEnvelopeAmount(e, "2026-09", "shows", 0, teto);
e = setEnvelopeAmount(e, "2026-09", "bar", 312, teto);
assert.equal(envelopeBudgets(e, "2026-09", teto).shows, 0, "tirou tudo de shows");
assert.equal(envelopeBudgets(e, "2026-09", teto).bar, 312, "e pôs em bar");
assert.equal(envelopeBudgets(e, "2026-10", teto).shows, Math.round(600 * 0.16), "outro mês fica no padrão");
e = resetEnvelopes(e, "2026-09");
assert.equal(envelopeBudgets(e, "2026-09", teto).shows, Math.round(600 * 0.16), "voltou ao padrão");

// ---- conta fixa marcada na mão ----
e = toggleBillPaid(e, "2026-09", "spotify");
assert.deepEqual(e.config.billsPaid["2026-09"], ["spotify"]);
e = toggleBillPaid(e, "2026-09", "spotify");
assert.deepEqual(e.config.billsPaid["2026-09"], [], "desmarca também");

// ---- gasto do pai desconta do crédito dele sozinho ----
let f: Data = { version: 1, txs: [], father: [], rules: [], lastBackup: null,
  config: { ...DEFAULT_CONFIG, accountBalance: 1000, fatherCreditStart: 0 } };
f = fatherSet(f, 300, "Pai me passou");
const meuAntes = myMoney(f);
f = addManual(f, { date: "2026-09-10", description: "Boleto do pai", amount: -200, category: "fathers_expense" });
assert.equal(fatherBalance(f), 100, "gasto do pai sai do crédito dele");
assert.equal(f.config.accountBalance, 800, "e sai da conta");
assert.equal(myMoney(f), meuAntes, "meu dinheiro não muda: era dinheiro dele");

// sem crédito sobrando, o pai passa a dever (crédito meu)
f = addManual(f, { date: "2026-09-11", description: "Outro boleto do pai", amount: -500, category: "fathers_expense" });
assert.equal(fatherBalance(f), -400, "estourou o crédito: ele fica devendo");
assert.equal(myMoney(f), meuAntes, "o que ele deve continua sendo meu");

// entrada do pai soma ao crédito
f = addManual(f, { date: "2026-09-12", description: "Pix do pai", amount: 1000, category: "income_fathers" });
assert.equal(fatherBalance(f), 600, "entrada do pai vira crédito dele");
assert.equal(myMoney(f), meuAntes, "entrada dele não é minha");

// apagar o lançamento desfaz o crédito
const alvo = f.txs.find((t) => t.description === "Pix do pai")!;
f = deleteTx(f, alvo.id);
assert.equal(fatherBalance(f), -400, "apagou o lançamento, sumiu do crédito");

// reclassificar para gasto do pai também mexe no crédito, e voltar atrás desfaz
f = addManual(f, { date: "2026-09-13", description: "Mercado", amount: -100, category: "var_market" });
const mercado = f.txs.find((t) => t.description === "Mercado")!;
f = recategorize(f, mercado.id, "fathers_expense", false).data;
assert.equal(fatherBalance(f), -500, "virou gasto do pai");
f = recategorize(f, mercado.id, "var_market", false).data;
assert.equal(fatherBalance(f), -400, "voltou a ser meu");
assert.equal(f.father.filter((e) => e.txId === mercado.id).length, 0, "não sobra lançamento órfão");

// compra na fatura não mexe no crédito (quem debita é o pagamento da fatura)
const fCard = importInvoice(f, [{ date: "2026-09-14", description: "Farmácia do pai", amount: -90 }]).data;
assert.equal(fatherBalance(fCard), -400, "compra no cartão fica fora do crédito");

// ---- apagar lançamento manual devolve o dinheiro; editar corrige ----
let g: Data = { version: 1, txs: [], father: [], rules: [], lastBackup: null,
  config: { ...DEFAULT_CONFIG, accountBalance: 1000, bills: [], fatherCreditStart: 0 } };
g = addManual(g, { date: "2026-09-10", description: "Almoço", amount: -50, category: "var_food" });
assert.equal(g.config.accountBalance, 950);
g = editManual(g, g.txs[0].id, { date: "2026-09-10", description: "Almoço", amount: -80, category: "var_food", note: "com a galera" });
assert.equal(g.config.accountBalance, 920, "editar troca o valor sem contar duas vezes");
assert.equal(g.txs.length, 1);
assert.equal(g.txs[0].note, "com a galera");
g = deleteTx(g, g.txs[0].id);
assert.equal(g.config.accountBalance, 1000, "apagar devolve o dinheiro");

// ---- dividir: parte minha, parte do pai ----
let h = importParsed(g, [{ date: "2026-09-12", description: "Pix enviado para LOJA X", amount: -300 }], null).data;
const orig = h.txs.find((t) => t.amount === -300)!;
const saldoAntes = h.config.accountBalance;
h = splitTx(h, orig.id, [{ amount: -100, category: "var_shopping" }, { amount: -200, category: "fathers_expense" }]);
assert.equal(h.txs.filter((t) => t.splitFrom).length, 2, "virou dois pedaços");
assert.equal(h.config.accountBalance, saldoAntes, "dividir não mexe no saldo");
assert.equal(fatherBalance(h), -200, "a parte do pai foi para o crédito dele");
assert.throws(() => splitTx(h, h.txs[0].id, [{ amount: -1, category: "var_food" }, { amount: -1, category: "var_food" }]), "pedaços têm que somar o total");
const reimport = importParsed(h, [{ date: "2026-09-12", description: "Pix enviado para LOJA X", amount: -300 }], null);
assert.equal(reimport.stats.imported, 0, "o extrato não traz a original de volta");

// ---- dá para gastar: o menor entre teto e conta ----
const hoje = new Date(2026, 8, 20);
let s1: Data = { ...g, txs: [], config: { ...g.config, accountBalance: 300, bills: [{ id: "x", name: "Academia", amount: 100, match: "ACADEMIA", atSource: false }] } };
let st = safeToSpend(s1, 800, hoje);
assert.equal(st.livre, 200, "teto 800, mas na conta só 300 − 100 da academia");
assert.ok(st.pelaConta);
s1 = { ...s1, config: { ...s1.config, accountBalance: 5000 } };
st = safeToSpend(s1, 800, hoje);
assert.equal(st.livre, 800, "com dinheiro sobrando, manda o teto");
assert.equal(st.dias, 11);

// ---- recorrência ----
const tx = (date: string, description: string, amount: number, category = "var_shopping") =>
  ({ id: date + description, date, description, amount, category, review: false });
let rr: Data = { ...g, txs: [
  tx("2026-07-08", "NETFLIX.COM", -39.9), tx("2026-08-08", "NETFLIX.COM", -39.9), tx("2026-09-08", "NETFLIX.COM", -44.9),
  ...[1, 8, 15, 22].flatMap((dd) => ["07", "08"].map((m) => tx(`2026-${m}-${String(dd).padStart(2, "0")}`, "UBER TRIP", -18))),
  tx("2026-09-05", "RESTAURANTE Y", -80),
], config: { ...g.config, bills: [] } };
const rec = recurringSuggestions(rr, "2026-09");
assert.deepEqual(rec.map((x) => x.name), ["Netflix.com"], "Netflix sim, Uber semanal e gasto único não");
assert.equal(rec[0].amount, 44.9, "sugere o valor mais recente");
rr = { ...rr, config: { ...rr.config, bills: [{ id: "n", name: "Netflix", amount: 39.9, match: "NETFLIX", atSource: false }] } };
assert.equal(recurringSuggestions(rr, "2026-09").length, 0, "já é conta fixa: não sugere");
assert.deepEqual(priceChanges(rr, "2026-09").map((p) => p.novo), [44.9], "avisa que a Netflix subiu");

// ---- próximos 30 dias ----
let fc: Data = { ...g, txs: [tx("2026-08-05", "SALARIO", 2270, "income_salary")],
  config: { ...g.config, accountBalance: 1000, salary: 2270, specialExpenses: [], bills: [{ id: "n", name: "Netflix", amount: 40, match: "NETFLIX", atSource: false }] } };
const f30 = forecast30(fc, 0, hoje);
assert.equal(f30.points.length, 31);
assert.equal(f30.points[0].value, 1000, "começa no que é seu hoje");
assert.deepEqual(f30.events.map((e) => [e.date, e.label]), [["2026-10-05", "Salário"], ["2026-10-10", "Netflix"]], "salário dia 5, conta dia 10");
assert.equal(f30.points[30].value, 1000 + 2270 - 40, "com teto zero, só entram salário e conta");

// ---- categorias, patrimônio, poupança, planilha ----
const ct = categoryTable([tx("2026-09-02", "A", -50, "var_bar"), tx("2026-08-02", "B", -20, "var_bar")], "2026-09");
assert.deepEqual(ct, [{ key: "var_bar", value: 50, prev: 20 }]);
const nw = netWorthHistory(fc, 3, hoje);
assert.equal(nw[nw.length - 1].value, Math.round(myMoney(fc)), "o último ponto é o de hoje");
assert.equal(nw[0].value, Math.round(myMoney(fc)), "sem nada depois de julho, julho = hoje");
assert.equal(savingsRate([tx("2026-09-05", "S", 2000, "income_salary"), tx("2026-09-06", "B", -500, "var_bar")], "2026-09").pct, 75);
assert.ok(toCsv(h).split("\n")[1].startsWith("12/09/2026;"), "planilha em dd/mm/aaaa");

function localIso(base: Date, deltaDays: number) {
  const x = new Date(base.getFullYear(), base.getMonth(), base.getDate() + deltaDays);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

// ---- CDB: CDI real do Banco Central + IR regressivo ----
let c: Data = { ...g, config: { ...g.config, accountBalance: 0, rendaFixa: 10000, rendaFixaDate: "2026-09-18",
  cdb: { pctCdi: 100, cdiAnnual: 13.65, principal: 10000, since: localIso(new Date(2026, 8, 24), -100) },
  cdiDaily: { "2026-09-21": 0.05, "2026-09-22": 0.05 } } };
const qui = new Date(2026, 8, 24, 10);
// seg e ter com a taxa do BC; qua (23) ainda sem taxa publicada usa a última; hoje (24) não conta
assert.equal(rendaFixaNow(c, qui), Math.round(10000 * 1.0005 ** 3 * 100) / 100, "CDI real + último conhecido");
assert.equal(rendaFixaNow(c, new Date(2026, 8, 19, 10)), 10000, "no dia seguinte à conferência (sábado) ainda não rendeu");
assert.deepEqual([180, 181, 360, 361, 720, 721].map(irRate), [22.5, 20, 20, 17.5, 17.5, 15], "tabela do IR");
const net = cdbNet(c, qui);
assert.equal(net.aliquota, 22.5, "100 dias: 22,5%");
assert.equal(net.ir, Math.round((net.bruto - 10000) * 0.225 * 100) / 100, "IR só sobre o rendimento");
assert.equal(net.liquido, Math.round((net.bruto - net.ir) * 100) / 100);
c = { ...c, config: { ...c.config, cdb: { ...c.config.cdb, since: undefined } } };
assert.equal(cdbNet(c, qui).aliquota, 22.5, "sem data: a alíquota mais alta");

// ---- parcelamento ----
let pc: Data = { ...g, txs: [], config: { ...g.config, bills: [], specialExpenses: [], accountBalance: 5000, goalDeadline: "2026-12" } };
pc = addParcelamento(pc, { name: "Celular", parcela: 100, from: "2026-09", until: "2026-12", match: "MAGALU" });
const cel = pc.config.bills[0];
assert.ok(billActive(cel, "2026-12") && !billActive(cel, "2027-01") && !billActive(cel, "2026-08"), "só entre a primeira e a última");
assert.deepEqual(parcela(cel, "2026-10"), { n: 2, total: 4 });
const pin = projectionInput(pc, new Date(2026, 8, 20));
assert.equal(pin.fixedCosts, 0, "parcela não é conta fixa para sempre");
assert.equal(pin.specialExpenses.filter((e) => e.description === "Celular").length, 4, "set a dez na projeção");
assert.equal(safeToSpend(pc, 8000, hoje).aPagar, 100, "a parcela do mês fica separada");
assert.ok(forecast30(pc, 0, hoje).events.some((e) => e.label === "Celular (2/4)"), "aparece nos próximos 30 dias");

console.log("selfcheck ok");

// ---- lançar falando ----
{
  const { parseFala, learnFromFala } = require("../lib/voice") as typeof import("../lib/voice");
  const qua = new Date(2026, 9, 1, 12);
  const f1 = parseFala("Gastei 50 reais em sorvete", [], [], qua)!;
  assert.deepEqual([f1.amount, f1.description, f1.category, f1.date], [-50, "Sorvete", "var_food", "2026-10-01"]);
  assert.equal(parseFala("gastei R$ 32,90 no ifood ontem", [], [], qua)!.category, "var_delivery");
  assert.equal(parseFala("gastei R$ 32,90 no ifood ontem", [], [], qua)!.date, "2026-09-30");
  assert.equal(parseFala("paguei 1.250 reais e 50 centavos de aluguel", [], [], qua)!.amount, -1250.5);
  assert.equal(parseFala("gastei 99 reais numa coisa", [], [], qua)!.category, null, "99 reais não é Uber 99");
  const f2 = parseFala("recebi 200 do meu pai", [], [], qua)!;
  assert.deepEqual([f2.amount, f2.category], [200, "income_fathers"]);
  assert.equal(parseFala("paguei 80 de remédio pro meu pai", [], [], qua)!.category, "fathers_expense");
  assert.equal(parseFala("uber 18 reais", [], [], qua)!.amount, -18);
  assert.equal(parseFala("gastei 2 mil numa viagem", [], [], qua)!.amount, -2000);
  assert.equal(parseFala("oi tudo bem", [], [], qua), null, "sem valor não lança");
  const f3 = parseFala("comprei um celular de 1200 reais em 12 vezes", [], [], qua)!;
  assert.deepEqual([f3.parcelas, f3.description, f3.category], [{ n: 12, total: 1200, parcela: 100 }, "Celular", "var_tech"]);
  assert.equal(parseFala("paguei 80 de remédio", [], [], qua)!.description, "Remédio", "mantém acento");
  assert.deepEqual(parseFala("tênis em 5x, parcela de 80", [], [], qua)!.parcelas, { n: 5, total: 400, parcela: 80 });
  // aprende: "sorvete" corrigido para Bar passa a cair em Bar
  const regras = learnFromFala([], "Sorvete", -50, "var_bar");
  assert.equal(parseFala("gastei 12 em sorvete", regras, [], qua)!.category, "var_bar");
}
console.log("fala ok");
{
  // CDB sem data (versão antiga) passa a render a partir de hoje
  const { parseBackup: pb } = require("../lib/store") as typeof import("../lib/store");
  const semData = JSON.stringify({ version: 1, txs: [], father: [], rules: [], lastBackup: null, config: { rendaFixa: 17000 } });
  assert.ok(pb(semData).data.config.rendaFixaDate, "CDB sem data ganha data");
}
console.log("cdb sem data ok");
{
  // ---- fatura do cartão: compra vira dívida na hora, pagamento quita ----
  const S = require("../lib/store") as typeof import("../lib/store");
  let fz: import("../lib/types").Data = { version: 1, txs: [], father: [], rules: [], lastBackup: null,
    config: { ...S.DEFAULT_CONFIG, accountBalance: 1000, bills: [], fatherCreditStart: 0, rendaFixa: 0, prefs: { ...S.DEFAULT_PREFS, countInvoices: true } } };
  const antes = S.myMoney(fz);
  fz = S.importInvoice(fz, [{ date: "2026-09-20", description: "LOJA A", amount: -300 }, { date: "2026-09-22", description: "LOJA B", amount: -100 }],
    { due: "2026-10-10", total: 400 }).data;
  assert.equal(S.myMoney(fz), antes - 400, "fatura nova já sai do meu dinheiro");
  assert.equal(fz.config.accountBalance, 1000, "mas a conta só muda quando paga");
  // reimportar a mesma fatura não duplica a dívida
  fz = S.importInvoice(fz, [{ date: "2026-09-20", description: "LOJA A", amount: -300 }], { due: "2026-10-10", total: 400 }).data;
  assert.equal(S.cardDebt(fz), 400);
  // pagamento aparece no extrato: sai da conta e a dívida some (sem contar duas vezes)
  fz = S.importParsed(fz, [{ date: "2026-10-09", description: "PGTO FAT CARTAO C6", amount: -400 }], null).data;
  assert.equal(S.cardDebt(fz), 0, "paga");
  assert.equal(S.myMoney(fz), antes - 400, "o total continua certo depois de pagar");
  // pagamento parcial deixa o resto em aberto; marcar como paga zera
  let pz = S.importInvoice({ ...fz, txs: [] }, [{ date: "2026-10-20", description: "LOJA C", amount: -500 }], { due: "2026-11-10", total: 500 }).data;
  pz = S.importParsed(pz, [{ date: "2026-11-08", description: "PGTO FAT CARTAO C6", amount: -200 }], null).data;
  assert.equal(S.invoiceOpen(pz, pz.config.invoices.find((i) => i.due === "2026-11-10")!), 300, "pagou parte");
  pz = S.toggleInvoicePaid(pz, pz.config.invoices.find((i) => i.due === "2026-11-10")!.id);
  assert.equal(S.invoiceOpen(pz, pz.config.invoices.find((i) => i.due === "2026-11-10")!), 0, "marcada paga");
}
console.log("fatura ok");
{
  // ---- projeção: gasto do mês não conta duas vezes; simulador por área ----
  const S = require("../lib/store") as typeof import("../lib/store");
  const P = require("../lib/projections") as typeof import("../lib/projections");
  const out = new Date(2026, 9, 3, 12);
  const tx = (date: string, amount: number, category: string) => ({ id: date + category + amount, date, description: category, amount, category, review: false });
  let pj: import("../lib/types").Data = { version: 1, father: [], rules: [], lastBackup: null, txs: [
      tx("2026-07-10", -600, "var_bar"), tx("2026-07-12", -200, "var_food"),
      tx("2026-08-10", -900, "var_bar"), tx("2026-08-12", -300, "var_food"),
      tx("2026-09-10", -600, "var_bar"), tx("2026-09-12", -100, "var_food"), tx("2026-09-15", -50, "var_barber"),
    ], config: { ...S.DEFAULT_CONFIG, accountBalance: 10000, bills: [], specialExpenses: [], salary: 2000, goalAmount: 12000, goalDeadline: "2026-12", fatherCreditStart: 0, rendaFixa: 0 } };
  const teto0 = P.computeScenarios(S.projectionInput(pj, out))[0];
  assert.ok(Math.abs(teto0.finalBalance - 12000) <= 4, "gastando o teto, fecha na meta");
  // gastou 300 hoje: sai do saldo, mas o teto do mês continua o mesmo
  const pj2 = S.addManual(pj, { date: "2026-10-03", description: "Bar", amount: -300, category: "var_bar" });
  const teto1 = P.computeScenarios(S.projectionInput(pj2, out))[0];
  assert.equal(teto1.monthlyVariable, teto0.monthlyVariable, "gasto do mês não derruba o teto duas vezes");
  assert.ok(Math.abs(teto1.finalBalance - 12000) <= 4);
  assert.equal(S.recentVariableAvg(pj, "2026-10"), Math.round((800 + 1200 + 750) / 3), "seu ritmo = média de 3 meses");
  assert.equal(P.computeScenarios(S.projectionInput(pj, out))[1].monthlyVariable, 917);
  // áreas pela média
  const av = S.categoryAverages(pj, "2026-10");
  assert.deepEqual(av, { var_bar: 700, var_food: 200, var_barber: 17 });
  const ev = S.envelopesFromHistory(pj, "2026-10").config.envelopes;
  assert.equal(ev[0].id, "var_bar", "a área onde mais gasta vem primeiro");
  assert.ok(Math.abs(ev.reduce((a, e) => a + e.share, 0) - 1) < 1e-9, "fatias somam 100%");
  assert.equal(ev[ev.length - 1].cats.length, 0, "tem a área 'Outros'");
  // plano = a média de cada área (o resto do teto fica guardado); acima do teto, corta na proporção
  const pm = S.envelopesFromHistory(pj, "2026-10", 5000);
  assert.deepEqual(S.envelopeBudgets(pm, "2026-11", 5000), { var_bar: 700, var_food: 200, var_barber: 17, resto: 0 });
  const corte = S.envelopesFromHistory(pj, "2026-10", 458.5);
  assert.equal(S.envelopeBudgets(corte, "2026-12", 458.5).var_bar, 350, "acima do teto: metade para todos");
}
console.log("projecao ok");
{
  // ---- personalização: médias, econômico, áreas, dia do salário e da conta ----
  const S = require("../lib/store") as typeof import("../lib/store");
  const P = require("../lib/projections") as typeof import("../lib/projections");
  const I = require("../lib/insights") as typeof import("../lib/insights");
  const tx = (date: string, amount: number, category: string) => ({ id: date + category + amount, date, description: category, amount, category, review: false });
  const base = { version: 1 as const, father: [], rules: [], lastBackup: null, txs: [
    tx("2026-04-10", -1200, "var_bar"), tx("2026-07-10", -600, "var_bar"), tx("2026-08-10", -900, "var_bar"), tx("2026-09-10", -600, "var_bar")],
    config: { ...S.DEFAULT_CONFIG, accountBalance: 10000, bills: [{ id: "b", name: "Academia", amount: 100, match: "", atSource: false, day: 22 }], specialExpenses: [], fatherCreditStart: 0, rendaFixa: 0 } };
  assert.equal(S.recentVariableAvg(base, "2026-10"), 700, "3 meses por padrão");
  const seis = { ...base, config: { ...base.config, prefs: { ...S.DEFAULT_PREFS, avgMonths: 6, economyPct: 50, payday: 7 } } };
  assert.equal(S.recentVariableAvg(seis, "2026-10"), 825, "6 meses: só conta mês que teve gasto");
  const sc = P.computeScenarios(S.projectionInput(seis, new Date(2026, 9, 3)));
  assert.equal(sc[2].monthlyVariable, Math.round(sc[0].monthlyVariable * 0.5), "econômico com o % escolhido");
  assert.equal(I.payday(seis), 7, "dia do salário escolhido");
  assert.equal(S.billDay(base, base.config.bills[0]), 22, "dia da conta escolhido");
}
console.log("prefs ok");
{
  const P = require("../lib/projections") as typeof import("../lib/projections");
  const inp = { effectiveBalance: 10000, salary: 2000, fixedCosts: 0, remainingMonths: 3, specialExpenses: [], goalAmount: 20000, startYear: 2026, startMonth: 10, skipFirstMonthSalary: false };
  assert.ok(P.calculateCeilingVariable(inp) < 0, "meta que não cabe");
  assert.equal(P.computeScenarios(inp)[0].monthlyVariable, 0, "teto nunca fica negativo (gasto negativo somaria dinheiro)");
  assert.equal(P.computeScenarios(inp)[0].finalBalance, 16000, "sem gastar: 10.000 + 3 salários");
  assert.equal(P.monthsToGoal(inp, 0), 5, "sem gastar: 5 meses de 2.000");
  assert.equal(P.monthsToGoal(inp, 1000), 10, "gastando 1.000: 10 meses");
  assert.equal(P.monthsToGoal(inp, 2000), null, "gasta tudo que ganha: nunca");
}
console.log("meta inviavel ok");
{
  // ---- a receber ----
  const S = require("../lib/store") as typeof import("../lib/store");
  const V = require("../lib/voice") as typeof import("../lib/voice");
  let r: import("../lib/types").Data = { version: 1, txs: [], father: [], rules: [], lastBackup: null,
    config: { ...S.DEFAULT_CONFIG, accountBalance: 1000, bills: [], fatherCreditStart: 0, rendaFixa: 0 } };
  const m0 = S.myMoney(r);
  // emprestou 100: sai da conta, mas continua sendo seu (alguém te deve)
  r = S.addReceivable(r, { person: "João", description: "Pizza", amount: 100, date: "2026-10-05", saiuDaConta: true });
  assert.equal(r.config.accountBalance, 900);
  assert.equal(S.myMoney(r), m0, "emprestar não diminui o que é seu");
  assert.equal(S.receivablesOpen(r), 100);
  // pagou 60: entra na conta e abate a dívida
  const id = r.receivables![0].id;
  r = S.payReceivable(r, id, { amount: 60, date: "2026-10-06", entrouNaConta: true });
  assert.equal(r.config.accountBalance, 960);
  assert.equal(S.receivableLeft(r.receivables![0]), 40, "faltam 40");
  assert.equal(S.myMoney(r), m0, "receber de volta também não muda o que é seu");
  assert.equal(r.txs.find((t) => t.category === "income_debt")!.description, "João pagou: Pizza");
  // não conta como renda nem gasto
  const { typeOf } = require("../lib/categories") as typeof import("../lib/categories");
  assert.equal(typeOf("income_debt"), "receivable");
  assert.equal(typeOf("lend_out"), "receivable");
  assert.equal(S.openReceivableOf(r, "joao").length, 1, "acha sem acento");
  // voz
  const q = new Date(2026, 9, 6, 12);
  const f1 = V.parseFala("o João me deve 50 reais da pizza", [], [], q)!;
  assert.deepEqual([f1.receber, f1.amount, f1.description], [{ tipo: "deve", person: "João" }, 50, "Pizza"]);
  const f2 = V.parseFala("emprestei 200 pro Pedro", [], [], q)!;
  assert.deepEqual([f2.receber, f2.amount], [{ tipo: "emprestei", person: "Pedro" }, 200]);
  const f3 = V.parseFala("o joão me pagou 40", [], [], q, ["João"])!;
  assert.deepEqual(f3.receber, { tipo: "pagou", person: "João" });
  assert.equal(V.parseFala("o pedro me pagou 40", [], [], q, ["João"])!.receber, undefined, "quem não deve é entrada normal");
}
console.log("a receber ok");
{
  // ---- CDB: cada movimento rende a partir da sua data (sem contar dobrado) ----
  const S = require("../lib/store") as typeof import("../lib/store");
  const mk = (extra: Partial<import("../lib/types").Config> = {}): import("../lib/types").Data => ({ version: 1, txs: [], father: [], rules: [], lastBackup: null,
    config: { ...S.DEFAULT_CONFIG, accountBalance: 5000, bills: [], fatherCreditStart: 0, rendaFixa: 10000, rendaFixaDate: "2026-10-01",
      cdb: { pctCdi: 100, cdiAnnual: 13.65, principal: 10000, moves: [] },
      cdiDaily: Object.fromEntries(["2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"].map((k) => [k, 0.05])), ...extra } });
  const dia = (n: number) => new Date(2026, 9, n, 12);
  // sem movimento: 5 dias úteis (02,05,06,07,08) até o dia 9 (hoje não conta)
  assert.equal(S.rendaFixaNow(mk(), dia(9)), Math.round(10000 * 1.0005 ** 5 * 100) / 100);
  // aplicou 1.000 no dia 6 (depois da conferência): rende só a partir daí
  let c = S.addManual(mk(), { date: "2026-10-06", description: "CDB", amount: -1000, category: "savings_cdb" });
  assert.equal(c.config.cdb.moves!.length, 1);
  const esperado = Math.round((10000 * 1.0005 ** 3 + 1000) * 1.0005 ** 2 * 100) / 100; // 02,05,06 antes; 07,08 depois
  assert.equal(S.rendaFixaNow(c, dia(9)), esperado, "a aplicação não rende antes da data dela");
  assert.equal(S.cdbPrincipalNow(c, dia(9)), 11000);
  // lançar aplicação com data antiga não dobra o rendimento (bug antigo)
  const semMov = S.rendaFixaNow(mk(), dia(9));
  assert.ok(S.rendaFixaNow(c, dia(9)) - semMov < 1010, "não infla");
  // apagar o lançamento tira a aplicação
  c = S.deleteTx(c, c.txs[0].id);
  assert.equal(S.rendaFixaNow(c, dia(9)), semMov, "apagou: volta ao que era");
  // extrato com aplicação ANTERIOR à conferência: já está no valor conferido, não entra de novo
  const antiga = S.importParsed(mk(), [{ date: "2026-09-20", description: "APLICACAO CDB", amount: -500 }], null).data;
  assert.equal(antiga.config.cdb.moves!.length, 0, "aplicação anterior à conferência é ignorada");
  const nova = S.importParsed(mk(), [{ date: "2026-10-07", description: "APLICACAO CDB", amount: -500 }], null).data;
  assert.equal(nova.config.cdb.moves!.length, 1, "posterior entra");
  // conferir no C6 recomeça e guarda a diferença
  const conf = S.conferirCdb(c, 10050, 10000, dia(9));
  assert.equal(S.rendaFixaNow(conf, dia(9)), 10050);
  assert.deepEqual([conf.config.cdb.checks![0].app, conf.config.cdb.checks![0].c6], [semMov, 10050]);
}
console.log("cdb movimentos ok");
{
  // ---- metas de vida e treino ----
  const L = require("../lib/life") as typeof import("../lib/life");
  const S = require("../lib/store") as typeof import("../lib/store");
  let v: import("../lib/types").Data = { version: 1, txs: [], father: [], rules: [], lastBackup: null,
    config: { ...S.DEFAULT_CONFIG, accountBalance: 20000, bills: [], fatherCreditStart: 0, rendaFixa: 0, salary: 2270 } };
  const hoje = new Date(2026, 10, 8, 12);
  assert.equal(L.ageText("2005-03-15", hoje), "21 anos e 7 meses");
  assert.equal(L.birthdayAt("2005-03-15", 25), "2030-03-15");
  assert.equal(L.ageAt("2005-03-15", "2030-03-14"), 24);
  // 500 mil aos 25: aporte mensal a juros compostos
  const meta500 = { id: "m", title: "500 mil", icon: "🎯", kind: "net" as const, unit: "R$", start: 20000, startDate: "2026-11-08", target: 500000, deadline: "2031-06-15" };
  v = L.saveGoal(v, meta500);
  const pl = L.moneyPlan(v, meta500, hoje);
  assert.equal(pl.v0, 20000);
  assert.equal(pl.n, 55, "55 meses até 15/06/2031");
  // confere: guardando o aporte a 10% a.a., chega no alvo
  const i = 1.1 ** (1 / 12) - 1;
  const fim = 20000 * (1 + i) ** 55 + pl.aporte * (((1 + i) ** 55 - 1) / i);
  assert.ok(Math.abs(fim - 500000) < 55 * 0.6 + 5, `aporte fecha o alvo (${fim})`);
  assert.deepEqual(pl.marcos.map((m) => m.ano), [2026, 2027, 2028, 2029, 2030, 2031], "um marco por ano");
  assert.equal(pl.marcos[5].valor, 500000, "o último marco é a meta");
  assert.ok(pl.marcos[0].valor < pl.marcos[1].valor, "marcos crescem");
  // retorno zero: divide igualmente
  const z = L.moneyPlan(v, { ...meta500, returnPct: 0 }, hoje);
  assert.equal(z.aporte, Math.round((500000 - 20000) / 55));
  // peso: 65 → 70 até 31/12, está em 66
  let w = L.saveGoal(v, { id: "p", title: "70 kg", icon: "🏋️", kind: "weight", unit: "kg", start: 65, startDate: "2026-09-10", target: 70, deadline: "2026-12-31" });
  w = L.logWeight(w, 65, "2026-09-10"); w = L.logWeight(w, 66, "2026-11-08");
  const gs = L.goalStatus(w, w.goals!.find((g) => g.id === "p")!, hoje);
  assert.equal(gs.atual, 66);
  assert.equal(gs.pct, 20);
  assert.ok(gs.naFrente === false, "esperado em 8/11 é ~67,3: está atrás");
  assert.equal(gs.diasRest, 53);
  assert.ok(gs.porSemana > 0.5 && gs.porSemana < 0.55, `precisa de ~0,53 kg/semana (${gs.porSemana})`);
  // tendência do peso: +1 kg em 4 semanas
  let tr = L.logWeight(L.logWeight(L.logWeight(v, 65, "2026-10-11"), 65.5, "2026-10-25"), 66, "2026-11-08");
  assert.equal(L.weightTrend(tr, hoje), 0.25);
  // contador
  let c = L.saveGoal(v, { id: "c", title: "Páginas", icon: "📖", kind: "count", unit: "páginas", start: 0, startDate: "2026-11-01", target: 300, deadline: "2026-12-01" });
  c = L.logGoal(c, "c", 40, "2026-11-04"); c = L.logGoal(c, "c", 90, "2026-11-08"); c = L.logGoal(c, "c", 95, "2026-11-08");
  assert.equal(L.goalCurrent(c, c.goals!.find((g) => g.id === "c")!), 95, "o último valor do dia vale");
  // treino: carga, recorde, última vez, semana
  let f = L.saveRoutine(v, { id: "A", name: "Peito", exercises: ["Supino reto", " ", "Crucifixo"] });
  assert.deepEqual(L.fitOf(f).routines[0].exercises, ["Supino reto", "Crucifixo"]);
  for (const [dia, kg] of [["2026-11-03", 60], ["2026-11-05", 62.5], ["2026-11-06", 65]] as const) {
    f = L.saveWorkout(f, { id: "", date: dia, routineId: "A", sets: [{ ex: "Supino reto", kg, reps: 8 }, { ex: "Supino reto", kg: kg - 5, reps: 10 }, { ex: "x", kg: 1, reps: 0 }] });
  }
  assert.equal(L.fitOf(f).workouts.length, 3);
  assert.equal(L.fitOf(f).workouts[0].sets.length, 2, "série sem repetição é descartada");
  assert.deepEqual(L.lastSets(f, "supino  RETO"), { date: "2026-11-06", sets: [{ kg: 65, reps: 8 }, { kg: 60, reps: 10 }] }, "acha sem diferença de maiúscula");
  assert.deepEqual(L.recordsOf(f, L.fitOf(f).workouts[2]), ["Supino reto"], "65 > 62,5: recorde");
  assert.deepEqual(L.recordsOf(f, L.fitOf(f).workouts[0]), [], "o primeiro treino não é recorde (não tinha antes)");
  const h = L.exerciseHistory(f, "Supino reto");
  assert.deepEqual([h.length, h[2].kg, h[2].volume, h[2].rm], [3, 65, 65 * 8 + 60 * 10, 82.33]);
  f = L.setTrainingDay(L.setTrainingDay(L.setTrainingDay(f, 2, "A"), 4, "A"), 0, "");
  const ws = L.weekStats(f, new Date(2026, 10, 6, 12)); // sexta 06/11
  assert.deepEqual([ws.previstos, ws.feitos], [3, 3], "ter, qui e dom previstos; 3, 5 e 6 feitos");
  assert.equal(L.weekDates("2026-11-08")[0], "2026-11-02", "semana começa na segunda");
  // agenda
  f = L.setTrainingTime(f, "19:30");
  const ics = L.buildIcs(f, hoje);
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 3);
  assert.ok(ics.includes("RRULE:FREQ=WEEKLY;BYDAY=TU") && ics.includes("DTSTART:20261110T193000"), "terça 10/11 às 19:30");
  assert.ok(ics.includes("SUMMARY:Treino · Peito"));
  // configuração inicial por arquivo não duplica
  const base = { ...v };
  const imp = L.importSetup(base, { prefs: { birth: "2005-03-15" }, goals: [meta500], fit: { weights: [{ date: "2026-09-10", kg: 65 }], days: { "2": "" }, time: "19:00" } });
  assert.deepEqual([imp.metas, imp.pesos, imp.data.config.prefs.birth], [0, 1, "2005-03-15"], "meta com mesmo id não duplica");
  assert.equal(L.importSetup(imp.data, { goals: [], fit: { weights: [{ date: "2026-09-10", kg: 65 }] } }).pesos, 0, "importar de novo não duplica");
}
console.log("metas de vida e treino ok");
{
  // ---- aba CDB: aplicar, resgatar, projeção, faixa de IR ----
  const S = require("../lib/store") as typeof import("../lib/store");
  const C = require("../lib/cdb") as typeof import("../lib/cdb");
  const base: import("../lib/types").Data = { version: 1, txs: [], father: [], rules: [], lastBackup: null,
    config: { ...S.DEFAULT_CONFIG, accountBalance: 5000, bills: [], fatherCreditStart: 0, rendaFixa: 10000, rendaFixaDate: "2026-10-01",
      cdb: { pctCdi: 100, cdiAnnual: 13.65, principal: 9000, since: "2026-06-01", moves: [] },
      cdiDaily: Object.fromEntries(["2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"].map((k) => [k, 0.05])) } };
  const dia = new Date(2026, 9, 9, 12);
  const ap = C.registrarCdb(base, { tipo: "aplicar", valorCdb: 1000, valorConta: 1000, date: "2026-10-06" }, dia);
  assert.equal(ap.config.accountBalance, 4000, "aplicar tira da conta");
  assert.equal(S.cdbPrincipalNow(ap, dia), 10000, "total aplicado sobe");
  const antes = S.rendaFixaNow(ap, dia);
  // resgate de 2.000 do CDB: na conta caem 1.950 (IR retido de 50)
  const rs = C.registrarCdb(ap, { tipo: "resgatar", valorCdb: 2000, valorConta: 1950, date: "2026-10-09" }, dia);
  assert.equal(rs.config.accountBalance, 4000 + 1950);
  assert.ok(Math.abs(S.rendaFixaNow(rs, dia) - (antes - 2000)) < 0.05, "o CDB cai o valor bruto do resgate");
  assert.ok(S.cdbPrincipalNow(rs, dia) < 10000 && S.cdbPrincipalNow(rs, dia) > 8000, "total aplicado cai na proporção");
  // projeção: 12 meses a 0,05%/dia útil, com aporte
  const p0 = C.cdbProjecao(base, 12, 0, dia), p1 = C.cdbProjecao(base, 12, 500, dia);
  assert.equal(p0.length, 13);
  assert.ok(p1[12].bruto > p0[12].bruto + 6000, "aporte de 500 por 12 meses soma 6.000 e rende");
  assert.ok(p0[12].liquido < p0[12].bruto, "líquido menor que bruto");
  assert.ok(Math.abs(p0[12].bruto / p0[0].bruto - 1.0005 ** (21 * 12)) < 0.003, "rende 21 dias úteis por mês");
  // faixa de IR: aplicou em 01/06 → 130 dias: faixa de 22,5% até o dia 180
  const f = C.proximaFaixa(base, dia)!;
  assert.equal(f.ultima, false);
  if (!f.ultima) { assert.equal(f.aliquota, 22.5); assert.equal(f.nova, 20); assert.equal(f.em, 181 - 130); assert.ok(f.ganho > 0); }
  assert.equal(C.cdbSerie(base, dia)[0].bruto, 10000, "a série começa na conferência");
  assert.ok(C.cdbSerie(base, dia).at(-1)!.bruto > 10000);
  const r = C.cdbRende(base, dia);
  assert.equal(r[0].rotulo, "Por dia útil");
  assert.ok(r[0].liquido < r[0].bruto && r[2].bruto > r[0].bruto * 20);
}
console.log("aba cdb ok");
{
  // ---- extrato: lançamento seu de hoje não pode travar o saldo do extrato novo ----
  const S = require("../lib/store") as typeof import("../lib/store");
  let e: import("../lib/types").Data = { version: 1, txs: [], father: [], rules: [], lastBackup: null,
    config: { ...S.DEFAULT_CONFIG, accountBalance: 1000, balanceDate: "2026-10-01", bills: [], fatherCreditStart: 0, rendaFixa: 0 } };
  // extrato de 25/10 com saldo 800
  e = S.importParsed(e, [{ date: "2026-10-20", description: "MERCADO", amount: -200 }], 800, "2026-10-25").data;
  assert.equal(e.config.accountBalance, 800);
  // você lança 50 de hoje (05/11): move o balanceDate para 05/11
  e = S.addManual(e, { date: "2026-11-05", description: "Almoço", amount: -50, category: "var_food" });
  assert.equal(e.config.accountBalance, 750);
  // chega o extrato de 31/10 (anterior ao lançamento, posterior ao último extrato): tem que valer
  e = S.importParsed(e, [{ date: "2026-10-28", description: "FARMACIA", amount: -100 }], 650, "2026-10-31").data;
  assert.equal(e.config.accountBalance, 600, "saldo do extrato (650) menos o lançamento de 05/11 (50)");
  assert.equal(e.config.stmtDate, "2026-10-31");
  // extrato mais velho que o último não rebaixa o saldo
  const velho = S.importParsed(e, [{ date: "2026-10-10", description: "X", amount: -5 }], 9999, "2026-10-12");
  assert.equal(velho.data.config.accountBalance, 600);
  assert.equal(velho.stats.closingApplied, false);

  // ---- meu dinheiro em partes ----
  const base: import("../lib/types").Data = { version: 1, txs: [], father: [], rules: [], lastBackup: null,
    config: { ...S.DEFAULT_CONFIG, accountBalance: 10000, bills: [], fatherCreditStart: 3000, rendaFixa: 5000, rendaFixaDate: "2026-11-01",
      cdb: { pctCdi: 100, cdiAnnual: 13.65, principal: 5000, moves: [] } } };
  let m = S.moneyParts(base, new Date(2026, 10, 1, 12));
  assert.equal(m.disponivel, 7000, "10.000 na conta menos 3.000 do pai");
  assert.equal(m.aReceber, 0);
  assert.equal(m.total, Math.round((m.disponivel + m.cdb + m.aReceber) * 100) / 100, "total = disponível + CDB + a receber");
  // pai passa a dever 500: entra em a receber
  const deve = S.fatherSet(base, -500, "ajuste");
  m = S.moneyParts(deve, new Date(2026, 10, 1, 12));
  assert.equal(m.disponivel, 10000, "tudo na conta é seu");
  assert.equal(m.doPai, 500);
  assert.equal(m.total, 10000 + m.cdb + 500, "o que o pai deve conta no total");
  // pessoas que devem + fatura em aberto
  const comFatura = { ...deve, config: { ...deve.config, prefs: { ...deve.config.prefs, countInvoices: true } } };
  const mais = S.importInvoice(S.addReceivable(comFatura, { person: "Ana", description: "", amount: 200, date: "2026-11-01", saiuDaConta: false }),
    [{ date: "2026-10-20", description: "LOJA", amount: -300 }], { due: "2026-11-10", total: 300 }).data;
  m = S.moneyParts(mais, new Date(2026, 10, 1, 12));
  assert.deepEqual([m.pessoas, m.aReceber, m.fatura, m.disponivel], [200, 700, 300, 9700], "a receber = pai + pessoas; disponível desconta a fatura");
  assert.equal(m.total, Math.round((m.disponivel + m.cdb + m.aReceber) * 100) / 100);
  // com a opção desligada (padrão) a fatura não desconta de nada
  const desl = S.importInvoice(deve, [{ date: "2026-10-20", description: "LOJA", amount: -300 }], { due: "2026-11-10", total: 300 }).data;
  assert.equal(S.cardDebt(desl), 0, "fatura não desconta por padrão");
  assert.equal(S.moneyParts(desl, new Date(2026, 10, 1, 12)).disponivel, 10000);
  assert.equal(S.DEFAULT_PREFS.countInvoices, false);
  // guardar dinheiro do pai: aparece como "guardado" e não entra no total
  assert.equal(S.moneyParts(base, new Date(2026, 10, 1, 12)).paiGuardado, 3000);
}
console.log("saldo e partes ok");
{
  // ---- 3 treinos, ajustes por dia, reorganizar por arquivo ----
  const L = require("../lib/life") as typeof import("../lib/life");
  const S = require("../lib/store") as typeof import("../lib/store");
  let v: import("../lib/types").Data = { version: 1, txs: [], father: [], rules: [], lastBackup: null,
    config: { ...S.DEFAULT_CONFIG, bills: [], fatherCreditStart: 0, rendaFixa: 0 } };
  // estado antigo: 4 rotinas
  v = L.saveRoutine(v, { id: "rot-ter", name: "Peito (terça)", exercises: ["Crucifixo"] });
  v = L.saveRoutine(v, { id: "rot-sab", name: "Peito (sábado)", exercises: ["Crucifixo", "Supino na máquina"] });
  v = L.setTrainingDay(L.setTrainingDay(v, 2, "rot-ter"), 6, "rot-sab");
  v = L.saveWorkout(v, { id: "w1", date: "2026-11-03", routineId: "rot-ter", sets: [{ ex: "Crucifixo", kg: 20, reps: 10 }] });
  const arq = { fit: { replace: true, remap: { "rot-ter": "rot-peito", "rot-sab": "rot-peito" },
    routines: [{ id: "rot-peito", name: "Peito, tríceps e ombro", exercises: ["Supino na máquina", "Crucifixo"], cardio: { tipo: "Bike", min: 20 } }, { id: "rot-perna", name: "Perna", exercises: ["Leg press"] }],
    days: { "2": "rot-peito", "6": "rot-peito", "4": "rot-perna" },
    dayExtra: { "6": { focus: "Ombro", minutes: 90, extra: ["Elevação lateral com halter", "Crucifixo"] }, "2": { minutes: 60 } } } };
  const r = L.importSetup(v, arq).data;
  assert.deepEqual(L.fitOf(r).routines.map((x) => x.name), ["Peito, tríceps e ombro", "Perna"], "ficam só as 3 rotinas do arquivo");
  assert.equal(L.fitOf(r).workouts[0].routineId, "rot-peito", "o treino já feito vai para a rotina nova");
  const sab = L.planForDay(r, 6)!;
  assert.deepEqual([sab.name, sab.focus, sab.minutes, sab.cardio?.min], ["Peito, tríceps e ombro", "Ombro", 90, 20]);
  assert.deepEqual(sab.exercises, ["Supino na máquina", "Crucifixo", "Elevação lateral com halter"], "extras do dia entram sem repetir");
  const ter = L.planForDay(r, 2)!;
  assert.deepEqual([ter.focus, ter.minutes, ter.exercises.length], [undefined, 60, 2], "terça: 60 min, sem extra");
  assert.equal(L.planForDay(r, 1), null, "segunda: descanso");
  // mudar o ajuste de um dia pela tela
  const m = L.setDayExtra(r, 6, { focus: "  ", minutes: 0, extra: [] });
  assert.equal(L.fitOf(m).dayExtra!["6"], undefined, "ajuste vazio some");
  // agenda: duração por dia e descrição com \n literal
  const ics = L.buildIcs(L.setTrainingTime(r, "19:00"), new Date(2026, 10, 8, 12));
  assert.ok(ics.includes("DTSTART:20261110T190000") && ics.includes("DTEND:20261110T200000"), "terça: 60 min");
  assert.ok(ics.includes("DTEND:20261107T203000") || ics.includes("DTEND:20261114T203000"), "sábado: 90 min");
  assert.ok(!/DESCRIPTION:[^\r\n]*\r?\n[A-Za-z]/.test(ics.replace(/BEGIN:VALARM[\s\S]*?END:VALARM/g, "")), "descrição não quebra linha");
  assert.ok(ics.includes("Ênfase: Ombro\\nSupino na máquina"), "linhas separadas por \n do ICS");
}
console.log("treino em 3 divisões ok");
{
  // ---- CDI do Banco Central: 404 "não encontrado" é "nada novo", não falta de internet ----
  const { interpretaCdi } = require("../lib/cdi") as typeof import("../lib/cdi");
  const vazio = interpretaCdi(404, '{"erro":{"statusCode":404,"detail":"SGSNegocioException: Value(s) not found"}}');
  assert.equal(vazio.ok, true, "período sem dia publicado não é erro");
  assert.deepEqual(vazio.dias, {});
  const ok = interpretaCdi(200, '[{"data":"05/11/2026","valor":"0.050788"},{"data":"06/11/2026","valor":"0.050788"}]');
  assert.deepEqual([ok.ok, ok.dias["2026-11-05"], Object.keys(ok.dias).length], [true, 0.050788, 2]);
  assert.equal(interpretaCdi(503, "").ok, false, "fora do ar é erro");
  assert.equal(interpretaCdi(200, "<html>").ok, false, "resposta estranha é erro");
  assert.ok(/fora do ar/.test(interpretaCdi(500, "").msg));
}
console.log("cdi bcb ok");
{
  // ---- CDB por aplicação, conferido contra as telas do C6 de 10/11/2026 ----
  const S = require("../lib/store") as typeof import("../lib/store");
  const C = require("../lib/cdb") as typeof import("../lib/cdb");
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const rows: { data: string; valor: string }[] = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../checks/fixtures/cdi-bcb.json"), "utf8"));
  const cdiDaily = Object.fromEntries(rows.map((r) => [r.data.split("/").reverse().join("-"), parseFloat(r.valor)]));
  const ap = (name: string, date: string, principal: number, pct: number) => ({ id: name, name, date, principal, pct });
  const mkc = (tr: import("../lib/types").CdbTranche[]): import("../lib/types").Data => ({ version: 1, txs: [], father: [], rules: [], lastBackup: null,
    config: { ...S.DEFAULT_CONFIG, accountBalance: 1000, bills: [], fatherCreditStart: 0, cdiDaily, cdb: { pctCdi: 101.5, cdiAnnual: 13.65, principal: 0, tranches: tr } } });
  const quatro = [ap("A", "2026-05-06", 133, 102), ap("B", "2026-06-09", 2500, 102), ap("C", "2026-08-28", 10000, 101.5), ap("D", "2026-08-31", 4890, 101.5)];
  const dia10 = new Date(2026, 10, 10, 12);
  const itens = S.cdbItens(mkc(quatro), dia10);
  const c6 = { A: [142.5, 1.9], B: [2645.26, 32.68], C: [10256.92, 57.8], D: [5013.0, 27.67] } as Record<string, number[]>;
  for (const i of itens) {
    assert.ok(Math.abs(i.value - c6[i.t.id][0]) <= 0.02, `${i.t.id}: app ${i.value} vs C6 ${c6[i.t.id][0]}`);
    assert.ok(Math.abs(i.ir - c6[i.t.id][1]) <= 0.01, `IR ${i.t.id}: app ${i.ir} vs C6 ${c6[i.t.id][1]}`);
  }
  const tot = S.cdbNet(mkc(quatro), dia10);
  assert.ok(Math.abs(tot.bruto - 18057.68) <= 0.06, `total bruto ${tot.bruto}`);
  assert.equal(S.cdbPrincipalNow(mkc(quatro), dia10), 17523, "total investido");
  assert.ok(Math.abs(tot.ir - 120.05) <= 0.03 && Math.abs(tot.liquido - 17937.63) <= 0.08, `IR ${tot.ir}, líquido ${tot.liquido}`);
  assert.deepEqual(itens.map((i) => i.aliquota), [20, 22.5, 22.5, 22.5], "a de 06/05 já passou de 180 dias: 20%");
  assert.equal(itens[0].proxima!.nova, 17.5, "a de maio cai para 17,5% aos 361 dias");
  // conferir no C6 recomeça dali e continua rendendo só em dia útil
  let c = mkc(quatro);
  for (const [id, v] of [["A", 142.5], ["B", 2645.26], ["C", 10256.92], ["D", 5013]] as const) c = C.conferirAplicacao(c, id, v, dia10);
  assert.ok(Math.abs(S.cdbNet(c, dia10).bruto - 18057.68) <= 0.01, "logo depois de conferir, bate exato");
  assert.equal(c.config.cdb.checks!.length, 4, "cada conferência registra a diferença");
  const amanha = new Date(2026, 10, 11, 12);
  assert.ok(S.cdbNet(c, amanha).bruto > S.cdbNet(c, dia10).bruto + 9, "no dia seguinte rende ~R$ 9,5 (CDI de 10/11 entra)");
  // sábado e domingo não rendem
  const sab = S.cdbNet(c, new Date(2026, 10, 14, 12)).bruto, dom = S.cdbNet(c, new Date(2026, 10, 15, 12)).bruto, seg = S.cdbNet(c, new Date(2026, 10, 16, 12)).bruto;
  assert.ok(dom === sab || dom - sab < 0.01, "domingo não rende além de sábado (ontem = sexta/sábado)");
  assert.ok(seg - dom < 0.01, "segunda ainda mostra até sexta: o CDI de segunda só entra na terça");
  assert.ok(S.cdbNet(c, new Date(2026, 10, 17, 12)).bruto > seg + 9, "terça já tem o rendimento de segunda");
  // aplicar: nova aplicação rende a partir do próprio dia e sai da conta
  const nova = C.aplicarCdb(c, { name: "CDB teste", date: "2026-11-10", valor: 1000, pct: 100, saiuDaConta: true }, dia10);
  assert.equal(nova.config.accountBalance, 0, "1000 saiu da conta");
  assert.equal(S.cdbTranches(nova).length, 5);
  assert.ok(Math.abs(S.cdbPrincipalNow(nova, dia10) - 18523) < 0.01);
  // resgate parcial: 1.000 brutos da C; líquido 995; o principal cai na proporção
  const rs = C.resgatarAplicacao(c, "C", { bruto: 1000, liquido: 995, date: "2026-11-10", entrouNaConta: true }, dia10);
  assert.equal(rs.config.accountBalance, 1000 + 995);
  const cInfo = S.cdbItens(rs, dia10).find((i) => i.t.id === "C")!;
  assert.ok(Math.abs(cInfo.value - 9256.92) < 0.02 && Math.abs(cInfo.t.principal - 10000 * (1 - 1000 / 10256.92)) < 0.1, `parcial: ${cInfo.value} / ${cInfo.t.principal}`);
  const fim = C.resgatarAplicacao(rs, "C", { bruto: 99999, liquido: 9000, date: "2026-11-10", entrouNaConta: false }, dia10);
  assert.equal(S.cdbTranches(fim).length, 3, "resgate total fecha a aplicação");
  // extrato: aplicação já conhecida não vira outra; manual substituído passa o vínculo
  const m = S.addManual(c, { date: "2026-11-10", description: "CDB", amount: -500, category: "savings_cdb" });
  assert.equal(S.cdbTranches(m).length, 5, "aplicação manual vira uma aplicação");
  const aposExtrato = S.importParsed(m, [{ date: "2026-11-10", description: "APLICACAO CDB", amount: -500 }, { date: "2026-08-28", description: "APLICACAO CDB", amount: -10000 }], null, "2026-11-10").data;
  assert.equal(S.cdbTranches(aposExtrato).length, 5, "nem a manual duplica nem a antiga (28/08) vira outra");
  assert.ok(S.cdbTranches(aposExtrato).filter((t) => t.txId).length >= 2, "as duas ficam ligadas aos lançamentos do extrato");
  // migração do modelo antigo (valor único) para aplicações
  const velho: import("../lib/types").Data = { ...mkc([]), config: { ...mkc([]).config, rendaFixa: 17743.79, rendaFixaDate: "2026-09-20", cdb: { pctCdi: 101.5, cdiAnnual: 13.65, principal: 17523, since: "2026-06-01", moves: [{ date: "2026-10-01", amount: 500 }] } } };
  const mig = S.migrarParaAplicacoes(velho);
  assert.deepEqual(S.cdbTranches(mig).map((t) => t.principal), [17523, 500]);
  assert.ok(S.rendaFixaNow(mig, dia10) > 18000, "continua rendendo depois da migração");
  // LCI/LCA sem IR
  const lci = S.trancheInfo(mkc([{ ...ap("L", "2026-06-01", 1000, 90), isento: true }]), { ...ap("L", "2026-06-01", 1000, 90), isento: true }, dia10);
  assert.equal(lci.ir, 0);
  // projeção por aplicação: sobe, líquido < bruto, aporte soma
  const p0 = C.cdbProjecao(c, 12, 0, dia10), p1 = C.cdbProjecao(c, 12, 500, dia10);
  assert.ok(p0[12].bruto > p0[0].bruto * 1.1 && p0[12].liquido < p0[12].bruto);
  assert.ok(p1[12].bruto > p0[12].bruto + 6000);
  const pf = C.proximaFaixa(c, dia10)!;
  assert.equal(pf.ultima, false);
  if (!pf.ultima) { assert.equal(pf.em, 181 - 154, "a primeira a cair de faixa é a de 09/06 (154 dias, 20% aos 181)"); assert.equal(pf.nova, 20); }
}
console.log("cdb por aplicação ok");
{
  // ---- gasto do pai que ficou fora do crédito (é o que faz "ele me deve" não aparecer) ----
  const S = require("../lib/store") as typeof import("../lib/store");
  const tx = (id: string, date: string, amount: number, category: string) => ({ id, date, description: id, amount, category, review: false });
  let p: import("../lib/types").Data = { version: 1, father: [], rules: [], lastBackup: null,
    txs: [tx("a", "2026-10-02", -500, "fathers_expense"), tx("b", "2026-10-03", 200, "income_fathers"), tx("c", "2026-10-04", -50, "var_food")],
    config: { ...S.DEFAULT_CONFIG, accountBalance: 1000, bills: [], fatherCreditStart: 0, rendaFixa: 0 } };
  assert.deepEqual(S.fatherPending(p).map((t) => t.id), ["a", "b"], "lançamentos do pai sem crédito aparecem como pendentes");
  assert.equal(S.moneyParts(p).doPai, 0, "enquanto pendentes, o crédito não reflete");
  p = S.syncFather(p, S.fatherPending(p));
  assert.equal(S.fatherPending(p).length, 0);
  assert.equal(S.fatherBalance(p), -300, "500 gastos e 200 recebidos: ele me deve 300");
  assert.equal(S.moneyParts(p).doPai, 300, "agora conta no total");
  // um ajuste de hoje reconcilia tudo que veio antes
  const aj = S.fatherSet({ ...p, father: [] }, 700, "ajuste");
  assert.equal(S.fatherPending(aj).length, 0, "ajuste dado depois dos lançamentos já os cobre");
}
console.log("pai pendente ok");

{
  // o rendimento do CDB entra na projeção: o teto sobe e a meta chega antes
  const P = require("../lib/projections") as typeof import("../lib/projections");
  const base = { effectiveBalance: 10000, salary: 3000, fixedCosts: 1000, remainingMonths: 4, specialExpenses: [], goalAmount: 12000, startYear: 2026, startMonth: 9, skipFirstMonthSalary: false };
  const sem = P.calculateCeilingVariable(base);
  const com = P.calculateCeilingVariable({ ...base, cdbMonthly: 120 });
  assert.equal(com - sem, Math.floor((3 * 120) / 4 + (sem % 1)) , "3 meses de rendimento (o 1º não conta) divididos em 4 meses");
  const fim = (i: typeof base & { cdbMonthly?: number }) => P.buildMonthlyProjection(i, 500).at(-1)!.projectedBalance;
  assert.equal(fim({ ...base, cdbMonthly: 100 }) - fim(base), 300, "o rendimento soma 3 vezes (não no mês atual)");
}
console.log("cdb na projeção ok");

{
  const L = require("../lib/life") as typeof import("../lib/life");
  const d0 = { txs: [], goals: [], config: DEFAULT_CONFIG, fit: undefined } as unknown as Data;
  assert.equal(L.grupoDe(d0, "Supino reto"), "Peito");
  assert.equal(L.grupoDe(d0, "Crucifixo inverso"), "Ombro", "inverso é ombro, não peito");
  assert.equal(L.grupoDe(d0, "Tríceps corda"), "Tríceps");
  assert.equal(L.grupoDe(d0, "Rosca martelo"), "Bíceps");
  assert.equal(L.grupoDe(d0, "Remada baixa"), "Costas");
  assert.equal(L.grupoDe(d0, "Leg press"), "Perna");
  assert.equal(L.grupoDe(d0, "Coisa nova"), "Outros");
  const d1 = L.setExGroup(d0, "Coisa nova", "Perna");
  assert.equal(L.grupoDe(d1, "Coisa nova"), "Perna", "o grupo escolhido vale mais que o nome");
  const rot = { id: "r", name: "x", exercises: ["Supino reto", "Supino inclinado", "Tríceps corda"] };
  assert.equal(L.grupoDaRotina(d0, rot), "Peito");
  assert.equal(L.grupoDaRotina(d0, { ...rot, group: "Costas" }), "Costas");
  assert.deepEqual(L.agrupar(["Leg press", "Supino reto"], (x) => L.grupoDe(d0, x)).map((g) => g.grupo), ["Peito", "Perna"]);
}
console.log("grupos musculares ok");

{
  const L = require("../lib/life") as typeof import("../lib/life");
  const C = require("../lib/cripto") as typeof import("../lib/cripto");
  const d0 = { txs: [], father: [], goals: [], config: DEFAULT_CONFIG, fit: undefined } as unknown as Data;
  // água: 3 L em 3 horários = 1 L, 2 L, 3 L acumulados; nunca negativa
  assert.deepEqual(L.aguaMarcos(d0).map((m) => [m.ate, m.ml, m.parte]), [["12:00", 1000, 1000], ["16:00", 2000, 1000], ["20:00", 3000, 1000]]);
  let a = L.addAgua(d0, 250, "2026-11-11"); a = L.addAgua(a, 500, "2026-11-12"); a = L.addAgua(a, -9999, "2026-11-13");
  assert.equal(L.aguaOf(a).log["2026-11-13"], 0, "não fica negativa");
  assert.equal(L.aguaSemana(a, "2026-11-12").ml, 750, "soma a semana de segunda a domingo");
  const ics = L.buildAguaIcs(a, new Date(2026, 10, 12));
  assert.ok(ics.includes("SUMMARY:Tomar 1 L de água até 12:00") && ics.split("BEGIN:VEVENT").length === 4 && ics.includes("RRULE:FREQ=DAILY"));
  // treino: série sem repetição some, mas o exercício fica no treino ao salvar (pend)
  let t = L.saveWorkout(d0, { id: "", date: "2026-11-12", sets: [{ ex: "Supino reto", kg: 40, reps: 10 }, { ex: "Supino reto", kg: 40, reps: 8 }, { ex: "Crucifixo", kg: 10, reps: 12 }], pend: ["Tríceps corda"] });
  const w = L.fitOf(t).workouts[0];
  assert.deepEqual(w.pend, ["Tríceps corda"]);
  // metas e volume
  const f = L.feitoNaSemana(t, "2026-11-12");
  assert.equal(f.series["Peito"], 3);
  const pv = L.pesoLevantado(t, "2026-11-12");
  assert.equal(pv.dia, 40 * 10 + 40 * 8 + 10 * 12);
  assert.equal(pv.semana, pv.dia); assert.equal(pv.ano, pv.dia); assert.equal(pv.mes, pv.dia);
  assert.equal(L.pesoLevantado(t, "2026-11-20").dia, 0);
  assert.equal(L.alvosOf(L.setAlvos(t, { cardioMin: 90 })).cardioMin, 90);
  // cripto: custo médio, perda e compra com média ponderada
  let c = C.salvarCripto(d0, { id: "s", symbol: "sol", name: "Solana", qty: 0.02, avgCost: 1000 });
  c = C.definirPreco(c, "s", 500, new Date(2026, 10, 12));
  const p = C.posicao(C.criptoOf(c)[0]);
  assert.equal(p.investido, 20); assert.equal(p.valor, 10); assert.equal(p.resultado, -10); assert.equal(p.pct, -50);
  c = C.comprarCripto(c, "s", 1, 1000);
  assert.ok(Math.abs(C.criptoOf(c)[0].avgCost - (0.02 * 1000 + 1000) / 1.02) < 1e-9, "média ponderada");
  c = C.venderCripto(c, "s", 5);
  assert.equal(C.criptoOf(c)[0].qty, 0, "vender mais que tem zera, não fica negativo");
  assert.equal((require("../lib/store") as typeof import("../lib/store")).moneyParts({ ...c, config: { ...c.config, prefs: { ...c.config.prefs, countCripto: false } } }).cripto, 0, "o botão desliga cripto do total");
}
console.log("água, treino, metas e cripto ok");

{
  const C = require("../lib/cripto") as typeof import("../lib/cripto");
  const d0 = { txs: [], father: [], goals: [], config: DEFAULT_CONFIG } as unknown as Data;
  let c = C.salvarCripto(d0, { id: "x", symbol: "abc", name: "Abc", qty: 2, avgCost: 100, price: 100, desde: "2026-01-10", alvo: { lucroPct: 20, perdaPct: 50 } });
  const antes = c;
  c = C.comprarCripto(c, "x", 1, 150, "2026-06-01"); // 3 moedas por 350 no total
  c = C.definirPreco(c, "x", 130, new Date(2026, 10, 12));
  const h = C.historicoDe(C.criptoOf(c)[0]);
  assert.equal(h.length, 2);
  assert.deepEqual([h[0].qty, h[0].pago, h[0].valor, h[0].pct], [2, 200, 260, 30], "posição inicial: pôs 200, vale 260");
  assert.deepEqual([h[1].qty, h[1].pago, h[1].valor, h[1].pct], [1, 150, 130, -13.33], "compra: pôs 150, vale 130");
  // meta de lucro: avisa só ao atravessar, não a cada atualização
  const sobe = C.definirPreco(antes, "x", 125);
  assert.equal(C.alvosAtingidos(antes, sobe).map((a) => a.tipo).join(), "lucro");
  assert.equal(C.alvosAtingidos(sobe, C.definirPreco(sobe, "x", 130)).length, 0, "já estava acima: não repete");
  assert.equal(C.alvosAtingidos(antes, C.definirPreco(antes, "x", 40)).map((a) => a.tipo).join(), "perda");
  assert.equal(C.noLucroAlvo(sobe).length, 1);
}
console.log("histórico e alvos de cripto ok");

// ---- regressões: cada bug que já apareceu e não pode voltar (ver AGENTS.md) ----
{
  const fs = require("fs") as typeof import("fs");
  const L = require("../lib/life") as typeof import("../lib/life");
  const P = require("../lib/projections") as typeof import("../lib/projections");
  const src = (f: string) => fs.readFileSync(f, "utf8");
  const d0 = { txs: [], father: [], goals: [], config: DEFAULT_CONFIG, fit: undefined } as unknown as Data;

  // 2026-11-14: janela da senha aparecia no meio da página e escurecia só o cartão (ficava presa ao cartão animado no iPhone)
  assert.ok(/createPortal\(/.test(src("components/ui.tsx")) && /document\.body/.test(src("components/ui.tsx")), "Sheet precisa ir para o <body> (portal)");

  // 2026-11-14: fonte sem o prefixo do endereço (/rumo) deixava a fonte padrão no GitHub Pages
  assert.ok(!/url\(["']?\/[a-z]/i.test(src("app/globals.css")), "CSS não pode ter url() absoluta: quebra com prefixo de endereço");
  assert.ok(/\$\{base\}\/fonts\/pjs\.woff2/.test(src("app/layout.tsx")), "a fonte precisa usar o prefixo do endereço");

  // 2026-11-14: .ics sem quebra de linha no fim e sem METHOD não era importado pelo iPhone
  for (const ics of [L.buildAguaIcs(d0, new Date(2026, 10, 14)), L.buildIcs({ ...d0, fit: { weights: [], days: { "1": "" }, time: "18:00", routines: [], workouts: [] } }, new Date(2026, 10, 14))]) {
    assert.ok(ics.endsWith("END:VCALENDAR\r\n"), ".ics termina com CRLF");
    assert.ok(ics.includes("METHOD:PUBLISH"), ".ics com METHOD:PUBLISH");
  }

  // 2026-11-14: leitura de PDF podia ficar esperando para sempre no iPhone
  const pdf = src("lib/pdf.ts");
  assert.ok(/Promise\.race\(\[lerPdf/.test(pdf) && /LeituraDemorou/.test(pdf), "pdfToText precisa ter limite de tempo geral");
  assert.ok(/pdfjsWorker/.test(pdf), "leitura sem Web Worker");
  assert.ok(/etapaPdf/.test(src("components/Mais.tsx")), "o aviso de erro mostra a etapa em que parou");

  // 2026-11-14: janelas ficavam abertas/escuras depois de voltar do seletor de arquivos (timers pausados pelo iOS)
  assert.ok(/visibilitychange/.test(src("components/ui.tsx")), "Sheet limpa o que sobrou ao voltar do seletor de arquivos");

  // 2026-11-11: texto preto nos gráficos do modo escuro (tooltip do Recharts usa #000 sem itemStyle)
  assert.ok(/itemStyle:\s*\{\s*color:\s*"var\(--ink\)"/.test(src("components/charts.tsx")), "tooltip dos gráficos usa a cor do tema");

  // 2026-11-13: a barra de limite do mês precisa mudar com o cenário escolhido
  const sc = P.computeScenarios({ effectiveBalance: 10000, salary: 3000, fixedCosts: 1000, remainingMonths: 4, specialExpenses: [], goalAmount: 12000, startYear: 2026, startMonth: 9, skipFirstMonthSalary: false, recentAvg: 700, economyPct: 30 });
  assert.equal(new Set(sc.map((s) => s.monthlyVariable)).size, 3, "teto, ritmo e econômico têm limites diferentes");
  assert.ok(/cenario-meta/.test(src("components/Metas.tsx")) && /cenario-meta/.test(src("components/Home.tsx")), "Metas e Início leem o mesmo cenário escolhido");

  // 2026-11-12: treino salvo perdia os exercícios ainda sem série
  const t = L.saveWorkout(d0, { id: "", date: "2026-11-12", sets: [{ ex: "Supino reto", kg: 40, reps: 10 }], pend: ["Tríceps corda", "Crucifixo"] });
  assert.deepEqual(L.fitOf(t).workouts[0].pend, ["Tríceps corda", "Crucifixo"]);
}
console.log("regressões ok");

{
  const L = require("../lib/life") as typeof import("../lib/life");
  const d0 = { txs: [], father: [], goals: [], config: DEFAULT_CONFIG, fit: undefined } as unknown as Data;
  // quinta-feira 12/11/2026 tem treino previsto (rotina) e foi feito; sexta só prevista; água anotada na quinta
  let d = L.saveRoutine(d0, { id: "r1", name: "Perna", exercises: ["Leg press"] });
  d = L.setTrainingDay(d, 4, "r1"); d = L.setTrainingDay(d, 5, "r1");
  d = L.saveWorkout(d, { id: "", date: "2026-11-12", sets: [{ ex: "Leg press", kg: 100, reps: 10 }, { ex: "Leg press", kg: 100, reps: 8 }], pend: ["Stiff"] });
  d = L.addAgua(d, 2250, "2026-11-12");
  const q = L.resumoDoDia(d, "2026-11-12", "2026-11-14");
  assert.deepEqual([q.feito, q.previsto, q.passou, q.hoje, q.series, q.volume, q.aguaMl], [true, true, true, false, 2, 1800, 2250]);
  const s = L.resumoDoDia(d, "2026-11-13", "2026-11-14");
  assert.deepEqual([s.feito, s.previsto, s.passou], [false, true, true], "previsto e não feito = perdido");
  const dom = L.resumoDoDia(d, "2026-11-15", "2026-11-14");
  assert.deepEqual([dom.feito, dom.previsto, dom.passou, dom.aguaMl], [false, false, false, 0], "descanso no futuro");
  assert.deepEqual(L.exerciciosDoTreino(q.treinos[0]), [{ ex: "Leg press", sets: [{ kg: 100, reps: 10 }, { kg: 100, reps: 8 }] }, { ex: "Stiff", sets: [] }]);
}
console.log("calendário de treino ok");
