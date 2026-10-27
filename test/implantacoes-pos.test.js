'use strict';
/* Pós-implantação: espólios (2 dias úteis de assumir, pela Análise de Espólio), levantamento de pendências (1 dia útil dos
   boletos) e 1ª prestação de contas (5 dias úteis do repasse), com os lembretes e o Cobrar (dados fictícios). */
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
const M = require('../server/implantacoes/metas');
const PO = require('../server/implantacoes/pos');
const { criarPrazos } = require('../server/implantacoes/prazos');

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
  await ctx.db.q("INSERT INTO modulos (slug, nome) VALUES ('analise-de-espolio', 'Análise de Espólio') ON CONFLICT DO NOTHING");
});
after(async () => { servidor.close(); await ctx.db.fechar(); });

/* solicitação na ferramenta Análise de Espólio (como o HTML grava) */
let nDoc = 0;
async function solicitacao(dados) {
  nDoc++;
  await ctx.db.q("INSERT INTO documentos (modulo_slug, colecao, doc_id, dados, seq) VALUES ('analise-de-espolio', 'solicitacoes', $1, $2::jsonb, $3)", [`s${nDoc}`, JSON.stringify(dados), nDoc]);
  return `s${nDoc}`;
}
// as outras implantações deste arquivo não entram na conta dos lembretes
const SEM_AVISOS_POS = `UPDATE implantacoes SET pos = pos || '{"avisos":{"espolio":"2099-01-01","pendencias":"2099-01-01","prestacao":"2099-01-01"}}'::jsonb`;

test('regras: prazos em dias úteis, repasse no 1º dia útil depois do vencimento, solicitação achada pelo CNPJ e só para as assumidas a partir do marco', () => {
  const ehUtil = (d) => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay());
  const P = criarPrazos(ehUtil);
  const params = M.parametrosEm([], '2026-11-02');
  assert.deepEqual([params.espolio_dias, params.pendencias_dias, params.prestacao_dias], [2, 1, 5]);
  assert.equal(PO.diaRepasse('2026-11-13', ehUtil), '2026-11-16'); // vence sexta → repasse segunda
  assert.equal(PO.diaRepasse('2026-11-10', ehUtil), '2026-11-11');
  // assumida segunda 02/11; boletos 04/11; 1º vencimento 10/11 → repasse 11/11
  const i = { id: 1, condominio: 'Residencial Fictício', cnpj: '11.222.333/0001-81', etapa: 'em_implantacao', enviado_em: '2026-11-01T13:00:00Z', iniciado_em: '2026-11-02T13:00:00Z',
    etapas: { boletos: { feito: true, primeiro_vencimento: '2026-11-10' } }, pos: { boletos_em: '2026-11-04' } };
  const calc = (hoje, extra = {}, sols = []) => PO.calcular({ ...i, ...extra }, { params, P, ehUtil, hoje, solicitacoes: sols });
  let r = calc('2026-11-03');
  const [esp, pen, pre] = r.etapas;
  assert.equal(esp.prazo.status, 'vence_amanha');
  assert.equal(esp.prazo.vence, '2026-11-04');
  assert.equal(pen.prazo.status, 'vence_amanha');
  assert.deepEqual([pre.inicio, pre.prazo.status, pre.prazo.vence], ['2026-11-11', 'aguardando', '2026-11-18']);
  r = calc('2026-11-05');
  assert.deepEqual([r.etapas[0].prazo.status, r.etapas[0].prazo.atraso, r.etapas[1].prazo.status], ['atrasado', 1, 'vence_hoje']);
  assert.equal(r.atrasadas, 1);
  assert.deepEqual(r.alerta, ['espolio', 'pendencias']);
  // a prestação conta do repasse: 5 dias úteis → 18/11
  assert.equal(calc('2026-11-18').etapas[2].prazo.status, 'vence_hoje');
  assert.equal(calc('2026-11-19').etapas[2].prazo.status, 'atrasado');
  // solicitação na Análise de Espólio: pelo CNPJ (qualquer formato); a de antes do envio ao setor não conta
  const antiga = { condominio: { nome: 'Residencial Fictício', cnpj: '11222333000181' }, criadaEm: '2026-10-01T12:00:00.000Z', status: 'concluida' };
  const nova = { condominio: { nome: 'Outro nome', cnpj: '11.222.333/0001-81' }, criadaEm: '2026-11-03T15:00:00.000Z', status: 'devolvida', motivoDevolucao: 'Falta o documento', protocolo: 'AE-1', unidades: [{ unid: '101' }] };
  r = calc('2026-11-05', {}, [antiga, nova]);
  assert.equal(r.etapas[0].prazo.status, 'cumprido');
  assert.equal(r.etapas[0].solicitacoes, 1);
  assert.deepEqual([r.etapas[0].devolutiva.situacao, r.etapas[0].devolutiva.motivo, r.etapas[0].acao], ['devolvida', 'Falta o documento', true]);
  // reaberta (nova solicitação concluída): a devolutiva é a mais recente; o prazo, o da primeira
  r = calc('2026-11-09', {}, [nova, { ...nova, criadaEm: '2026-11-06T12:00:00.000Z', status: 'concluida', resultado: [{ unid: '101', titular: 'Espólio Fictício', resultado: 'elegivel' }] }]);
  assert.deepEqual([r.etapas[0].prazo.status, r.etapas[0].devolutiva.situacao, r.etapas[0].acao, r.etapas[0].devolutiva.resultado.length], ['cumprido', 'concluida', false, 1]);
  // sem CNPJ, pelo nome (sem acento e sem pontuação)
  assert.equal(calc('2026-11-05', { cnpj: '', formulario: {} }, [{ condominio: { nome: 'RESIDENCIAL  FICTICIO' }, criadaEm: '2026-11-02T15:00:00Z', status: 'nova' }]).etapas[0].prazo.status, 'cumprido');
  // feitas as três
  r = calc('2026-11-20', { pos: { boletos_em: '2026-11-04', pendencias: { em: '2026-11-05T12:00:00Z', situacao: 'enviado' }, prestacao: { em: '2026-11-17T12:00:00Z' } } }, [nova, { ...nova, criadaEm: '2026-11-06T12:00:00Z', status: 'concluida' }]);
  assert.equal(r.concluido, true);
  assert.deepEqual(r.etapas.map((x) => x.prazo.status), ['cumprido', 'cumprido', 'cumprido']);
  // sem boletos e sem 1º vencimento: aguardando
  r = calc('2026-11-03', { etapas: { boletos: { feito: false } }, pos: {} });
  assert.deepEqual([r.etapas[1].prazo.status, r.etapas[1].prazo.motivo, r.etapas[2].prazo.motivo], ['aguardando', 'boletos', 'vencimento']);
  // histórico importado e assumidas antes do marco ficam de fora
  assert.equal(calc('2026-11-03', { importacao_id: 3 }), null);
  assert.equal(calc('2026-11-03', { iniciado_em: '2026-10-20T13:00:00Z' }), null);
});

let idP;
test('marcar as etapas: quem conduz (ou a coordenação) marca e desfaz; boletos emitidos começam as pendências; solicitação achada sozinha', async () => {
  idP = await assumida('Residencial Fictício Pós');
  let d = await detalhe(ana, idP);
  let [esp, pen, pre] = d.setor.pos.etapas;
  assert.equal(esp.dias, 2);
  assert.ok(['no_prazo', 'vence_amanha'].includes(esp.prazo.status), esp.prazo.status);
  assert.deepEqual([pen.prazo.status, pre.prazo.motivo], ['aguardando', 'vencimento']);
  // outra pessoa da equipe sem autorização não marca
  assert.equal((await bia('POST', `/api/implantacoes/${idP}/pos/pendencias`, { situacao: 'enviado' })).status, 403);
  assert.equal((await ana('POST', `/api/implantacoes/${idP}/pos/outra`, {})).status, 404);
  assert.equal((await ana('POST', `/api/implantacoes/${idP}/pos/pendencias`, { situacao: 'enviado' })).status, 409);
  // boletos emitidos (1º vencimento já passou neste teste): começa o levantamento de pendências
  const etapas = { documentacao: { feito: true }, vouch: { id: '90801' }, onboarding: { situacao: 'realizado', data: '2026-10-22', hora: '09:00' }, boletos: { feito: true, primeiro_vencimento: '2026-01-05' }, envio: { forma: 'email' } };
  assert.equal((await ana('PATCH', `/api/implantacoes/${idP}/etapas`, { etapas })).status, 200);
  assert.equal((await ctx.db.um('SELECT pos FROM implantacoes WHERE id = $1', [idP])).pos.boletos_em, M.diaSP(Date.now()));
  assert.equal((await ana('POST', `/api/implantacoes/${idP}/pos/pendencias`, {})).status, 400);
  let r = await ana('POST', `/api/implantacoes/${idP}/pos/pendencias`, { situacao: 'enviado' });
  assert.equal(r.status, 200, r.texto);
  pen = r.json.pos.etapas[1];
  assert.deepEqual([pen.feito, pen.prazo.status, pen.registro.texto, pen.registro.por_nome], [true, 'cumprido', 'Enviado no WhatsApp e salvo no CPD', 'Ana Fictícia']);
  r = await ana('POST', `/api/implantacoes/${idP}/pos/prestacao`, {});
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.pos.etapas[2].inicio, '2026-01-06');
  assert.equal(r.json.pos.etapas[2].feito, true);
  // a coordenação desfaz
  r = await coord('POST', `/api/implantacoes/${idP}/pos/prestacao`, { acao: 'desfazer' });
  assert.equal(r.json.pos.etapas[2].feito, false);
  assert.equal(r.json.pos.etapas[2].prazo.status, 'atrasado');
  assert.equal((await ana('POST', `/api/implantacoes/${idP}/pos/prestacao`, {})).status, 200);
  // espólios: sem solicitação achada, o protocolo à mão
  assert.equal((await ana('POST', `/api/implantacoes/${idP}/pos/espolio`, { protocolo: '' })).status, 400);
  r = await ana('POST', `/api/implantacoes/${idP}/pos/espolio`, { protocolo: 'AE-2026-0001' });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.pos.etapas[0].manual.protocolo, 'AE-2026-0001');
  assert.equal(r.json.pos.concluido, true);
  assert.equal((await ana('POST', `/api/implantacoes/${idP}/pos/espolio`, { acao: 'desfazer' })).status, 200);
  // a solicitação na Análise de Espólio é achada pelo CNPJ e a devolutiva aparece
  await solicitacao({ condominio: { nome: 'Residencial Fictício Pós', cnpj: '11.222.333/0001-81', chave: 'x' }, origem: 'implantacao', tipo: 'implantacao', unidades: [{ unid: '101', titular: 'Titular Fictício' }],
    solicitanteId: `mb-${ids['ana@teste.com']}`, solicitanteNome: 'Ana Fictícia', criadaEm: new Date().toISOString(), status: 'em_analise', protocolo: 'AE-2026-0002', resultado: [] });
  d = await detalhe(ana, idP);
  esp = d.setor.pos.etapas[0];
  assert.deepEqual([esp.feito, esp.solicitacoes, esp.devolutiva.situacao, esp.devolutiva.protocolo], [true, 1, 'aguardando', 'AE-2026-0002']);
  assert.equal((await ana('POST', `/api/implantacoes/${idP}/pos/espolio`, { protocolo: 'AE-9' })).status, 409);
  // aparece na aba do Acompanhamento
  const a = (await coord('GET', '/api/implantacoes/acompanhamento')).json;
  const linha = a.pos.find((x) => x.id === idP);
  assert.ok(linha);
  assert.equal(linha.responsavel_nome, 'Ana Fictícia');
  assert.equal(linha.concluido, true);
  // boletos desmarcados: tira a data
  assert.equal((await ana('PATCH', `/api/implantacoes/${idP}/etapas`, { etapas: { ...etapas, boletos: { feito: false, primeiro_vencimento: '2026-01-05' } } })).status, 200);
  assert.equal((await ctx.db.um('SELECT pos FROM implantacoes WHERE id = $1', [idP])).pos.boletos_em, undefined);
  // assumida antes do marco: não tem pós-implantação
  await ctx.db.q("UPDATE implantacoes SET iniciado_em = '2026-10-20T13:00:00Z' WHERE id = $1", [idP]);
  assert.equal((await detalhe(ana, idP)).setor.pos, null);
  assert.equal((await ana('POST', `/api/implantacoes/${idP}/pos/prestacao`, {})).status, 409);
  assert.ok(!(await coord('GET', '/api/implantacoes/acompanhamento')).json.pos.some((x) => x.id === idP));
});

test('rotina: lembrete na véspera e no dia, atraso uma vez por dia útil à assistente e à coordenação; a coordenação cobra', async () => {
  const id = await assumida('Residencial Fictício Rotina');
  // outro CNPJ (a solicitação do teste anterior não vale para esta); assumida segunda 02/11/2026 → espólios vencem 04/11
  await ctx.db.q(`UPDATE implantacoes SET cnpj = '22.333.444/0001-55', formulario = formulario || '{"cnpj":"22.333.444/0001-55"}'::jsonb,
    enviado_em = '2026-10-30T13:00:00Z', iniciado_em = '2026-11-02T13:00:00Z' WHERE id = $1`, [id]);
  await ctx.db.q(`${SEM_AVISOS_POS} WHERE id <> $1`, [id]);
  await ctx.db.q("UPDATE implantacoes SET aviso_concluir_em = '2099-01-01', aviso_onboarding_em = '2099-01-01'");
  await ctx.db.q("UPDATE implantacao_fichas SET aviso_prazo_em = '2099-01-01'");
  const ex = async (dia, hora) => (await ctx.rotinasImplantacao.executar(sp(dia, hora))).prazos_dias_uteis.pos;
  assert.equal(await ex('2026-11-02'), 0);
  assert.equal(await ex('2026-11-03'), 1);
  assert.match((await ultimo('ana@teste.com')).titulo, /^Pós-implantação · Espólios vence amanhã · Residencial Fictício Rotina/);
  assert.equal(await ex('2026-11-03'), 0); // uma vez por dia
  assert.equal(await ex('2026-11-03', 18), 0); // fora do expediente
  await ex('2026-11-04');
  assert.match((await ultimo('ana@teste.com')).titulo, /^Pós-implantação · Espólios vence hoje · /);
  await ex('2026-11-05');
  assert.match((await ultimo('ana@teste.com')).titulo, /^Pós-implantação atrasada · Espólios · 1 dia útil · /);
  assert.match((await ultimo('coord@teste.com')).titulo, /^Pós-implantação atrasada de Ana Fictícia · Espólios · 1 dia útil/);
  // fim de semana não conta e fora do expediente não avisa
  assert.equal(await ex('2026-11-07'), 0);
  // a solicitação aberta encerra o prazo (cumprido com atraso) e para os avisos
  await solicitacao({ condominio: { nome: 'Residencial Fictício Rotina', cnpj: '22333444000155' }, criadaEm: '2026-11-06T15:00:00.000Z', status: 'nova', protocolo: 'AE-2026-0003', unidades: [] });
  assert.equal(await ex('2026-11-09'), 0);
  const d = await detalhe(ana, id);
  assert.deepEqual([d.setor.pos.etapas[0].prazo.status, d.setor.pos.etapas[0].prazo.atraso], ['cumprido_com_atraso', 2]);
  // Cobrar: só a coordenação; a assistente recebe
  assert.equal((await ana('POST', `/api/implantacoes/${id}/cobrar`, { qual: 'pendencias' })).status, 403);
  assert.equal((await coord('POST', `/api/implantacoes/${id}/cobrar`, { qual: 'pendencias' })).status, 200);
  assert.match((await ultimo('ana@teste.com')).texto, /está cobrando o levantamento de pendências \(pós-implantação\) de Residencial Fictício Rotina/);
});
