'use strict';
/* Implantação pelo portal: do contrato assinado (no portal ou fora dele) ao envio ao setor, com avisos e lembretes (dados fictícios). */
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

let admin, exec, gestorCr, coord, equipe, outro;
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
const avisosDe = async (email) => (await ctx.db.q('SELECT n.titulo, n.texto, n.link FROM notificacoes n JOIN usuarios u ON u.id = n.usuario_id WHERE u.email = $1 ORDER BY n.id', [email])).rows;
const emailsPara = (email) => emails.filter((m) => m.para.email === email);
const PDF = Buffer.from('%PDF-1.4\n% documento fictício\n');
const anexar = (c, id, tipo, nome = `${tipo}.pdf`) => c('POST', `/api/implantacoes/${id}/documentos`, PDF, { headers: { 'x-tipo': tipo, 'x-nome-arquivo': encodeURIComponent(nome) } });

const FORM_ANALISE = {
  razao_social: 'Condomínio Residencial Fictício', cnpj: '11.222.333/0001-81', uf: 'CE', cidade: 'Fortaleza', tipo_contratacao: 'nova',
  uh_total: 24, taxa_ordinaria: 1840, dia_vencimento: 10, desconto_pontualidade: { tipo: 'nenhum' }, sindico: { tipo: 'condomino', isencao: 'integral' },
  administradora: 'Administradora Exemplo',
};
/* análise já liberada ao executivo, há `dias` dias, com a convenção e o retorno em PDF */
let seq = 0;
async function analiseLiberada(dias, nome = 'Condomínio Residencial Fictício') {
  seq++;
  const { id } = await ctx.db.um(`INSERT INTO analises (protocolo, etapa, resultado, condominio, cnpj, uf, tipo_contratacao, executivo_id, solicitante_id, formulario,
      taxa_adm, boleto, enviada_em, liberada_em) VALUES ($1, 'enviada', 'aprovada', $2, '11.222.333/0001-81', 'CE', 'nova', $3, $4, $5::jsonb, 3, 2,
      now() - make_interval(days => $6), now() - make_interval(days => $6)) RETURNING id`,
  [`AC-2026-01-01-${String(seq).padStart(2, '0')}`, nome, ids.executivo, ids['exec@teste.com'], JSON.stringify({ ...FORM_ANALISE, razao_social: nome }), dias]);
  for (const tipo of ['convencao', 'retorno_pdf']) {
    await ctx.db.q("INSERT INTO analise_documentos (analise_id, tipo, nome, mime, tamanho, conteudo) VALUES ($1, $2, $3, 'application/pdf', $4, $5)", [id, tipo, `${tipo}.pdf`, PDF.length, PDF]);
  }
  return id;
}
/* contrato concluído no portal (a advogada já registrou as condições), de uma análise liberada, com a via assinada */
let seqCt = 0;
const FECHADO = { taxa_adm: 3.5, boleto: 2, desconto_tipo: 'nenhum', garantias: ['Taxa ordinária', 'Taxa extraordinária'], cashback: '5', cashback_receitas: ['Taxa administrativa'],
  inicio_contrato: '2026-11-01', honorarios: 12, foro: 'Fortaleza/CE', prazo_contestacao: 15, clausulas: [] };
async function contratoConcluido(nome = 'Condomínio Residencial Fictício') {
  const aid = await analiseLiberada(5, nome);
  seqCt++;
  const { id } = await ctx.db.um(`INSERT INTO contratos (protocolo, etapa, origem, analise_id, analise_protocolo, condominio, cnpj, uf, executivo_id, solicitante_id, formulario, fechado, fechado_em, concluido_em, assinado_em, enviado_em)
    SELECT $1, 'assinado', 'analise', a.id, a.protocolo, a.condominio, a.cnpj, a.uf, a.executivo_id, a.solicitante_id, $2::jsonb, $3::jsonb, now(), now(), now(), now() FROM analises a WHERE a.id = $4 RETURNING id`,
  [`CT-2026-01-01-${String(seqCt).padStart(2, '0')}`, JSON.stringify({ nome, cnpj: '11.222.333/0001-81', uf: 'CE', cidade: 'Fortaleza', garantias: FECHADO.garantias }), JSON.stringify(FECHADO), aid]);
  await ctx.db.q("INSERT INTO contrato_documentos (contrato_id, tipo, nome, mime, tamanho, conteudo) VALUES ($1, 'contrato_assinado', 'contrato-assinado.pdf', 'application/pdf', $2, $3)", [id, PDF.length, PDF]);
  return { aid, ct: id };
}
const abrir = async (ct) => (await exec('POST', `/api/contratos/${ct}/implantacao`, {})).json.implantacao;

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
  exec = await pessoa('Executiva Fictícia', 'exec@teste.com');
  gestorCr = await pessoa('Gestor do Crédito Fictício', 'gestorcr@teste.com');
  coord = await pessoa('Coordenadora Fictícia', 'coord@teste.com');
  equipe = await pessoa('Analista de Implantação Fictícia', 'equipe@teste.com');
  outro = await pessoa('Outra Pessoa', 'outro@teste.com');
  await noSetor('Análise de Crédito', 'gestorcr@teste.com', true);
  await noSetor('Implantação', 'coord@teste.com', true);
  await noSetor('Implantação', 'equipe@teste.com', false);
  const ex = await admin('POST', '/api/credito/executivos', { nome: 'Executiva Fictícia', uf: 'CE', regiao: 'Ceará', usuario_id: ids['exec@teste.com'] });
  assert.equal(ex.status, 201, ex.texto);
  ids.executivo = ex.json.id;
});
after(async () => { servidor.close(); await ctx.db.fechar(); });

test('perfis: comercial, equipe, coordenação e quem não tem acesso', async () => {
  const p = async (c) => (await c('GET', '/api/implantacoes/meta')).json.perfil;
  assert.equal((await p(exec)).executivo.id, ids.executivo);
  assert.deepEqual([(await p(coord)).coordenacao, (await p(coord)).equipe], [true, true]);
  assert.deepEqual([(await p(equipe)).coordenacao, (await p(equipe)).equipe], [false, true]);
  assert.equal((await outro('GET', '/api/implantacoes/resumo')).json.acesso, false);
  assert.equal((await outro('GET', '/api/implantacoes/contratos')).status, 403);
  assert.equal((await exec('GET', '/api/implantacoes?vis=fila')).status, 403);
  // a análise de crédito não abre mais implantação: o gestor do crédito não tem o que fazer aqui
  assert.equal((await gestorCr('GET', '/api/implantacoes/resumo')).json.acesso, false);
});

let idI;
test('a partir do contrato concluído: as condições fechadas, o contrato, a convenção e o retorno vêm junto', async () => {
  const { aid, ct } = await contratoConcluido();
  assert.ok((await exec('GET', '/api/implantacoes/contratos')).json.contratos.some((x) => x.id === ct));
  assert.equal((await exec('POST', '/api/implantacoes', { origem: 'analise', analise_id: aid })).status, 404); // a análise sozinha não abre implantação
  const r = await exec('POST', `/api/contratos/${ct}/implantacao`, {});
  assert.equal(r.status, 201, r.texto);
  idI = r.json.implantacao;
  const d = (await exec('GET', `/api/implantacoes/${idI}`)).json;
  assert.equal(d.implantacao.etapa, 'rascunho');
  assert.equal(d.implantacao.formulario.nome, 'Condomínio Residencial Fictício');
  assert.equal(d.implantacao.formulario.taxa_adm, 3.5);
  assert.equal(d.implantacao.referencia.boleto, 2);
  assert.equal(d.condicoes_do_juridico, false);
  assert.deepEqual(d.documentos.map((x) => x.tipo).sort(), ['analise_credito', 'contrato', 'convencao']);
  assert.ok(!(await exec('GET', '/api/implantacoes/contratos')).json.contratos.some((x) => x.id === ct));
  assert.equal((await exec('POST', `/api/contratos/${ct}/implantacao`, {})).status, 409);
  // a análise mostra a implantação aberta a partir dela
  assert.equal((await exec('GET', `/api/credito/analises/${aid}`)).json.implantacao.id, idI);
  assert.equal((await outro('GET', `/api/implantacoes/${idI}`)).status, 404);
});

const FORM = {
  nome: 'Condomínio Residencial Fictício', cnpj: '11.222.333/0001-81', uf: 'CE', cidade: 'Fortaleza', uh_total: 24, dia_vencimento: 10,
  sindico_tipo: 'condomino', sindico_isencao: 'integral', sindico_nome: 'Síndico Fictício', sindico_cpf: '111.444.777-35',
  sindico_email: 'sindico@exemplo.com', sindico_telefone: '(85) 90000-0000',
  taxa_adm: 3.5, boleto: 2, taxa_ordinaria: 1840, desconto_tipo: 'nenhum', inicio_contrato: '2026-11-01', honorarios: 12,
  garantias: ['Taxa ordinária', 'Taxa extraordinária'], parceria: 'sim', parceiros: [{ id: 'p-alfa', nome: 'Alfa Administradora' }],
  cashback: '5', cashback_receitas: ['Taxa administrativa'], antecipacao: 'nao',
  administradora: 'Administradora Exemplo', consultor_nome: 'Consultor Fictício', consultor_telefone: '(85) 90000-0001',
  contatos: [{ nome: 'Contato Fictício', funcao: 'Gerente predial', telefone: '(85) 90000-0002' }],
};

test('enviar: confere o que falta, gera o protocolo e avisa a coordenação, a equipe e o executivo', async () => {
  let env = await exec('POST', `/api/implantacoes/${idI}/enviar`, {});
  assert.equal(env.status, 400);
  assert.ok(env.json.faltas.some((f) => /Ata de eleição/.test(f)));
  assert.ok(env.json.faltas.some((f) => /nome do síndico/.test(f)));
  const p = await exec('PATCH', `/api/implantacoes/${idI}`, { formulario: FORM });
  assert.equal(p.status, 200, p.texto);
  assert.deepEqual(p.json.diferencas.map((x) => x.campo), ['taxa_adm']);
  for (const tipo of ['cadastro_moradores', 'ata_eleicao', 'ata_orcamento', 'documento_sindico']) assert.equal((await anexar(exec, idI, tipo)).status, 201);
  assert.equal((await anexar(exec, idI, 'qualquer')).status, 400);
  env = await exec('POST', `/api/implantacoes/${idI}/enviar`, {});
  assert.equal(env.status, 200, env.texto);
  assert.match(env.json.protocolo, /^IMP-\d{4}-\d{2}-\d{2}-01$/);
  assert.equal(env.json.etapa, 'fila');
  assert.deepEqual(env.json.pendencias, ['Conta bancária', 'Comprovante de endereço do síndico', 'Modelo do boleto anterior']);
  assert.match((await avisosDe('coord@teste.com')).pop().titulo, /^Nova implantação · IMP-/);
  assert.match((await avisosDe('equipe@teste.com')).pop().titulo, /^Chegou uma nova implantação/);
  assert.equal(emailsPara('coord@teste.com').length, 1);
  assert.equal(emailsPara('equipe@teste.com').length, 1);
  // o executivo recebe as pendências no sino (o e-mail é o lembrete diário)
  const pend = (await avisosDe('exec@teste.com')).pop();
  assert.match(pend.titulo, /^Pendências da implantação/);
  assert.match(pend.texto, /Conta bancária/);
  assert.equal(emailsPara('exec@teste.com').filter((m) => /Pendências/.test(m.subject)).length, 0);
  // depois de enviada, o formulário não muda mais pelo executivo
  assert.equal((await exec('PATCH', `/api/implantacoes/${idI}`, { formulario: FORM })).status, 403);
  const d = (await coord('GET', `/api/implantacoes/${idI}`)).json;
  assert.deepEqual(d.diferencas.map((x) => [x.campo, x.valor, x.analise]), [['taxa_adm', 3.5, 3]]);
});

test('listas: o executivo vê as suas; a fila é do setor; a coordenação conta o que chegou', async () => {
  const minhas = (await exec('GET', '/api/implantacoes?vis=minhas')).json.implantacoes;
  assert.ok(minhas.some((x) => x.id === idI && x.pendentes.length === 3));
  const fila = (await equipe('GET', '/api/implantacoes?vis=fila')).json.implantacoes;
  assert.deepEqual(fila.map((x) => x.id), [idI]);
  assert.equal((await coord('GET', '/api/implantacoes/resumo')).json.fila, 1);
  assert.equal((await outro('GET', '/api/implantacoes?vis=minhas')).json.implantacoes.length, 0);
});

test('documento pendente que chega avisa o setor; lembrete diário por e-mail ao executivo, uma vez por dia útil', async () => {
  assert.equal((await anexar(exec, idI, 'conta_bancaria')).status, 201);
  assert.match((await avisosDe('coord@teste.com')).pop().titulo, /^Documento chegou/);
  // próximo dia útil, 10h em Brasília
  const d = new Date();
  do d.setUTCDate(d.getUTCDate() + 1); while ([0, 6].includes(d.getUTCDay()));
  const amanha = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 13, 0));
  const antes = emailsPara('exec@teste.com').length;
  assert.equal((await ctx.rotinasImplantacao.executar(amanha)).documentos, 1);
  await new Promise((ok) => setTimeout(ok, 20));
  const m = emailsPara('exec@teste.com').slice(antes);
  assert.equal(m.length, 1);
  assert.match(m[0].text, /1\. Comprovante de endereço do síndico\n2\. Modelo do boleto anterior/);
  assert.ok(!/Conta bancária/.test(m[0].text));
  assert.equal((await ctx.rotinasImplantacao.executar(new Date(amanha.getTime() + 3600 * 1000))).documentos, 0);
  // fora do expediente não roda
  assert.equal((await ctx.rotinasImplantacao.executar(new Date(amanha.getTime() - 6 * 3600 * 1000))).documentos, 0);
});

test('parceiros da base de comissão para a lista suspensa', async () => {
  await ctx.registros.upsert('parceiros', 'partners', 'p-boa', { id: 'p-boa', nome: 'Boa Vista Gestão Fictícia', uf: 'PB' });
  await ctx.registros.upsert('parceiros', 'partners', 'p-alfa', { id: 'p-alfa', nome: 'Alfa Administradora Fictícia', uf: 'CE' });
  const r = (await exec('GET', '/api/implantacoes/parceiros')).json;
  assert.deepEqual(r.parceiros.map((x) => x.nome), ['Alfa Administradora Fictícia', 'Boa Vista Gestão Fictícia']);
  assert.equal(r.aviso, null);
});

test('cancelar: o executivo cancela o rascunho; a coordenação cancela depois do envio', async () => {
  const { ct } = await contratoConcluido('Residencial Fictício Aurora');
  const id = await abrir(ct);
  assert.equal((await equipe('POST', `/api/implantacoes/${id}/cancelar`, {})).status, 403); // rascunho é só do executivo
  assert.equal((await exec('POST', `/api/implantacoes/${id}/cancelar`, {})).status, 200);
  assert.ok((await exec('GET', '/api/implantacoes/contratos')).json.contratos.some((x) => x.id === ct)); // o contrato volta para a lista
  assert.equal((await exec('POST', `/api/implantacoes/${idI}/cancelar`, {})).status, 403);
});

/* ===================== parte 2: setor Implantação ===================== */
let idI2;
test('designar: só a coordenação, para alguém do setor; prazo de 8h úteis para iniciar', async () => {
  assert.equal((await equipe('POST', `/api/implantacoes/${idI}/designar`, { usuario_id: ids['equipe@teste.com'] })).status, 403);
  assert.equal((await coord('POST', `/api/implantacoes/${idI}/designar`, { usuario_id: ids['outro@teste.com'] })).status, 400);
  const r = await coord('POST', `/api/implantacoes/${idI}/designar`, { usuario_id: ids['equipe@teste.com'] });
  assert.equal(r.status, 200, r.texto);
  const i = (await equipe('GET', `/api/implantacoes/${idI}`)).json.implantacao;
  assert.equal(i.etapa, 'em_implantacao');
  assert.equal(i.responsavel_id, ids['equipe@teste.com']);
  assert.equal(new Date(i.prazo_inicio).getTime(), ctx.expediente.somarHorasUteis(new Date(i.designado_em), 8).getTime());
  const aviso = (await avisosDe('equipe@teste.com')).pop();
  assert.match(aviso.titulo, /^Implantação designada para você/);
  assert.match(aviso.texto, /8h úteis/);
  assert.equal((await equipe('GET', '/api/implantacoes/resumo')).json.minhas, 1);
});

test('rotinas: lembrete à coordenação a cada 4h úteis sem designação e aviso de prazo estourado (uma vez)', async () => {
  idI2 = await abrir((await contratoConcluido('Edifício Fictício Horizonte')).ct);
  assert.equal((await exec('PATCH', `/api/implantacoes/${idI2}`, { formulario: { ...FORM, nome: 'Edifício Fictício Horizonte' } })).status, 200);
  for (const tipo of ['cadastro_moradores', 'ata_eleicao', 'ata_orcamento']) await anexar(exec, idI2, tipo);
  assert.equal((await exec('POST', `/api/implantacoes/${idI2}/enviar`, {})).status, 200);
  const daquiUmaSemana = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const r = await ctx.rotinasImplantacao.executar(daquiUmaSemana);
  assert.equal(r.sem_designacao, 1);
  assert.equal(r.prazos, 1);
  const coordAvisos = (await avisosDe('coord@teste.com')).map((x) => x.titulo);
  assert.ok(coordAvisos.some((t) => /^Ainda sem ninguém designado · .* · Edifício Fictício Horizonte/.test(t)));
  assert.ok(coordAvisos.some((t) => /^Passou do prazo para iniciar/.test(t)));
  assert.match((await avisosDe('equipe@teste.com')).pop().titulo, /^Passou do prazo para iniciar/);
  const novo = await ctx.rotinasImplantacao.executar(daquiUmaSemana);
  assert.deepEqual([novo.sem_designacao, novo.prazos], [0, 0]);
});

test('iniciar, conferências do setor e as 5 etapas', async () => {
  { const x = await coord('POST', `/api/implantacoes/${idI}/iniciar`, {}); assert.equal(x.status, 403, x.texto); } // só quem foi designado
  assert.equal((await equipe('PATCH', `/api/implantacoes/${idI}/etapas`, { etapas: {} })).status, 403); // antes de iniciar
  assert.equal((await equipe('POST', `/api/implantacoes/${idI}/iniciar`, {})).status, 200);
  // cadastro de moradores em CSV: 2 unidades, um CPF inválido na linha 3
  const csv = Buffer.from('Unidade;Nome;CPF\n101;Morador Fictício 1;111.444.777-35\n102;Morador Fictício 2;123.456.789-00\n');
  // depois do envio, o executivo não troca documento já anexado; quem conduz troca
  assert.equal((await exec('POST', `/api/implantacoes/${idI}/documentos`, csv, { headers: { 'x-tipo': 'cadastro_moradores', 'x-nome-arquivo': 'cadastro.csv', 'content-type': 'text/csv' } })).status, 409);
  assert.equal((await equipe('POST', `/api/implantacoes/${idI}/documentos`, csv, { headers: { 'x-tipo': 'cadastro_moradores', 'x-nome-arquivo': 'cadastro.csv', 'content-type': 'text/csv' } })).status, 201);
  let d = (await equipe('GET', `/api/implantacoes/${idI}`)).json;
  assert.deepEqual(d.conferencias.cadastro, { unidades: 2, tem_documento: true, documentos_invalidos: [3], sem_documento: 0, unidades_formulario: 24 });
  assert.equal(d.conferencias.cpf_sindico, true);
  assert.deepEqual(d.conferencias.diferencas.map((x) => x.campo), ['taxa_adm']);
  assert.equal(d.faltas_etapas.length, 5); // documentação, Vouch, boletos, 1º vencimento e envio (o onboarding pode ficar para depois)
  assert.equal((await exec('PATCH', `/api/implantacoes/${idI}/etapas`, { etapas: {} })).status, 403);
  // marcado: data e hora obrigatórias
  assert.equal((await equipe('PATCH', `/api/implantacoes/${idI}/etapas`, { etapas: { onboarding: { situacao: 'marcado', data: '2026-10-23' } } })).status, 400);
  // boletos emitidos: o 1º vencimento é obrigatório
  assert.equal((await equipe('PATCH', `/api/implantacoes/${idI}/etapas`, { etapas: { boletos: { feito: true } } })).status, 400);
  let r = await equipe('PATCH', `/api/implantacoes/${idI}/etapas`, { etapas: { documentacao: { feito: true }, vouch: { id: '90001' }, onboarding: { situacao: 'marcado', data: '2026-10-23', hora: '15:00' } } });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.faltas.length, 3);
  assert.equal(r.json.onboarding_pendente, true);
  assert.equal(r.json.etapas.onboarding.por, (await ctx.db.um("SELECT id FROM usuarios WHERE email = 'equipe@teste.com'")).id); // quem conduz
  assert.equal((await equipe('POST', `/api/implantacoes/${idI}/concluir`, {})).status, 400);
});

test('pendência: volta ao executivo e o reenvio volta para quem conduz', async () => {
  const r = await equipe('POST', `/api/implantacoes/${idI}/pendencia`, { itens: ['Enviar a ata de eleição assinada'] });
  assert.equal(r.status, 200, r.texto);
  const aviso = (await avisosDe('exec@teste.com')).pop();
  assert.match(aviso.titulo, /^Pendência na implantação/);
  assert.match(aviso.texto, /ata de eleição assinada/);
  assert.equal((await exec('PATCH', `/api/implantacoes/${idI}`, { formulario: { ...FORM, observacoes: 'Ata enviada' } })).status, 200);
  const env = await exec('POST', `/api/implantacoes/${idI}/enviar`, {});
  assert.equal(env.json.etapa, 'em_implantacao');
  assert.match((await avisosDe('equipe@teste.com')).pop().titulo, /^Pendência respondida/);
  assert.ok((await equipe('GET', `/api/implantacoes/${idI}`)).json.pode.etapas); // segue iniciada
});

test('concluir: aviso à coordenação e ao setor Parceiros, e o condomínio entra na base de comissão com o parceiro', async () => {
  await pessoa('Parceiros Fictício', 'parceiros@teste.com');
  await noSetor('Parceiros', 'parceiros@teste.com', false);
  const base = { documentacao: { feito: true }, vouch: { id: '90001' }, onboarding: { situacao: 'realizado' }, boletos: { feito: true, primeiro_vencimento: '2026-11-10' }, envio: { forma: 'email' } };
  const r0 = await equipe('PATCH', `/api/implantacoes/${idI}/etapas`, { etapas: base });
  assert.equal(r0.status, 400); // realizado sem data e hora não salva
  const r1 = await equipe('PATCH', `/api/implantacoes/${idI}/etapas`, { etapas: { ...base, onboarding: { situacao: 'realizado', data: '2026-10-20', hora: '10:00' } } });
  assert.deepEqual(r1.json.faltas, []);
  const r = await equipe('POST', `/api/implantacoes/${idI}/concluir`, {});
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.parceiros.criado, 'Condomínio Residencial Fictício');
  const condo = await ctx.registros.obter('parceiros', 'condos', 'c-condominioresidencialficticio');
  assert.deepEqual(JSON.parse(condo.vinculosJSON), [{ partnerId: 'p-alfa', rate: 0 }]);
  assert.equal(condo.valorBoleto, 2);
  const ap = (await avisosDe('parceiros@teste.com')).pop();
  assert.match(ap.titulo, /^Condomínio novo com parceiro/);
  assert.match(ap.texto, /Alfa Administradora/);
  assert.match((await avisosDe('coord@teste.com')).pop().titulo, /^Pronta para a Base de Clientes/);
  assert.equal((await coord('GET', '/api/implantacoes/resumo')).json.carteira, 1);
});

test('Carteira: a coordenação confere os dados (ID Vouch e envio vêm das etapas) e confirma', async () => {
  assert.equal((await equipe('GET', `/api/implantacoes/${idI}/carteira`)).status, 403);
  const p = (await coord('GET', `/api/implantacoes/${idI}/carteira`)).json;
  assert.deepEqual([p.dados.codigo, p.dados.nome, p.dados.comarca, p.dados.forma_envio, p.dados.vencimento, p.dados.inicio_contrato],
    ['90001', 'Fictício', 'CE', 'E-MAIL', '10', '2026-11-01']);
  assert.deepEqual(p.duplicados, []);
  // o síndico vem do formulário e é obrigatório na Base de Clientes
  assert.ok(p.dados.sindico_nome && p.dados.sindico_email && p.dados.sindico_telefone);
  assert.equal((await coord('POST', `/api/implantacoes/${idI}/carteira`, { dados: { ...p.dados, sindico_email: 'sem-arroba' } })).status, 400);
  assert.equal((await coord('POST', `/api/implantacoes/${idI}/carteira`, { dados: { ...p.dados, sindico_telefone: '9999' } })).status, 400);
  const r = await coord('POST', `/api/implantacoes/${idI}/carteira`, { dados: { ...p.dados, nome: 'Residencial Fictício' } });
  assert.equal(r.status, 201, r.texto);
  const c = await ctx.db.um('SELECT * FROM condominios WHERE id = $1', [r.json.condominio_id]);
  assert.deepEqual([c.codigo, c.nome, c.comarca, c.forma_envio, c.cnpj, String(c.inicio_contrato instanceof Date ? c.inicio_contrato.toISOString().slice(0, 10) : c.inicio_contrato).slice(0, 10)],
    ['90001', 'Residencial Fictício', 'CE', 'E-MAIL', '11.222.333/0001-81', '2026-11-01']);
  assert.deepEqual([c.sindico_nome, c.sindico_telefone, c.sindico_email], [p.dados.sindico_nome, p.dados.sindico_telefone, p.dados.sindico_email]);
  assert.equal((await coord('GET', `/api/implantacoes/${idI}`)).json.implantacao.etapa, 'na_carteira');
  assert.equal((await coord('POST', `/api/implantacoes/${idI}/carteira`, { dados: p.dados })).status, 403);
  // o mesmo ID Vouch não entra em outra implantação
  await coord('POST', `/api/implantacoes/${idI2}/designar`, { usuario_id: ids['equipe@teste.com'] });
  await equipe('POST', `/api/implantacoes/${idI2}/iniciar`, {});
  assert.equal((await equipe('PATCH', `/api/implantacoes/${idI2}/etapas`, { etapas: { vouch: { id: '90001' } } })).status, 409);
});

/* ===================== parte 3: contrato assinado fora do portal ===================== */
const temLeitor = (() => { try { require('child_process').execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); require('child_process').execFileSync('python3', ['-c', 'import reportlab'], { stdio: 'ignore' }); return true; } catch { return false; } })();
async function retornoFicticio(protocolo) {
  const R = require('../server/credito/retorno');
  const { analisar } = require('../server/credito/motor');
  const lanc = (c, valor) => ({ competencia: c, vencimento: `${c}-10`, tipo: 'ordinaria', valor });
  const formulario = { razao_social: 'Residencial Fictício Antigo', cnpj: '11.444.777/0001-61', uf: 'PB', cidade: 'Cidade Exemplo', tipo_contratacao: 'nova',
    executivo: { nome: 'Executiva Fictícia', uf: 'PB' }, uh_total: 30, taxa_ordinaria: 500, dia_vencimento: 5, desconto_pontualidade: { tipo: 'nenhum' }, sindico: { tipo: 'profissional', isencao: 'nao' } };
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const meses = [3, 2, 1].map((k) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - k); return d.toISOString().slice(0, 7); });
  const r = analisar({ formulario, convencao: { presente: true, registro: 'RI', uh: 30 }, relatorio: { presente: true, data_emissao: hoje, tem_competencia: true, tem_nomes: true,
    unidades: [{ unidade: '101', titular: 'Titular Fictício', lancamentos: meses.map((c) => lanc(c, 500)) }] } }, undefined, { hoje });
  return (await R.gerarPdf(R.montarDados(r, { formulario, protocolo, analista: 'Analista Fictício', emissao: hoje }))).pdf;
}

test('contrato assinado fora do portal: o executivo preenche e envia; a advogada registra as condições e segue ao setor', { skip: !temLeitor && 'pdftotext ou reportlab não instalados' }, async () => {
  const pdf = await retornoFicticio('AC-2026-0915');
  const enviar = (c, acao) => c('POST', `/api/implantacoes/pdf?acao=${acao}`, pdf, { headers: { 'content-type': 'application/pdf', 'x-nome-arquivo': 'retorno.pdf' } });
  assert.equal((await outro('POST', '/api/implantacoes/pdf?acao=ler', pdf)).status, 403);
  assert.equal((await exec('POST', '/api/implantacoes/pdf?acao=ler', Buffer.from('não é pdf'))).status, 400);
  const lido = (await enviar(exec, 'ler')).json;
  assert.deepEqual([lido.lido.protocolo, lido.lido.razao_social, lido.lido.cnpj, lido.lido.resultado, lido.lido.uh_total, lido.lido.taxa_ordinaria],
    ['AC-2026-0915', 'Residencial Fictício Antigo', '11.444.777/0001-61', 'aprovada', 30, 500]);
  assert.ok(lido.lido.taxa_adm > 0 && lido.lido.boleto === 2);
  const r = await enviar(exec, 'criar');
  assert.equal(r.status, 201, r.texto);
  const id = r.json.id;
  let d = (await exec('GET', `/api/implantacoes/${id}`)).json;
  assert.deepEqual([d.implantacao.origem, d.implantacao.assinado_fora, d.implantacao.analise_protocolo, d.condicoes_do_juridico], ['pdf', true, 'AC-2026-0915', true]);
  assert.equal(d.implantacao.formulario.taxa_ordinaria, 500);
  assert.match(d.implantacao.formulario.observacoes, /Próximos passos da análise/);
  assert.equal((await enviar(exec, 'criar')).status, 409); // o mesmo PDF não abre duas
  // o executivo preenche o que é dele: a taxa, o boleto, o desconto, a vigência e os honorários são da advogada
  const FORA = { ...FORM, nome: 'Residencial Fictício Antigo', cnpj: '11.444.777/0001-61', uf: 'PB', uh_total: 30, parceria: 'nao', parceiros: [],
    taxa_adm: null, boleto: null, inicio_contrato: '', honorarios: null };
  assert.equal((await exec('PATCH', `/api/implantacoes/${id}`, { formulario: FORA })).status, 200);
  for (const tipo of ['cadastro_moradores', 'ata_eleicao', 'ata_orcamento', 'convencao']) await anexar(exec, id, tipo);
  let env = await exec('POST', `/api/implantacoes/${id}/enviar`, {});
  assert.equal(env.status, 400);
  assert.deepEqual(env.json.faltas, ['Anexar: Contrato assinado.']); // nada das condições do contrato
  assert.equal((await anexar(exec, id, 'contrato', 'contrato-assinado.pdf')).status, 201);
  env = await exec('POST', `/api/implantacoes/${id}/enviar`, {});
  assert.equal(env.status, 200, env.texto);
  assert.deepEqual([env.json.etapa, /^IMP-/.test(env.json.protocolo), /^CT-/.test(env.json.contrato)], ['juridico', true, true]);
  d = (await exec('GET', `/api/implantacoes/${id}`)).json;
  assert.deepEqual([d.implantacao.etapa, d.contrato.etapa, d.pode.editar, d.pode.cancelar], ['juridico', 'conferencia', false, true]);
  assert.ok(!(await coord('GET', '/api/implantacoes?vis=fila')).json.implantacoes.some((x) => x.id === id)); // ainda não chegou ao setor
  // o contrato entra nas Assinaturas do Jurídico, com a via assinada, o retorno e a convenção; quem elabora é avisado
  const ct = d.contrato.id;
  const c = (await admin('GET', `/api/contratos/${ct}`)).json;
  assert.deepEqual([c.contrato.origem, c.contrato.formulario.assinado_fora, c.pode.registrar], ['pdf', true, true]);
  assert.deepEqual(c.documentos.map((x) => x.tipo).sort(), ['analise_credito', 'contrato_assinado', 'convencao']);
  assert.ok((await admin('GET', '/api/contratos?vis=assinaturas')).json.contratos.some((x) => x.id === ct && x.assinado_fora));
  assert.match((await avisosDe('admin@teste.com')).pop().titulo, /^Contrato assinado fora do portal · CT-/);
  // a advogada registra as condições do contrato assinado: a implantação segue sozinha para o setor
  const x = c.contrato.fechado;
  const fe = await admin('PUT', `/api/contratos/${ct}/fechado`, { condicoes: { ...x, taxa_adm: 3.25, boleto: 2.5, honorarios: 15, inicio_contrato: '2026-12-01' }, concluir: true });
  assert.equal(fe.status, 200, fe.texto);
  assert.equal(fe.json.implantacao_etapa, 'fila');
  d = (await exec('GET', `/api/implantacoes/${id}`)).json;
  assert.deepEqual([d.implantacao.etapa, d.implantacao.formulario.taxa_adm, d.implantacao.formulario.boleto, d.implantacao.formulario.honorarios, d.implantacao.formulario.inicio_contrato, d.condicoes_do_juridico],
    ['fila', 3.25, 2.5, 15, '2026-12-01', false]);
  assert.ok(d.implantacao.enviado_em);
  assert.match((await avisosDe('exec@teste.com')).pop().titulo, /^Condições registradas · IMP-/);
  assert.ok((await avisosDe('coord@teste.com')).some((a) => /^Nova implantação · /.test(a.titulo) && /contrato assinado fora do portal/.test(a.texto)));
});

test('contrato assinado fora do portal: análise do portal não entra por aqui; o Jurídico cancela e a implantação volta', { skip: !temLeitor && 'pdftotext ou reportlab não instalados' }, async () => {
  // análise feita no portal: o contrato é pedido em Solicitação de Contrato
  const aid = await analiseLiberada(1, 'Residencial Fictício do Portal');
  const prot = (await ctx.db.um('SELECT protocolo FROM analises WHERE id = $1', [aid])).protocolo;
  const doPortal = await retornoFicticio(prot);
  const r0 = await exec('POST', '/api/implantacoes/pdf?acao=criar', doPortal, { headers: { 'content-type': 'application/pdf' } });
  assert.equal(r0.status, 409);
  assert.match(r0.json.erro, /Solicitação de Contrato/);
  // o Jurídico cancela a conferência: volta ao executivo em rascunho
  const pdf = await retornoFicticio('AC-2026-0916');
  const { id } = (await exec('POST', '/api/implantacoes/pdf?acao=criar', pdf, { headers: { 'content-type': 'application/pdf' } })).json;
  assert.equal((await exec('PATCH', `/api/implantacoes/${id}`, { formulario: { ...FORM, nome: 'Residencial Fictício Antigo', cnpj: '11.444.777/0001-61', uf: 'PB', parceria: 'nao', parceiros: [] } })).status, 200);
  for (const tipo of ['cadastro_moradores', 'ata_eleicao', 'ata_orcamento', 'convencao', 'contrato']) await anexar(exec, id, tipo);
  assert.equal((await exec('POST', `/api/implantacoes/${id}/enviar`, {})).json.etapa, 'juridico');
  const ct = (await exec('GET', `/api/implantacoes/${id}`)).json.contrato.id;
  assert.equal((await admin('POST', `/api/contratos/${ct}/cancelar`, { motivo: 'Via assinada ilegível' })).status, 200);
  const d = (await exec('GET', `/api/implantacoes/${id}`)).json;
  assert.deepEqual([d.implantacao.etapa, d.implantacao.contrato_id, d.pode.editar, d.condicoes_do_juridico], ['rascunho', null, true, true]);
  assert.match((await avisosDe('exec@teste.com')).pop().texto, /Via assinada ilegível/);
  // o executivo desiste com a implantação no Jurídico: a conferência do contrato é cancelada junto
  assert.equal((await exec('POST', `/api/implantacoes/${id}/enviar`, {})).json.etapa, 'juridico');
  const ct2 = (await exec('GET', `/api/implantacoes/${id}`)).json.contrato.id;
  assert.equal((await exec('POST', `/api/implantacoes/${id}/cancelar`, {})).status, 200);
  assert.equal((await admin('GET', `/api/contratos/${ct2}`)).json.contrato.etapa, 'cancelada');
});

test('formulário em PDF: quem vê a implantação exporta, com as seções, a parceria e o andamento do setor', { skip: !temLeitor && 'pdftotext ou reportlab não instalados' }, async () => {
  assert.equal((await outro('GET', `/api/implantacoes/${idI}/formulario.pdf`, undefined, { bruto: true })).status, 404);
  const r = await exec('GET', `/api/implantacoes/${idI}/formulario.pdf`, undefined, { bruto: true });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.equal(r.buffer.subarray(0, 5).toString('latin1'), '%PDF-');
  const texto = require('child_process').execFileSync('pdftotext', ['-', '-'], { input: r.buffer }).toString();
  for (const trecho of [/IMP-\d{4}-\d{2}-\d{2}-01/, /Condomínio Residencial Fictício/, /Diferente da análise/, /3,50% \(análise: 3,00%\)/, /Alfa Administradora/, /definido pelo setor Parceiros/,
    /ANDAMENTO NO SETOR/, /ID 90001/, /Contato Fictício/]) assert.match(texto, trecho);
});

test('acompanhamento: o setor, a coordenação e a diretoria veem; o executivo não', async () => {
  assert.equal((await exec('GET', '/api/implantacoes/acompanhamento')).status, 403);
  assert.equal((await outro('GET', '/api/implantacoes/acompanhamento')).status, 403);
  const r = await equipe('GET', '/api/implantacoes/acompanhamento');
  assert.equal(r.status, 200, r.texto);
  const l = r.json.linhas.find((x) => x.id === idI);
  assert.equal(l.pct, 100);
  assert.deepEqual([l.primeiro_vencimento, l.vencimento_previsto, l.onboarding.limite, l.onboarding.status, l.onboarding.por_nome], ['2026-11-10', false, '2026-12-10', 'batida', 'Analista de Implantação Fictícia']);
  assert.equal(l.documentacao.status, 'pendente');
  assert.deepEqual(l.documentacao.falta, ['Procuração']);
  assert.deepEqual(r.json.pode, { parametros: false, marcar: false, cobrar: true, antecipacao: true });
  assert.equal((await coord('GET', '/api/implantacoes/acompanhamento')).json.pode.parametros, true);
  assert.ok((await equipe('GET', '/api/implantacoes/resumo')).json.acompanhamento);
  assert.ok(!(await exec('GET', '/api/implantacoes/resumo')).json.acompanhamento);
});

test('documentos da meta: a procuração é da equipe; o que é do executivo tem lembrete 3 dias antes e cobrança, só a ele', async () => {
  const { lembretesDocumentacao } = require('../server/rotas/implantacoes-acompanhamento');
  const M = require('../server/implantacoes/metas');
  let l = (await equipe('GET', '/api/implantacoes/acompanhamento')).json.linhas.find((x) => x.id === idI);
  assert.deepEqual([l.documentacao.falta, l.documentacao.falta_executivo], [['Procuração'], []]);
  // só falta a procuração: nada a cobrar do executivo, nem lembrete
  assert.equal((await equipe('POST', `/api/implantacoes/${idI}/cobrar-documentos`, {})).status, 409);
  await lembretesDocumentacao(ctx.db, ctx.avisos, M.somarDias(l.documentacao.limite, -2));
  assert.ok(!(await avisosDe('exec@teste.com')).some((x) => x.texto.includes(l.protocolo) && /^Faltam poucos dias/.test(x.titulo)));
  // a meta passa a contar também o comprovante de endereço do síndico, que é do executivo
  const valores = { ...M.PADRAO, docs_meta: [...M.PADRAO.docs_meta, 'comprovante_endereco'] };
  assert.equal((await coord('POST', '/api/implantacoes/acompanhamento/parametros', { valores, vale_desde: '2000-01-01' })).status, 201);
  l = (await equipe('GET', '/api/implantacoes/acompanhamento')).json.linhas.find((x) => x.id === idI);
  assert.deepEqual(l.documentacao.falta_executivo, ['Comprovante de endereço do síndico']);
  await ctx.db.q('UPDATE implantacoes SET lembrete_doc_em = NULL WHERE id = $1', [idI]);
  assert.equal(await lembretesDocumentacao(ctx.db, ctx.avisos, M.somarDias(l.documentacao.limite, -4)), 0);
  assert.ok(await lembretesDocumentacao(ctx.db, ctx.avisos, M.somarDias(l.documentacao.limite, -2)) >= 1);
  assert.equal(await lembretesDocumentacao(ctx.db, ctx.avisos, M.somarDias(l.documentacao.limite, -1)), 0); // uma vez só
  const lembrete = (await avisosDe('exec@teste.com')).find((x) => x.texto.includes(l.protocolo) && /^Faltam poucos dias · Documentos pendentes para implantação – /.test(x.titulo));
  assert.ok(lembrete && /Comprovante de endereço/.test(lembrete.texto) && !/Procuração/.test(lembrete.texto));
  assert.equal((await exec('POST', `/api/implantacoes/${idI}/cobrar-documentos`, {})).status, 403);
  const quantos = (await avisosDe('equipe@teste.com')).length;
  const r = await equipe('POST', `/api/implantacoes/${idI}/cobrar-documentos`, {});
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json.faltam, ['Comprovante de endereço do síndico']);
  assert.match((await avisosDe('exec@teste.com')).pop().titulo, /^Documentos pendentes para implantação – /);
  assert.equal((await avisosDe('equipe@teste.com')).length, quantos); // ninguém além do executivo
});

test('meta de documentação à mão: só a coordenação, com motivo; e volta ao cálculo', async () => {
  assert.equal((await equipe('POST', `/api/implantacoes/${idI}/meta-documentacao`, { resultado: 'bateu', motivo: 'x' })).status, 403);
  assert.equal((await coord('POST', `/api/implantacoes/${idI}/meta-documentacao`, { resultado: 'bateu' })).status, 400);
  assert.equal((await coord('POST', `/api/implantacoes/${idI}/meta-documentacao`, { resultado: 'bateu', motivo: 'Procuração dispensada: o síndico assina' })).status, 200);
  let l = (await coord('GET', '/api/implantacoes/acompanhamento')).json.linhas.find((x) => x.id === idI);
  assert.deepEqual([l.documentacao.status, l.documentacao.manual.motivo], ['batida', 'Procuração dispensada: o síndico assina']);
  assert.equal((await equipe('POST', `/api/implantacoes/${idI}/cobrar-documentos`, {})).status, 409);
  assert.equal((await coord('POST', `/api/implantacoes/${idI}/meta-documentacao`, { resultado: null })).status, 200);
  l = (await coord('GET', '/api/implantacoes/acompanhamento')).json.linhas.find((x) => x.id === idI);
  assert.deepEqual([l.documentacao.status, l.documentacao.manual], ['pendente', null]);
});

test('parâmetros das metas: só a coordenação altera; valem a partir da data escolhida', async () => {
  const M = require('../server/implantacoes/metas');
  const hoje = M.diaSP(Date.now());
  const valores = { ...M.PADRAO, documentacao_dias: 45, docs_meta: ['convencao', 'ata_eleicao', 'ata_orcamento', 'procuracao'] };
  assert.equal((await equipe('POST', '/api/implantacoes/acompanhamento/parametros', { valores, vale_desde: hoje })).status, 403);
  assert.equal((await coord('POST', '/api/implantacoes/acompanhamento/parametros', { valores: { ...valores, meta_pct: 0 }, vale_desde: hoje })).status, 400);
  assert.equal((await coord('POST', '/api/implantacoes/acompanhamento/parametros', { valores, vale_desde: '2026-02-30' })).status, 400);
  assert.equal((await coord('POST', '/api/implantacoes/acompanhamento/parametros', { valores, vale_desde: '2000-01-01' })).status, 201);
  const j = (await coord('GET', '/api/implantacoes/acompanhamento')).json;
  assert.equal(j.parametros.documentacao_dias, 45);
  assert.equal(j.historico[0].alterado_por_nome, 'Coordenadora Fictícia');
  const l = j.linhas.find((x) => x.id === idI);
  assert.equal(l.documentacao.limite, M.somarDias(l.enviado, 45));
});
