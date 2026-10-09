'use strict';
/*
 * Aba Carteira de condomínios.
 * Todos que entram no portal consultam; a administração cadastra, edita, importa e transfere carteiras.
 * Coordenador e supervisor editam e transferem só a coluna de responsável do setor deles
 * (Cobrança → analista de cobrança, Crédito → assistente de crédito).
 * Cada alteração fica no histórico (auditoria) com o que mudou, quem mudou e quando.
 */
const express = require('express');
const { FUNCOES, CAMPOS, SITUACOES, interpretar, normalizar, exportar } = require('../carteira');

const COLUNAS = CAMPOS.map((c) => c.campo);
// DATE volta como texto (evita deslocar o dia pelo fuso)
const SELECT = `SELECT c.id, ${COLUNAS.filter((x) => x !== 'inicio_contrato').map((x) => 'c.' + x).join(', ')},
  to_char(c.inicio_contrato, 'YYYY-MM-DD') AS inicio_contrato, c.criado_em, c.atualizado_em, u.nome AS atualizado_por_nome
  FROM condominios c LEFT JOIN usuarios u ON u.id = c.atualizado_por`;

function rotasCarteira({ db, seg }) {
  const r = express.Router();
  const json = express.json({ limit: '1mb' });
  r.use('/api/carteira', seg.exigirLogin);
  const soAdmin = (req, res, next) => (req.usuario.papel === 'admin' ? next() : res.status(403).json({ erro: 'Só a administração altera a carteira.' }));

  /* colunas de responsável que a pessoa pode alterar: todas (administrador) ou as dos setores dela (coordenador/supervisor) */
  async function funcoesEditaveis(u) {
    if (u.papel === 'admin') return FUNCOES.map((f) => f.campo);
    const setores = await seg.setoresGeridos(u);
    if (!setores || !setores.size) return [];
    const nomes = new Set((await db.q('SELECT nome FROM setores WHERE id = ANY($1::int[])', [[...setores]])).rows.map((x) => x.nome));
    return FUNCOES.filter((f) => f.setor && nomes.has(f.setor)).map((f) => f.campo);
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

  /* ===================== consulta ===================== */
  r.get('/api/carteira', async (req, res) => {
    const { rows } = await db.q(`${SELECT} ORDER BY c.nome, c.comarca`);
    res.json({ condominios: rows, funcoes: FUNCOES.map((f) => ({ campo: f.campo, rotulo: f.rotulo })), situacoes: SITUACOES, pode_editar: req.usuario.papel === 'admin',
      funcoes_editaveis: await funcoesEditaveis(req.usuario) });
  });

  r.get('/api/carteira/exportar', async (req, res) => {
    const { rows } = await db.q(`${SELECT} ORDER BY c.nome, c.comarca`);
    await seg.auditar(req, 'carteira_exportada', null, { condominios: rows.length });
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="carteira-de-condominios-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.set('Cache-Control', 'private, no-store');
    res.send(exportar(rows));
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
  r.post('/api/carteira', soAdmin, json, async (req, res) => {
    const b = req.body || {};
    if (!b.codigo) {
      // próximo ID numérico livre
      const { n } = await db.um(`SELECT COALESCE(MAX(codigo::int), 0) + 1 AS n FROM condominios WHERE codigo ~ '^[0-9]{1,9}$'`);
      b.codigo = String(n);
    }
    const v = normalizar({ situacao: 'ATIVO', ...b });
    if (v.erro) return erro(res, 400, v.erro);
    if (!v.dados.nome) return erro(res, 400, 'Informe o nome do condomínio.');
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
    const editaveis = await funcoesEditaveis(req.usuario);
    if (!editaveis.length) return erro(res, 403, 'Só a administração altera a carteira.');
    const atual = await db.um(`${SELECT} WHERE c.id = $1`, [Number(req.params.id) || 0]);
    if (!atual) return erro(res, 404, 'Condomínio não encontrado.');
    const v = normalizar(req.body || {});
    if (v.erro) return erro(res, 400, v.erro);
    const mudancas = diferencas(atual, v.dados);
    if (req.usuario.papel !== 'admin') {
      const fora = Object.keys(mudancas).filter((k) => !editaveis.includes(k));
      if (fora.length) return erro(res, 403, 'Você altera só o responsável do seu setor neste condomínio.');
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

  r.delete('/api/carteira/:id', soAdmin, async (req, res) => {
    const atual = await db.um('SELECT id, nome, codigo FROM condominios WHERE id = $1', [Number(req.params.id) || 0]);
    if (!atual) return erro(res, 404, 'Condomínio não encontrado.');
    await db.q('DELETE FROM condominios WHERE id = $1', [atual.id]);
    await seg.auditar(req, 'condominio_removido', null, atual);
    res.json({ ok: true });
  });

  /* ===================== importar o CSV da planilha ===================== */
  // atualiza pelo ID; quem não está no arquivo continua como está
  r.post('/api/carteira/importar', soAdmin, express.raw({ type: () => true, limit: '10mb' }), async (req, res) => {
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
