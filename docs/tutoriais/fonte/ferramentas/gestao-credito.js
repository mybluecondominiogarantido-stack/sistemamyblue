'use strict';
/*
 * Tutorial da Central de Ferramentas — Gestão Crédito (Conciliação de Repasses e Divisor de Comprovantes).
 * Dados fictícios: a carteira do cenário (CNPJs inventados), a planilha de repasses do dia, a consulta de
 * pagamentos do banco e os comprovantes, todos gerados aqui.
 *
 * O coordenador do Crédito (Caio Mendes) concilia os repasses do dia com os pagamentos do banco, registra e trata
 * as divergências e separa o PDF de comprovantes por condomínio e assistente de crédito.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const SLUG = 'central-de-ferramentas-gestao-credito';
const quadro = (t) => t.p.frameLocator(`iframe[data-slug="${SLUG}"]`);
const arquivoTemp = (nome, conteudo) => { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tut-')), nome); fs.writeFileSync(f, conteudo); return f; };

const FUSO = 'America/Sao_Paulo';
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: FUSO });
const dia = (n) => { const d = new Date(hoje() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/* último dia útil antes de hoje: o dia dos repasses conciliados no vídeo */
const diaRepasse = () => { for (let n = -1; ; n--) { const d = new Date(dia(n) + 'T12:00:00Z').getUTCDay(); if (d > 0 && d < 6) return dia(n); } };
const br = (iso) => iso.split('-').reverse().join('/');
const brl = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CNPJ = (i) => `12.345.678/000${i + 1}-9${i}`; // o mesmo da carteira do cenário

/* repasses do dia (carteira do cenário) e o que o banco mostra */
const REPASSES = [
  // condomínio, índice na carteira, descrição, valor previsto, responsável na planilha, favorecido no banco, valor pago, status
  ['Cond. Jardim Azul', 0, '1º Rateio', 18420.55, 'BRUNA REIS', 'CONDOMINIO JARDIM AZUL', 18420.55, 'Efetuado'],
  ['Ed. Solar das Palmeiras', 1, '1º Rateio', 9870.1, 'DAVI ROCHA', 'CONDOMINIO EDIFICIO SOLAR DAS PALMEIRAS', 9870.1, 'Efetuado'],
  ['Res. Primavera', 2, '1º Rateio', 12305, 'BRUNA REIS', 'RESIDENCIAL PRIMAVERA', 12035, 'Efetuado'],
  ['Cond. Vila Rica', 3, '1º Rateio', 7640.35, 'DAVI ROCHA', 'CONDOMINIO VILA RICA', 7640.35, 'Não efetuado'],
  ['Ed. Aurora', 4, '1º Rateio', 15002.8, 'BRUNA REIS', 'CONDOMINIO EDIFICIO AURORA', 15002.8, 'Efetuado'],
  ['Ed. Aurora', 4, '2º Rateio', 1250, 'BRUNA REIS', null, 0, ''],
];

async function arquivos(navegador) {
  const d = diaRepasse();
  const xlsx = require(path.join(process.env.BIBLIOTECAS || '', 'node_modules', 'xlsx'));
  const planilha = (nome, linhas) => { const wb = xlsx.utils.book_new(); xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(linhas), 'Planilha1'); return arquivoTemp(nome, xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })); };
  // 1) planilha de repasses do dia
  const repasses = planilha(`Repasses_do_Dia_${br(d).replace(/\//g, '-')}.xlsx`, [
    [`Repasses do Dia ${br(d)} (exemplo fictício)`], [],
    ['Condomínio', 'CNPJ', 'Descrição', 'Tipo', 'Valor', 'Vencimento', 'Responsável'],
    ...REPASSES.map(([nome, i, desc, valor, resp]) => [nome, CNPJ(i), desc, 'Repasse normal', valor, br(d), resp]),
    ['Total', '', '', '', REPASSES.reduce((t, r) => t + r[3], 0)],
  ]);
  // 2) consulta de pagamentos do banco (Itaú)
  const pagos = REPASSES.filter((r) => r[5]).map(([, i, , , , fav, valor, st], k) => [fav, CNPJ(i), 'TED Conta Corrente', String(48120 + k * 7), br(d), valor, st]);
  pagos.splice(3, 0, ['PAPELARIA CENTRAL LTDA', '45.210.778/0001-30', 'Boleto', '48199', br(d), 486.9, 'Efetuado']);
  const banco = planilha(`consultaPagamentos_${br(d).replace(/\//g, '-')}.xlsx`, [
    ['Consulta de pagamentos (exemplo fictício)'], ['Período:', br(d)], ['Agência/conta', '0001 / 12345-6', '', '', 'MYBLUE EXEMPLO LTDA'], [],
    ['Favorecido', 'CPF/CNPJ', 'Tipo de pagamento', 'Referência', 'Data do pagamento', 'Valor (R$)', 'Status'],
    ...pagos, ['Total', '', '', '', '', pagos.reduce((t, r) => t + r[5], 0)],
  ]);
  // 3) PDF de comprovantes do banco (um por página), dos pagamentos efetuados
  const comp = REPASSES.filter((r) => r[5] && r[7] === 'Efetuado').map(([, i, , , , fav, valor], k) => `
    <section style="page-break-after:always;font:13px Arial,sans-serif;color:#222;padding:18mm 20mm">
      <p style="font-size:10px;color:#888">EXEMPLO FICTÍCIO PARA TUTORIAL</p>
      <h2 style="font-size:18px;margin:6px 0 18px">Comprovante de transferência — TED</h2>
      <p>Banco: Itaú · Agência/conta de origem: 0001 / 12345-6 · MYBLUE EXEMPLO LTDA</p>
      <p style="margin-top:14px">Nome do favorecido: ${fav}</p>
      <p>CPF/CNPJ: ${CNPJ(i)}</p>
      <p>Agência/conta creditada: 0${310 + i} / 2${i}4458-${i}</p>
      <p style="margin-top:14px">Valor da TED: R$ ${brl(valor)}</p>
      <p>Data da transferência: ${br(d)}</p>
      <p>Autenticação: ${(9017350 + k * 131).toString(16).toUpperCase()}A7F3C2</p>
    </section>`).join('');
  const pg = await navegador.newPage();
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">${comp}</body></html>`);
  const comprovantes = arquivoTemp(`Comprovantes_${br(d).replace(/\//g, '-')}.pdf`, await pg.pdf({ format: 'A5' }));
  await pg.close();
  return { repasses, banco, comprovantes };
}

/* histórico fictício: os dois dias anteriores já conciliados, com divergências em andamento */
function documentos(ids) {
  const caio = { id: ids['caio@myblue.com.br'], nome: 'Caio Mendes' }, bruna = { id: ids['bruna@myblue.com.br'], nome: 'Bruna Reis' };
  const d1 = dia(-6), d2 = dia(-5);
  const conc = (d, fonte, prev, val, por) => ({ dia: d, fonte, fonteNome: fonte === 'itau' ? 'Extrato Itaú' : 'Pedidos de Compra (Protheus)', verbo: fonte === 'itau' ? 'Pago' : 'Lançado',
    layoutPrevisto: 'Repasses do Dia', conta: fonte === 'itau' ? '0001 / 12345-6' : 'MATA121', empresa: fonte === 'itau' ? 'MYBLUE EXEMPLO LTDA' : 'Protheus',
    previsto: { qtd: 5, valor: prev }, recebido: { qtd: 5, valor: val }, validos: { qtd: 5, valor: val }, conciliados: { qtd: 4, valor: val }, outros: { qtd: 0, valor: 0, itens: [] },
    alertas: [], divergencias: { total: 1, pendentes: 1 }, totalInformado: val, arquivos: { previsto: `Repasses_do_Dia_${br(d).replace(/\//g, '-')}.xlsx`, pago: fonte === 'itau' ? 'consultaPagamentos.xlsx' : 'Pedidos_de_Compra.pdf' },
    registradoPor: por, registradoEm: d + 'T18:10:00.000Z' });
  const div = (d, fonte, tipo, cond, i, desc, resp, prev, pago, sit, responsavel, notas) => ({ dia: d, fonte, tipo, condominio: cond, linhas: 1, descricao: desc, respPlanilha: resp, cnpjConta: CNPJ(i),
    sinalizacao: '', favorecido: pago ? cond.toUpperCase() : '', cnpj: pago ? CNPJ(i) : '', ref: '', previsto: prev, pago, obsAuto: fonte === 'itau' ? 'Não localizado em Extrato Itaú' : 'Não localizado em Pedidos de Compra (Protheus)',
    origem: 'auto', situacao: sit, responsavel, atualizadoEm: d + 'T18:10:00.000Z', historico: notas.map(([h, por, s, nota]) => ({ em: d + `T${h}:00.000Z`, por, situacao: s, nota })) });
  return {
    [`conciliacoes/${d1}_protheus`]: conc(d1, 'protheus', 41210.4, 38770.4, caio),
    [`conciliacoes/${d2}_itau`]: conc(d2, 'itau', 52980.15, 50180.15, bruna),
    [`divergencias/${d1}_protheus_previsto-e-nao-lancado_res-bela-vista`]: div(d1, 'protheus', 'Previsto e não lançado', 'Res. Bela Vista', 5, '1º Rateio', 'BRUNA REIS', 2440, 0, 'em_analise', bruna,
      [['18:10', caio, 'aberta', 'Registrada pela conciliação do dia.'], ['19:02', bruna, 'em_analise', 'Pedido de compra em lançamento no Protheus.']]),
    [`divergencias/${d2}_itau_previsto-e-nao-pago_cond-jardim-azul`]: div(d2, 'itau', 'Previsto e não pago', 'Cond. Jardim Azul', 0, '2º Rateio', 'BRUNA REIS', 2800, 0, 'aberta', bruna,
      [['18:10', bruna, 'aberta', 'Registrada pela conciliação do dia.']]),
  };
}

/* bibliotecas do cdnjs: entregues no endereço do portal (o redirecionamento para o cdnjs escapa da rota do gravador) */
const PACOTES = { 'pdf.js': 'pdfjs-dist/build', xlsx: 'xlsx/dist', 'pdf-lib': 'pdf-lib/dist', jszip: 'jszip/dist' };
async function servirBibliotecas(t) {
  await t.ctx.route(/\/cdn\/cdnjs\/ajax\/libs\//, (rota) => {
    const [lib, , arquivo] = new URL(rota.request().url()).pathname.split('/ajax/libs/')[1].split('/');
    const local = PACOTES[lib] && path.join(process.env.BIBLIOTECAS || '', 'node_modules', PACOTES[lib], arquivo);
    if (!local || !fs.existsSync(local)) return rota.continue();
    return rota.fulfill({ path: local, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await t.p.reload();
}

const roteiro = {
  nome: 'ferramenta-gestao-credito',
  ferramenta: SLUG,
  entrar: 'caio@myblue.com.br',
  inicio: '#/m/' + SLUG,
  largura: 1600, // as tabelas de conciliação ficam empilhadas na tela padrão
  async preparar(cen) {
    const r = await cen.admin('POST', `/api/admin/modulos/${SLUG}/documentos`, { modulo: SLUG, documentos: documentos(cen.id) });
    if (!r || !r.total) throw new Error('não gravou os dados de exemplo: ' + JSON.stringify(r));
  },
  async ajustar(t) {
    await servirBibliotecas(t);
    await quadro(t).locator('.cx-card').first().waitFor({ timeout: 20000 });
    await t.pausa(1200);
  },
  abertura: ['As ferramentas de repasses da coordenação de Crédito, com a Carteira do portal.',
    ['Conciliar os repasses do dia com o banco', 'Registrar e tratar as divergências', 'Separar os comprovantes por responsável']],
  async gravar(t) {
    const f = quadro(t);
    const arq = await arquivos(t.p.context().browser());

    const H = '1 · As ferramentas';
    await t.legenda('Duas ferramentas, com a Carteira do portal e a mesma planilha de repasses do dia: a <b>Conciliação de Repasses</b> e o <b>Divisor de Comprovantes</b>.', { etapa: H, ms: 500 });
    await t.mostrar(f.locator('.cx-card').first(), 2200);
    await t.mostrar(f.locator('.cx-card').nth(1), 1800);

    const C = '2 · Conciliar';
    await t.legenda('Na <b>Conciliação</b>, escolha o que conferir: <b>Lançamentos</b> (Protheus) ou <b>Pagamentos</b> (banco).', { etapa: C, ms: 300 });
    await t.clicar(f.locator('.cx-card').first(), { depois: 1400 });
    await t.clicar(f.locator('.tab[data-view="pag"]'), { depois: 1200 });
    await t.legenda('Envie a <b>planilha de repasses do dia</b> e a <b>consulta de pagamentos</b> do banco do mesmo dia.', { etapa: C, ms: 300 });
    await t.enviarArquivo(f.locator('#dropPrev-pag'), f.locator('#inPrev-pag'), arq.repasses, { depois: 1200 });
    await t.enviarArquivo(f.locator('#dropPago-pag'), f.locator('#inPago-pag'), arq.banco, { depois: 2200 });
    await t.legenda('O resultado sai na hora: o que <b>faltou pagar</b>, o que foi pago com <b>valor diferente</b> e o que saiu <b>sem previsão</b>.', { etapa: C, ms: 300 });
    await t.mostrar(f.locator('#resultado-pag .banner').first(), 2400);
    await t.mostrar(f.locator('#resultado-pag .totals'), 2400);
    await t.rolar(380);
    await t.mostrar(f.locator('#resultado-pag table').first(), 2600);
    await t.legenda('<b>Registrar conciliação</b> guarda o dia e leva cada divergência para o registro da equipe.', { etapa: C, ms: 300 });
    await t.clicar(f.locator('#btnSalvar-pag'), { depois: 2200 });

    const D = '3 · Divergências';
    await t.legenda('Em <b>Divergências</b>, as pendências de todos os dias. Clique numa para registrar a tratativa.', { etapa: D, ms: 300 });
    await t.mostrar(f.locator('#tbDiv'), 2200);
    await t.clicar(f.locator('#tbDiv tr', { hasText: 'Res. Bela Vista' }), { depois: 1400 });
    await t.legenda('Escolha a situação e escreva o que foi feito: fica no histórico, com nome e hora.', { etapa: D, ms: 300 });
    await t.clicar(f.locator('.drawer .seg button[data-s="em_analise"]'), { depois: 500 });
    await t.digitar(f.locator('#tNota'), 'Pedido lançado no Protheus; pagamento agendado para amanhã.', { atraso: 22 });
    await t.clicar(f.locator('#tSalvar'), { depois: 1600 });
    await t.legenda('Resolvido? <b>✓ Ajuste feito</b> encerra a divergência (dá para marcar várias de uma vez).', { etapa: D, ms: 300 });
    await t.clicar(f.locator('#tbDiv tr', { hasText: 'Cond. Vila Rica' }).locator('[data-aj]'), { depois: 1200 });
    await t.digitar(f.locator('#ajNota'), 'TED reenviada e efetuada.', { atraso: 26 });
    await t.clicar(f.locator('#ajOk'), { depois: 1800 });

    const V = '4 · Comprovantes';
    await t.legenda('No <b>Divisor de Comprovantes</b>: a planilha do dia e o PDF com os comprovantes do banco.', { etapa: V, ms: 300 });
    await t.clicar(f.locator('.cx-nav [data-ir="div"]'), { depois: 1400 });
    await t.enviarArquivo(f.locator('#dropPlan'), f.locator('#inPlan'), arq.repasses, { depois: 1200 });
    await t.enviarArquivo(f.locator('#dropPdf'), f.locator('#inPdf'), arq.comprovantes, { depois: 2600 });
    await t.legenda('Cada comprovante é identificado pelo <b>CNPJ</b>, pelo <b>valor</b> e pelo nome, com o condomínio e a assistente de crédito.', { etapa: V, ms: 300 });
    await t.mostrar(f.locator('#pages .pg').first(), 2600, { dy: 0.4 });
    await t.legenda('A <b>conferência</b> mostra os repasses sem comprovante e os comprovantes fora da planilha.', { etapa: V, ms: 300 });
    await t.mostrar(f.locator('#cardConf'), 2800, { dy: 0.3 });
    await t.legenda('<b>Baixar ZIP</b>: uma pasta por responsável, um PDF por condomínio — ou o botão de cada assistente.', { etapa: V, ms: 300 });
    await t.clicar(f.locator('#btnZip'), { depois: 2400 });
  },
  resumo: ['<b>Conciliação</b>: planilha do dia × banco (ou Protheus) → <b>Registrar</b>', '<b>Divergências</b>: tratativa com histórico e <b>✓ Ajuste feito</b>',
    '<b>Divisor de Comprovantes</b>: confere e baixa o ZIP por responsável'],
};
module.exports = roteiro;
