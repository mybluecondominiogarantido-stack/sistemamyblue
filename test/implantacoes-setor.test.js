'use strict';
/* Setor Implantação no dia a dia: quem edita (autorização da coordenação), pausas do prazo para concluir, concluir com o
   onboarding pendente, documento recebido sem arquivo, Obs. do Controle, Cobrar e os lembretes dos prazos (dados fictícios). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');

let servidor, base, ctx;
/* agenda do Microsoft 365 simulada: guarda o que o portal pediu (convite do onboarding) */
const agenda = {
  chamadas: [], falhar: false,
  async criar(x) { if (this.falhar) throw new Error('sem permissão de calendário'); this.chamadas.push(['criar', x]); return { id: 'ev-' + this.chamadas.length }; },
  async atualizar(id, x) { this.chamadas.push(['atualizar', x, id]); return { id }; },
  async cancelar(id) { this.chamadas.push(['cancelar', null, id]); },
};

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
    if (opts.bruto) return { status: r.status, headers: r.headers, buffer: Buffer.from(await r.arrayBuffer()) };
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
// os lembretes do pós-implantação (test/implantacoes-pos.test.js) não entram nestes testes
const SEM_AVISOS_POS = `UPDATE implantacoes SET pos = pos || '{"avisos":{"espolio":"2099-01-01","pendencias":"2099-01-01","prestacao":"2099-01-01"}}'::jsonb`;

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
async function assumida(nome, extra = {}) {
  seq++;
  const { id: aid } = await ctx.db.um(`INSERT INTO analises (protocolo, etapa, resultado, condominio, cnpj, uf, tipo_contratacao, executivo_id, solicitante_id, formulario,
      taxa_adm, boleto, enviada_em, liberada_em) VALUES ($1, 'enviada', 'aprovada', $2, '11.222.333/0001-81', 'CE', 'nova', $3, $4, $5::jsonb, 3, 2, now(), now()) RETURNING id`,
  [`AC-2026-02-01-${String(seq).padStart(2, '0')}`, nome, ids.executivo, ids['exec@teste.com'], JSON.stringify({ razao_social: nome, uf: 'CE', tipo_contratacao: 'nova', uh_total: 24 })]);
  for (const tipo of ['convencao', 'retorno_pdf']) {
    await ctx.db.q("INSERT INTO analise_documentos (analise_id, tipo, nome, mime, tamanho, conteudo) VALUES ($1, $2, $3, 'application/pdf', $4, $5)", [aid, tipo, `${tipo}.pdf`, PDF.length, PDF]);
  }
  // a implantação começa do contrato concluído (as condições fechadas são as do formulário)
  const fechado = { taxa_adm: 3, boleto: 2, desconto_tipo: 'nenhum', garantias: ['Taxa ordinária'], cashback: 'nao', inicio_contrato: '2026-11-01', honorarios: 12, foro: 'Fortaleza/CE', prazo_contestacao: 15, clausulas: [] };
  const { id: ct } = await ctx.db.um(`INSERT INTO contratos (protocolo, etapa, origem, analise_id, analise_protocolo, condominio, cnpj, uf, executivo_id, solicitante_id, formulario, fechado, fechado_em, concluido_em)
    SELECT 'CT-' || a.protocolo, 'assinado', 'analise', a.id, a.protocolo, a.condominio, a.cnpj, a.uf, a.executivo_id, a.solicitante_id, $1::jsonb, $2::jsonb, now(), now() FROM analises a WHERE a.id = $3 RETURNING id`,
  [JSON.stringify({ nome, uf: 'CE' }), JSON.stringify(fechado), aid]);
  const r = await exec('POST', `/api/contratos/${ct}/implantacao`, {});
  assert.equal(r.status, 201, r.texto);
  const id = r.json.implantacao;
  assert.equal((await exec('PATCH', `/api/implantacoes/${id}`, { formulario: { ...FORM, nome, ...extra } })).status, 200);
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
    portalUrl: 'https://portal.teste', enviarEmail: async () => {}, agenda });
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
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/documentos/marcar`, { tipo: 'conta_bancaria', de: 'sindico', observacao: 'Em papel' })).status, 409); // já anexado
  // de quem veio é obrigatório (síndico, administradora ou outro)
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/documentos/marcar`, { tipo: 'modelo_boleto', observacao: 'Original em papel, arquivado no CPD' })).status, 400);
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/documentos/marcar`, { tipo: 'modelo_boleto', de: 'administradora', observacao: 'Original em papel, arquivado no CPD' })).status, 201);
  d = await detalhe(ana, idA);
  assert.ok(!d.pendencias.includes('Modelo do boleto anterior'));
  const doc = d.documentos.find((x) => x.tipo === 'modelo_boleto' && !x.substituido_em);
  assert.deepEqual([doc.sem_arquivo, doc.observacao, doc.recebido_de, doc.enviado_por_nome], [true, 'Original em papel, arquivado no CPD', 'administradora', 'Ana Fictícia']);
  assert.equal((await ana('GET', `/api/implantacoes/${idA}/documentos/${doc.id}`)).status, 404); // não há arquivo para baixar
  // na meta de documentação, a data da marcação conta como a do recebimento (a procuração é da equipe)
  const meta = async () => (await coord('GET', '/api/implantacoes/acompanhamento')).json.linhas.find((l) => l.id === idA).documentacao.docs.find((x) => x.tipo === 'procuracao');
  assert.equal((await meta()).em, null);
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/documentos/marcar`, { tipo: 'procuracao', de: 'sindico', observacao: 'Procuração assinada em papel' })).status, 201);
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
  await ctx.db.q("UPDATE implantacao_fichas SET aviso_prazo_em = '2099-01-01'");
  await ctx.db.q(SEM_AVISOS_POS);
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

/* ===================== ficha de transição ===================== */
const temReportlab = (() => { try { require('child_process').execFileSync('python3', ['-c', 'import reportlab']); return true; } catch { return false; } })();
let sup, rita;
const DADOS_FICHA = { taxa_condominial: 'Fixa', balancete: 'Não', subsindico: 'Subsíndica Fictícia',
  consumo: [{ incide: 'Sim', tipo: 'Variável', valor: 'R$ 4.200,00/mês', obs: 'Leitura pela administradora' }, { incide: 'Não' }, { incide: 'Não' }],
  receitas: [{ tipo: 'Outra receita', descricao: 'Aluguel de antena', valor: 'R$ 900,00' }],
  nao_garantidas: [{ unidade: 'Apto 101', o_que: 'Todas as taxas', por_que: 'Espólio', obs: 'Inventário' }],
  conferidos: { ata_taxa_extra: 'Não se aplica', ata_receita: 'Conferida' }, particularidades: '1º boleto com prazo curto.' };

test('ficha de transição: abre na conclusão já preenchida (Obs. do Controle na seção 8) e só quem conduz edita', async () => {
  sup = await pessoa('Supervisora de Crédito Fictícia', 'sup@teste.com');
  rita = await pessoa('Rita Fictícia', 'rita@teste.com');
  await noSetor('Crédito', 'sup@teste.com', true);
  await noSetor('Crédito', 'rita@teste.com', false);
  const j = (await ana('GET', `/api/implantacoes/${idA}/ficha`)).json;
  assert.equal(j.ficha.situacao, 'a_enviar');
  assert.equal(j.ficha.prazo.dias, 5);
  assert.ok(['no_prazo', 'vence_amanha', 'vence_hoje'].includes(j.ficha.prazo.status), j.ficha.prazo.status);
  assert.deepEqual(j.conteudo.secoes.map((s) => s.numero), [1, 2, '2.1', '2.2', '2.3', '2.4', 3, 4, 5, 6, 7, 8]);
  assert.equal(j.dados.outras_observacoes, 'Síndico pediu boleto separado');
  assert.ok(j.pode.editar && j.pode.enviar);
  assert.ok(j.faltas.length);
  // a equipe vê; sem autorização não edita; o Crédito só vê depois de receber
  const b = (await bia('GET', `/api/implantacoes/${idA}/ficha`)).json;
  assert.equal(b.pode.editar, false);
  assert.equal((await bia('PUT', `/api/implantacoes/${idA}/ficha`, { dados: DADOS_FICHA })).status, 403);
  assert.equal((await rita('GET', `/api/implantacoes/${idA}/ficha`)).status, 404);
  const e = await ana('POST', `/api/implantacoes/${idA}/ficha/enviar`, {});
  assert.equal(e.status, 400);
  assert.ok(e.json.faltas.some((x) => /Balancete/.test(x)));
  const s = await ana('PUT', `/api/implantacoes/${idA}/ficha`, { dados: DADOS_FICHA });
  assert.deepEqual([s.status, s.json.faltas], [200, []]);
  const k = (await ana('GET', `/api/implantacoes/${idA}/ficha`)).json.conteudo;
  assert.deepEqual(k.secoes.find((x) => x.numero === '2.4').tabela.linhas[0].map((c) => c.v), ['Outra receita', 'Aluguel de antena', 'R$ 900,00', '']);
});

test('ficha de transição: sem assistente na Carteira vai à supervisão, que escolhe; devolução com pergunta, resposta e versões (até 3)', async () => {
  const r1 = await ana('POST', `/api/implantacoes/${idA}/ficha/enviar`, {});
  assert.equal(r1.status, 200, r1.texto);
  assert.deepEqual([r1.json.versao, r1.json.para], [1, null]);
  assert.match((await ultimo('sup@teste.com')).titulo, /^Ficha de transição para distribuir · /);
  let j = (await sup('GET', `/api/implantacoes/${idA}/ficha`)).json;
  assert.ok(j.pode.escolher);
  assert.ok(j.credito.some((x) => x.nome === 'Rita Fictícia'));
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/ficha/destino`, { usuario_id: ids['rita@teste.com'] })).status, 403);
  assert.equal((await sup('POST', `/api/implantacoes/${idA}/ficha/destino`, { usuario_id: ids['ana@teste.com'] })).status, 400);
  assert.equal((await sup('POST', `/api/implantacoes/${idA}/ficha/destino`, { usuario_id: ids['rita@teste.com'] })).status, 200);
  assert.match((await ultimo('rita@teste.com')).texto, /fica com você/);
  // a assistente de crédito vê a versão enviada e devolve com pergunta
  j = (await rita('GET', `/api/implantacoes/${idA}/ficha`)).json;
  assert.deepEqual([j.ficha.destino.nome, j.ficha.situacao, j.pode.confirmar, j.pode.devolver, j.pode.editar, j.dados], ['Rita Fictícia', 'enviada', true, true, false, null]);
  assert.match(j.conteudo.subtitulo, /Assistente de crédito: Rita Fictícia|Assistente de implantação: Ana Fictícia/);
  assert.equal((await rita('POST', `/api/implantacoes/${idA}/ficha/devolver`, { pergunta: '' })).status, 400);
  assert.equal((await rita('POST', `/api/implantacoes/${idA}/ficha/devolver`, { pergunta: 'O 1º repasse vai para qual conta?' })).status, 200);
  const dv = await ultimo('ana@teste.com');
  assert.match(dv.titulo, /^Ficha de transição devolvida com pergunta/);
  assert.match(dv.texto, /qual conta/);
  j = (await ana('GET', `/api/implantacoes/${idA}/ficha`)).json;
  assert.deepEqual([j.ficha.situacao, j.ficha.devolucao.detalhe.pergunta, j.pode.responder], ['devolvida', 'O 1º repasse vai para qual conta?', true]);
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/ficha/responder`, { resposta: 'Para a conta do contrato.' })).status, 200);
  assert.match((await ultimo('rita@teste.com')).titulo, /^Resposta sobre a ficha/);
  // nova versão: pede o motivo; a assistente de crédito é avisada e confirma
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/ficha/enviar`, { dados: { ...DADOS_FICHA, repasse_obs: 'Conta do contrato até a nova chegar' } })).status, 400);
  const r2 = await ana('POST', `/api/implantacoes/${idA}/ficha/enviar`, { motivo: 'esclarecida a conta do primeiro repasse' });
  assert.deepEqual([r2.status, r2.json.versao, r2.json.para], [200, 2, 'Rita Fictícia']);
  assert.match((await ultimo('rita@teste.com')).titulo, /^Ficha de transição \(versão 2\)/);
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/ficha/confirmar`, {})).status, 403);
  assert.equal((await rita('POST', `/api/implantacoes/${idA}/ficha/confirmar`, {})).status, 200);
  assert.match((await ultimo('ana@teste.com')).titulo, /^Ficha de transição recebida/);
  j = (await ana('GET', `/api/implantacoes/${idA}/ficha`)).json;
  assert.equal(j.ficha.situacao, 'recebida');
  assert.deepEqual(j.versoes.map((v) => [v.versao, v.para_nome, !!v.confirmada_em]), [[1, 'Rita Fictícia', false], [2, 'Rita Fictícia', true]]);
  // 3ª versão; a 4ª só com a liberação da coordenação
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/ficha/enviar`, { motivo: 'conta bancária recebida' })).status, 200);
  const r4 = await ana('POST', `/api/implantacoes/${idA}/ficha/enviar`, { motivo: 'mais uma correção' });
  assert.equal(r4.status, 409);
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/ficha/liberar`, { motivo: 'Erro no valor da água' })).status, 403);
  assert.equal((await coord('POST', `/api/implantacoes/${idA}/ficha/liberar`, { motivo: 'Erro no valor da água' })).status, 200);
  assert.equal((await ana('POST', `/api/implantacoes/${idA}/ficha/enviar`, { motivo: 'valor da água corrigido' })).status, 200);
  const tipos = (await detalhe(ana, idA)).eventos.map((e) => e.tipo);
  for (const t of ['ficha_enviada', 'ficha_destino', 'ficha_devolvida', 'ficha_resposta', 'ficha_recebida', 'ficha_liberada']) assert.ok(tipos.includes(t), t);
  // a versão enviada não muda depois
  const v1 = await ctx.db.um('SELECT conteudo FROM implantacao_ficha_versoes WHERE implantacao_id = $1 AND versao = 1', [idA]);
  assert.equal(v1.conteudo.secoes.find((x) => x.numero === 4).campos.find((c) => c[0] === 'Considerações')[1].v, '');
});

test('ficha de transição: PDF de cada versão (-v1, -v2) no papel timbrado', { skip: !temReportlab && 'reportlab não instalado' }, async () => {
  const r = await rita('GET', `/api/implantacoes/${idA}/ficha.pdf?versao=2`, undefined, { bruto: true });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.match(decodeURIComponent(r.headers.get('content-disposition')), /Ficha_de_transicao_.*-v2\.pdf/);
  assert.equal(r.buffer.subarray(0, 4).toString(), '%PDF');
  assert.equal((await rita('GET', `/api/implantacoes/${idA}/ficha.pdf?versao=9`, undefined, { bruto: true })).status, 404);
});

test('ficha de transição: na Carteira, a assistente de crédito que recebeu a ficha fica no condomínio', async () => {
  const p = (await coord('GET', `/api/implantacoes/${idA}/carteira`)).json;
  const r = await coord('POST', `/api/implantacoes/${idA}/carteira`, { dados: { ...p.dados, codigo: '90101' } });
  assert.equal(r.status, 201, r.texto);
  assert.equal((await ctx.db.um('SELECT assistente_credito FROM condominios WHERE id = $1', [r.json.condominio_id])).assistente_credito, 'Rita Fictícia');
});

test('ficha de transição: prazo de 5 dias úteis da conclusão; lembrete na véspera e no dia, atraso à assistente e à coordenação', async () => {
  const id = await assumida('Residencial Fictício Delta');
  const etapas = { documentacao: { feito: true }, vouch: { id: '90404' }, onboarding: { situacao: 'realizado', data: '2026-10-22', hora: '09:00' }, boletos: { feito: true, primeiro_vencimento: '2026-11-10' }, envio: { forma: 'email' } };
  assert.equal((await ana('PATCH', `/api/implantacoes/${id}/etapas`, { etapas })).status, 200);
  assert.equal((await ana('POST', `/api/implantacoes/${id}/concluir`, {})).status, 200);
  assert.match((await ultimo('ana@teste.com')).titulo, /^Ficha de transição aberta · /);
  // aberta numa segunda (26/10/2026) → 5 dias úteis: vence 02/11 (sem feriados no teste)
  await ctx.db.q("UPDATE implantacao_fichas SET aberta_em = '2026-10-26T13:00:00Z', aviso_prazo_em = NULL WHERE implantacao_id = $1", [id]);
  await ctx.db.q("UPDATE implantacao_fichas SET aviso_prazo_em = '2099-01-01' WHERE implantacao_id <> $1", [id]);
  await ctx.db.q("UPDATE implantacoes SET aviso_concluir_em = '2099-01-01', aviso_onboarding_em = '2099-01-01'");
  await ctx.db.q(SEM_AVISOS_POS);
  const ex = async (dia) => (await ctx.rotinasImplantacao.executar(sp(dia))).prazos_dias_uteis.ficha;
  assert.equal(await ex('2026-10-29'), 0);
  assert.equal(await ex('2026-10-30'), 1);
  assert.match((await ultimo('ana@teste.com')).titulo, /^Ficha de transição vence amanhã · /);
  assert.equal(await ex('2026-10-30'), 0);
  await ex('2026-11-02');
  assert.match((await ultimo('ana@teste.com')).titulo, /^Ficha de transição vence hoje · /);
  await ex('2026-11-03');
  assert.match((await ultimo('ana@teste.com')).titulo, /^Ficha de transição atrasada · 1 dia útil · /);
  assert.match((await ultimo('coord@teste.com')).titulo, /^Ficha de transição atrasada de Ana Fictícia · 1 dia útil/);
  assert.equal((await coord('POST', `/api/implantacoes/${id}/cobrar`, { qual: 'ficha' })).status, 200);
  assert.match((await ultimo('ana@teste.com')).texto, /cobrando a ficha de transição/);
  // enviada, a rotina para
  assert.equal((await ana('POST', `/api/implantacoes/${id}/ficha/enviar`, { dados: DADOS_FICHA })).status, 200);
  assert.equal(await ex('2026-11-04'), 0);
  await ctx.db.q("UPDATE implantacao_fichas SET primeiro_envio_em = '2026-11-04T15:00:00Z' WHERE implantacao_id = $1", [id]);
  const j = (await ana('GET', `/api/implantacoes/${id}/ficha`)).json;
  assert.equal(j.ficha.prazo.status, 'cumprido_com_atraso');
});

/* ===================== antecipação → Controle de Repasses ===================== */
test('antecipação: a Implantação envia; no Controle de Repasses o Gestor cadastra (com ajuste) ou devolve; atualização com antes e depois', async () => {
  const id = await assumida('Residencial Fictício Épsilon', { antecipacao: 'sim', antecipacao_valor: 20000, antecipacao_data: '2026-11-05', antecipacao_prazo: '10 parcelas' });
  const gestor = await pessoa('Gestor de Repasses Fictício', 'rep@teste.com');
  const leitor = await pessoa('Leitor de Repasses Fictício', 'leitor@teste.com');
  // sem a ferramenta cadastrada, só a administração abre
  assert.equal((await gestor('GET', '/api/repasses/antecipacoes')).status, 403);
  await ctx.db.q(`INSERT INTO modulos (slug, nome, config) VALUES ('repasses', 'Controle de Repasses', $1::jsonb)`, [JSON.stringify({ papeis: [{ id: 'gestor', nome: 'Gestor' }] })]);
  await ctx.db.q("INSERT INTO permissoes (usuario_id, modulo_slug, papeis) VALUES ($1, 'repasses', ARRAY['gestor']), ($2, 'repasses', ARRAY[]::text[])", [ids['rep@teste.com'], ids['leitor@teste.com']]);
  // envio pela Implantação: só o setor
  assert.equal((await exec('POST', `/api/implantacoes/${id}/antecipacao/enviar`, {})).status, 403);
  const e = await ana('POST', `/api/implantacoes/${id}/antecipacao/enviar`, {});
  assert.equal(e.status, 200, e.texto);
  assert.deepEqual(e.json.enviado, { valor: 20000, data: '2026-11-05', dia: 5, prazo: '10 parcelas', fim: '2027-08' });
  assert.equal((await ana('POST', `/api/implantacoes/${id}/antecipacao/enviar`, {})).status, 409);
  // a ferramenta lê
  const l = await leitor('GET', '/api/repasses/antecipacoes');
  assert.equal(l.status, 200);
  const it = l.json.itens.find((x) => x.implantacao_id === id);
  assert.deepEqual([it.tipo, it.condominio.nome, it.condominio.comarca, it.valor, it.dia, it.fim, it.enviado_por, it.na_carteira],
    ['nova', 'Residencial Fictício Épsilon', 'CE', 20000, 5, '2027-08', 'Ana Fictícia', false]);
  // só o Gestor decide
  assert.equal((await leitor('POST', `/api/repasses/antecipacoes/${id}/cadastrar`, { regra_id: 'G1' })).status, 403);
  const c = await gestor('POST', `/api/repasses/antecipacoes/${id}/cadastrar`, { regra_id: 'G123', valor: 20000, dia: 6, modo: 'exato', fim: '2027-08', obs: 'dia 5 é sábado' });
  assert.equal(c.status, 200, c.texto);
  assert.deepEqual(c.json.ajuste, { dia: { de: 5, para: 6 } });
  const av = await ultimo('ana@teste.com');
  assert.match(av.titulo, /^Antecipação cadastrada com ajuste · /);
  assert.match(av.texto, /dia 5 → dia 6/);
  assert.equal((await gestor('POST', `/api/repasses/antecipacoes/${id}/cadastrar`, { regra_id: 'G123' })).status, 409);
  assert.ok(!(await gestor('GET', '/api/repasses/antecipacoes')).json.itens.some((x) => x.implantacao_id === id));
  let linha = (await coord('GET', '/api/implantacoes/acompanhamento')).json.linhas.find((x) => x.id === id);
  assert.deepEqual([linha.antecipacao_envio.situacao, linha.antecipacao_envio.regra_id, linha.antecipacao_envio.mudou], ['cadastrada', 'G123', false]);
  // o formulário muda depois do cadastro: aparece como mudou e vai como atualização, com o antes
  await ctx.db.q(`UPDATE implantacoes SET formulario = formulario || '{"antecipacao_valor": 25000}'::jsonb WHERE id = $1`, [id]);
  linha = (await coord('GET', '/api/implantacoes/acompanhamento')).json.linhas.find((x) => x.id === id);
  assert.equal(linha.antecipacao_envio.mudou, true);
  assert.equal((await ana('POST', `/api/implantacoes/${id}/antecipacao/enviar`, {})).json.atualizacao, true);
  const at = (await gestor('GET', '/api/repasses/antecipacoes')).json.itens.find((x) => x.implantacao_id === id);
  assert.deepEqual([at.tipo, at.regra_id, at.valor, at.antes.valor], ['atualizacao', 'G123', 25000, 20000]);
  // devolução com motivo
  assert.equal((await gestor('POST', `/api/repasses/antecipacoes/${id}/devolver`, { motivo: '' })).status, 400);
  assert.equal((await gestor('POST', `/api/repasses/antecipacoes/${id}/devolver`, { motivo: 'O valor novo não foi aprovado pela diretoria' })).status, 200);
  assert.match((await ultimo('ana@teste.com')).texto, /não foi aprovado/);
  linha = (await coord('GET', '/api/implantacoes/acompanhamento')).json.linhas.find((x) => x.id === id);
  assert.deepEqual([linha.antecipacao_envio.situacao, linha.antecipacao_envio.motivo], ['devolvida', 'O valor novo não foi aprovado pela diretoria']);
  const tipos = (await detalhe(ana, id)).eventos.map((x) => x.tipo);
  for (const t of ['antecipacao_enviada', 'antecipacao_cadastrada', 'antecipacao_devolvida']) assert.ok(tipos.includes(t), t);
});

test('Acompanhamento: colunas do Controle (Obs. só de quem conduz), fichas de transição, Excel e desfazer o envio da antecipação', async () => {
  const j = (await ana('GET', '/api/implantacoes/acompanhamento')).json;
  const l = j.linhas.find((x) => x.id === idA);
  assert.equal(l.controle.obs, 'Síndico pediu boleto separado');
  assert.equal(l.controle.vouch, '90101');
  assert.equal(l.controle.pode_obs, true);
  assert.equal((await bia('GET', '/api/implantacoes/acompanhamento')).json.linhas.find((x) => x.id === idA).controle.pode_obs, false);
  const f = j.fichas.find((x) => x.id === idA);
  assert.deepEqual([f.situacao, f.destino_nome, f.versao, f.limite], ['enviada', 'Rita Fictícia', 4, 4]);
  const x = await ana('POST', '/api/implantacoes/acompanhamento/excel', { nome: 'Controle 2026', abas: [{ titulo: 'Controle', cab: ['Protocolo', '%'], linhas: [['IMP-1', 60]] }] }, { bruto: true });
  assert.equal(x.status, 200);
  assert.match(x.headers.get('content-disposition'), /Controle_2026\.xlsx/);
  assert.deepEqual(require('../server/planilha').lerXlsx(x.buffer), [['Protocolo', '%'], ['IMP-1', '60']]);
  assert.equal((await exec('POST', '/api/implantacoes/acompanhamento/excel', { abas: [{ cab: ['a'], linhas: [] }] })).status, 403);
  // desfazer: a nova sai da lista do Controle de Repasses
  const id = await assumida('Residencial Fictício Zeta', { antecipacao: 'sim', antecipacao_valor: 5000, antecipacao_data: '2026-12-10', antecipacao_prazo: 'permanente' });
  assert.equal((await ana('POST', `/api/implantacoes/${id}/antecipacao/enviar`, {})).json.enviado.fim, '');
  assert.equal((await ana('POST', `/api/implantacoes/${id}/antecipacao/desfazer`, {})).status, 200);
  assert.equal((await ana('POST', `/api/implantacoes/${id}/antecipacao/desfazer`, {})).status, 409);
  assert.equal(await ctx.db.um('SELECT 1 FROM implantacao_antecipacoes WHERE implantacao_id = $1', [id]), null);
});

test('onboarding marcado: convite no Outlook (1h, Teams) para quem conduz, o setor CS sem a liderança e o síndico; mudar atualiza, desmarcar cancela', async () => {
  await pessoa('Carla Fictícia', 'carla.cs@teste.com');
  await pessoa('Lider Fictício', 'lider.cs@teste.com');
  await noSetor('CS', 'carla.cs@teste.com', false);
  await noSetor('CS', 'lider.cs@teste.com', true);
  const id = await assumida('Residencial Fictício Convite');
  agenda.chamadas = [];
  const salvar = (onboarding) => ana('PATCH', `/api/implantacoes/${id}/etapas`, { etapas: { onboarding } });
  // data e hora são obrigatórias
  assert.equal((await salvar({ situacao: 'marcado', data: '2026-11-04' })).status, 400);
  let r = await salvar({ situacao: 'marcado', data: '2026-11-04', hora: '10:00' });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.convite.situacao, 'enviado');
  const [acao, x] = agenda.chamadas[0];
  assert.equal(acao, 'criar');
  assert.deepEqual([x.inicio, x.fim], ['2026-11-04T10:00', '2026-11-04T11:00']);
  assert.deepEqual(x.participantes.map((p) => p.email).sort(), ['ana@teste.com', 'carla.cs@teste.com', 'sindico@exemplo.com']);
  // salvar de novo sem mudar não reenvia; mudar a hora atualiza o mesmo convite
  assert.equal((await salvar({ situacao: 'marcado', data: '2026-11-04', hora: '10:00' })).json.convite.situacao, 'mantido');
  r = await salvar({ situacao: 'marcado', data: '2026-11-04', hora: '15:30' });
  assert.equal(r.json.convite.situacao, 'atualizado');
  assert.deepEqual([agenda.chamadas[1][0], agenda.chamadas[1][2], agenda.chamadas[1][1].fim], ['atualizar', 'ev-1', '2026-11-04T16:30']);
  // voltar para "a marcar" cancela
  assert.equal((await salvar({ situacao: 'a_marcar' })).json.convite.situacao, 'cancelado');
  assert.deepEqual(agenda.chamadas[2].slice(0, 1), ['cancelar']);
  assert.equal((await ctx.db.um('SELECT onboarding_convite FROM implantacoes WHERE id = $1', [id])).onboarding_convite, null);
  // o Microsoft 365 recusou: o onboarding salva e a tela recebe o aviso
  agenda.falhar = true;
  r = await salvar({ situacao: 'marcado', data: '2026-11-05', hora: '09:00' });
  agenda.falhar = false;
  assert.equal(r.status, 200);
  assert.equal(r.json.convite.situacao, 'erro');
  assert.match(r.json.convite.mensagem, /sem permissão de calendário/);
});

test('a coordenação cobra o onboarding; documento errado volta a faltar pela pendência e o comercial anexa o certo', async () => {
  const id = await assumida('Residencial Fictício Pendência');
  assert.equal((await ana('POST', `/api/implantacoes/${id}/cobrar`, { qual: 'onboarding' })).status, 403);
  assert.equal((await coord('POST', `/api/implantacoes/${id}/cobrar`, { qual: 'onboarding' })).status, 200);
  assert.match((await ultimo('ana@teste.com')).texto, /cobrando o onboarding/);
  // depois do envio, o comercial não troca nem tira o que já anexou
  assert.equal((await anexar(exec, id, 'ata_eleicao')).status, 409);
  // a assistente devolve com pendência dizendo qual documento está errado: ele volta a faltar
  assert.equal((await ana('POST', `/api/implantacoes/${id}/pendencia`, { itens: ['A ata de eleição está sem assinatura'], documentos: ['ata_eleicao'] })).status, 200);
  const d = await detalhe(exec, id);
  assert.ok(!d.documentos.some((x) => x.tipo === 'ata_eleicao' && !x.substituido_em));
  assert.equal((await anexar(exec, id, 'ata_eleicao')).status, 201);
  assert.equal((await anexar(exec, id, 'ata_eleicao')).status, 409);
  assert.equal((await anexar(exec, id, 'cadastro_moradores')).status, 409);
});
