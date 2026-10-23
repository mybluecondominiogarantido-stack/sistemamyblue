'use strict';
/* Importação do histórico das planilhas da Implantação (Formulário + Controle), com planilhas fictícias no formato das reais. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');
const I = require('../server/implantacoes/importacao');

let servidor, base, ctx, admin, coord, equipe, exec;
const ids = {};
function cliente() {
  let cookie = '';
  return async function req(metodo, url, corpo) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    let body;
    if (corpo !== undefined) { body = JSON.stringify(corpo); headers['content-type'] = 'application/json'; }
    const r = await fetch(base + url, { method: metodo, headers, body });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* não é JSON */ }
    return { status: r.status, json, texto };
  };
}
async function entrar(email, senha) { const c = cliente(); assert.equal((await c('POST', '/api/auth/login', { email, senha })).status, 200); return c; }
async function pessoa(nome, email) {
  const r = await admin('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome, email, papel: 'usuario', senha: 'Senha1234' });
  assert.equal(r.status, 201, r.texto);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  ids[email] = r.json.id;
  return entrar(email, 'Senha1234');
}
const noSetor = async (setor, email, lider) => {
  const s = await ctx.db.um('SELECT id FROM setores WHERE nome = $1', [setor]);
  await ctx.db.q('INSERT INTO setor_membros (setor_id, usuario_id, lider) VALUES ($1, $2, $3)', [s.id, ids[email], lider]);
};

/* ---------- planilhas fictícias (títulos das colunas como no Forms e no Controle; dados inventados) ---------- */
const CAB_FORM = ['Id', 'Hora de início', 'Hora de conclusão', 'Email', 'Nome', 'Solicitante:', 'Nome do Condomínio:', 'CNPJ do Condomínio:', 'Informar Estado do Contrato: ',
  'Número total de Unidades:', 'Nome do Executivo de Vendas', 'Tipo de Síndico:', 'E-mail do Executivo de Vendas', ' Dia do vencimento', 'Nome do Síndico', 'CPF do Síndico',
  'Síndico isento de Taxa Condominial?', 'Qual E-mail do Síndico/Condomínio?', 'Qual Telefone de Contato Síndico?', 'Qual o percentual de honorários de cobrança extrajudicial?',
  'Qual o Percentual da Taxa Administrativa?', 'Qual o Valor do Boleto?', 'Qual percentual de cobrança extrajudicial (Honorário)?', 'O que iremos garantir?',
  ' Tem desconto de pontualidade? Se sim, qual o valor ou %?', 'Até qual dia incide o desconto de pontualidade, caso tenha?', 'Possui taxa extra vigente? Se sim, qual o valor e a quantidade de parcelas?',
  'Contrato possui parceiro? Se sim, qual. ', 'Possui Administradora ou contador? Se sim, qual o nome?', 'Nome do responsável (Consultor do Condomínio)?', 'Contrato com Cashback? 1',
  'Foi Negociado Antecipação de Valores? ', 'Qual o contato do consultor (E-mail e/ou telefone)?', 'Contrato com Parceria? Se sim, selecione o parceiro:',
  'Qual a porcentagem do pagamento que será destinada ao parceiro?\n', 'O Condominio é de entrega?', 'Se sim, para pergunta anterior informe a construtora: ',
  'Confirmo que enviarei os seguintes documentos para Implantação', 'Anexe documentação: ', 'Se sim no item anterior, indicar sob quais receitas incidirá o percentual:',
  'Caso tenha Cashback, informar o porcentual:', 'Qual a data de inicio do Contrato?', 'Ficou acordado algum valor a ser antecipado?', 'Se sim para o item anterior, qual o valor?',
  'Qual a data da antecipação? ', 'A antecipação acordada é permanente ou por período determinado?', 'Existe alguma outra observação ou informação pertinente à implantação do cliente? Se sim elencar qual(is)',
  'Coluna1', 'Coluna2', 'Coluna3', 'Coluna4', 'Coluna5', 'Coluna6', 'Flag AQ (aux.)', 'Flag AF (aux.)', 'Antecipação? (aux.)', 'Valor/Detalhe (aux.)'];
function resposta({ id, conclusao, nome, cnpj, estado = 'Fortaleza - Ce', exec = 'Executiva Fictícia', email = 'exec@teste.com', inicio, ant = 'Não', antValor = '', antData = '', antPrazo = '', obs = '' }) {
  const l = Array(CAB_FORM.length).fill('');
  Object.assign(l, { 0: id, 1: conclusao, 2: conclusao, 6: nome, 7: cnpj, 8: estado, 9: '24', 10: exec, 11: 'Condômino', 12: email, 13: '10', 14: 'Síndico Fictício',
    15: '111.444.777-35', 16: 'Sim', 17: 'sindico@exemplo.com', 18: '(85) 90000-0000', 20: '2,5%', 21: 'R$ 2,00', 22: '12%', 23: 'Taxa ordinária;Taxa extra;',
    24: 'Não', 28: 'Administradora Exemplo', 30: 'Não', 33: 'Não tem parceria;', 35: 'Não', 39: 'Não tem Cashback', 41: inicio, 43: antValor, 44: antData, 45: antPrazo, 46: obs, 55: ant });
  return l;
}
const csv = (linhas) => linhas.map((l) => l.map((c) => (/[;"\n]/.test(c) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(';')).join('\r\n');
const CAB_CTRL = ['Nº FORMULÁRIO', 'CONDOMÍNIO', 'CNPJ', 'ESTADO', 'DIA VENC.', '1º VENC.', 'ADM.', 'EXECUTIVO', 'SÍNDICO', 'CONTRATO', 'DATA CONTRATO', 'DOC.', 'DATA DOC.', 'VOUCH',
  'ONBOARDING', 'DATA ONBOARDING', 'EMISSÃO DE BOLETOS', 'ENVIO E-MAIL/FÍSICO', 'IMPLANTADO POR', 'OBS.', 'MÊS', '% CONCLUÍDO', 'Nº FORM (Ref.)', 'ESTADO (bruto)', 'CONDOMÍNIO (chave)', 'CONFERÊNCIA', 'CARGO / E-MAIL EXEC.'];
function linhaCtrl({ n, nome, cnpj, uf = 'CE', contrato, doc = 'SIM', dataDoc, onb = 'REALIZADO', dataOnb = '', boletos = 'SIM', envio = 'DIGITAL', por = 'Analista de Implantação Fictícia', obs = '', mes, pct, ref }) {
  return [String(n), nome, cnpj, uf, '10', '10/' + contrato.slice(3, 5), 'Adm', 'Executiva Fictícia', 'Síndico Fictício', 'SIM', contrato, doc, dataDoc, 'SIM', onb, dataOnb, boletos, envio, por, obs, mes, pct, String(ref), '', nome, 'OK', ''];
}
const CNPJ = { a: '11.222.333/0001-81', b: '45.997.418/0001-53', c: '12.345.678/0001-95', d: '27.865.757/0001-02', e: '33.000.167/0001-01', f: '60.746.948/0001-12' };
// Formulário: linha do Forms = posição (título na linha 1). Ids 4 e 5 repetidos como na planilha real.
const FORM = [CAB_FORM,
  resposta({ id: '1', conclusao: '10/02/2025 10:00', nome: 'Residencial Histórico Alfa', cnpj: CNPJ.a, inicio: '01/03/2025' }), // linha 2: histórico, na Carteira
  resposta({ id: '2', conclusao: '45700,5', nome: 'Edifício Histórico Beta', cnpj: CNPJ.b, estado: 'Natal Rn', inicio: '01/04/2025' }), // linha 3: data em série do Excel
  resposta({ id: '3', conclusao: '20/05/2025 09:00', nome: 'Edifício Histórico Beta', cnpj: CNPJ.b, estado: 'Natal Rn', inicio: '01/06/2025' }), // linha 4: mesmo nome no ano → vale esta
  resposta({ id: '4', conclusao: '05/12/2025 10:00', nome: 'Condomínio Novo Gama', cnpj: CNPJ.c, inicio: '01/01/2026' }), // linha 5: Controle Nº 4
  resposta({ id: '4', conclusao: '06/12/2025 10:00', nome: 'Condomínio Novo Delta', cnpj: CNPJ.d, estado: 'João Pessoa, Paraíba', inicio: 'jan-26', ant: 'Sim', antValor: 'R$ 15.000,00', antData: '15/01/2026', antPrazo: '10 parcelas' }), // linha 6: Controle Nº 4 de novo
  resposta({ id: '5', conclusao: '07/12/2025 10:00', nome: 'Condomínio Teste', cnpj: CNPJ.e, inicio: '01/01/2026' }), // linha 7: Controle desconsiderar
  resposta({ id: '6', conclusao: '01/08/2026 10:00', nome: 'Residencial Novo Épsilon', cnpj: CNPJ.f, inicio: '01/09/2026', email: 'outro.exec@teste.com', exec: 'Executivo Desconhecido' }), // linha 8
];
const CTRL = [['CONTROLE IMPLANTAÇÕES '], ['', '2026'], CAB_CTRL,
  linhaCtrl({ n: 4, nome: 'Condomínio Novo Gama', cnpj: CNPJ.c, contrato: '01/01/2026', dataDoc: '05/12/2025', mes: 'jan/26', pct: '100%', ref: 5, obs: 'síndico prefere e-mail' }),
  linhaCtrl({ n: 4, nome: 'Condomínio Novo Delta', cnpj: CNPJ.d, uf: 'PB', contrato: '01/01/2026', dataDoc: '06/12/2025', onb: 'A MARCAR', mes: 'jan/26', pct: '80%', ref: 6 }),
  linhaCtrl({ n: 5, nome: 'Condomínio Teste', cnpj: CNPJ.e, contrato: '01/01/2026', dataDoc: '07/12/2025', mes: 'jan/26', pct: '100%', ref: 7, obs: 'DESCONSIDERAR - teste' }),
  linhaCtrl({ n: 6, nome: 'Residencial Novo Épsilon', cnpj: CNPJ.f, contrato: '01/09/2026', dataDoc: '01/08/2026', onb: 'REALIZADO', mes: 'set/26', pct: '100%', ref: 8, por: 'Pessoa de Fora' }),
  [], ['', '2027'], CAB_CTRL];
const b64 = (s) => Buffer.from(s, 'latin1').toString('base64'); // como o Excel salva (Windows-1252)
const ARQ = { formulario: b64(csv(FORM)), controle: b64(csv(CTRL)) };

before(async () => {
  const cfg = lerConfig({ dataDir: ':memoria:', databaseUrl: '', adminEmail: 'admin@teste.com', adminSenha: 'Admin1234', silencioso: true, porta: 0, portalUrl: 'https://portal.teste', enviarEmail: async () => {} });
  const r = await criarApp(cfg);
  ctx = r.ctx;
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE');
  servidor = http.createServer(r.app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  admin = await entrar('admin@teste.com', 'Admin1234');
  coord = await pessoa('Coordenadora Fictícia', 'coord@teste.com');
  equipe = await pessoa('Analista de Implantação Fictícia', 'equipe@teste.com');
  exec = await pessoa('Executiva Fictícia', 'exec@teste.com');
  await noSetor('Implantação', 'coord@teste.com', true);
  await noSetor('Implantação', 'equipe@teste.com', false);
  assert.equal((await admin('POST', '/api/credito/executivos', { nome: 'Executiva Fictícia', uf: 'CE', regiao: 'Ceará', usuario_id: ids['exec@teste.com'] })).status, 201);
  await ctx.db.q("INSERT INTO condominios (codigo, nome, cnpj) VALUES ('90001', 'RESIDENCIAL HISTORICO ALFA', $1)", [CNPJ.a]);
});
after(async () => { servidor.close(); await ctx.db.fechar(); });

test('leitura: datas do Excel, só mês e ano e UF do texto livre', () => {
  assert.equal(I.data('45700,5').dia, '2025-02-12');
  assert.deepEqual([I.data('set-26').dia, I.data('set-26').tipo], ['2026-09-01', 'mes']);
  assert.equal(I.data('05/12/2024 10:03').dia, '2024-12-05');
  assert.deepEqual(['Fortaleza - Ce', 'Natal Rn', 'João Pessoa, Paraíba', 'Itaitinga, Ceará', 'DF', 'Extremoz, Rio grande do Norte'].map(I.uf), ['CE', 'RN', 'PB', 'CE', 'DF', 'RN']);
  assert.equal(I.numero('R$1,30'), 1.3);
  assert.equal(I.numero('2,5 %'), 2.5);
});

test('prévia: regras da planilha (linha do Forms, desconsiderar, envio mais recente no ano) e nada gravado', async () => {
  assert.equal((await equipe('POST', '/api/implantacoes/importacao/previa', ARQ)).status, 403);
  const r = await coord('POST', '/api/implantacoes/importacao/previa', ARQ);
  assert.equal(r.status, 200, r.texto);
  const { resumo, itens } = r.json;
  assert.deepEqual([resumo.respostas, resumo.linhas_controle, resumo.controle, resumo.historico, resumo.desconsideradas, resumo.substituidas], [7, 4, 3, 2, 1, 1]);
  const por = (c) => itens.find((x) => x.chave === c);
  // Nº 4 repetido no Controle: cada linha acha a sua resposta pela linha do Forms
  assert.deepEqual([por('C5').condominio, por('C6').condominio], ['Condomínio Novo Gama', 'Condomínio Novo Delta']);
  assert.match(por('C7').motivo, /^desconsiderada na planilha/);
  assert.equal(por('F3').situacao, 'fora'); // Beta: vale o envio de maio (linha 4)
  assert.match(por('F3').motivo, /substituída/);
  assert.deepEqual([por('F4').situacao, por('F4').uf, por('F2').carteira, por('F2').executivo_achado], ['aviso', 'RN', '90001', true]);
  assert.ok(por('C6').avisos.some((a) => /só com mês e ano/.test(a)) === false); // a data do contrato vem do Controle
  assert.ok(por('C8').avisos.some((a) => /Pessoa de Fora/.test(a)));
  assert.ok(por('C8').avisos.some((a) => /Executivo Desconhecido/.test(a)));
  assert.deepEqual(resumo.por_mes.map((m) => [m.mes, m.contratos, m.pct_medio]), [['2026-01', 2, 90], ['2026-09', 1, 100]]);
  assert.equal((await ctx.db.um('SELECT COUNT(*)::int AS n FROM implantacoes')).n, 0);
});

test('importar: histórico concluído, 2026 com etapas, documentos da meta, Obs.; sem avisos, fora das filas e das rotinas', async () => {
  const antes = (await ctx.db.um('SELECT COUNT(*)::int AS n FROM notificacoes')).n;
  const r = await coord('POST', '/api/implantacoes/importacao', ARQ);
  assert.equal(r.status, 201, r.texto);
  assert.deepEqual([r.json.importadas, r.json.fora], [5, 2]);
  assert.equal((await coord('POST', '/api/implantacoes/importacao', ARQ)).status, 409);
  const linhas = (await ctx.db.q('SELECT * FROM implantacoes ORDER BY numero_planilha, id')).rows;
  const de = (nome) => linhas.find((x) => x.condominio === nome);
  const alfa = de('Residencial Histórico Alfa');
  assert.deepEqual([alfa.etapa, alfa.origem, alfa.protocolo, alfa.numero_planilha, !!alfa.condominio_id], ['na_carteira', 'planilha', null, 1, true]);
  const gama = de('Condomínio Novo Gama');
  assert.deepEqual([gama.etapa, gama.responsavel_id, gama.etapas.onboarding.situacao, gama.etapas.boletos.primeiro_vencimento, gama.obs_controle.texto],
    ['na_carteira', ids['equipe@teste.com'], 'realizado', '2026-01-10', 'síndico prefere e-mail']);
  const delta = de('Condomínio Novo Delta');
  assert.deepEqual([delta.etapa, delta.uf, delta.formulario.antecipacao, delta.formulario.antecipacao_valor], ['em_implantacao', 'PB', 'sim', 15000]);
  const eps = de('Residencial Novo Épsilon');
  assert.deepEqual([eps.responsavel_id, eps.importacao.implantado_por, eps.importacao.executivo], [null, 'Pessoa de Fora', 'Executivo Desconhecido']);
  const docs = (await ctx.db.q('SELECT tipo, sem_arquivo, to_char(enviado_em AT TIME ZONE \'America/Sao_Paulo\', \'YYYY-MM-DD\') AS dia FROM implantacao_documentos WHERE implantacao_id = $1 ORDER BY tipo', [eps.id])).rows;
  assert.deepEqual(docs.map((d) => [d.tipo, d.sem_arquivo, d.dia]), [['ata_eleicao', true, '2026-08-01'], ['ata_orcamento', true, '2026-08-01'], ['convencao', true, '2026-08-01'], ['procuracao', true, '2026-08-01']]);
  // nada de avisos; fora da fila e das minhas; as rotinas não pegam as importadas
  assert.equal((await ctx.db.um('SELECT COUNT(*)::int AS n FROM notificacoes')).n, antes);
  assert.equal((await equipe('GET', '/api/implantacoes?vis=fila')).json.implantacoes.length, 0);
  assert.equal((await equipe('GET', '/api/implantacoes/resumo')).json.minhas, 0);
  assert.equal((await equipe('GET', '/api/implantacoes?vis=todas')).json.implantacoes.length, 5);
  await ctx.rotinasImplantacao.executar(new Date('2026-12-02T17:00:00Z'));
  assert.equal((await ctx.db.um('SELECT COUNT(*)::int AS n FROM notificacoes')).n, antes);
  // no Acompanhamento: no histórico (com o Nº e a etiqueta), metas de 2026 contadas
  const j = (await coord('GET', '/api/implantacoes/acompanhamento?ano=2026')).json;
  const le = j.linhas.find((x) => x.id === eps.id);
  assert.deepEqual([le.importada, le.numero, le.responsavel_nome, le.executivo_nome, le.na_meta, le.onboarding.status, le.documentacao.status],
    [true, 6, 'Pessoa de Fora', 'Executivo Desconhecido', true, 'batida', 'batida']);
  // na implantação: só consulta, sem prazo e sem ficha; a em andamento pode ser concluída, sem avisos
  const d = (await equipe('GET', `/api/implantacoes/${delta.id}`)).json;
  assert.deepEqual([d.pode.importada, d.pode.etapas, d.pode.pendencia, d.setor.prazo_concluir], [true, true, false, null]);
  assert.equal((await equipe('POST', `/api/implantacoes/${delta.id}/antecipacao/enviar`, {})).status, 409);
  assert.equal((await equipe('PATCH', `/api/implantacoes/${delta.id}/etapas`, { etapas: { ...delta.etapas, onboarding: { situacao: 'realizado', data: '2026-02-01' } } })).status, 200);
  assert.equal((await equipe('POST', `/api/implantacoes/${delta.id}/concluir`, {})).status, 200);
  assert.equal((await ctx.db.um('SELECT etapa FROM implantacoes WHERE id = $1', [delta.id])).etapa, 'na_carteira');
  assert.equal((await ctx.db.um('SELECT COUNT(*)::int AS n FROM implantacao_fichas')).n, 0);
  assert.equal((await ctx.db.um('SELECT COUNT(*)::int AS n FROM notificacoes')).n, antes);
});

test('desfazer: apaga o que ninguém mexeu; a que foi editada no portal fica; depois dá para importar de novo', async () => {
  const lotes = (await coord('GET', '/api/implantacoes/importacao')).json.lotes;
  assert.equal(lotes.length, 1);
  const r = await coord('POST', `/api/implantacoes/importacao/${lotes[0].id}/desfazer`, {});
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual([r.json.apagadas, r.json.mantidas.map((x) => x.condominio)], [4, ['Condomínio Novo Delta']]);
  const p = (await coord('POST', '/api/implantacoes/importacao/previa', ARQ)).json;
  assert.match(p.itens.find((x) => x.chave === 'C6').motivo, /já está no portal/);
  assert.equal((await coord('POST', '/api/implantacoes/importacao', ARQ)).json.importadas, 4);
});
