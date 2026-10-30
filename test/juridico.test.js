'use strict';
/* Demandas Jurídicas: a planilha de acompanhamento do Jurídico dentro do portal — prazo em dias úteis pelo tipo, SLA pela
   data da entrega, avisos, os pedidos da Solicitação de Contrato na mesma lista e a importação da planilha (dados fictícios). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');
const { criarXlsx } = require('../server/xlsx');
const { lerPlanilha } = require('../server/planilha');
const I = require('../server/juridico/importacao');

let servidor, base, ctx;
const emails = [];

function cliente() {
  let cookie = '';
  return async function req(metodo, url, corpo) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    let body;
    if (corpo !== undefined) { body = JSON.stringify(corpo); headers['content-type'] = 'application/json'; }
    const r = await fetch(base + url, { method: metodo, headers, body, redirect: 'manual' });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* não é JSON */ }
    return { status: r.status, json, texto, headers: r.headers };
  };
}
async function entrar(email, senha) {
  const c = cliente();
  assert.equal((await c('POST', '/api/auth/login', { email, senha })).status, 200);
  return c;
}

let admin, adv, coord, comercial, outro, diretor;
const ids = {};
async function pessoa(nome, email, papel = 'usuario') {
  const r = await admin('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome, email, papel, senha: 'Senha1234' });
  assert.equal(r.status, 201, r.texto);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  ids[email] = r.json.id;
  return entrar(email, 'Senha1234');
}
const noSetor = async (email, setor) => ctx.db.q('INSERT INTO setor_membros (setor_id, usuario_id) SELECT id, $2 FROM setores WHERE nome = $1', [setor, ids[email]]);
const avisosDe = async (email) => (await ctx.db.q('SELECT titulo, texto, link FROM notificacoes WHERE usuario_id = $1 ORDER BY id', [ids[email]])).rows;
const serie = (d) => (Date.UTC(...d.split('-').map((x, k) => Number(x) - (k === 1 ? 1 : 0))) - Date.UTC(1899, 11, 30)) / 86400000;
const diaBr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const util = (d) => { const x = new Date(`${d}T12:00:00Z`).getUTCDay(); return x > 0 && x < 6; };

/* planilha fictícia no formato da do Jurídico: títulos na linha 6, Tabela de Prazos ao lado */
function planilha(linhas) {
  const vazio = () => Array(17).fill('');
  const corpo = [['ACOMPANHAMENTO — ATIVIDADES JURÍDICAS'], ['Prazos calculados automaticamente'], [''], ['Registro de Demandas']];
  const cab = ['#', 'Atividade', 'Solicitante', 'Cliente', 'Setor', 'Estado', 'Objeto da demanda', 'Data da Solicitação', 'Prazo de Entrega', 'Data da Entrega',
    'Status', 'Observações', 'SLA', '', 'Tipo de Atividade', 'Prazo (h úteis)', 'Dias úteis'];
  const prazos = [['Contrato (garantia)', 8], ['Aditivo', 16], ['Rescisão', 24]];
  const max = Math.max(linhas.length, prazos.length + 2);
  const rows = [];
  for (let k = 0; k < max; k++) {
    const l = linhas[k] ? [...linhas[k]] : vazio().slice(0, 13);
    while (l.length < 14) l.push('');
    if (prazos[k]) l.push(prazos[k][0], prazos[k][1], Math.ceil(prazos[k][1] / 8));
    rows.push(l);
  }
  return criarXlsx([{ titulo: 'Acompanhamento Jurídico', cab: corpo[0], linhas: [...corpo.slice(1), cab, ...rows] }]);
}

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
  adv = await pessoa('Advogada Fictícia', 'adv@teste.com');
  coord = await pessoa('Coordenadora Fictícia', 'coord@teste.com', 'coordenador');
  comercial = await pessoa('Executivo Fictício', 'exec@teste.com');
  outro = await pessoa('Outra Pessoa', 'outro@teste.com');
  diretor = await pessoa('Diretor Fictício', 'diretor@teste.com');
  await noSetor('adv@teste.com', 'Jurídico');
  await noSetor('coord@teste.com', 'Jurídico');
  await noSetor('exec@teste.com', 'Comercial');
  assert.equal((await admin('PUT', '/api/credito/diretoria', { pessoas: [ids['diretor@teste.com']] })).status, 200);
});
after(async () => { servidor.close(); await ctx.db.fechar(); });

test('leitura da planilha: acha os títulos, a Tabela de Prazos, as datas, os status e o solicitante do portal', () => {
  const linhas = lerPlanilha(planilha([
    [1, 'Aditivo', 'Executivo Fictício', 'Condomínio Alfa', 'Comercial', 'CE', 'Taxa extra', serie('2026-06-19'), serie('2026-06-23'), serie('2026-06-22'), 'Concluído', 'ok'],
    [2, 'Contrato (garantia)', 'Pessoa Sem Cadastro', 'Condomínio Beta', 'Comercial', 'MA', '', serie('2026-06-22'), '', '', 'Atrasado', ''],
    [3, 'Parecer', 'Executivo Fictício', 'Gama', '', '', '', serie('2026-06-22'), '', '', 'Pendente', ''],
  ]));
  const r = I.conferir(linhas, { usuarios: [{ id: 7, nome: 'Executivo Fictício' }], tipos: [], contratos: [{ id: 1, protocolo: 'CT-1', condominio: 'Residencial Beta', dia: '2026-06-25' }], demandas: [] });
  assert.deepEqual(r.tipos.map((t) => [t.nome, t.horas]), [['Contrato (garantia)', 8], ['Aditivo', 16], ['Rescisão', 24]]);
  const [a, b, c] = r.itens;
  assert.deepEqual([a.solicitada_em, a.prazo, a.entregue_em, a.status, a.solicitante_id, a.situacao], ['2026-06-19', '2026-06-23', '2026-06-22', 'concluido', 7, 'pronta']);
  // sem prazo na planilha: o portal calcula (1 dia útil); "Atrasado" vira automático; o mesmo cliente já pedido pela Solicitação de Contrato fica de fora
  assert.equal(b.prazo, '2026-06-23');
  assert.equal(b.status, 'em_andamento');
  assert.equal(b.situacao, 'duplicada');
  assert.match(b.motivo, /CT-1/);
  assert.equal(c.situacao, 'erro');
  assert.match(c.motivo, /Tabela de Prazos/);
  assert.deepEqual(r.resumo, { total: 3, prontas: 1, avisos: 0, duplicadas: 1, erros: 1, tipos: 3 });
  assert.throws(() => I.conferir([['nada'], ['aqui']], { usuarios: [] }), /linha de títulos/);
  // dias úteis como o DIATRABALHO: sexta + 2 = terça; 8h = 1 dia, 12h = 2 dias
  assert.equal(I.somarDiasUteis('2026-06-19', 2, util), '2026-06-23');
  assert.deepEqual([I.diasDoPrazo(8), I.diasDoPrazo(12), I.diasDoPrazo(24)], [1, 2, 3]);
});

let tipos;
test('importar a planilha: prévia, tipos da Tabela de Prazos, números da planilha, histórico sem avisos, e desfazer', async () => {
  const arquivo = planilha([
    [1, 'Aditivo', 'Executivo Fictício', 'Condomínio Alfa', 'Comercial', 'CE', 'Taxa extra', serie('2026-06-19'), serie('2026-06-23'), serie('2026-06-22'), 'Concluído', ''],
    [2, 'Contrato (garantia)', 'Pessoa Sem Cadastro', 'Condomínio Beta', 'Comercial', 'MA', '', serie('2026-06-22'), serie('2026-06-23'), serie('2026-06-25'), 'Aguardando retorno', 'Contrato enviado'],
    [3, 'Rescisão', 'Executivo Fictício', 'Condomínio Gama', 'Comercial', 'CE', '', serie('2026-07-01'), serie('2026-07-06'), '', 'Em andamento', ''],
  ]).toString('base64');
  assert.equal((await adv('POST', '/api/juridico/importacao/previa', { arquivo })).status, 403); // só a administração e a coordenação
  const pv = await coord('POST', '/api/juridico/importacao/previa', { arquivo });
  assert.equal(pv.status, 200, pv.texto);
  assert.equal(pv.json.resumo.total, 3);
  assert.equal(pv.json.itens[1].situacao, 'aviso'); // solicitante sem cadastro: fica o nome
  const imp = await coord('POST', '/api/juridico/importacao', { arquivo });
  assert.equal(imp.status, 201, imp.texto);
  assert.equal(imp.json.importadas, 3);
  assert.equal((await coord('POST', '/api/juridico/importacao', { arquivo })).status, 409);
  const l = (await adv('GET', '/api/juridico/demandas?vis=todas')).json;
  assert.deepEqual(l.demandas.map((d) => d.ref).sort(), ['1', '2', '3']);
  const [g] = l.demandas.filter((d) => d.ref === '2');
  assert.deepEqual([g.tipo, g.solicitante_nome, g.solicitante_id, g.setor, g.uf, g.status, g.sla], ['Contrato (garantia)', 'Pessoa Sem Cadastro', null, 'Comercial', 'MA', 'aguardando_retorno', 'fora']);
  const [r3] = l.demandas.filter((d) => d.ref === '3');
  assert.equal(r3.solicitante_id, ids['exec@teste.com']);
  assert.equal(r3.atrasada, true);
  tipos = (await adv('GET', '/api/juridico/meta')).json.tipos;
  assert.deepEqual(tipos.map((t) => [t.nome, t.horas, t.contratos]), [['Contrato (garantia)', 8, true], ['Aditivo', 16, false], ['Rescisão', 24, false]]);
  // a rotina não avisa o atraso do histórico
  await ctx.rotinasJuridico.executar(new Date());
  assert.ok(!(await avisosDe('adv@teste.com')).some((a) => /Passou do prazo/.test(a.titulo)));

  // desfazer: o que foi mexido depois fica
  assert.equal((await adv('POST', `/api/juridico/demandas/${r3.id}/comentario`, { texto: 'Em revisão.' })).status, 201);
  const lote = (await coord('GET', '/api/juridico/importacao')).json.lotes[0];
  const dz = await coord('POST', `/api/juridico/importacao/${lote.id}/desfazer`, {});
  assert.equal(dz.status, 200, dz.texto);
  assert.equal(dz.json.apagadas, 2);
  assert.deepEqual(dz.json.mantidas.map((x) => x.numero), [3]);
});

let idD;
test('pedir ao Jurídico: qualquer pessoa abre, o prazo sai do tipo em dias úteis, e o Jurídico é avisado', async () => {
  const meta = (await comercial('GET', '/api/juridico/meta')).json;
  assert.equal(meta.perfil.juridico, false);
  assert.deepEqual(meta.pessoas, []); // a lista de pessoas é só do Jurídico
  assert.equal(meta.eu.setor, 'Comercial');
  const aditivo = meta.tipos.find((t) => t.nome === 'Aditivo');
  assert.equal(aditivo.dias, 2);
  assert.equal((await comercial('POST', '/api/juridico/demandas', { tipo_id: aditivo.id })).status, 400); // sem cliente
  const r = await comercial('POST', '/api/juridico/demandas', { tipo_id: aditivo.id, cliente: 'Condomínio Delta', objeto: 'Aditivo de taxa extra', uf: 'ce',
    solicitada_em: '2026-01-01', solicitante_id: ids['outro@teste.com'] }); // quem não é do Jurídico não escolhe data nem solicitante
  assert.equal(r.status, 201, r.texto);
  idD = r.json.id;
  assert.equal(r.json.numero, 4); // depois do que ficou da importação
  assert.equal(r.json.prazo, I.somarDiasUteis(diaBr(), 2, util));
  const d = (await comercial('GET', `/api/juridico/demandas/${idD}`)).json.demanda;
  assert.deepEqual([d.solicitante_id, d.solicitada_em, d.setor, d.uf, d.status], [ids['exec@teste.com'], diaBr(), 'Comercial', 'CE', 'pendente']);
  assert.ok((await avisosDe('adv@teste.com')).some((a) => /Nova demanda para o Jurídico · Aditivo/.test(a.titulo) && a.link === `#/demandas-juridicas/${idD}`));
  assert.ok(emails.some((m) => m.para.email === 'adv@teste.com'));
  // quem pediu vê as suas; a lista completa é do Jurídico e da diretoria
  // quem pediu vê as suas (a nova e a da planilha que ficou), mesmo as lançadas pelo Jurídico
  assert.deepEqual((await comercial('GET', '/api/juridico/demandas?vis=minhas')).json.demandas.map((x) => x.ref).sort(), ['3', '4']);
  assert.equal((await comercial('GET', '/api/juridico/demandas?vis=todas')).status, 403);
  assert.equal((await outro('GET', `/api/juridico/demandas/${idD}`)).status, 404);
  assert.equal((await diretor('GET', '/api/juridico/demandas?vis=todas')).status, 200);
  assert.equal((await diretor('PATCH', `/api/juridico/demandas/${idD}`, { status: 'concluido' })).status, 403);
  assert.equal((await adv('GET', '/api/juridico/resumo')).json.pendentes, 1);
});

test('o Jurídico conduz: responsável, aguardando retorno, comentário de quem pediu e a entrega registrada ao concluir', async () => {
  let r = await adv('PATCH', `/api/juridico/demandas/${idD}`, { responsavel_id: ids['outro@teste.com'] });
  assert.equal(r.status, 400); // responsável precisa ser do Jurídico
  r = await adv('PATCH', `/api/juridico/demandas/${idD}`, { responsavel_id: ids['adv@teste.com'], status: 'aguardando_retorno', observacoes: 'Falta a ata.' });
  assert.equal(r.status, 200, r.texto);
  assert.ok((await avisosDe('exec@teste.com')).some((a) => /^Aguardando retorno · demanda #4/.test(a.titulo) && /Falta a ata/.test(a.texto)));
  assert.equal((await comercial('GET', '/api/juridico/resumo')).json.retorno, 1);
  assert.equal((await comercial('PATCH', `/api/juridico/demandas/${idD}`, { status: 'concluido' })).status, 403);
  assert.equal((await comercial('POST', `/api/juridico/demandas/${idD}/comentario`, { texto: 'Ata enviada por e-mail.' })).status, 201);
  assert.ok((await avisosDe('adv@teste.com')).some((a) => /Comentário na demanda #4/.test(a.titulo) && /Ata enviada/.test(a.texto)));
  r = await adv('PATCH', `/api/juridico/demandas/${idD}`, { status: 'concluido' });
  assert.equal(r.json.entregue_em, diaBr());
  const x = (await adv('GET', `/api/juridico/demandas/${idD}`)).json;
  assert.equal(x.demanda.sla, 'dentro');
  assert.deepEqual(x.eventos.map((e) => e.tipo), ['criada', 'status', 'comentario', 'status']);
  assert.equal((await comercial('DELETE', `/api/juridico/demandas/${idD}`)).status, 403); // já não está pendente
});

test('o Jurídico lança pelos outros com data passada; a Tabela de prazos recalcula as abertas; a rotina avisa o atraso uma vez', async () => {
  const resc = tipos.find((t) => t.nome === 'Rescisão');
  const r = await adv('POST', '/api/juridico/demandas', { tipo_id: resc.id, cliente: 'Condomínio Épsilon', solicitante_nome: 'Fornecedor Externo', setor: 'Suprimentos',
    solicitada_em: '2026-06-01', entregue_em: '2026-06-03', status: 'concluido' });
  assert.equal(r.status, 201, r.texto);
  const d1 = (await adv('GET', `/api/juridico/demandas/${r.json.id}`)).json.demanda;
  assert.deepEqual([d1.solicitante_nome, d1.setor, d1.prazo, d1.sla], ['Fornecedor Externo', 'Suprimentos', '2026-06-04', 'dentro']);
  const aberta = await adv('POST', '/api/juridico/demandas', { tipo_id: resc.id, cliente: 'Condomínio Zeta', solicitante_id: ids['exec@teste.com'] });
  assert.ok((await avisosDe('exec@teste.com')).some((a) => /O Jurídico registrou seu pedido/.test(a.titulo)));
  // prazo do tipo de 24h para 8h: a aberta é recalculada, a concluída guarda o SLA que teve
  const novos = tipos.map((t) => ({ id: t.id, nome: t.nome, horas: t.id === resc.id ? 8 : t.horas }));
  assert.equal((await comercial('PUT', '/api/juridico/tipos', { tipos: novos })).status, 403);
  const p = await adv('PUT', '/api/juridico/tipos', { tipos: [...novos, { nome: 'Parecer', horas: 12 }], contratos_id: tipos[0].id });
  assert.equal(p.status, 200, p.texto);
  assert.equal(p.json.recalculadas, 2); // a nova e a rescisão da planilha que ainda não foi entregue
  assert.equal(p.json.tipos.find((t) => t.nome === 'Parecer').horas, 12);
  const d2 = (await adv('GET', `/api/juridico/demandas/${aberta.json.id}`)).json.demanda;
  assert.equal(d2.prazo, I.somarDiasUteis(diaBr(), 1, util));
  assert.equal((await adv('GET', `/api/juridico/demandas/${r.json.id}`)).json.demanda.prazo, '2026-06-04');
  // uma semana depois do prazo, num dia útil às 10h: avisa a equipe (ninguém é responsável), uma vez só
  const depois = new Date(`${I.somarDiasUteis(d2.prazo, 5, util)}T13:00:00Z`);
  const f = await ctx.rotinasJuridico.executar(depois);
  assert.equal(f.atrasadas, 2);
  assert.ok((await avisosDe('coord@teste.com')).some((a) => /Passou do prazo · demanda #/.test(a.titulo)));
  assert.equal((await ctx.rotinasJuridico.executar(depois)).atrasadas, 0);
});

test('os pedidos da Solicitação de Contrato entram na lista e nos indicadores, sem lançar de novo', async () => {
  const { id } = await ctx.db.um(`INSERT INTO contratos (protocolo, etapa, origem, condominio, uf, solicitante_id, enviado_em, prazo)
    VALUES ('CT-2026-06-10-01', 'minuta_enviada', 'entrega', 'Condomínio Contrato', 'RN', $1, '2026-06-10T12:00:00-03:00', '2026-06-15T12:00:00-03:00') RETURNING id`, [ids['exec@teste.com']]);
  await ctx.db.q("INSERT INTO contrato_eventos (contrato_id, tipo, criado_em) VALUES ($1, 'minuta_enviada', '2026-06-12T15:00:00-03:00')", [id]);
  const l = (await adv('GET', '/api/juridico/demandas?vis=todas&origem=contrato')).json.demandas;
  assert.equal(l.length, 1);
  assert.deepEqual([l[0].ref, l[0].tipo, l[0].status, l[0].solicitada_em, l[0].prazo, l[0].entregue_em, l[0].sla, l[0].setor],
    ['CT-2026-06-10-01', 'Contrato (garantia)', 'aguardando_retorno', '2026-06-10', '2026-06-15', '2026-06-12', 'dentro', 'Comercial']);
  assert.ok((await comercial('GET', '/api/juridico/demandas?vis=minhas')).json.demandas.some((x) => x.id === `ct-${id}`));
  const ind = (await diretor('GET', '/api/juridico/indicadores?ano=2026')).json;
  const garantia = ind.tipos.find((t) => t.nome === 'Contrato (garantia)');
  assert.deepEqual(garantia.meses[5], { dentro: 1, total: 1, pct: 100 }); // junho: o contrato (no prazo); a importada do Beta foi desfeita
  assert.ok(ind.resumo.entregues >= 2);
  assert.equal((await comercial('GET', '/api/juridico/indicadores')).status, 403);
  const x = await adv('GET', '/api/juridico/demandas.xlsx?vis=todas');
  assert.equal(x.status, 200);
  assert.match(x.headers.get('content-type'), /spreadsheetml/);
});
