'use strict';
/* Testes da Central de Tickets (node --test). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');

let servidor, base, ctx;
const emails = [];

function cliente() {
  let cookie = '';
  return async function req(metodo, url, corpo, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (cookie) headers.cookie = cookie;
    let body;
    if (corpo !== undefined) {
      if (typeof corpo === 'string' || Buffer.isBuffer(corpo)) { body = corpo; headers['content-type'] ||= 'text/plain'; }
      else { body = JSON.stringify(corpo); headers['content-type'] = 'application/json'; }
    }
    const r = await fetch(base + url, { method: metodo, headers, body, redirect: 'manual' });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    if (opts.bruto) return { status: r.status, headers: r.headers, buffer: Buffer.from(await r.arrayBuffer()) };
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* não é JSON */ }
    return { status: r.status, json, texto, headers: r.headers };
  };
}

async function entrar(email, senha) {
  const c = cliente();
  const r = await c('POST', '/api/auth/login', { email, senha });
  assert.equal(r.status, 200, r.texto);
  return c;
}

let admin, lider, membro, outro, solicitante;
let ids = {};
let setorCobranca, setorCredito, categoria;

/* cria usuário com senha definitiva (sem a troca obrigatória do 1º acesso) */
async function criarPessoa(nome, email) {
  const r = await admin('POST', '/api/admin/usuarios', { nome, email, papel: 'usuario', senha: 'Senha1234' });
  assert.equal(r.status, 201, r.texto);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  ids[email] = r.json.id;
  return entrar(email, 'Senha1234');
}

before(async () => {
  const cfg = lerConfig({ dataDir: ':memoria:', databaseUrl: '', adminEmail: 'admin@teste.com', adminSenha: 'Admin1234', silencioso: true, porta: 0, limiteAnexoMb: 1,
    portalUrl: 'https://portal.teste', enviarEmail: async (msg) => { emails.push(msg); } });
  const r = await criarApp(cfg);
  ctx = r.ctx;
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE');
  servidor = http.createServer(r.app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  admin = await entrar('admin@teste.com', 'Admin1234');
  lider = await criarPessoa('Lia Líder', 'lider@teste.com');
  membro = await criarPessoa('Mário Membro', 'membro@teste.com');
  outro = await criarPessoa('Otávio Outro', 'outro@teste.com');
  solicitante = await criarPessoa('Sara Solicitante', 'sara@teste.com');
});

after(async () => {
  servidor.close();
  await ctx.db.fechar();
});

test('setores oficiais da MyBlue estão cadastrados (Sucesso do Cliente virou CS)', async () => {
  const { setores } = (await admin('GET', '/api/admin/equipes')).json;
  const nomes = setores.map((s) => s.nome);
  for (const n of ['Administrativa/Financeira', 'Cobrança', 'Comercial', 'Crédito', 'CS', 'Implantação', 'Jurídico', 'Máquina de Vendas', 'Marketing', 'Supervisão', 'Gerência']) {
    assert.ok(nomes.includes(n), 'falta o setor ' + n);
  }
  assert.ok(!nomes.includes('Sucesso do Cliente'));
  setorCobranca = setores.find((s) => s.nome === 'Cobrança').id;
  setorCredito = setores.find((s) => s.nome === 'Crédito').id;
});

test('admin monta a equipe do setor e os tipos de demanda', async () => {
  let r = await admin('PUT', `/api/admin/equipes/${setorCobranca}/membros`, { membros: [{ usuario_id: ids['lider@teste.com'], lider: true }, { usuario_id: ids['membro@teste.com'] }] });
  assert.equal(r.status, 200);
  r = await admin('PUT', `/api/admin/equipes/${setorCredito}/membros`, { membros: [{ usuario_id: ids['outro@teste.com'], lider: true }] });
  assert.equal(r.status, 200);
  r = await admin('POST', `/api/admin/equipes/${setorCobranca}/categorias`, { nome: '2ª via de boleto', prazo_horas: 8, prioridade: 'alta' });
  assert.equal(r.status, 201);
  categoria = r.json.id;
  assert.equal((await admin('POST', `/api/admin/equipes/${setorCobranca}/categorias`, { nome: '2ª via de boleto' })).status, 409);
  // quem não é admin não mexe nas equipes
  assert.equal((await lider('GET', '/api/admin/equipes')).status, 403);
});

let ticket;
test('qualquer pessoa abre ticket para um setor; prazo vem do tipo de demanda', async () => {
  assert.equal((await solicitante('POST', '/api/tickets', { interno: true, titulo: '', setor_id: setorCobranca })).status, 400);
  const r = await solicitante('POST', '/api/tickets', { interno: true, titulo: 'Boleto do Cond. Azul', descricao: 'Síndico pediu a 2ª via', setor_id: setorCobranca, categoria_id: categoria });
  assert.equal(r.status, 201, r.texto);
  ticket = r.json.id;
  const d = (await solicitante('GET', `/api/tickets/${ticket}`)).json;
  assert.equal(d.ticket.status, 'novo');
  assert.equal(d.ticket.prioridade, 'alta');
  // 8 h de expediente (seg–sex, 8h–17h) contadas da abertura
  const { criarExpediente } = require('../server/expediente');
  const esperado = criarExpediente().somarHorasUteis(new Date(d.ticket.criado_em), 8);
  assert.ok(Math.abs(new Date(d.ticket.prazo) - esperado) < 5000, 'prazo de 8 h úteis');
  assert.equal(d.pode.equipe, false);
  // categoria de outro setor é recusada
  assert.equal((await solicitante('POST', '/api/tickets', { interno: true, titulo: 'x', setor_id: setorCredito, categoria_id: categoria })).status, 400);
});

test('visibilidade: setor vê, quem é de fora não vê', async () => {
  assert.equal((await outro('GET', `/api/tickets/${ticket}`)).status, 404);
  assert.equal((await membro('GET', `/api/tickets/${ticket}`)).status, 200);
  const fila = (await membro('GET', '/api/tickets?vis=setor')).json.tickets;
  assert.ok(fila.some((t) => t.id === ticket));
  assert.ok(!(await outro('GET', '/api/tickets?vis=setor')).json.tickets.some((t) => t.id === ticket));
  assert.equal((await membro('GET', '/api/tickets?vis=todos')).status, 403);
  assert.ok((await admin('GET', '/api/tickets?vis=todos')).json.tickets.some((t) => t.id === ticket));
  assert.ok((await solicitante('GET', '/api/tickets?vis=abertos')).json.tickets.some((t) => t.id === ticket));
});

test('só o líder muda responsável, prioridade e prazo para resposta', async () => {
  assert.equal((await membro('PATCH', `/api/tickets/${ticket}`, { responsavel_id: ids['lider@teste.com'] })).status, 403);
  assert.equal((await membro('PATCH', `/api/tickets/${ticket}`, { responsavel_id: ids['membro@teste.com'] })).status, 403, 'membro não assume sozinho');
  assert.equal((await solicitante('PATCH', `/api/tickets/${ticket}`, { responsavel_id: ids['membro@teste.com'] })).status, 403);
  assert.equal((await membro('PATCH', `/api/tickets/${ticket}`, { prioridade: 'baixa' })).status, 403);
  assert.equal((await membro('PATCH', `/api/tickets/${ticket}`, { prazo: new Date(Date.now() + 864e5).toISOString() })).status, 403);
  // pessoa de fora do setor não pode ser responsável
  assert.equal((await lider('PATCH', `/api/tickets/${ticket}`, { responsavel_id: ids['outro@teste.com'] })).status, 400);
  const r = await lider('PATCH', `/api/tickets/${ticket}`, { responsavel_id: ids['membro@teste.com'] });
  assert.equal(r.status, 200, r.texto);
  const d = (await membro('GET', `/api/tickets/${ticket}`)).json;
  assert.equal(d.ticket.responsavel_id, ids['membro@teste.com']);
  assert.equal(d.ticket.status, 'novo', 'continua "novo" até a pessoa iniciar com o prazo para conclusão');
  assert.equal(d.pode.atribuir, false);
  assert.equal(d.pode.prazo_conclusao, true);
  assert.ok((await membro('GET', '/api/tickets?vis=minha')).json.tickets.some((t) => t.id === ticket));
  assert.equal((await membro('GET', '/api/tickets/resumo')).json.minha_fila, 1);
  // membro também não devolve para a fila
  assert.equal((await membro('PATCH', `/api/tickets/${ticket}`, { responsavel_id: null })).status, 403);
});

test('quem pega o ticket inicia informando o prazo para conclusão', async () => {
  assert.equal((await membro('PATCH', `/api/tickets/${ticket}`, { status: 'em_andamento' })).status, 400, 'sem prazo para conclusão não inicia');
  assert.equal((await membro('PATCH', `/api/tickets/${ticket}`, { status: 'em_andamento', prazo_conclusao: new Date(Date.now() - 864e5).toISOString() })).status, 400, 'data passada');
  assert.equal((await solicitante('PATCH', `/api/tickets/${ticket}`, { prazo_conclusao: new Date(Date.now() + 864e5).toISOString() })).status, 403);
  const conclusao = new Date(Date.now() + 2 * 864e5);
  let r = await membro('PATCH', `/api/tickets/${ticket}`, { status: 'em_andamento', prazo_conclusao: conclusao.toISOString() });
  assert.equal(r.status, 200, r.texto);
  let d = (await solicitante('GET', `/api/tickets/${ticket}`)).json;
  assert.equal(d.ticket.status, 'em_andamento');
  assert.equal(new Date(d.ticket.prazo_conclusao).getTime(), conclusao.getTime(), 'quem abriu vê a previsão');
  assert.ok(d.ticket.primeira_resposta_em, 'definir o prazo conta como 1º retorno');
  const aviso = (await solicitante('GET', '/api/notificacoes')).json.notificacoes.find((n) => n.ticket_id === ticket && /atendimento/.test(n.titulo));
  assert.ok(aviso && /Previsão de conclusão/.test(aviso.texto));
  // mudar depois exige o motivo
  const nova = new Date(Date.now() + 3 * 864e5).toISOString();
  assert.equal((await membro('PATCH', `/api/tickets/${ticket}`, { prazo_conclusao: nova })).status, 400);
  r = await membro('PATCH', `/api/tickets/${ticket}`, { prazo_conclusao: nova, motivo: 'Aguardando o banco' });
  assert.equal(r.status, 200, r.texto);
  d = (await solicitante('GET', `/api/tickets/${ticket}`)).json;
  assert.ok(d.eventos.some((e) => e.tipo === 'prazo_conclusao' && e.texto === 'Aguardando o banco'));
});

test('notas internas e anexos internos ficam só com a equipe', async () => {
  assert.equal((await membro('POST', `/api/tickets/${ticket}/comentarios`, { texto: 'Conferir no banco antes', interno: true })).status, 201);
  assert.equal((await membro('POST', `/api/tickets/${ticket}/comentarios`, { texto: 'Estamos emitindo a 2ª via.' })).status, 201);
  assert.equal((await solicitante('POST', `/api/tickets/${ticket}/comentarios`, { texto: 'nota escondida', interno: true })).status, 403);
  assert.equal((await solicitante('POST', `/api/tickets/${ticket}/comentarios`, { texto: 'Obrigada!' })).status, 201);

  let r = await membro('POST', `/api/tickets/${ticket}/anexos`, Buffer.from('segredo'), { headers: { 'content-type': 'text/plain', 'x-nome-arquivo': encodeURIComponent('extrato interno.txt'), 'x-interno': '1' } });
  assert.equal(r.status, 201);
  const interno = r.json.id;
  r = await solicitante('POST', `/api/tickets/${ticket}/anexos`, Buffer.from('<script>alert(1)</script>'), { headers: { 'content-type': 'text/html', 'x-nome-arquivo': 'print.html' } });
  assert.equal(r.status, 201);
  const publico = r.json.id;

  const visto = (await solicitante('GET', `/api/tickets/${ticket}`)).json;
  assert.ok(!visto.eventos.some((e) => e.interno), 'solicitante não vê notas internas');
  assert.ok(visto.eventos.some((e) => e.texto === 'Estamos emitindo a 2ª via.'));
  assert.deepEqual(visto.anexos.map((a) => a.id), [publico]);
  assert.equal((await solicitante('GET', `/api/tickets/${ticket}/anexos/${interno}`, undefined, { bruto: true })).status, 404);
  const equipe = (await membro('GET', `/api/tickets/${ticket}`)).json;
  assert.equal(equipe.anexos.length, 2);
  assert.ok(equipe.ticket.primeira_resposta_em, '1ª resposta registrada');

  // HTML enviado nunca abre como página
  const baixado = await membro('GET', `/api/tickets/${ticket}/anexos/${publico}?ver=1`, undefined, { bruto: true });
  assert.equal(baixado.status, 200);
  assert.equal(baixado.headers.get('content-type'), 'application/octet-stream');
  assert.match(baixado.headers.get('content-disposition'), /^attachment/);
  // limite de tamanho
  assert.equal((await membro('POST', `/api/tickets/${ticket}/anexos`, Buffer.alloc(1024 * 1024 + 10, 1), { headers: { 'content-type': 'application/pdf' } })).status, 413);
});

test('resolver, reabrir pelo solicitante e linha do tempo', async () => {
  assert.equal((await solicitante('PATCH', `/api/tickets/${ticket}`, { status: 'resolvido' })).status, 403);
  assert.equal((await membro('PATCH', `/api/tickets/${ticket}`, { status: 'resolvido', motivo: 'Boleto enviado por e-mail' })).status, 200);
  let d = (await solicitante('GET', `/api/tickets/${ticket}`)).json;
  assert.equal(d.ticket.status, 'resolvido');
  assert.ok(d.ticket.resolvido_em);
  assert.equal(d.pode.reabrir, true);
  assert.equal((await solicitante('PATCH', `/api/tickets/${ticket}`, { status: 'em_andamento', motivo: 'Boleto veio com valor errado' })).status, 200);
  d = (await solicitante('GET', `/api/tickets/${ticket}`)).json;
  assert.equal(d.ticket.status, 'em_andamento');
  assert.equal(d.ticket.resolvido_em, null);
  const tipos = d.eventos.map((e) => e.tipo);
  for (const t of ['criado', 'atribuicao', 'comentario', 'anexo', 'status']) assert.ok(tipos.includes(t), 'falta evento ' + t);
});

test('transferir para outro setor volta para a fila do novo setor', async () => {
  assert.equal((await solicitante('PATCH', `/api/tickets/${ticket}`, { setor_id: setorCredito })).status, 403);
  const r = await membro('PATCH', `/api/tickets/${ticket}`, { setor_id: setorCredito, motivo: 'É análise de crédito' });
  assert.equal(r.status, 200, r.texto);
  const d = (await outro('GET', `/api/tickets/${ticket}`)).json;
  assert.equal(d.ticket.setor_nome, 'Crédito');
  assert.equal(d.ticket.responsavel_id, null);
  assert.equal(d.ticket.status, 'novo');
  assert.equal(d.ticket.categoria_id, null);
  assert.equal(d.ticket.prazo_conclusao, null, 'a equipe nova define o próprio prazo para conclusão');
  // a equipe antiga deixa de ver (não é mais do setor nem responsável)
  assert.equal((await membro('GET', `/api/tickets/${ticket}`)).status, 404);
  // setor com tickets não pode ser removido
  assert.equal((await admin('DELETE', `/api/admin/setores/${setorCredito}`)).status, 409);
});

test('atrasados e painel de indicadores', async () => {
  const r = await solicitante('POST', '/api/tickets', { interno: true, titulo: 'Acordo de cobrança', setor_id: setorCobranca, prioridade: 'urgente' });
  const atrasado = r.json.id;
  assert.equal((await lider('PATCH', `/api/tickets/${atrasado}`, { prazo: new Date(Date.now() - 3600e3).toISOString() })).status, 200);
  const lista = (await lider('GET', '/api/tickets?vis=setor&atrasados=1')).json.tickets;
  assert.deepEqual(lista.map((t) => t.id), [atrasado]);
  assert.equal(lista[0].atrasado, true);

  const rp = await lider('GET', '/api/tickets/painel/indicadores?dias=30');
  assert.equal(rp.status, 200, rp.texto);
  const p = rp.json;
  assert.equal(p.geral.atrasados, 1);
  assert.ok(p.por_setor.every((s) => s.nome === 'Cobrança'), 'líder vê só o próprio setor');
  assert.equal((await solicitante('GET', '/api/tickets/painel/indicadores')).status, 403);
  const geral = (await admin('GET', '/api/tickets/painel/indicadores')).json;
  assert.ok(geral.por_setor.length >= 2);

  // respondeu (1º retorno): o prazo para resposta deixa de contar; passa a valer o de conclusão
  assert.equal((await lider('POST', `/api/tickets/${atrasado}/comentarios`, { texto: 'Vendo isso' })).status, 201);
  assert.equal((await lider('GET', '/api/tickets?vis=setor&atrasados=1')).json.tickets.length, 0);
  await ctx.db.q("UPDATE tickets SET prazo_conclusao = now() - interval '1 hour' WHERE id = $1", [atrasado]);
  assert.deepEqual((await lider('GET', '/api/tickets?vis=setor&atrasados=1')).json.tickets.map((t) => t.id), [atrasado], 'conclusão vencida');

  // cancelado pelo solicitante
  assert.equal((await solicitante('PATCH', `/api/tickets/${atrasado}`, { status: 'cancelado' })).status, 200);
  assert.equal((await lider('GET', '/api/tickets?vis=setor&atrasados=1')).json.tickets.length, 0);
});

test('busca por número e texto', async () => {
  const porNumero = (await admin('GET', `/api/tickets?vis=todos&status=todos&q=%23${ticket}`)).json.tickets;
  assert.ok(porNumero.some((t) => t.id === ticket));
  const porTexto = (await admin('GET', '/api/tickets?vis=todos&status=todos&q=cond.%20azul')).json.tickets;
  assert.deepEqual(porTexto.map((t) => t.id), [ticket]);
});

const esperar = () => new Promise((ok) => setTimeout(ok, 30));

test('quem recebe o ticket é avisado no portal e por e-mail', async () => {
  emails.length = 0;
  const r = await solicitante('POST', '/api/tickets', { interno: true, titulo: 'Negativação indevida', setor_id: setorCobranca });
  const id = r.json.id;
  await esperar();
  // ticket novo: avisa o líder do setor (triagem)
  assert.ok(emails.some((e) => e.para.email === 'lider@teste.com' && e.subject.includes(`#${id}`)), 'e-mail para o líder');
  let n = (await lider('GET', '/api/notificacoes')).json;
  assert.ok(n.nao_lidas >= 1);
  assert.equal(n.notificacoes[0].ticket_id, id);
  assert.equal(n.email_ativo, true);

  emails.length = 0;
  assert.equal((await lider('PATCH', `/api/tickets/${id}`, { responsavel_id: ids['membro@teste.com'] })).status, 200);
  await esperar();
  const e = emails.find((x) => x.para.email === 'membro@teste.com');
  assert.ok(e, 'e-mail para o responsável');
  assert.match(e.subject, /passado para você/);
  assert.ok(e.text.includes(`https://portal.teste/#/tickets/${id}`), 'link do ticket no e-mail');
  n = (await membro('GET', '/api/notificacoes')).json;
  assert.equal(n.notificacoes[0].tipo, 'atribuido');
  // só novidades depois do último aviso visto
  assert.equal((await membro('GET', '/api/notificacoes?desde=' + n.notificacoes[0].id)).json.notificacoes.length, 0);
  // quem fez a ação não recebe aviso de si mesmo
  assert.ok(!(await lider('GET', '/api/notificacoes')).json.notificacoes.some((x) => x.tipo === 'atribuido'));

  // abrir o ticket marca os avisos dele como lidos
  await membro('GET', `/api/tickets/${id}`);
  assert.ok(!(await membro('GET', '/api/notificacoes')).json.notificacoes.some((x) => x.ticket_id === id && !x.lida));

  // comentário avisa quem abriu (sem e-mail); resolução avisa por e-mail
  emails.length = 0;
  await membro('POST', `/api/tickets/${id}/comentarios`, { texto: 'Verificando com o banco' });
  assert.equal((await solicitante('GET', '/api/notificacoes')).json.notificacoes[0].tipo, 'comentario');
  await membro('PATCH', `/api/tickets/${id}`, { status: 'resolvido', motivo: 'Baixa feita' });
  await esperar();
  assert.ok(emails.some((x) => x.para.email === 'sara@teste.com' && /resolvido/.test(x.subject)));
  assert.equal(emails.length, 1, 'comentário não gera e-mail');
  assert.equal((await solicitante('POST', '/api/notificacoes/lidas', { todas: true })).status, 200);
  assert.equal((await solicitante('GET', '/api/notificacoes')).json.nao_lidas, 0);
});

test('perfil Supervisão vê e direciona tickets de todos os setores', async () => {
  const sup = await criarPessoa('Sueli Supervisora', 'sup@teste.com');
  const r0 = await solicitante('POST', '/api/tickets', { interno: true, titulo: 'Contrato novo', setor_id: setorCobranca });
  const id = r0.json.id;
  // antes do perfil: não vê
  assert.equal((await sup('GET', `/api/tickets/${id}`)).status, 404);
  const r = await admin('PATCH', `/api/admin/usuarios/${ids['sup@teste.com']}`, { supervisor_tickets: true });
  assert.equal(r.status, 200, r.texto);
  const usu = (await admin('GET', '/api/admin/usuarios')).json.usuarios.find((u) => u.id === ids['sup@teste.com']);
  assert.equal(usu.supervisor_tickets, true);
  assert.equal(usu.papel, 'usuario', 'não vira administradora do portal');
  assert.equal((await sup('GET', '/api/admin/usuarios')).status, 403);

  const d = (await sup('GET', `/api/tickets/${id}`)).json;
  assert.equal(d.pode.atribuir, true);
  assert.ok((await sup('GET', '/api/tickets?vis=todos')).json.tickets.some((t) => t.id === id));
  assert.equal((await sup('PATCH', `/api/tickets/${id}`, { responsavel_id: ids['lider@teste.com'] })).status, 200);
  assert.equal((await sup('PATCH', `/api/tickets/${id}`, { responsavel_id: ids['membro@teste.com'], prioridade: 'alta' })).status, 200);
  assert.equal((await sup('PATCH', `/api/tickets/${id}`, { setor_id: setorCredito })).status, 200);
  const p = (await sup('GET', '/api/tickets/painel/indicadores')).json;
  assert.ok(p.por_setor.length >= 2, 'painel com todos os setores');
  const meta = (await sup('GET', '/api/tickets/meta')).json;
  assert.ok(meta.setores.find((s) => s.id === setorCobranca).membros.length >= 2, 'vê as equipes para direcionar');
});

test('administração envia e-mail de teste para si', async () => {
  emails.length = 0;
  const r = await admin('POST', '/api/admin/equipes/email-teste');
  assert.equal(r.status, 200, r.texto);
  assert.equal(emails[0].para.email, 'admin@teste.com');
  assert.equal((await lider('POST', '/api/admin/equipes/email-teste')).status, 403);
  assert.equal((await admin('GET', '/api/admin/equipes')).json.email.ativo, true);
});

/* ===================== condomínio da carteira ===================== */
test('demanda de condomínio vai direto para a pessoa da carteira; interna vai para o líder', async () => {
  const csv = Buffer.from([
    'ID;SITUAÇÃO;COMARCA;CONDOMÍNIO;ANALISTA ADMINISTRATIVA;ANALISTA EXTRAJUDICIAL;ASSISTENTE CRÉDITO',
    '1;ATIVO;CE;Jardim Azul;MARIO MEMBRO - 4601;FULANA APOIO - 4700;OTAVIO OUTRO - 4602',
    '2;ATIVO;PB;Solar;BELTRANO SEM CADASTRO - 4603;;',
  ].join('\r\n'), 'latin1');
  assert.equal((await admin('POST', '/api/carteira/importar', csv, { headers: { 'content-type': 'text/csv' } })).status, 200);
  const azul = (await ctx.db.um("SELECT id FROM condominios WHERE codigo = '1'")).id;
  const solar = (await ctx.db.um("SELECT id FROM condominios WHERE codigo = '2'")).id;

  // precisa dizer se é de condomínio ou interna
  assert.equal((await solicitante('POST', '/api/tickets', { titulo: 'Sem escolha', setor_id: setorCobranca })).status, 400);
  assert.equal((await solicitante('POST', '/api/tickets', { titulo: 'Inexistente', setor_id: setorCobranca, condominio_id: 99999 })).status, 400);

  const meta = (await solicitante('GET', '/api/tickets/meta')).json;
  const m = meta.condominios.find((c) => c.id === azul);
  assert.equal(m.resp[setorCobranca], 'Mário Membro', 'acha o nome sem acento e sem ramal');
  assert.equal(m.resp[setorCredito], 'Otávio Outro');
  assert.equal(meta.condominios.find((c) => c.id === solar).resp[setorCobranca], null, 'na carteira, mas sem cadastro');

  emails.length = 0;
  let r = await solicitante('POST', '/api/tickets', { titulo: '2ª via unidade 101', setor_id: setorCobranca, condominio_id: azul });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.responsavel.id, ids['membro@teste.com']);
  let d = (await membro('GET', `/api/tickets/${r.json.id}`)).json;
  assert.equal(d.ticket.condominio_nome, 'Jardim Azul');
  assert.equal(d.ticket.status, 'novo');
  assert.ok(d.eventos.some((e) => e.tipo === 'atribuicao' && e.detalhe.automatico));
  assert.ok(emails.some((x) => x.para.email === 'membro@teste.com'));
  assert.ok(!emails.some((x) => x.para.email === 'lider@teste.com'), 'líder não precisa distribuir');

  r = await solicitante('POST', '/api/tickets', { titulo: 'Balancete', setor_id: setorCredito, condominio_id: azul });
  assert.equal(r.json.responsavel.id, ids['outro@teste.com']);

  // pessoa da carteira sem cadastro no portal: fila do setor (líder); a equipe vê o aviso interno
  r = await solicitante('POST', '/api/tickets', { titulo: 'Acordo', setor_id: setorCobranca, condominio_id: solar });
  assert.equal(r.json.responsavel, null);
  const tSolar = r.json.id;
  assert.ok((await lider('GET', `/api/tickets/${tSolar}`)).json.eventos.some((e) => e.tipo === 'carteira_sem_cadastro'));
  assert.ok(!(await solicitante('GET', `/api/tickets/${tSolar}`)).json.eventos.some((e) => e.tipo === 'carteira_sem_cadastro'));

  // interna: fila do setor, líder avisado
  emails.length = 0;
  r = await solicitante('POST', '/api/tickets', { titulo: 'Notebook novo', setor_id: setorCobranca, interno: true });
  assert.equal(r.json.responsavel, null);
  assert.ok(emails.some((x) => x.para.email === 'lider@teste.com'));
  assert.equal((await admin('GET', `/api/tickets/${r.json.id}`)).json.ticket.demanda_interna, true);

  // transferir para o Crédito leva à assistente de crédito do condomínio
  assert.equal((await lider('PATCH', `/api/tickets/${tSolar}`, { setor_id: setorCredito })).status, 200);
  assert.equal((await admin('GET', `/api/tickets/${tSolar}`)).json.ticket.responsavel_id, null, 'Solar não tem assistente de crédito');

  // busca pelo nome do condomínio
  assert.ok((await admin('GET', '/api/tickets?vis=todos&q=jardim%20azul')).json.tickets.length >= 2);
});
