'use strict';
/* Controle de Renegociações → ticket para a assistente de crédito (node --test). Dados fictícios. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');
const { acharCondominio, chaveCondominio } = require('../server/carteira');
const { criarExpediente } = require('../server/expediente');

let servidor, base, ctx;
const emails = [];

// cabeçalho da planilha como a ferramenta define (SHEET_HEADERS)
const CAB = ['ID', 'Condomínio', 'Estado', 'Data', 'Status', 'Taxa Anterior (%)', 'Taxa de Serviço (%)', 'Tarifa Anterior (R$)', 'Tarifa Bancária (R$)',
  'VOP Mensal (R$)', 'Qtd. Boletos', 'Receita Anterior (R$)', 'Receita Nova (R$)', 'Perda Mensal (R$)', 'Perda (%)', 'Antecipações (R$)', '% Antecip. do VOP',
  'Honorários', 'Val. Boletos', 'Fidelização', 'Início vigência', 'Meses no Exercício', 'Perda no Ano (R$)', 'Observações', 'Relatório', 'Registrado em',
  'Tipo de negociação', 'Tipo (outro)', 'Dia antecipação', 'Dia vencimento'];
const HTML_RENEG = `<!DOCTYPE html><html><head><title>MyBlue — Controle de Renegociações</title></head><body><script>
const SHEET_URL_BUILTIN = "https://script.google.com/macros/s/AAA/exec";
const SHEET_HEADERS = ${JSON.stringify(CAB)};
const TICKET_HEADERS = ["ID","Assunto"];
function isAppsScript(url){ return /script\\.google\\.com\\/macros\\/.*\\/exec/.test(url||''); }
</script></body></html>`;

/* linha como a ferramenta grava (recToRow): datas dd/mm/aaaa, números como números */
function linha(v) {
  const d = { ID: v.id, 'Condomínio': v.cond, Estado: v.uf, Data: '27/10/2026', Status: v.status, 'Taxa Anterior (%)': 2.5, 'Taxa de Serviço (%)': 2.1,
    'Tarifa Anterior (R$)': 2, 'Tarifa Bancária (R$)': 1.9, 'VOP Mensal (R$)': 18450, 'Qtd. Boletos': 64, 'Perda Mensal (R$)': 80.2, 'Fidelização': 12,
    'Início vigência': '01/11/2026', 'Registrado em': '27/10/2026', ...v.campos };
  return CAB.map((c) => (d[c] == null ? '' : d[c]));
}

function cliente() {
  let cookie = '';
  return async function req(metodo, url, corpo, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (cookie) headers.cookie = cookie;
    let body;
    if (corpo !== undefined) {
      if (typeof corpo === 'string' || Buffer.isBuffer(corpo)) { body = corpo; headers['content-type'] ||= 'text/plain'; } else { body = JSON.stringify(corpo); headers['content-type'] = 'application/json'; }
    }
    const r = await fetch(base + url, { method: metodo, headers, body, redirect: 'manual' });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* não é JSON */ }
    return { status: r.status, json, texto };
  };
}

async function entrar(email, senha) {
  const c = cliente();
  const r = await c('POST', '/api/auth/login', { email, senha });
  assert.equal(r.status, 200, r.texto);
  return c;
}

let admin, sara, bruna, lia;
const ids = {};
let setorCredito;

async function criarPessoa(nome, email, extra = {}) {
  const r = await admin('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome, email, papel: 'usuario', senha: 'Senha1234', ...extra });
  assert.equal(r.status, 201, r.texto);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  ids[email] = r.json.id;
  return entrar(email, 'Senha1234');
}

/* grava pela planilha interna, como a ferramenta faz (fetch no-cors, corpo em texto) */
const gravar = (c, corpo) => c('POST', '/api/gas/renegociacoes', JSON.stringify(corpo), { headers: { 'content-type': 'text/plain;charset=utf-8' } });
const ticketsDe = (item) => ctx.db.q('SELECT t.* FROM renegociacao_tickets r JOIN tickets t ON t.id = r.ticket_id WHERE r.item_id = $1', [item]).then((x) => x.rows);
const totalTickets = async () => (await ctx.db.um('SELECT COUNT(*)::int AS n FROM tickets')).n;

before(async () => {
  const cfg = lerConfig({ dataDir: ':memoria:', databaseUrl: '', adminEmail: 'admin@teste.com', adminSenha: 'Admin1234', silencioso: true, porta: 0,
    portalUrl: 'https://portal.teste', enviarEmail: async (msg) => { emails.push(msg); } });
  const r = await criarApp(cfg);
  ctx = r.ctx;
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE');
  servidor = http.createServer(r.app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  admin = await entrar('admin@teste.com', 'Admin1234');

  assert.equal((await admin('PUT', '/api/admin/modulos/renegociacoes/arquivo', HTML_RENEG, { headers: { 'content-type': 'text/html' } })).status, 200);
  assert.equal((await admin('PATCH', '/api/admin/modulos/renegociacoes', { fonte_dados: 'interno' })).status, 200);
  sara = await criarPessoa('Sara Alves', 'sara@teste.com', { modulos: ['renegociacoes'] });
  bruna = await criarPessoa('Bruna Reis', 'bruna@teste.com');
  lia = await criarPessoa('Lia Líder', 'lia@teste.com');
  setorCredito = (await admin('GET', '/api/admin/equipes')).json.setores.find((s) => s.nome === 'Crédito').id;
  assert.equal((await admin('PUT', `/api/admin/equipes/${setorCredito}/membros`, {
    membros: [{ usuario_id: ids['lia@teste.com'], lider: true }, { usuario_id: ids['bruna@teste.com'] }] })).status, 200);
  const csv = Buffer.from([
    'ID;SITUAÇÃO;COMARCA;CONDOMÍNIO;ANALISTA ADMINISTRATIVA;ANALISTA EXTRAJUDICIAL;ASSISTENTE CRÉDITO',
    '1;ATIVO;CE;Jardim Azul;;;BRUNA REIS - 4610',
    '2;ATIVO;PB;Solar II;;;BELTRANO SEM CADASTRO - 4603',
    '3;ATIVO;RN;Jardim Azul;;;BRUNA REIS - 4610',
  ].join('\r\n'), 'latin1');
  assert.equal((await admin('POST', '/api/carteira/importar', csv, { headers: { 'content-type': 'text/csv' } })).status, 200);
});

after(async () => {
  servidor.close();
  await ctx.db.fechar();
});

test('nome do condomínio: sem acento, prefixo, romano e o "1" final; precisa ser um só na UF', () => {
  assert.equal(chaveCondominio('Cond. Monte Azul II'), 'monte azul 2');
  assert.equal(chaveCondominio('Vila das Flores 1'), chaveCondominio('Vila das Flores I'));
  assert.equal(chaveCondominio('Bela Vista'), chaveCondominio('Bela Vista 1'));
  assert.notEqual(chaveCondominio('Vila das Flores II'), chaveCondominio('Vila das Flores I'));
  const lista = [
    { id: 1, nome: 'Palacio dos Ipes', comarca: 'PB', situacao: 'ATIVO' },
    { id: 2, nome: 'Aurora', comarca: 'CE', situacao: 'ATIVO' }, { id: 3, nome: 'Aurora', comarca: 'PB', situacao: 'ATIVO' },
    { id: 4, nome: 'Horizonte', comarca: 'CE', situacao: 'ATIVO' }, { id: 5, nome: 'Horizonte', comarca: 'CE', situacao: 'DISTRATADO' },
  ];
  assert.equal(acharCondominio(lista, 'PALÁCIO DOS IPÊS', 'pb').id, 1);
  assert.equal(acharCondominio(lista, 'Residencial Áurora', 'PB').id, 3);
  assert.equal(acharCondominio(lista, 'Aurora', ''), null, 'sem UF e com dois iguais: não escolhe');
  assert.equal(acharCondominio(lista, 'Horizonte', 'CE').id, 4, 'fica o ativo');
  assert.equal(acharCondominio(lista, 'Recanto 1', 'PB'), null);
  assert.equal(acharCondominio(lista, '', 'PB'), null);
});

test('renegociação em negociação não abre ticket; ao virar Fechado, o ticket vai direto para a assistente da carteira', async () => {
  const antes = await totalTickets();
  let r = await gravar(sara, { action: 'add', row: linha({ id: 'r1', cond: 'Cond. Jardim Azul', uf: 'CE', status: 'Em negociação' }) });
  assert.equal(r.status, 200, r.texto);
  assert.equal(await totalTickets(), antes);

  emails.length = 0;
  r = await gravar(sara, { action: 'update', id: 'r1', row: linha({ id: 'r1', cond: 'Cond. Jardim Azul', uf: 'CE', status: 'Fechado' }) });
  assert.equal(r.status, 200, r.texto);
  const [t] = await ticketsDe('r1');
  assert.ok(t, 'abriu o ticket');
  assert.equal(t.setor_id, setorCredito);
  assert.equal(t.responsavel_id, ids['bruna@teste.com']);
  assert.equal(t.solicitante_id, ids['sara@teste.com']);
  assert.equal(t.titulo, 'Renegociação fechada: Jardim Azul · CE');
  assert.equal(t.prioridade, 'alta');
  assert.equal(t.demanda_interna, false);
  // tipo de demanda criado sozinho: 9 h úteis, prioridade alta
  const cat = await ctx.db.um('SELECT * FROM ticket_categorias WHERE id = $1', [t.categoria_id]);
  assert.deepEqual([cat.nome, cat.prazo_horas, cat.prioridade], ['Renegociação fechada', 9, 'alta']);
  const esperado = criarExpediente().somarHorasUteis(new Date(t.criado_em), 9);
  assert.ok(Math.abs(new Date(t.prazo) - esperado) < 5000, 'prazo de 9 h úteis');
  for (const trecho of ['Sara Alves fechou a renegociação no Controle de Renegociações', 'Taxa de serviço: 2,50% → 2,10%', 'Tarifa bancária por boleto: R$ 2,00 → R$ 1,90',
    'VOP mensal: R$ 18.450,00', 'Qtd. de boletos: 64', 'Fidelização: 12 meses', 'Início da vigência: 01/11/2026', 'Data da negociação: 27/10/2026']) {
    assert.ok(t.descricao.includes(trecho), 'falta na descrição: ' + trecho + '\n' + t.descricao);
  }
  assert.ok(!t.descricao.includes('Perda'), 'perda de receita é do CS, não vai para o Crédito');
  // a assistente recebe o aviso por e-mail; o líder não precisa distribuir
  assert.ok(emails.some((x) => x.para.email === 'bruna@teste.com' && x.html.includes('Taxa de serviço: 2,50% → 2,10%')));
  assert.ok(!emails.some((x) => x.para.email === 'lia@teste.com'));
  // as duas vêem o ticket na Central de Tickets
  const d = (await bruna('GET', `/api/tickets/${t.id}`)).json;
  assert.equal(d.ticket.condominio_nome, 'Jardim Azul');
  assert.equal(d.ticket.categoria_nome, 'Renegociação fechada');
  assert.ok(d.eventos.some((e) => e.tipo === 'criado' && e.detalhe.origem === 'Controle de Renegociações'));
  assert.ok(d.eventos.some((e) => e.tipo === 'atribuicao' && e.detalhe.automatico));
  assert.ok((await sara('GET', '/api/tickets?vis=abertos')).json.tickets.some((x) => x.id === t.id));
});

test('salvar de novo sem mudar as condições não comenta; mudar vira comentário no mesmo ticket', async () => {
  const [t] = await ticketsDe('r1');
  const total = await totalTickets();
  const comentarios = async () => (await ctx.db.q("SELECT texto FROM ticket_eventos WHERE ticket_id = $1 AND tipo = 'comentario' ORDER BY id", [t.id])).rows;
  await gravar(sara, { action: 'update', id: 'r1', row: linha({ id: 'r1', cond: 'Cond. Jardim Azul', uf: 'CE', status: 'Fechado', campos: { 'Perda Mensal (R$)': 99 } }) });
  assert.equal((await comentarios()).length, 0);

  emails.length = 0;
  await gravar(sara, { action: 'update', id: 'r1', row: linha({ id: 'r1', cond: 'Cond. Jardim Azul', uf: 'CE', status: 'Fechado', campos: { 'Taxa de Serviço (%)': 1.99, 'Fidelização': 24 } }) });
  assert.equal(await totalTickets(), total, 'não abre outro ticket');
  const [c] = await comentarios();
  assert.ok(c.texto.includes('Taxa de serviço: 2,10% → 1,99%'), c.texto);
  assert.ok(c.texto.includes('Fidelização: 12 meses → 24 meses'), c.texto);
  assert.ok(!c.texto.includes('VOP'), 'só o que mudou');
  assert.ok(emails.some((x) => x.para.email === 'bruna@teste.com'));
  assert.equal((await ctx.db.um('SELECT status FROM tickets WHERE id = $1', [t.id])).status, 'novo');
});

test('reaberta e fechada de novo depois do ticket resolvido: o mesmo ticket volta para a assistente', async () => {
  const [t] = await ticketsDe('r1');
  assert.equal((await bruna('PATCH', `/api/tickets/${t.id}`, { status: 'resolvido' })).status, 200);
  const campos = { 'Taxa de Serviço (%)': 1.99, 'Fidelização': 24 };
  await gravar(sara, { action: 'update', id: 'r1', row: linha({ id: 'r1', cond: 'Cond. Jardim Azul', uf: 'CE', status: 'Em negociação', campos }) });
  emails.length = 0;
  await gravar(sara, { action: 'update', id: 'r1', row: linha({ id: 'r1', cond: 'Cond. Jardim Azul', uf: 'CE', status: 'Fechado', campos: { ...campos, 'Início vigência': '01/12/2026' } }) });
  const [depois] = await ticketsDe('r1');
  assert.equal(depois.id, t.id);
  assert.equal(depois.status, 'novo');
  assert.equal(depois.resolvido_em, null);
  assert.equal(depois.responsavel_id, ids['bruna@teste.com']);
  const ev = (await bruna('GET', `/api/tickets/${t.id}`)).json.eventos;
  assert.ok(ev.some((e) => e.tipo === 'status' && e.detalhe.de === 'resolvido' && e.detalhe.para === 'novo'));
  assert.ok(ev.some((e) => e.tipo === 'comentario' && e.texto.includes('Início da vigência: 01/11/2026 → 01/12/2026')));
  assert.ok(emails.some((x) => x.para.email === 'bruna@teste.com' && /reaberto/.test(x.subject)));
});

test('condomínio fora da carteira: fila do Crédito para o líder, e quem fechou é avisado', async () => {
  emails.length = 0;
  // datas e números como vêm da planilha Google importada
  const campos = { 'Início vigência': '2026-06-01T03:00:00.000Z', 'Taxa Anterior (%)': '', 'Taxa de Serviço (%)': '1,8' };
  await gravar(sara, { action: 'add', row: linha({ id: 'r2', cond: 'Cond. Lago Sul', uf: 'CE', status: 'Fechado', campos }) });
  const [t] = await ticketsDe('r2');
  assert.ok(t);
  assert.ok(t.descricao.includes('Início da vigência: 01/06/2026'), t.descricao);
  assert.ok(t.descricao.includes('Taxa de serviço: 1,80%\n'), t.descricao);
  assert.equal(t.condominio_id, null);
  assert.equal(t.responsavel_id, null);
  assert.equal(t.titulo, 'Renegociação fechada: Cond. Lago Sul · CE');
  assert.ok(t.descricao.includes('Condomínio não identificado na Base de Clientes'));
  assert.ok(emails.some((x) => x.para.email === 'lia@teste.com'), 'líder distribui');
  const ev = (await lia('GET', `/api/tickets/${t.id}`)).json.eventos;
  assert.ok(ev.some((e) => e.tipo === 'condominio_nao_identificado' && e.detalhe.condominio === 'Cond. Lago Sul'));
  const aviso = await ctx.db.um('SELECT * FROM notificacoes WHERE usuario_id = $1 AND ticket_id = $2', [ids['sara@teste.com'], t.id]);
  assert.ok(aviso && /não identificado/.test(aviso.titulo));
});

test('assistente da carteira sem cadastro no portal: fila do Crédito, com o aviso interno', async () => {
  emails.length = 0;
  await gravar(sara, { action: 'add', row: linha({ id: 'r3', cond: 'Solar 2', uf: 'PB', status: 'Fechado' }) });
  const [t] = await ticketsDe('r3');
  assert.equal(t.titulo, 'Renegociação fechada: Solar II · PB');
  assert.equal(t.responsavel_id, null);
  assert.ok((await lia('GET', `/api/tickets/${t.id}`)).json.eventos.some((e) => e.tipo === 'carteira_sem_cadastro'));
  assert.ok(emails.some((x) => x.para.email === 'lia@teste.com'));
});

test('não abre ticket: renegociação que já estava fechada e importação da base', async () => {
  // fechada antes de existir o ticket automático (veio da planilha): editar não abre ticket
  await ctx.registros.upsert('renegociacoes', 'renegociacoes', 'antiga', linha({ id: 'antiga', cond: 'Jardim Azul', uf: 'CE', status: 'Fechado' }), null);
  const total = await totalTickets();
  await gravar(sara, { action: 'update', id: 'antiga', row: linha({ id: 'antiga', cond: 'Jardim Azul', uf: 'CE', status: 'Fechado', campos: { 'Observações': 'corrigido' } }) });
  // "Importar base 2026" grava em lote
  await gravar(sara, { action: 'addMany', rows: [linha({ id: 'lote1', cond: 'Jardim Azul', uf: 'CE', status: 'Fechado' })] });
  assert.equal(await totalTickets(), total);
  assert.equal((await ticketsDe('antiga')).length, 0);
  assert.equal((await ticketsDe('lote1')).length, 0);
});

test('o tipo de demanda pode ser ajustado pela administração e vale para os próximos tickets', async () => {
  const cat = await ctx.db.um("SELECT * FROM ticket_categorias WHERE nome = 'Renegociação fechada'");
  await ctx.db.q("UPDATE ticket_categorias SET prazo_horas = 18, prioridade = 'media' WHERE id = $1", [cat.id]);
  await gravar(sara, { action: 'add', row: linha({ id: 'r4', cond: 'Jardim Azul', uf: 'RN', status: 'Fechado' }) });
  const [t] = await ticketsDe('r4');
  assert.equal(t.prioridade, 'media');
  assert.equal(t.titulo, 'Renegociação fechada: Jardim Azul · RN', 'mesmo nome em outra UF: acha pela UF');
  const esperado = criarExpediente().somarHorasUteis(new Date(t.criado_em), 18);
  assert.ok(Math.abs(new Date(t.prazo) - esperado) < 5000);
  assert.equal((await ctx.db.um("SELECT COUNT(*)::int AS n FROM ticket_categorias WHERE nome = 'Renegociação fechada'")).n, 1);
});

const PDF = Buffer.from('%PDF-1.4\n% relatório fictício\n%%EOF\n').toString('base64');
const anexosDe = async (ticketId) => (await ctx.db.q('SELECT nome, tipo, interno FROM ticket_anexos WHERE ticket_id = $1 ORDER BY id', [ticketId])).rows;

test('tipo de negociação e dias da antecipação vão para a planilha e para o ticket', async () => {
  const campos = { 'Tipo de negociação': 'Antecipação', 'Antecipações (R$)': 15000, 'Dia antecipação': '1', 'Dia vencimento': '10' };
  await gravar(sara, { action: 'add', row: linha({ id: 'r5', cond: 'Jardim Azul', uf: 'CE', status: 'Fechado', campos }) });
  const [t] = await ticketsDe('r5');
  for (const trecho of ['Tipo de negociação: Antecipação', 'Antecipações: R$ 15.000,00', 'Dia da antecipação (todo mês): 1', 'Dia do vencimento (todo mês): 10']) {
    assert.ok(t.descricao.includes(trecho), 'falta: ' + trecho + '\n' + t.descricao);
  }
  // as colunas novas voltam na leitura da planilha (a ferramenta lê pelo cabeçalho)
  const r = await sara('GET', '/api/gas/renegociacoes');
  const [cab, ...linhas] = r.json;
  assert.equal(cab[cab.length - 4], 'Tipo de negociação');
  assert.equal(linhas.find((l) => l[0] === 'r5')[cab.indexOf('Dia vencimento')], '10');
  // mudar o tipo depois vira comentário
  await gravar(sara, { action: 'update', id: 'r5', row: linha({ id: 'r5', cond: 'Jardim Azul', uf: 'CE', status: 'Fechado', campos: { ...campos, 'Tipo de negociação': 'Renegociação de taxa', 'Dia antecipação': '', 'Dia vencimento': '' } }) });
  const c = await ctx.db.um("SELECT texto FROM ticket_eventos WHERE ticket_id = $1 AND tipo = 'comentario'", [t.id]);
  assert.ok(c.texto.includes('Tipo de negociação: Antecipação → Renegociação de taxa'), c.texto);
});

test('relatório de garantia (PDF): guardado no banco e anexado no ticket, antes ou depois de fechar', async () => {
  // enviado com a renegociação ainda em negociação: entra no ticket quando ela fechar
  await gravar(sara, { action: 'add', row: linha({ id: 'r6', cond: 'Jardim Azul', uf: 'CE', status: 'Em negociação' }) });
  let r = await gravar(sara, { action: 'relatorio', id: 'r6', nome: 'relatorio-garantia.pdf', pdf: PDF });
  assert.equal(r.status, 200, r.texto);
  assert.equal((await ctx.db.um('SELECT tamanho FROM renegociacao_relatorios WHERE item_id = $1', ['r6'])).tamanho, Buffer.from(PDF, 'base64').length);
  await gravar(sara, { action: 'update', id: 'r6', row: linha({ id: 'r6', cond: 'Jardim Azul', uf: 'CE', status: 'Fechado', campos: { 'Relatório': 'relatorio-garantia.pdf' } }) });
  const [t] = await ticketsDe('r6');
  assert.deepEqual(await anexosDe(t.id), [{ nome: 'relatorio-garantia.pdf', tipo: 'application/pdf', interno: false }]);
  assert.ok(t.descricao.includes('Relatório de garantia: relatorio-garantia.pdf'));
  // a assistente baixa o PDF pela Central de Tickets
  const d = (await bruna('GET', `/api/tickets/${t.id}`)).json;
  assert.equal(d.anexos.length, 1);
  assert.ok(d.eventos.some((e) => e.tipo === 'anexo'));

  // enviado depois do ticket aberto (a ferramenta salva e logo envia o PDF): entra no ticket que já existe
  await gravar(sara, { action: 'add', row: linha({ id: 'r7', cond: 'Jardim Azul', uf: 'CE', status: 'Fechado' }) });
  r = await gravar(sara, { action: 'relatorio', id: 'r7', nome: 'outro.pdf', pdf: PDF });
  assert.equal(r.status, 200, r.texto);
  const [t7] = await ticketsDe('r7');
  assert.equal((await anexosDe(t7.id)).length, 1);

  // só PDF, e só de renegociação que existe
  assert.equal((await gravar(sara, { action: 'relatorio', id: 'r7', nome: 'x.pdf', pdf: Buffer.from('<html>').toString('base64') })).status, 400);
  assert.equal((await gravar(sara, { action: 'relatorio', id: 'nao-existe', nome: 'x.pdf', pdf: PDF })).status, 400);
  assert.equal((await gravar(sara, { action: 'relatorio', id: 'r7', sheet: 'tickets', nome: 'x.pdf', pdf: PDF })).status, 400, 'só na aba das renegociações');
});
