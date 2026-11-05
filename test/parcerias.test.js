'use strict';
/* Solicitação de Contrato Parceria: do pedido do comercial ao parceiro cadastrado na base de comissão (dados fictícios). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');
const F = require('../server/parcerias/formulario');

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

let admin, exec, cs, adv, diretor, parceiros, outro;
const ids = {};
async function pessoa(nome, email) {
  const r = await admin('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome, email, papel: 'usuario', senha: 'Senha1234' });
  assert.equal(r.status, 201, r.texto);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  ids[email] = r.json.id;
  return entrar(email, 'Senha1234');
}
async function noSetor(email, setor) {
  const s = await ctx.db.um('SELECT id FROM setores WHERE nome = $1', [setor]);
  await ctx.db.q('INSERT INTO setor_membros (setor_id, usuario_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [s.id, ids[email]]);
}
const avisosDe = async (email) => (await ctx.db.q('SELECT titulo, texto, link FROM notificacoes WHERE usuario_id = $1 ORDER BY id', [ids[email]])).rows;
const PDF = Buffer.from('%PDF-1.4\n% documento fictício\n');
const anexar = (c, id, tipo, nome = `${tipo}.pdf`) => c('POST', `/api/parcerias/${id}/documentos`, PDF, { headers: { 'x-tipo': tipo, 'x-nome-arquivo': encodeURIComponent(nome) } });

// CNPJ e CPF fictícios com dígitos válidos
const FORM = {
  empresa: 'Imobiliária Exemplo Ltda', cnpj: '11.222.333/0001-81', representante_nome: 'Representante Fictício', representante_cpf: '529.982.247-25',
  representante_email: 'rep@exemplo.com', financeiro_nome: 'Financeiro Fictício', financeiro_telefone: '(84) 99999-0000', email_prestacao: 'contas@exemplo.com',
  recorrencia: 'sim', recorrencia_pct: '10', venda: 'sim', venda_pct: '50', outras: '',
};

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
  cs = await pessoa('Analista CS Fictícia', 'cs@teste.com');
  adv = await pessoa('Advogada Fictícia', 'adv@teste.com');
  diretor = await pessoa('Diretor Fictício', 'diretor@teste.com');
  parceiros = await pessoa('Pessoa de Parceiros', 'parceiros@teste.com');
  outro = await pessoa('Outra Pessoa', 'outro@teste.com');
  assert.equal((await admin('POST', '/api/credito/executivos', { nome: 'Executiva Fictícia', uf: 'RN', regiao: 'Rio Grande do Norte', usuario_id: ids['exec@teste.com'] })).status, 201);
  assert.equal((await admin('PUT', '/api/credito/diretoria', { pessoas: [ids['diretor@teste.com']] })).status, 200);
  assert.equal((await admin('PUT', '/api/contratos/equipe', { pessoas: [ids['adv@teste.com']] })).status, 200);
  await noSetor('cs@teste.com', 'CS');
  await noSetor('parceiros@teste.com', 'Parceiros');
});
after(async () => { servidor.close(); await ctx.db.fechar(); });

test('regras do formulário: o que falta, percentual fora do padrão e o que vai para a base', () => {
  const f = F.normalizar({ ...FORM, cnpj: '11.222.333/0001-00', representante_cpf: '111.111.111-11', recorrencia_pct: 'outro', recorrencia_outro: 12 });
  const campos = F.faltasCampos(f).map((x) => x.campo);
  assert.deepEqual(campos.sort(), ['cnpj', 'representante_cpf']);
  assert.deepEqual(F.itensDiretoria(f), ['Comissão de recorrência de 12% (padrão: 10% ou 5%).']);
  assert.deepEqual(F.faltasCampos(F.normalizar(FORM)), []);
  assert.deepEqual(F.itensDiretoria(F.normalizar(FORM)), []);
  assert.ok(F.avisos(F.normalizar({ ...FORM, recorrencia: 'nao', venda: 'nao' }))[0].includes('sem comissão'));
  // recusado pela diretoria: a recorrência fica para a advogada preencher e a venda volta para o padrão
  const ini = F.fechadoInicial({ formulario: F.normalizar({ ...FORM, recorrencia_pct: 'outro', recorrencia_outro: 12, venda_pct: 'outro', venda_outro: 60 }), diretoria: { decidido_em: 'x', aprovado: false } });
  assert.deepEqual([ini.recorrencia_pct, ini.venda_pct], [null, 50]);
  assert.equal(F.acharNaBase([{ nome: 'Outra', cnpj: '11222333000181' }], { formulario: { cnpj: '11.222.333/0001-81' } }).nome, 'Outra');
});

test('quem pede: executivo, CS e diretoria; outra pessoa não vê', async () => {
  assert.equal((await outro('GET', '/api/parcerias/resumo')).json.acesso, false);
  assert.equal((await outro('POST', '/api/parcerias', {})).status, 403);
  for (const c of [exec, cs, diretor]) assert.equal((await c('GET', '/api/parcerias/meta')).json.perfil.solicita, true);
  assert.equal((await parceiros('GET', '/api/parcerias/meta')).json.perfil.solicita, false);
  assert.equal((await parceiros('GET', '/api/parcerias/resumo')).json.acesso, true);
  assert.equal((await exec('GET', '/api/parcerias?vis=fila')).status, 403);
});

let idP;
test('do pedido do comercial ao contrato assinado e ao parceiro cadastrado', async () => {
  const r = await exec('POST', '/api/parcerias', {});
  assert.equal(r.status, 201, r.texto);
  idP = r.json.id;
  // rascunho vazio: não envia
  const vazio = await exec('POST', `/api/parcerias/${idP}/enviar`, {});
  assert.equal(vazio.status, 400);
  assert.ok(vazio.json.faltas_campos.some((x) => x.campo === 'cnpj'));
  assert.equal((await outro('GET', `/api/parcerias/${idP}`)).status, 404);
  // percentual fora do padrão: vai para a diretoria
  assert.equal((await exec('PATCH', `/api/parcerias/${idP}`, { formulario: { ...FORM, recorrencia_pct: 'outro', recorrencia_outro: 12 } })).status, 200);
  const env = await exec('POST', `/api/parcerias/${idP}/enviar`, {});
  assert.equal(env.status, 200, env.texto);
  assert.match(env.json.protocolo, /^CP-\d{4}-\d{2}-\d{2}-01$/);
  assert.equal(env.json.etapa, 'fila');
  assert.ok((await avisosDe('adv@teste.com')).some((a) => a.titulo.startsWith('Nova solicitação de contrato de parceria')));
  assert.ok((await avisosDe('diretor@teste.com')).some((a) => a.titulo.startsWith('Decisão da diretoria na parceria')));
  // o mesmo CNPJ não abre outra solicitação
  const dup = await cs('POST', '/api/parcerias', { formulario: FORM });
  assert.equal((await cs('POST', `/api/parcerias/${dup.json.id}/enviar`, {})).status, 409);
  assert.equal((await cs('GET', '/api/parcerias/cnpj?cnpj=11222333000181')).json.aberta.protocolo, env.json.protocolo);
  // na Demandas Jurídicas, sem lançar de novo
  const dj = (await adv('GET', '/api/juridico/demandas?vis=todas')).json;
  const lista = dj.demandas || dj;
  assert.ok(lista.some((d) => d.origem === 'parceria' && d.ref === env.json.protocolo && d.status === 'pendente'));

  assert.equal((await adv('POST', `/api/parcerias/${idP}/assumir`, {})).status, 200);
  assert.equal((await anexar(adv, idP, 'minuta')).status, 201);
  assert.equal((await adv('POST', `/api/parcerias/${idP}/minuta`, {})).status, 409); // diretoria ainda não decidiu
  assert.equal((await diretor('POST', `/api/parcerias/${idP}/diretoria`, { aprovar: false })).status, 400); // precisa do motivo
  assert.equal((await diretor('POST', `/api/parcerias/${idP}/diretoria`, { aprovar: true })).status, 200);
  assert.equal((await adv('POST', `/api/parcerias/${idP}/minuta`, { mensagem: 'Segue a minuta.' })).status, 200);
  assert.ok((await avisosDe('exec@teste.com')).some((a) => a.titulo.startsWith('Minuta do contrato de parceria pronta')));
  // o parceiro pede ajuste e depois aprova
  assert.equal((await exec('POST', `/api/parcerias/${idP}/ajuste`, { texto: 'Trocar o e-mail da prestação de contas.' })).status, 200);
  assert.equal((await adv('POST', `/api/parcerias/${idP}/minuta`, {})).status, 400); // a minuta anexada é de antes do ajuste
  assert.equal((await anexar(adv, idP, 'minuta', 'minuta-v2.pdf')).status, 201);
  assert.equal((await adv('POST', `/api/parcerias/${idP}/minuta`, {})).status, 200);
  assert.equal((await exec('POST', `/api/parcerias/${idP}/pedir-assinatura`, {})).status, 200);
  assert.equal((await adv('POST', `/api/parcerias/${idP}/em-assinatura`, {})).status, 200);
  assert.equal((await adv('POST', `/api/parcerias/${idP}/assinado`, {})).status, 400); // sem a via assinada
  assert.equal((await anexar(adv, idP, 'contrato_assinado')).status, 201);
  assert.equal((await adv('POST', `/api/parcerias/${idP}/assinado`, {})).status, 200);
  // as condições vêm do pedido (12% aprovado pela diretoria e 50% na venda)
  let d = (await adv('GET', `/api/parcerias/${idP}`)).json;
  assert.equal(d.parceria.etapa, 'conferencia');
  assert.deepEqual([d.parceria.fechado.recorrencia_pct, d.parceria.fechado.venda_pct], [12, 50]);
  assert.ok(d.faltas_fechado.includes('Informar o início da vigência.'));
  const cond = { ...d.parceria.fechado, inicio: '2026-12-01', email_prestacao: 'financeiro@exemplo.com' };
  assert.equal((await adv('PUT', `/api/parcerias/${idP}/fechado`, { condicoes: { ...cond, inicio: '' }, concluir: true })).status, 400);
  assert.equal((await adv('PUT', `/api/parcerias/${idP}/fechado`, { condicoes: cond, concluir: true })).status, 200);
  assert.ok((await avisosDe('parceiros@teste.com')).some((a) => a.titulo.startsWith('Cadastrar o parceiro')));
  // o setor Parceiros vê os dados prontos e cadastra (o executivo não pode)
  d = (await parceiros('GET', `/api/parcerias/${idP}`)).json;
  assert.equal(d.pode.cadastrar_parceiro, true);
  assert.equal(d.parceiro.registro.emailPrestacao, 'financeiro@exemplo.com');
  assert.deepEqual(d.diferencas_fechado.map((x) => x.rotulo), ['E-mail da prestação de contas']);
  assert.equal((await exec('POST', `/api/parcerias/${idP}/cadastrar-parceiro`, {})).status, 403);
});

test('cadastro do parceiro: lembrete a cada 2 dias úteis e ligação ao cadastro que já existe', async () => {
  // sem cadastro, a rotina lembra o setor Parceiros depois de 2 dias úteis
  await ctx.db.q("UPDATE parcerias SET aviso_parceiros_em = now() - interval '7 days' WHERE id = $1", [idP]);
  const antes = (await avisosDe('parceiros@teste.com')).length;
  const feito = await ctx.rotinasParcerias.executar();
  assert.equal(feito.parceiros, 1);
  assert.equal((await avisosDe('parceiros@teste.com')).length, antes + 1);
  assert.equal((await ctx.rotinasParcerias.executar()).parceiros, 0); // só de novo depois de mais 2 dias úteis
  // a ferramenta, já no banco do portal, tem o parceiro cadastrado (mesmo CNPJ): o contrato é ligado a ele, sem criar outro
  await ctx.db.q("UPDATE modulos SET fonte_dados = 'interno' WHERE slug = 'parceiros'");
  await ctx.registros.upsert('parceiros', 'partners', 'antigo-1', { id: 'antigo-1', nome: 'Imobiliária Exemplo', uf: 'RN', cnpj: '11222333000181' }, null);
  const d = (await parceiros('GET', `/api/parcerias/${idP}`)).json;
  assert.equal(d.parceiro.na_base, 'Imobiliária Exemplo');
  const r = await parceiros('POST', `/api/parcerias/${idP}/cadastrar-parceiro`, {});
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.ja_existia, true);
  const base = await ctx.registros.listar('parceiros', 'partners');
  assert.equal(base.length, 1);
  assert.deepEqual([base[0].id, base[0].nome, base[0].uf, base[0].comissaoRecorrencia, base[0].comissaoVenda, base[0].emailPrestacao],
    ['antigo-1', 'Imobiliária Exemplo', 'RN', 12, 50, 'financeiro@exemplo.com']);
  assert.ok((await avisosDe('exec@teste.com')).some((a) => a.titulo.startsWith('Parceria assinada: já pode indicar condomínios')));
  assert.equal((await parceiros('POST', `/api/parcerias/${idP}/cadastrar-parceiro`, {})).status, 409);
  assert.equal((await ctx.rotinasParcerias.executar()).parceiros, 0);
});

test('pendência e prazo da minuta vencido', async () => {
  const r = await cs('POST', '/api/parcerias', { formulario: { ...FORM, empresa: 'Administradora Fictícia', cnpj: '11.444.777/0001-61', recorrencia: 'nao', venda: 'sim', venda_pct: '50' } });
  const id = r.json.id;
  assert.equal((await cs('POST', `/api/parcerias/${id}/enviar`, {})).status, 200);
  await ctx.db.q("UPDATE parcerias SET prazo = now() - interval '1 hour' WHERE id = $1", [id]);
  assert.equal((await ctx.rotinasParcerias.executar()).prazos, 1);
  assert.equal((await ctx.rotinasParcerias.executar()).prazos, 0);
  assert.equal((await adv('POST', `/api/parcerias/${id}/assumir`, {})).status, 200);
  assert.equal((await adv('POST', `/api/parcerias/${id}/pendencia`, { itens: ['Confirmar o telefone do financeiro'] })).status, 200);
  assert.ok((await avisosDe('cs@teste.com')).some((a) => a.titulo.startsWith('Pendência no contrato de parceria')));
  assert.equal((await cs('POST', `/api/parcerias/${id}/enviar`, {})).status, 200);
  const d = (await cs('GET', `/api/parcerias/${id}`)).json;
  assert.equal(d.parceria.etapa, 'em_elaboracao'); // volta para quem assumiu
  assert.equal((await cs('POST', `/api/parcerias/${id}/cancelar`, { motivo: 'teste' })).status, 403); // em elaboração, o comercial não cancela
  assert.equal((await adv('POST', `/api/parcerias/${id}/cancelar`, { motivo: 'Parceiro desistiu' })).status, 200);
});
