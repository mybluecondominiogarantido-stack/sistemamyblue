'use strict';
/*
 * Aba Base de Clientes.
 * Todos que entram no portal consultam (a carteira não é exportada). Quem edita o quê (dados do condomínio, cada coluna de responsável,
 * adicionar novos, cadastrar/importar) vem das regras de acesso (server/regras.js), configuradas em
 * Ferramentas do setor → Base de Clientes. A administração pode tudo.
 * Cada alteração fica no histórico (auditoria) com o que mudou, quem mudou e quando.
 */
const express = require('express');
const { FUNCOES, CAMPOS, SITUACOES, interpretar, normalizar } = require('../carteira');
const { interpretarImplantacao, compararComCarteira } = require('../implantacao');
const { criarXlsx } = require('../xlsx');

const COLUNAS = CAMPOS.map((c) => c.campo);
const ROTULOS = { codigo: 'ID Vouch', situacao: 'situação', comarca: 'UF', nome: 'nome', vencimento: 'vencimento', administradora: 'administradora', forma_envio: 'forma de envio',
  executivo: 'executivo', sindico_nome: 'síndico', sindico_telefone: 'telefone do síndico', sindico_email: 'e-mail do síndico', inicio_contrato: 'vigência', razao_social: 'razão social', cnpj: 'CNPJ', observacoes: 'observações',
  ...Object.fromEntries(FUNCOES.map((f) => [f.campo, f.rotulo])) };
// DATE volta como texto (evita deslocar o dia pelo fuso)
const SELECT = `SELECT c.id, ${COLUNAS.filter((x) => x !== 'inicio_contrato').map((x) => 'c.' + x).join(', ')},
  to_char(c.inicio_contrato, 'YYYY-MM-DD') AS inicio_contrato, c.criado_em, c.atualizado_em, u.nome AS atualizado_por_nome
  FROM condominios c LEFT JOIN usuarios u ON u.id = c.atualizado_por`;

function rotasCarteira({ db, seg, regras, boletosCarteira, documentos }) {
  const r = express.Router();
  const json = express.json({ limit: '1mb' });
  r.use('/api/carteira', seg.exigirLogin);
  // carteira alterada: o Controle de Emissão de Boletos recebe a mudança (depois da 1ª conferência)
  r.use('/api/carteira', (req, res, next) => {
    if (req.method !== 'GET' && boletosCarteira) res.on('finish', () => { if (res.statusCode < 400) boletosCarteira.agendar(req.usuario); });
    next();
  });
  // quem edita o quê vem das regras de acesso (Ferramentas do setor → Carteira); consultar é de todos
  const QUEM_LIBERA = ' Quem libera: a administração ou, nas permissões do setor dela, a coordenação/supervisão, em Configurações → Acessos → Base de Clientes.';
  const exigir = (chave, msg) => async (req, res, next) => {
    try { if (await regras.pode(req.usuario, chave)) return next(); return res.status(403).json({ erro: msg + QUEM_LIBERA }); } catch (e) { return next(e); }
  };
  const soCadastro = exigir('carteira.cadastro', 'Você não tem permissão para cadastrar, excluir ou importar condomínios.');
  const soAdicionar = exigir('carteira.adicionar', 'Você não tem permissão para adicionar condomínios novos.');
  const soMarketing = exigir('carteira.marketing', 'Você não tem permissão para baixar a Lista do Marketing.');

  /* colunas de responsável que a pessoa altera e transfere */
  async function funcoesEditaveis(u) {
    if (u.papel === 'admin') return FUNCOES.map((f) => f.campo);
    const p = await regras.permissoesDe(u);
    return FUNCOES.filter((f) => p.has('carteira.' + f.campo)).map((f) => f.campo);
  }
  /* todos os campos que a pessoa altera num condomínio */
  const DADOS = CAMPOS.map((c) => c.campo).filter((c) => c !== 'codigo' && !FUNCOES.some((f) => f.campo === c));
  async function camposEditaveis(u) {
    if (u.papel === 'admin') return CAMPOS.map((c) => c.campo);
    const p = await regras.permissoesDe(u);
    return [...(p.has('carteira.cadastro') ? ['codigo'] : []), ...(p.has('carteira.dados') ? DADOS : []),
      ...FUNCOES.filter((f) => p.has('carteira.' + f.campo)).map((f) => f.campo)];
  }
  const erro = (res, status, msg) => res.status(status).json({ erro: msg });
  const ehDuplicado = (e) => e && (e.code === '23505' || /duplicate key|unique/i.test(String(e.message)));

  /* o que mudou entre o registro atual e os dados novos: { campo: [de, para] } */
  function diferencas(atual, novo) {
    const m = {};
    for (const k of Object.keys(novo)) {
      const de = atual[k] == null ? '' : String(atual[k]);
      const para = novo[k] == null ? '' : String(novo[k]);
      if (de !== para) m[k] = [de, para];
    }
    return m;
  }

  async function gravar(t, id, dados, usuarioId) {
    const cols = Object.keys(dados);
    const sets = cols.map((c, i) => `${c} = $${i + 1}`);
    await t.q(`UPDATE condominios SET ${sets.join(', ')}, atualizado_em = now(), atualizado_por = $${cols.length + 1} WHERE id = $${cols.length + 2}`,
      [...cols.map((c) => dados[c]), usuarioId, id]);
  }

  /* O que o portal identificou sobre quem pode o quê na carteira (mostrado na própria tela):
     o que quem está vendo pode, com o motivo, e quem tem cada permissão hoje. */
  const NIVEL = { admin: 'Administrador', coordenador: 'Coordenação', supervisor: 'Supervisão', usuario: 'Usuário' };
  async function quadroDeAcesso(u) {
    const meusSetores = (await db.q('SELECT s.nome FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id WHERE sm.usuario_id = $1 ORDER BY s.ordem, s.nome', [u.id])).rows.map((x) => x.nome);
    const minhas = await regras.permissoesDe(u);
    const quem = await regras.quemPode();
    const admins = (await db.q("SELECT nome FROM usuarios WHERE ativo AND papel = 'admin' ORDER BY nome")).rows.map((x) => x.nome);
    const lista = regras.PERMISSOES.filter((p) => p.chave.startsWith('carteira.'));
    return {
      voce: { nivel: NIVEL[u.papel] || u.papel, setores: meusSetores,
        pode: lista.filter((p) => minhas.has(p.chave)).map((p) => ({ rotulo: p.rotulo, motivo: minhas.get(p.chave) })) },
      admins,
      permissoes: lista.map((p) => ({ chave: p.chave, rotulo: p.rotulo, quem: quem.get(p.chave) })),
    };
  }

  /* ===================== consulta ===================== */
  r.get('/api/carteira', async (req, res) => {
    const { rows } = await db.q(`${SELECT} ORDER BY c.nome, c.comarca`);
    res.json({ condominios: rows, funcoes: FUNCOES.map((f) => ({ campo: f.campo, rotulo: f.rotulo })), situacoes: SITUACOES,
      pode_editar: await regras.pode(req.usuario, 'carteira.cadastro'), campos_editaveis: await camposEditaveis(req.usuario),
      funcoes_editaveis: await funcoesEditaveis(req.usuario), pode_adicionar: await regras.pode(req.usuario, 'carteira.adicionar'), pode_marketing: await regras.pode(req.usuario, 'carteira.marketing'), // quem edita o quê: só para administração, coordenação e supervisão (usuário comum só consulta e não vê a lista)
      acesso: req.usuario.papel === 'admin' || seg.GESTORES_DE_SETOR.includes(req.usuario.papel) ? await quadroDeAcesso(req.usuario) : null });
  });

  /* ===================== Lista do Marketing ===================== */
  // os síndicos dos condomínios ativos (só quem tem síndico, telefone ou e-mail), em planilha
  r.get('/api/carteira/marketing', soMarketing, async (req, res) => {
    const { rows } = await db.q(`SELECT nome, comarca, sindico_nome, sindico_telefone, sindico_email FROM condominios
      WHERE situacao = 'ATIVO' AND (sindico_nome <> '' OR sindico_telefone <> '' OR sindico_email <> '') ORDER BY nome, comarca`);
    await seg.auditar(req, 'carteira_marketing', null, { condominios: rows.length });
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`Lista do Marketing ${new Date().toISOString().slice(0, 10)}.xlsx`)}`);
    res.set('Cache-Control', 'private, no-store');
    res.send(criarXlsx([{ titulo: 'Síndicos', cab: ['Condomínio', 'UF', 'Síndico', 'Telefone', 'E-mail'],
      linhas: rows.map((c) => [c.nome, c.comarca, c.sindico_nome, c.sindico_telefone, c.sindico_email]) }]));
  });

  r.get('/api/carteira/:id', async (req, res) => {
    const c = await db.um(`${SELECT} WHERE c.id = $1`, [Number(req.params.id) || 0]);
    if (!c) return erro(res, 404, 'Condomínio não encontrado.');
    const historico = (await db.q(`SELECT a.quando, a.acao, a.detalhe, u.nome AS usuario_nome FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.acao IN ('condominio_criado','condominio_editado','condominio_importado','carteira_transferida') AND a.detalhe->>'id' = $1
      ORDER BY a.id DESC LIMIT 50`, [String(c.id)])).rows;
    res.json({ condominio: c, historico });
  });

  /* ===================== cadastro e edição (administração) ===================== */
  r.post('/api/carteira', soCadastro, json, async (req, res) => {
    const b = req.body || {};
    // o ID Vouch vem do Vouch: quem cadastra informa (não é gerado aqui)
    if (!String(b.codigo || '').trim()) return erro(res, 400, 'Informe o ID Vouch do condomínio.');
    const v = normalizar({ situacao: 'ATIVO', ...b });
    if (v.erro) return erro(res, 400, v.erro);
    if (!v.dados.nome) return erro(res, 400, 'Informe o nome do condomínio.');
    // condomínio novo precisa da vigência do contrato (os que já estavam na carteira preenchem ao editar)
    if (!v.dados.inicio_contrato) return erro(res, 400, 'Informe a vigência do contrato.');
    const cols = Object.keys(v.dados);
    try {
      const { id } = await db.um(`INSERT INTO condominios (${cols.join(', ')}, atualizado_por) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(', ')}, $${cols.length + 1}) RETURNING id`,
        [...cols.map((c) => v.dados[c]), req.usuario.id]);
      await seg.auditar(req, 'condominio_criado', null, { id, nome: v.dados.nome, codigo: v.dados.codigo });
      res.status(201).json({ id });
    } catch (e) {
      if (ehDuplicado(e)) return erro(res, 409, `Já existe um condomínio com o ID ${v.dados.codigo}.`);
      throw e;
    }
  });

  r.patch('/api/carteira/:id', json, async (req, res) => {
    const editaveis = await camposEditaveis(req.usuario);
    if (!editaveis.length) return erro(res, 403, 'Você só consulta a carteira.' + QUEM_LIBERA);
    const atual = await db.um(`${SELECT} WHERE c.id = $1`, [Number(req.params.id) || 0]);
    if (!atual) return erro(res, 404, 'Condomínio não encontrado.');
    const v = normalizar(req.body || {});
    if (v.erro) return erro(res, 400, v.erro);
    const mudancas = diferencas(atual, v.dados);
    if (req.usuario.papel !== 'admin') {
      const fora = Object.keys(mudancas).filter((k) => !editaveis.includes(k));
      if (fora.length) return erro(res, 403, `Você não tem permissão para alterar: ${fora.map((k) => ROTULOS[k] || k).join(', ')}.` + QUEM_LIBERA);
    }
    if (!Object.keys(mudancas).length) return res.json({ ok: true, sem_mudanca: true });
    const dados = {};
    for (const k of Object.keys(mudancas)) dados[k] = v.dados[k];
    try {
      await db.tx((t) => gravar(t, atual.id, dados, req.usuario.id));
    } catch (e) {
      if (ehDuplicado(e)) return erro(res, 409, `Já existe um condomínio com o ID ${dados.codigo}.`);
      throw e;
    }
    await seg.auditar(req, 'condominio_editado', null, { id: atual.id, nome: v.dados.nome || atual.nome, mudancas });
    res.json({ ok: true });
  });

  r.delete('/api/carteira/:id', soCadastro, async (req, res) => {
    const atual = await db.um('SELECT id, nome, codigo FROM condominios WHERE id = $1', [Number(req.params.id) || 0]);
    if (!atual) return erro(res, 404, 'Condomínio não encontrado.');
    await db.q('DELETE FROM condominios WHERE id = $1', [atual.id]);
    await seg.auditar(req, 'condominio_removido', null, atual);
    res.json({ ok: true });
  });

  /* ===================== importar o CSV da planilha ===================== */
  // atualiza pelo ID; quem não está no arquivo continua como está
  r.post('/api/carteira/importar', soCadastro, express.raw({ type: () => true, limit: '10mb' }), async (req, res) => {
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!buf.length) return erro(res, 400, 'Envie o arquivo CSV da carteira.');
    let lidos;
    try { lidos = interpretar(buf); } catch (e) { return erro(res, 400, e.message); }
    const resumo = { lidos: lidos.condominios.length, novos: 0, atualizados: 0, iguais: 0, avisos: lidos.avisos };
    const editados = [];
    await db.tx(async (t) => {
      const existentes = new Map((await t.q(`${SELECT}`)).rows.map((c) => [c.codigo, c]));
      for (const d of lidos.condominios) {
        const atual = existentes.get(d.codigo);
        if (!atual) {
          const cols = Object.keys(d);
          await t.q(`INSERT INTO condominios (${cols.join(', ')}, atualizado_por) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(', ')}, $${cols.length + 1})`,
            [...cols.map((c) => d[c]), req.usuario.id]);
          resumo.novos++;
          continue;
        }
        const mudancas = diferencas(atual, d);
        if (!Object.keys(mudancas).length) { resumo.iguais++; continue; }
        const dados = {};
        for (const k of Object.keys(mudancas)) dados[k] = d[k];
        await gravar(t, atual.id, dados, req.usuario.id);
        editados.push({ id: atual.id, nome: d.nome, mudancas });
        resumo.atualizados++;
      }
    });
    for (const e of editados) await seg.auditar(req, 'condominio_importado', null, e);
    await seg.auditar(req, 'carteira_importada', null, { ...resumo, avisos: resumo.avisos.length });
    res.json(resumo);
  });

  /* ===================== adicionar novos (planilha de implantação) ===================== */
  // lê a planilha "Controle de Implantações" e diz, para cada condomínio, se é novo ou já está na carteira
  r.post('/api/carteira/implantacao/ler', soAdicionar, express.raw({ type: () => true, limit: '15mb' }), async (req, res) => {
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!buf.length) return erro(res, 400, 'Envie a planilha de implantação (.xlsx ou .csv).');
    let itens;
    try { itens = interpretarImplantacao(buf); } catch (e) { return erro(res, 400, e.message); }
    const carteira = (await db.q('SELECT id, codigo, nome, comarca FROM condominios')).rows;
    compararComCarteira(itens, carteira);
    res.json({ itens });
  });

  // grava os condomínios escolhidos; confere todos antes e só grava se não houver erro
  r.post('/api/carteira/implantacao/adicionar', soAdicionar, json, async (req, res) => {
    const lista = Array.isArray(req.body && req.body.itens) ? req.body.itens : null;
    if (!lista || !lista.length) return erro(res, 400, 'Escolha ao menos um condomínio.');
    if (lista.length > 500) return erro(res, 400, 'Envie no máximo 500 condomínios por vez.');
    // responsáveis: cada coordenador/supervisor escolhe só o do setor dele; o administrador, todos
    const editaveis = await funcoesEditaveis(req.usuario);
    const existentes = new Set((await db.q('SELECT codigo FROM condominios')).rows.map((x) => x.codigo));
    const vistos = new Set();
    const erros = [];
    const prontos = [];
    lista.forEach((b, i) => {
      // responsáveis são opcionais: o que vier preenchido já entra na carteira
      const v = normalizar({ situacao: 'ATIVO', ...b });
      const falha = (msg) => erros.push({ indice: i, erro: msg });
      if (v.erro) return falha(v.erro);
      const d = v.dados;
      if (!d.codigo) return falha('Informe o ID Vouch.');
      if (!d.nome) return falha('Informe o nome do condomínio.');
      if (!d.inicio_contrato) return falha('Informe a vigência.');
      if (d.cnpj && d.cnpj.replace(/\D/g, '').length !== 14) return falha(`CNPJ incompleto (${d.cnpj}): são 14 dígitos.`);
      const fora = FUNCOES.filter((f) => d[f.campo] && !editaveis.includes(f.campo));
      if (fora.length) return falha(`${fora.map((f) => f.rotulo).join(', ')}: você não tem permissão para escolher. Deixe em branco (é preenchido depois na ficha) ou peça a quem pode.`);
      if (existentes.has(d.codigo)) return falha(`O ID Vouch ${d.codigo} já está na carteira.`);
      if (vistos.has(d.codigo)) return falha(`O ID Vouch ${d.codigo} foi digitado em mais de um condomínio.`);
      vistos.add(d.codigo);
      prontos.push(d);
    });
    if (erros.length) return res.status(400).json({ erro: erros.length === 1 ? erros[0].erro : `${erros.length} condomínios precisam de correção.`, erros });
    const ids = await db.tx(async (t) => {
      const novos = [];
      for (const d of prontos) {
        const cols = Object.keys(d);
        const { id } = await t.um(`INSERT INTO condominios (${cols.join(', ')}, atualizado_por) VALUES (${cols.map((_, k) => '$' + (k + 1)).join(', ')}, $${cols.length + 1}) RETURNING id`,
          [...cols.map((c) => d[c]), req.usuario.id]);
        novos.push({ id, nome: d.nome, codigo: d.codigo });
      }
      return novos;
    });
    for (const c of ids) await seg.auditar(req, 'condominio_criado', null, { ...c, origem: 'planilha de implantação' });
    res.status(201).json({ criados: ids.length, ids: ids.map((c) => c.id) });
  });

  /* ===================== transferir a carteira de uma pessoa ===================== */
  r.post('/api/carteira/transferir', json, async (req, res) => {
    const b = req.body || {};
    const f = FUNCOES.find((x) => x.campo === b.funcao);
    if (!f) return erro(res, 400, 'Função inválida.');
    if (!(await funcoesEditaveis(req.usuario)).includes(f.campo)) return erro(res, 403, 'Você transfere só a carteira do seu setor.');
    const de = String(b.de || '').trim().toUpperCase();
    const pessoa = normalizar({ [f.campo]: b.para }).dados[f.campo];
    if (!de) return erro(res, 400, 'Informe de quem é a carteira.');
    if (!pessoa) return erro(res, 400, 'Informe para quem vai a carteira.');
    if (pessoa === de) return erro(res, 400, 'Escolha uma pessoa diferente.');
    const ids = Array.isArray(b.ids) && b.ids.length ? b.ids.map(Number).filter(Number.isInteger) : null;
    const alvo = (await db.q(`SELECT id, nome FROM condominios WHERE ${f.campo} = $1 ${ids ? 'AND id = ANY($2::int[])' : ''}`, ids ? [de, ids] : [de])).rows;
    if (!alvo.length) return erro(res, 400, 'Nenhum condomínio dessa pessoa para transferir.');
    await db.q(`UPDATE condominios SET ${f.campo} = $1, atualizado_em = now(), atualizado_por = $2 WHERE id = ANY($3::int[])`, [pessoa, req.usuario.id, alvo.map((c) => c.id)]);
    for (const c of alvo) await seg.auditar(req, 'carteira_transferida', null, { id: c.id, nome: c.nome, mudancas: { [f.campo]: [de, pessoa] } });
    res.json({ ok: true, condominios: alvo.length });
  });

  return r;
}

module.exports = { rotasCarteira };
