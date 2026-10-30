'use strict';
/*
 * Tutorial da Análise de Espólio (Cobrança). Dados fictícios: condomínios da carteira do cenário,
 * titulares, CPFs, telefones e relatórios inventados.
 *
 * A coordenadora da Cobrança (Lia Souza, papel Gestão) recebe a solicitação da Implantação, anexa o
 * relatório do Vouch e a inadimplência anterior, confere a classificação, conclui (ficha) e faz a
 * reanálise de 90 dias pela Fila de acompanhamento.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const SLUG = 'analise-de-espolio';
const quadro = (t) => t.p.frameLocator(`iframe[data-slug="${SLUG}"]`);
const arquivoTemp = (nome, conteudo) => { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tut-')), nome); fs.writeFileSync(f, conteudo); return f; };

/* datas relativas a hoje (o vídeo funciona em qualquer dia) */
const FUSO = 'America/Sao_Paulo';
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: FUSO });
const dia = (n) => { const d = new Date(hoje() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const br = (iso) => iso.split('-').reverse().join('/');
const ANO = hoje().slice(0, 4);
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
/* competência n meses antes do mês atual: { mes: 'Julho', ano: '2026', venc: '10/07/2026', mm: '07' } */
function comp(n) {
  const d = new Date(hoje().slice(0, 7) + '-10T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - n);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0'), aa = String(d.getUTCFullYear());
  return { mes: MESES[d.getUTCMonth()], ano: aa, mm, venc: `10/${mm}/${aa}` };
}
const CNPJ = (i) => `12.345.678/000${i + 1}-9${i}`; // o mesmo da carteira do cenário
const chave = (i) => 'cnpj:' + CNPJ(i).replace(/\D/g, '');

/* ---------- histórico fictício (análises já concluídas, base do BI e a solicitação nova) ---------- */
let seq = 0;
const uid = () => 'u' + (++seq).toString(36) + 'x' + Math.random().toString(36).slice(2, 6);
function unidade(unid, titular, cpf, resultado, regra, motivo, vouch, ant) {
  return { id: uid(), unid, titular, cpf, obs: '', override: '', motivoAjuste: '', manual: { vouch: null, ant: null }, esc: { vouch: null, ant: null },
    cas: { vouch: null, ant: null }, vouch, ant, resultado, regra, motivo, situacao: resultado === 'EXCLUIR' ? 'excluida' : 'ativa', encerramento: null, completar: false, pendente: false };
}
function rodada(protocolo, tipo, i, nome, data, unidades, extra) {
  const n = (x) => unidades.filter((u) => u.resultado === x).length;
  return { protocolo, tipo, origem: 'modulo', condominio: { nome, cnpj: CNPJ(i), chave: chave(i) }, dataAnalise: data, analista: 'Otto Reis', idadeGarantia: 4,
    bi: { valor: 820, sinal: '-' }, semAnterior: tipo === 'avulso', semBi: false, semVouch: false, nota: '', status: 'concluida',
    vouch: { corte: br(dia(-1)), emissao: br(data), totalTaxas: 4, totalUnidades: 2, lidas: 4, conferido: true }, unidades, anterior: null,
    proximaReanalise: dia(diasEntre(hoje(), data) + 90), criadaEm: data + 'T13:00:00.000Z', criadoPor: 'mb-0', criadoPorNome: 'Lia Souza',
    concluidaEm: data + 'T15:30:00.000Z', concluidoPor: 'mb-0', concluidoPorNome: 'Lia Souza',
    resumo: { total: unidades.length, excluir: n('EXCLUIR'), prev: n('PREVENTIVO'), rean: n('REANÁLISE'), enc: 0, pendentes: 0 }, ...extra };
}
const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);

function documentos(ids) {
  const lia = 'mb-' + ids['lia@myblue.com.br'], otto = 'mb-' + ids['otto@myblue.com.br'];
  const d1 = dia(-102), d2 = dia(-79), d3 = dia(-24);
  const r1 = rodada(`AE-${ANO}-0001`, 'implantacao', 1, 'Ed. Solar das Palmeiras', d1, [
    unidade('A - 101', 'HELENA DUARTE CAMPOS', '214.538.907-31', 'PREVENTIVO', '3', 'Sem Vouch; anterior pontual (1).', 0, 1),
    unidade('B - 203', 'ROGÉRIO ANTUNES PIRES', '388.120.645-02', 'EXCLUIR', '1', '2 no Vouch e 3 na base anterior.', 2, 3),
    unidade('C - 302', 'OTÁVIO BRANDÃO LIMA', '502.776.318-40', 'PREVENTIVO', '3', 'Implantação sem inadimplência no Vouch (esperado nesta fase).', 0, 0)]);
  const r2 = rodada(`AE-${ANO}-0002`, 'implantacao', 0, 'Cond. Jardim Azul', d2, [
    unidade('101', 'CLARA MENDONÇA REIS', '127.904.556-18', 'EXCLUIR', '1', '3 no Vouch e 2 na base anterior.', 3, 2),
    unidade('402', 'WALTER SIQUEIRA NETO', '640.215.937-55', 'PREVENTIVO', '5', 'Contrato recente (4 meses) e 1 cobrança(s).', 1, 0)]);
  const r3 = rodada(`AE-${ANO}-0003`, 'avulso', 3, 'Cond. Vila Rica', d3, [
    unidade('B - 12', 'NAIR GONÇALVES PRADO', '731.442.890-26', 'PREVENTIVO', '4', '1 cobrança(s) no Vouch com BI positivo — em acompanhamento.', 1, 0)], { analista: 'Marcos Lima', bi: { valor: 2140, sinal: '+' } });
  const docs = {
    ['perfis/' + lia]: { id: lia, nome: 'Lia Souza', papeis: ['gestao'], nomeCarteira: '' },
    ['perfis/' + otto]: { id: otto, nome: 'Otto Reis', papeis: ['implantacao'], nomeCarteira: '' },
    ['vistos/' + otto]: { id: otto, nome: 'Otto Reis', em: dia(-1) + 'T12:00:00.000Z' },
    'meta/estado': { seq: { [ANO]: 4 } },
    'meta/acesso': { ticketSetor: 'Crédito' },
    'rodadas/r1': r1, 'rodadas/r2': r2, 'rodadas/r3': r3,
    'bi_base/atual': { enviadoEm: dia(0) + 'T11:00:00.000Z', por: 'Lia Souza', arquivo: 'Resultado_BI.xlsx', base: [
      { nome: 'Condomínio Jardim Azul', meses: 6, sinal: '+', resultado: 3120.4 }, { nome: 'Edifício Solar das Palmeiras', meses: 7, sinal: '-', resultado: 410 },
      { nome: 'Residencial Primavera', meses: 4, sinal: '-', resultado: 1250 }, { nome: 'Condomínio Vila Rica', meses: 3, sinal: '+', resultado: 2140 },
      { nome: 'Edifício Aurora', meses: 2, sinal: '+', resultado: 980.5 }] },
    // a solicitação nova, enviada pela Implantação ontem
    'solicitacoes/s4': { condominio: { nome: 'Res. Primavera', cnpj: CNPJ(2), chave: chave(2) }, origem: 'implantacao', tipo: 'implantacao',
      unidades: [{ unid: 'A - 102', titular: 'MARTA RIBEIRO GOMES', cpf: '301.452.118-07' }, { unid: 'B - 204', titular: 'SÉRGIO PAIVA MOREIRA', cpf: '455.903.271-60' },
        { unid: 'C - 301', titular: 'LÚCIA FERNANDES ROCHA', cpf: '612.087.334-19' }],
      obs: 'Inventário em andamento na A - 102; herdeiros em contato com a administração.', solicitanteId: otto, solicitanteNome: 'Otto Reis',
      criadaEm: dia(-1) + 'T14:20:00.000Z', status: 'nova', vistaEm: null, rodadaId: null, protocolo: `AE-${ANO}-0004`, resultado: [], motivoDevolucao: '' },
  };
  // as análises antigas também vieram de solicitações (já concluídas)
  [[r1, 'r1', 's1', d1], [r2, 'r2', 's2', d2], [r3, 'r3', 's3', d3]].forEach(([r, rid, sid, d]) => {
    r.solicitacaoId = sid;
    docs['solicitacoes/' + sid] = { condominio: r.condominio, origem: r.tipo, tipo: r.tipo, unidades: r.unidades.map((u) => ({ unid: u.unid, titular: u.titular, cpf: u.cpf })),
      obs: '', solicitanteId: otto, solicitanteNome: r.analista, criadaEm: dia(diasEntre(hoje(), d) - 2) + 'T12:00:00.000Z', status: 'concluida', vistaEm: d + 'T12:00:00.000Z',
      rodadaId: rid, protocolo: r.protocolo, resultado: r.unidades.map((u) => ({ unid: u.unid, titular: u.titular, cpf: u.cpf, resultado: u.resultado, regra: u.regra, motivo: u.motivo })),
      motivoDevolucao: '', concluidaEm: r.concluidaEm };
  });
  return docs;
}

/* ---------- arquivos de entrada (fictícios) ---------- */
const brl = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/* Relatório de Inadimplências - Consolidado do Vouch: o leitor da ferramenta usa as linhas do PDF (células separadas) */
function htmlVouch(nome, cnpj, devedores) {
  const taxas = devedores.reduce((s, d) => s + d.taxas.length, 0), inad = devedores.filter((d) => d.taxas.length).length;
  const total = devedores.reduce((s, d) => s + d.taxas.length * d.valor, 0);
  let doc = 7104500;
  const linhas = devedores.map((d) => `
    <tr class="dev"><td>${d.unid}</td><td colspan="2">${d.nome}</td><td colspan="2">${d.cpf}</td><td>${d.tel}</td></tr>
    ${d.taxas.length ? d.taxas.map((c) => `<tr><td>${String(++doc).padStart(8, '0')}</td><td>${c.ano} - ${c.mes}</td><td>Taxa de arrecadação</td><td>${c.venc}</td><td></td><td class="v">${brl(d.valor)}</td></tr>`).join('')
      + `<tr class="sub"><td>Subtotal</td><td></td><td></td><td></td><td></td><td class="v">${brl(d.valor * d.taxas.length)}</td></tr>`
      : '<tr><td colspan="6">Nada consta</td></tr>'}`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font:11px Arial,sans-serif;margin:14mm;color:#222} p{margin:0 0 6px} table{border-collapse:collapse;width:100%;margin-top:10px}
    td,th{padding:4px 8px;text-align:left;white-space:nowrap} th{border-bottom:1px solid #999} .dev td{font-weight:bold;padding-top:10px} .v{text-align:right} .sub td{border-top:1px solid #ccc}
  </style></head><body>
    <p style="font-size:9px;color:#777">EXEMPLO FICTÍCIO PARA TUTORIAL</p>
    <p><b>Condomínio ${nome} - CNPJ ${cnpj}</b></p>
    <p>Relatório de Inadimplências - Consolidado (Até ${br(dia(-1))}) &nbsp; &nbsp; &nbsp; Emissão: ${br(dia(0))} 08:15:00</p>
    <p>Total (${taxas} taxas em ${inad} unidades, R$ ${brl(total)})</p>
    <table><tr><th>Documento</th><th>Competência</th><th>Referência</th><th>Vencimento</th><th>Novo Vencimento</th><th class="v">Valor</th></tr>${linhas}</table>
  </body></html>`;
}
async function arquivos(navegador) {
  const pg = await navegador.newPage();
  const pdf = async (nome, html) => { await pg.setContent(html); return arquivoTemp(nome, await pg.pdf({ format: 'A4' })); };
  const [c3, c2, c1] = [comp(3), comp(2), comp(1)];
  const vouch = await pdf('Inadimplencia_Vouch_Res_Primavera.pdf', htmlVouch('RES. PRIMAVERA', CNPJ(2), [
    { unid: 'A - 102', nome: 'MARTA RIBEIRO GOMES', cpf: '301.452.118-07', tel: '(85) 98877-1020', valor: 412.5, taxas: [c3, c2, c1] },
    { unid: 'A - 103', nome: 'PAULO HENRIQUE DIAS', cpf: '208.334.150-72', tel: '(85) 99631-4410', valor: 412.5, taxas: [c1] },
    { unid: 'B - 204', nome: 'SÉRGIO PAIVA MOREIRA', cpf: '455.903.271-60', tel: '(85) 98120-7735', valor: 412.5, taxas: [] },
    { unid: 'C - 301', nome: 'LÚCIA FERNANDES ROCHA', cpf: '612.087.334-19', tel: '(85) 99704-2288', valor: 398, taxas: [c2, c1] },
  ]));
  const reanalise = await pdf('Inadimplencia_Vouch_Ed_Solar_das_Palmeiras.pdf', htmlVouch('ED. SOLAR DAS PALMEIRAS', CNPJ(1), [
    { unid: 'A - 101', nome: 'HELENA DUARTE CAMPOS', cpf: '214.538.907-31', tel: '(11) 98450-3321', valor: 530, taxas: [c3, c2, c1] },
    { unid: 'C - 302', nome: 'OTÁVIO BRANDÃO LIMA', cpf: '502.776.318-40', tel: '(11) 99812-0457', valor: 530, taxas: [] },
    { unid: 'D - 404', nome: 'IVONE CARDOSO MELO', cpf: '377.610.442-85', tel: '(11) 97733-1290', valor: 530, taxas: [c1] },
  ]));
  await pg.close();
  // inadimplência da administradora anterior na planilha padrão (antes da garantia MyBlue)
  const xlsx = require(path.join(process.env.BIBLIOTECAS || '', 'node_modules', 'xlsx'));
  const ant = (n) => { const c = comp(n); return [`${c.mm}/${c.ano}`, c.venc]; };
  const linhas = [['Inadimplência anterior · Res. Primavera (exemplo fictício)'], [],
    ['Unidade', 'Titular', 'CPF', 'Descrição', 'Competência', 'Vencimento'],
    ['A - 102', 'MARTA RIBEIRO GOMES', '301.452.118-07', 'TAXA CONDOMINIAL', ...ant(7)],
    ['A - 102', 'MARTA RIBEIRO GOMES', '301.452.118-07', 'TAXA CONDOMINIAL', ...ant(6)],
    ['B - 204', 'SÉRGIO PAIVA MOREIRA', '455.903.271-60', 'TAXA CONDOMINIAL', ...ant(8)],
    ['D - 401', 'RAQUEL TAVARES SOUZA', '190.274.663-08', 'TAXA CONDOMINIAL', ...ant(6)]];
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(linhas), 'Inadimplência');
  const anterior = arquivoTemp('Inadimplencia_anterior_Res_Primavera.xlsx', xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  return { vouch, reanalise, anterior };
}

/* Bibliotecas do cdnjs (pdf.js e SheetJS). Na ferramenta isolada o portal troca o endereço por /t/<chave>/cdn/cdnjs/…
   e, sem internet, redireciona para o cdnjs — o redirecionamento escapa da rota do gravador. Aqui a cópia local
   (BIBLIOTECAS) é entregue já no endereço do portal; depois a página é recarregada.
   O html2pdf (ficha em PDF) fica de fora de propósito: isolada (sandbox sem allow-same-origin), a cópia da página que
   ele monta num iframe é bloqueada ("Blocked a frame with origin null") e a conclusão mostra um erro. Sem ele, a
   ferramenta usa o próprio caminho alternativo (imprimir a ficha) e segue para o ticket, como deve ser. */
const PACOTES = { 'pdf.js': 'pdfjs-dist/build', xlsx: 'xlsx/dist' };
async function servirBibliotecas(t) {
  await t.ctx.route(/\/cdn\/cdnjs\/ajax\/libs\//, (rota) => {
    const [lib, , arquivo] = new URL(rota.request().url()).pathname.split('/ajax/libs/')[1].split('/');
    if (lib === 'html2pdf.js') return rota.abort();
    const local = PACOTES[lib] && path.join(process.env.BIBLIOTECAS || '', 'node_modules', PACOTES[lib], arquivo);
    if (!local || !fs.existsSync(local)) return rota.continue();
    return rota.fulfill({ path: local, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await t.p.reload();
}

const roteiro = {
  nome: 'ferramenta-espolio',
  ferramenta: SLUG,
  entrar: 'lia@myblue.com.br',
  inicio: '#/m/' + SLUG,
  async preparar(cen) {
    // a carteira (carteira/atual) é mantida pelo banco: entra junto, para a importação não apagar
    const atual = await cen.admin('GET', `/api/admin/modulos/${SLUG}/dados`);
    const docs = documentos(cen.id);
    for (const [c, v] of Object.entries((atual && atual.colecoes) || {})) {
      if (c !== 'carteira') continue;
      for (const { id, ...dados } of v.documentos) docs[`${c}/${id}`] = dados;
    }
    if (!docs['carteira/atual']) throw new Error('a carteira de condomínios não chegou à ferramenta');
    const r = await cen.admin('POST', `/api/admin/modulos/${SLUG}/documentos`, { modulo: SLUG, documentos: docs });
    if (!r || !r.total) throw new Error('não gravou os dados de exemplo: ' + JSON.stringify(r));
  },
  async ajustar(t) {
    await servirBibliotecas(t);
    await quadro(t).locator('#sync.on').waitFor({ state: 'attached', timeout: 20000 });
    await quadro(t).locator('#dashTiles .tile').first().waitFor({ timeout: 15000 });
    await t.pausa(800);
  },
  abertura: ['Quais unidades com titular falecido saem da garantia e quais seguem em acompanhamento, da solicitação à ficha.',
    ['Painel e solicitações', 'Relatórios: Vouch, administradora anterior e BI', 'Classificação pela política e ficha', 'Reanálise a cada 90 dias']],
  async gravar(t) {
    const f = quadro(t);
    const aba = (id) => f.locator(`#tabs .tab[data-tab="${id}"]`);
    const arq = await arquivos(t.p.context().browser());

    const V = '1 · Visão geral';
    await t.legenda('O <b>Dashboard</b> mostra os espólios sinalizados, as análises do mês, o que está pendente e as exclusões.', { etapa: V, ms: 500 });
    await t.mostrar(f.locator('#dashTiles'), 2600, { dy: 0.5 });
    await t.legenda('Abaixo: o resultado por mês e as <b>próximas reanálises</b>, que vencem 90 dias depois de cada análise.', { etapa: V, ms: 300 });
    await t.rolar(380, f.locator('#dashGrafico'));
    await t.mostrar(f.locator('#dashFila'), 2000);
    await t.rolar(-380);

    const S = '2 · Solicitação';
    await t.legenda('A Implantação (ou a Cobrança) pede a análise com as unidades de titular falecido. O pedido chega em <b>Solicitações</b>.', { etapa: S, ms: 300 });
    await t.clicar(aba('sol'), { depois: 1400 });
    await t.clicar(f.locator('#p-sol tr[data-sol]').first(), { depois: 1400 });
    await t.legenda('Confira o condomínio, quem pediu e as unidades. <b>Iniciar análise</b> abre a análise já preenchida.', { etapa: S, ms: 300 });
    await t.mostrar(f.locator('#modal table'), 2000);
    await t.clicar(f.locator('#mSolIniciar'), { depois: 1800 });

    const D = '3 · Relatórios';
    await t.legenda('Anexe o <b>relatório de inadimplência do Vouch</b> (PDF consolidado). A leitura é conferida com o total do relatório.', { etapa: D, ms: 300 });
    await t.enviarArquivo(f.locator('#docVouch'), f.locator('input[data-doc="vouch"]'), arq.vouch, { depois: 2600 });
    await t.legenda('Depois, a <b>inadimplência anterior</b>: o PDF da administradora anterior ou a planilha padrão.', { etapa: D, ms: 300 });
    await t.enviarArquivo(f.locator('#docAnt'), f.locator('input[data-doc="ant"]'), arq.anterior, { depois: 2600 });
    await t.legenda('O <b>Power BI</b> vem da base do dia (em Configurações): a idade da garantia e o resultado entram sozinhos.', { etapa: D, ms: 300 });
    await t.mostrar(f.locator('#docBi'), 1200);
    await t.mostrar(f.locator('#bi'), 1800);

    const C = '4 · Classificação';
    await t.legenda('Cada unidade é classificada pela <b>Política de Análise de Espólio</b>: <b>Excluir</b> ou <b>Em acompanhamento</b>, com a regra aplicada.', { etapa: C, ms: 300 });
    await t.mostrar(f.locator('#unidadesWrap details.unid').first(), 1800, { dy: 0.3 });
    await t.mostrar(f.locator('#unidadesWrap details.unid').nth(2), 1500, { dy: 0.3 });
    await t.legenda('Clique na unidade para ver as <b>evidências</b> (as taxas lidas em cada relatório) e, se precisar, ajustar com motivo.', { etapa: C, ms: 300 });
    await t.clicar(f.locator('#unidadesWrap details.unid summary').first(), { depois: 1200 });
    await t.mostrar(f.locator('#unidadesWrap .prova').first(), 2400);
    await t.clicar(f.locator('#unidadesWrap details.unid summary').first(), { depois: 800 });

    const F = '5 · Concluir e ficha';
    await t.legenda('A <b>ficha</b> é montada ao lado, pronta para a pasta do condomínio. Tudo certo? <b>Concluir análise</b>.', { etapa: F, ms: 300 });
    await t.rolar(500, f.locator('#fichaPreview'));
    await t.mostrar(f.locator('#fichaPreview .f-tab'), 2200);
    await t.clicar(f.locator('#btnConcluir'), { depois: 2500 });
    await t.legenda('Com exclusão, a ficha sai na hora para formalizar. Em seguida, abra o <b>ticket</b> para quem guarda a ficha na pasta.', { etapa: F, ms: 300 });
    await f.locator('#tkEnviar').waitFor({ timeout: 15000 });
    await t.mostrar(f.locator('#tkResp'), 1200);
    await t.mostrar(f.locator('#tkEnviar'), 1800);
    await t.clicar(f.locator('#modal [data-fechar]'), { depois: 900 });

    const R = '6 · Reanálise';
    await t.legenda('Quem segue em acompanhamento entra na <b>Fila de acompanhamento</b>, com reanálise a cada 90 dias.', { etapa: R, ms: 300 });
    await t.clicar(aba('lote'), { depois: 1600 });
    await t.legenda('<b>Selecionar vencidos</b> e <b>Reanalisar</b>: anexe o PDF do Vouch de cada um — o condomínio é reconhecido pelo cabeçalho.', { etapa: R, ms: 300 });
    await t.clicar(f.locator('#btnSelVencidos'), { depois: 900 });
    const escolha = t.p.waitForEvent('filechooser', { timeout: 10000 });
    await t.clicar(f.locator('#btnReanalisarSel'), { depois: 300 });
    await (await escolha).setFiles(arq.reanalise);
    await f.locator('#loteAndamento [data-revisar]').waitFor({ timeout: 15000 });
    await t.pausa(600);
    await t.legenda('Na reanálise só o Vouch conta: <b>3 ou mais</b> taxas em aberto → Excluir; abaixo disso, segue em acompanhamento.', { etapa: R, ms: 300 });
    await t.clicar(f.locator('#loteAndamento [data-revisar]').first(), { depois: 1600 });
    await t.mostrar(f.locator('#modal details.unid').first(), 2200, { dy: 0.3 });
    await t.legenda('Revisado, <b>Concluir</b>: a análise ganha protocolo e o prazo da próxima reanálise.', { etapa: R, ms: 300 });
    await t.clicar(f.locator('#mLoteConcluir'), { depois: 2600 });
  },
  resumo: ['<b>Solicitações</b> → <b>Iniciar análise</b>: Vouch, inadimplência anterior e BI', 'Classificação pela política: <b>Excluir</b> ou <b>Em acompanhamento</b> → <b>Concluir</b> (ficha e ticket)',
    '<b>Fila de acompanhamento</b>: reanálise a cada 90 dias, só pelo Vouch'],
};
module.exports = roteiro;
