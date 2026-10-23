'use strict';
/* Setor Implantação no dia a dia: quem edita (autorização da coordenação), pausas do prazo para concluir, concluir com o
   onboarding pendente, documento recebido sem arquivo, Obs. do Controle, Cobrar e os lembretes dos prazos (dados fictícios). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');

let servidor, base, ctx;

function cliente() {
  let cookie = '';
  return async function req(metodo, url, corpo, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (cookie) headers.cookie = cookie;
    let body;
    if (corpo !== undefined) {
      if (Buffer.isBuffer(corpo)) { body = corpo; headers['content-type'] ||= 'application/octet-stream'; } else { body = JSON.stringify(corpo); headers['content-type'] = 'application/json'; }
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
  assert.equal((await c('POST', '/api/auth/login', { email, senha })).status, 200);
  return c;
}

let admin, exec, coord, ana, bia;
const ids = {};
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
const avisosDe = async (email) => (await ctx.db.q('SELECT titulo, texto FROM notificacoes WHERE usuario_id = $1 ORDER BY id', [ids[email]])).rows;
const ultimo = async (email) => (await avisosDe(email)).pop() || {};
const PDF = Buffer.from('%PDF-1.4\n% documento fictício\n');
const anexar = (c, id, tipo) => c('POST', `/api/implantacoes/${id}/documentos`, PDF, { headers: { 'x-tipo': tipo, 'x-nome-arquivo': `${tipo}.pdf` } });
const detalhe = async (c, id) => (await c('GET', `/api/implantacoes/${id}`)).json;

const FORM = {
  nome: 'Condomínio Fictício', cnpj: '11.222.333/0001-81', uf: 'CE', cidade: 'Fortaleza', uh_total: 24, dia_vencimento: 10,
  sindico_tipo: 'condomino', sindico_isencao: 'integral', sindico_nome: 'Síndico Fictício', sindico_cpf: '111.444.777-35',
  sindico_email: 'sindico@exemplo.com', sindico_telefone: '(85) 90000-0000',
  taxa_adm: 3, boleto: 2, taxa_ordinaria: 1840, desconto_tipo: 'nenhum', inicio_contrato: '2026-11-01', honorarios: 12,
  garantias: ['Taxa ordinária'], parceria: 'nao', cashback: 'nao', antecipacao: 'nao',
  administradora: 'Administradora Exemplo', consultor_nome: 'Consultor Fictício', consultor_telefone: '(85) 90000-0001',
  contatos: [{ nome: 'Contato Fictício', funcao: 'Gerente predial', telefone: '(85) 90000-0002' }],
};
/* implantação enviada, designada para a Ana e assumida por ela */
let seq = 0;
async function assumida(nome) {
  seq++;
  const { id: aid } = await ctx.db.um(`INSERT INTO analises (protocolo, etapa, resultado, condominio, cnpj, uf, tipo_contratacao, executivo_id, solicitante_id, formulario,
      taxa_adm, boleto, enviada_em, liberada_em) VALUES ($1, 'enviada', 'aprovada', $2, '11.222.333/0001-81', 'CE', 'nova', $3, $4, $5::jsonb, 3, 2, now(), now()) RETURNING id`,
  [`AC-2026-02-01-${String(seq).padStart(2, '0')}`, nome, ids.executivo, ids['exec@teste.com'], JSON.stringify({ razao_social: nome, uf: 'CE', tipo_contratacao: 'nova', uh_total: 24 })]);
  for (const tipo of ['convencao', 'retorno_pdf']) {
    await ctx.db.q("INSERT INTO analise_documentos (analise_id, tipo, nome, mime, tamanho, conteudo) VALUES ($1, $2, $3, 'application/pdf', $4, $5)", [aid, tipo, `${tipo}.pdf`, PDF.length, PDF]);
  }
  const r = await exec('POST', '/api/implantacoes', { origem: 'analise', analise_id: aid });
  assert.equal(r.status, 201, r.texto);
  const id = r.json.id;
  assert.equal((await exec('PATCH', `/api/implantacoes/${id}`, { formulario: { ...FORM, nome } })).status, 200);
  for (const tipo of ['cadastro_moradores', 'ata_eleicao', 'ata_orcamento']) assert.equal((await anexar(exec, id, tipo)).status, 201);
  { const x = await exec('POST', `/api/implantacoes/${id}/enviar`, {}); assert.equal(x.status, 200, x.texto); }
  assert.equal((await coord('POST', `/api/implantacoes/${id}/designar`, { usuario_id: ids['ana@teste.com'] })).status, 200);
  assert.equal((await ana('POST', `/api/implantacoes/${id}/iniciar`, {})).status, 200);
  return id;
}
/* instante em Brasília (UTC−3) */
const sp = (dia, hora = 14) => new Date(`${dia}T${String(hora + 3).padStart(2, '0')}:00:00Z`);

before(async () => {
  const cfg = lerConfig({ dataDir: ':memoria:', databaseUrl: '', adminEmail: 'admin@teste.com', adminSenha: 'Admin1234', silencioso: true, porta: 0,
    portalUrl: 'https://portal.teste', enviarEmail: async () => {} });
  const r = await criarApp(cfg);
  ctx = r.ctx;
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE');
  servidor = http.createServer(r.app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  admin = await entrar('admin@teste.com', 'Admin1234');
  exec = await pessoa('Executiva Fictícia', 'exec@teste.com');
  coord = await pessoa('Coordenadora Fictícia', 'coord@teste.com');
  ana = await pessoa('Ana Fictícia', 'ana@teste.com');
  bia = await pessoa('Bia Fictícia', 'bia@teste.com');
  await noSetor('Implantação', 'coord@teste.com', true);
  await noSetor('Implantação', 'ana@teste.com', false);
  await noSetor('Implantação', 'bia@teste.com', false);
  const ex = await admin('POST', '/api/credito/executivos', { nome: 'Executiva Fictícia', uf: 'CE', regiao: 'Ceará', usuario_id: ids['exec@teste.com'] });
  assert.equal(ex.status, 201, ex.texto);
  ids.executivo = ex.json.id;
});
after(async () => { servidor.close(); await ctx.db.fechar(); });

let idA;
test('quem edita: a equipe vê tudo, só a designada edita; outra pessoa pede e a coordenação autoriza, com escopo, e revoga', async () => {
  idA = await assumida('Residencial Fictício Alfa');
  let d = await detalhe(bia, idA);
  assert.ok(d.implantacao, 'a equipe vê a implantação de outra pessoa');
  assert.deepEqual([d.pode.etapas, d.pode.documentos, d.pode.marcar_documentos, d.pode.impedimento, d.pode.pedir_autorizacao], [false, false, false, false, true]);
  assert.equal((await bia('PATCH', `/api/implantacoes/${idA}/etapas`, { etapas: { vouch: { id: '1' } } })).status, 403);
  assert.equal((await anexar(bia, idA, 'conta_bancaria')).status, 403);
  // quem conduz não pede; o pedido precisa de motivo e vai à coordenação
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/autorizacoes/pedir`, { motivo: 'Preciso editar' })).status, 403);
  assert.equal((await bia('POST', `/api/implantacoes/${idA}/autorizacoes/pedir`, { motivo: '' })).status, 400);
  assert.equal((await bia('POST', `/api/implantacoes/${idA}/autorizacoes/pedir`, { motivo: 'Ana de férias, o síndico mandou a conta' })).status, 201);
  assert.equal((await bia('POST', `/api/implantacoes/${idA}/autorizacoes/pedir`, { motivo: 'De novo, por favor' })).status, 409);
  const ap = await ultimo('coord@teste.com');
  assert.match(ap.titulo, /^Pedido para editar · IMP-/);
  assert.match(ap.texto, /Bia Fictícia pede .* com Ana Fictícia: "Ana de férias/);
  // a coordenação vê o pedido; a Ana não decide
  d = await detalhe(coord, idA);
  const pedido = d.setor.autorizacoes.find((a) => a.situacao === 'pedida');
  assert.equal(pedido.usuario_nome, 'Bia Fictícia');
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/autorizacoes`, { pedido_id: pedido.id, escopo: 'documentos' })).status, 403);
  assert.equal((await coord('POST', `/api/implantacoes/${idA}/autorizacoes`, { pedido_id: pedido.id, escopo: 'documentos', ate: '2020-01-01' })).status, 400);
  assert.equal((await coord('POST', `/api/implantacoes/${idA}/autorizacoes`, { pedido_id: pedido.id, escopo: 'documentos' })).status, 201);
  assert.match((await ultimo('bia@teste.com')).titulo, /^Você pode editar · /);
  d = await detalhe(bia, idA);
  assert.equal(d.setor.autorizacao.escopo, 'documentos');
  assert.deepEqual([d.pode.documentos, d.pode.marcar_documentos, d.pode.etapas, d.pode.pedir_autorizacao], [true, true, false, false]);
  assert.equal((await anexar(bia, idA, 'conta_bancaria')).status, 201);
  assert.equal((await bia('PATCH', `/api/implantacoes/${idA}/etapas`, { etapas: { vouch: { id: '1' } } })).status, 403);
  // a coordenação troca para "só as etapas" (substitui a anterior) e depois revoga
  assert.equal((await coord('POST', `/api/implantacoes/${idA}/autorizacoes`, { usuario_id: ids['ana@teste.com'], escopo: 'tudo' })).status, 409); // já conduz
  assert.equal((await coord('POST', `/api/implantacoes/${idA}/autorizacoes`, { usuario_id: ids['exec@teste.com'], escopo: 'tudo' })).status, 400); // não é da equipe
  assert.equal((await coord('POST', `/api/implantacoes/${idA}/autorizacoes`, { usuario_id: ids['bia@teste.com'], escopo: 'etapas', motivo: 'Cobrir a Ana' })).status, 201);
  const ativas = (await detalhe(coord, idA)).setor.autorizacoes.filter((a) => a.situacao === 'ativa');
  assert.deepEqual(ativas.map((a) => a.escopo), ['etapas']);
  assert.equal((await bia('PATCH', `/api/implantacoes/${idA}/etapas`, { etapas: { vouch: { id: '90101' } } })).status, 200);
  assert.equal((await anexar(bia, idA, 'modelo_boleto')).status, 403);
  assert.equal((await coord('POST', `/api/implantacoes/${idA}/autorizacoes/${ativas[0].id}/revogar`, {})).status, 200);
  assert.match((await ultimo('bia@teste.com')).titulo, /^Autorização encerrada/);
  assert.equal((await bia('PATCH', `/api/implantacoes/${idA}/etapas`, { etapas: { vouch: { id: '90101' } } })).status, 403);
  assert.equal((await coord('POST', `/api/implantacoes/${idA}/autorizacoes/${ativas[0].id}/revogar`, {})).status, 404);
  // pedido recusado, com a resposta
  assert.equal((await bia('POST', `/api/implantacoes/${idA}/autorizacoes/pedir`, { motivo: 'Preciso anexar o boleto' })).status, 201);
  const p2 = (await detalhe(coord, idA)).setor.autorizacoes.find((a) => a.situacao === 'pedida');
  assert.equal((await coord('POST', `/api/implantacoes/${idA}/autorizacoes/${p2.id}/recusar`, { resposta: 'A Ana volta amanhã' })).status, 200);
  assert.match((await ultimo('bia@teste.com')).texto, /A Ana volta amanhã/);
  // autorização vencida não vale
  await ctx.db.q("INSERT INTO implantacao_autorizacoes (implantacao_id, usuario_id, situacao, escopo, ate) VALUES ($1, $2, 'ativa', 'tudo', '2020-01-01')", [idA, ids['bia@teste.com']]);
  assert.equal((await detalhe(bia, idA)).pode.etapas, false);
  const tipos = (await detalhe(coord, idA)).eventos.map((e) => e.tipo);
  for (const t of ['autorizacao_pedida', 'autorizacao', 'autorizacao_revogada', 'autorizacao_recusada']) assert.ok(tipos.includes(t), t);
});

test('prazo para concluir: 3 dias úteis; impedimento pausa (a coordenação é avisada) e retoma com o que foi resolvido', async () => {
  let d = await detalhe(ana, idA);
  assert.equal(d.setor.prazo_concluir.dias, 3);
  assert.ok(['no_prazo', 'vence_amanha', 'vence_hoje'].includes(d.setor.prazo_concluir.status), d.setor.prazo_concluir.status);
  assert.equal((await bia('POST', `/api/implantacoes/${idA}/impedimento`, { motivo: 'sindico', detalhe: 'Aguardando a ata' })).status, 403);
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/impedimento`, { motivo: 'xyz', detalhe: 'Aguardando a ata' })).status, 400);
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/impedimento`, { motivo: 'sindico', detalhe: '' })).status, 400);
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/impedimento/retomar`, { resolucao: 'Nada a retomar' })).status, 409);
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/impedimento`, { motivo: 'sindico', detalhe: 'O síndico não enviou a conta bancária' })).status, 201);
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/impedimento`, { motivo: 'vouch', detalhe: 'Outro motivo qualquer' })).status, 409);
  const ac = await ultimo('coord@teste.com');
  assert.match(ac.titulo, /^Prazo pausado · /);
  assert.match(ac.texto, /Aguardando o síndico: "O síndico não enviou/);
  d = await detalhe(ana, idA);
  assert.equal(d.setor.prazo_concluir.status, 'pausado');
  assert.deepEqual(d.setor.pausas.map((p) => [p.tipo, p.motivo, !!p.fim]), [['impedimento', 'Aguardando o síndico', false]]);
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/impedimento/retomar`, { resolucao: '' })).status, 400);
  const r = await ana('POST', `/api/implantacoes/${idA}/impedimento/retomar`, { resolucao: 'Conta bancária recebida por e-mail' });
  assert.equal(r.status, 200, r.texto);
  assert.ok(r.json.prazo.vence);
  const ar = await ultimo('coord@teste.com');
  assert.match(ar.titulo, /^Prazo retomado · /);
  assert.match(ar.texto, /Conta bancária recebida por e-mail" · concluir até \d\d\/\d\d\/\d{4}/);
  d = await detalhe(ana, idA);
  assert.equal(d.setor.pausas[0].resolucao, 'Conta bancária recebida por e-mail');
  assert.notEqual(d.setor.prazo_concluir.status, 'pausado');
});

test('pendência com o comercial pausa o prazo sozinha e o reenvio retoma, avisando quem conduz', async () => {
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/pendencia`, { itens: ['Enviar o modelo do boleto'] })).status, 200);
  let d = await detalhe(ana, idA);
  assert.equal(d.setor.prazo_concluir.status, 'pausado');
  assert.equal(d.setor.pausas.filter((p) => !p.fim).map((p) => p.tipo).join(), 'pendencia');
  assert.equal((await exec('POST', `/api/implantacoes/${idA}/enviar`, {})).status, 200);
  const a = await ultimo('ana@teste.com');
  assert.match(a.titulo, /^Pendência respondida/);
  assert.match(a.texto, /prazo .*voltou a contar/i);
  d = await detalhe(ana, idA);
  assert.ok(d.setor.pausas.every((p) => p.fim));
  assert.notEqual(d.setor.prazo_concluir.status, 'pausado');
});

test('documento recebido sem arquivo: com observação, conta como recebido e dá para desfazer', async () => {
  let d = await detalhe(ana, idA);
  assert.ok(d.pendencias.includes('Modelo do boleto anterior'));
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/documentos/marcar`, { tipo: 'modelo_boleto', observacao: '' })).status, 400);
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/documentos/marcar`, { tipo: 'analise_credito', observacao: 'Em papel' })).status, 400);
  assert.equal((await bia('POST', `/api/implantacoes/${idA}/documentos/marcar`, { tipo: 'modelo_boleto', observacao: 'Em papel' })).status, 403);
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/documentos/marcar`, { tipo: 'conta_bancaria', observacao: 'Em papel' })).status, 409); // já anexado
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/documentos/marcar`, { tipo: 'modelo_boleto', observacao: 'Original em papel, arquivado no CPD' })).status, 201);
  d = await detalhe(ana, idA);
  assert.ok(!d.pendencias.includes('Modelo do boleto anterior'));
  const doc = d.documentos.find((x) => x.tipo === 'modelo_boleto' && !x.substituido_em);
  assert.deepEqual([doc.sem_arquivo, doc.observacao, doc.enviado_por_nome], [true, 'Original em papel, arquivado no CPD', 'Ana Fictícia']);
  assert.equal((await ana('GET', `/api/implantacoes/${idA}/documentos/${doc.id}`)).status, 404); // não há arquivo para baixar
  // na meta de documentação, a data da marcação conta como a do recebimento (a procuração é da equipe)
  const meta = async () => (await coord('GET', '/api/implantacoes/acompanhamento')).json.linhas.find((l) => l.id === idA).documentacao.docs.find((x) => x.tipo === 'procuracao');
  assert.equal((await meta()).em, null);
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/documentos/marcar`, { tipo: 'procuracao', observacao: 'Procuração assinada em papel' })).status, 201);
  assert.match((await meta()).em, /^\d{4}-\d{2}-\d{2}/);
  const proc = (await detalhe(ana, idA)).documentos.find((x) => x.tipo === 'procuracao' && !x.substituido_em);
  assert.equal((await coord('POST', `/api/implantacoes/${idA}/documentos/${proc.id}/desfazer`, {})).status, 200);
  assert.equal((await meta()).em, null);
  // desfazer: só a marcação sem arquivo, e volta a faltar
  const conta = d.documentos.find((x) => x.tipo === 'conta_bancaria' && !x.substituido_em);
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/documentos/${conta.id}/desfazer`, {})).status, 404);
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/documentos/${doc.id}/desfazer`, {})).status, 200);
  d = await detalhe(ana, idA);
  assert.ok(d.pendencias.includes('Modelo do boleto anterior'));
  assert.ok(d.documentos.find((x) => x.id === doc.id).desfeito_em);
  const tipos = d.eventos.map((e) => e.tipo);
  assert.ok(tipos.includes('documento_marcado') && tipos.includes('documento_desmarcado'));
});

test('Obs. do Controle e Cobrar: quem conduz escreve a Obs.; só a coordenação cobra', async () => {
  assert.equal((await bia('POST', `/api/implantacoes/${idA}/obs-controle`, { texto: 'Não sou eu' })).status, 403);
  const r = await ana('POST', `/api/implantacoes/${idA}/obs-controle`, { texto: 'Síndico pediu boleto separado' });
  assert.equal(r.status, 200, r.texto);
  assert.equal((await detalhe(coord, idA)).setor.obs_controle.texto, 'Síndico pediu boleto separado');
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/cobrar`, { qual: 'concluir' })).status, 403);
  assert.equal((await coord('POST', `/api/implantacoes/${idA}/cobrar`, { qual: 'concluir' })).status, 200);
  const a = await ultimo('ana@teste.com');
  assert.match(a.titulo, /^Cobrança · /);
  assert.match(a.texto, /cobrando a conclusão da implantação/);
});

test('concluir com o onboarding pendente: fica o alerta, o onboarding é registrado depois e a justificativa', async () => {
  const etapas = { documentacao: { feito: true }, vouch: { id: '90101' }, onboarding: { situacao: 'pendente' }, boletos: { feito: true, primeiro_vencimento: '2026-11-10' }, envio: { forma: 'email' } };
  const p = await ana('PATCH', `/api/implantacoes/${idA}/etapas`, { etapas });
  assert.equal(p.status, 200, p.texto);
  assert.deepEqual([p.json.faltas, p.json.onboarding_pendente], [[], true]);
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/onboarding`, { onboarding: { situacao: 'realizado', data: '2026-10-20' } })).status, 403); // antes de concluir é pelas etapas
  const c = await ana('POST', `/api/implantacoes/${idA}/concluir`, {});
  assert.equal(c.status, 200, c.texto);
  let d = await detalhe(ana, idA);
  assert.equal(d.implantacao.etapa, 'concluida');
  assert.equal(d.onboarding_pendente, true);
  assert.ok(d.pode.onboarding);
  assert.equal(d.setor.prazo_concluir.status.startsWith('cumprido'), true);
  assert.ok(d.eventos.find((e) => e.tipo === 'concluida').detalhe.onboarding_pendente);
  // justificativa
  assert.equal((await bia('POST', `/api/implantacoes/${idA}/onboarding-justificativa`, { texto: 'O síndico viajou e remarcou' })).status, 403);
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/onboarding-justificativa`, { texto: 'curto' })).status, 400);
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/onboarding-justificativa`, { texto: 'O síndico viajou e remarcou para dezembro' })).status, 200);
  d = await detalhe(coord, idA);
  assert.equal(d.setor.onboarding.justificativa.texto, 'O síndico viajou e remarcou para dezembro');
  // o onboarding registrado depois de concluir
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/onboarding`, { onboarding: { situacao: 'realizado' } })).status, 400);
  const o = await ana('POST', `/api/implantacoes/${idA}/onboarding`, { onboarding: { situacao: 'realizado', data: '2026-10-22', hora: '10:00' } });
  assert.equal(o.status, 200, o.texto);
  d = await detalhe(ana, idA);
  assert.deepEqual([d.onboarding_pendente, d.pode.onboarding, d.implantacao.etapas.onboarding.por], [false, false, ids['ana@teste.com']]);
});

test('concluir com impedimento aberto encerra a pausa', async () => {
  const id = await assumida('Residencial Fictício Gama');
  assert.equal((await ana('POST', `/api/implantacoes/${id}/impedimento`, { motivo: 'vouch', detalhe: 'Cadastro no Vouch pendente' })).status, 201);
  const etapas = { documentacao: { feito: true }, vouch: { id: '90303' }, onboarding: { situacao: 'realizado', data: '2026-10-22', hora: '09:00' }, boletos: { feito: true, primeiro_vencimento: '2026-11-10' }, envio: { forma: 'email' } };
  assert.equal((await ana('PATCH', `/api/implantacoes/${id}/etapas`, { etapas })).status, 200);
  assert.equal((await ana('POST', `/api/implantacoes/${id}/concluir`, {})).status, 200);
  const d = await detalhe(ana, id);
  assert.ok(d.setor.pausas.every((p) => p.fim));
});

test('rotina dos prazos: lembrete na véspera e no dia, atraso uma vez por dia útil à assistente e à coordenação, e "ainda está impedida?"', async () => {
  const id = await assumida('Residencial Fictício Beta');
  // assumida numa segunda (26/10/2026): 3 dias úteis → vence 29/10
  await ctx.db.q("UPDATE implantacoes SET iniciado_em = '2026-10-26T13:00:00Z' WHERE id = $1", [id]);
  // as outras implantações deste arquivo não entram na conta
  await ctx.db.q("UPDATE implantacoes SET aviso_concluir_em = '2099-01-01' WHERE id <> $1", [id]);
  const titulos = async (email) => (await avisosDe(email)).map((x) => x.titulo);
  const ex = (dia) => ctx.rotinasImplantacao.executar(sp(dia));
  assert.equal((await ex('2026-10-27')).prazos_dias_uteis.concluir, 0);
  assert.equal((await ex('2026-10-28')).prazos_dias_uteis.concluir, 1);
  assert.match((await ultimo('ana@teste.com')).titulo, /^Concluir até amanhã · /);
  assert.equal((await ex('2026-10-28')).prazos_dias_uteis.concluir, 0); // uma vez por dia
  await ex('2026-10-29');
  assert.match((await ultimo('ana@teste.com')).titulo, /^Concluir hoje · /);
  const antes = (await titulos('coord@teste.com')).length;
  await ex('2026-10-30');
  assert.match((await ultimo('ana@teste.com')).titulo, /^Implantação atrasada · 1 dia útil · /);
  assert.match((await ultimo('coord@teste.com')).titulo, /^Implantação atrasada de Ana Fictícia · 1 dia útil/);
  assert.equal((await titulos('coord@teste.com')).length, antes + 1);
  assert.equal((await ctx.rotinasImplantacao.executar(new Date('2026-10-31T17:00:00Z'))).prazos_dias_uteis.concluir, 0); // sábado
  // impedimento marcado em 30/10: pausa (sem alerta de atraso) e, 3 dias úteis depois, "ainda está impedida?"
  assert.equal((await ana('POST', `/api/implantacoes/${id}/impedimento`, { motivo: 'administradora', detalhe: 'A administradora anterior não mandou a inadimplência' })).status, 201);
  await ctx.db.q("UPDATE implantacao_pausas SET inicio = '2026-10-30T15:00:00Z' WHERE implantacao_id = $1 AND fim IS NULL", [id]);
  const n0 = (await titulos('ana@teste.com')).length;
  let f = (await ex('2026-11-03')).prazos_dias_uteis;
  assert.deepEqual([f.concluir, f.impedimento], [0, 0]);
  f = (await ex('2026-11-04')).prazos_dias_uteis;
  assert.deepEqual([f.concluir, f.impedimento], [0, 1]);
  const t = await titulos('ana@teste.com');
  assert.equal(t.length, n0 + 1);
  assert.match(t.pop(), /^Ainda está impedida\? · /);
  assert.equal((await ex('2026-11-05')).prazos_dias_uteis.impedimento, 0);
});
