'use strict';
/*
 * "Planilhas" internas: cada módulo tem coleções (equivalentes às abas do Google Sheets)
 * com registros identificados por um ID. Os dados ficam em JSONB, então dá para consultar
 * direto no Postgres (ex.: dados->>'nome', ou dados->>1 para a 2ª coluna de uma linha).
 */
function criarRegistros(db) {
  const UPSERT = `INSERT INTO registros (modulo_slug, colecao, item_id, dados, atualizado_por) VALUES ($1, $2, $3, $4::jsonb, $5)
    ON CONFLICT (modulo_slug, colecao, item_id) DO UPDATE SET dados = excluded.dados, atualizado_em = now(), atualizado_por = excluded.atualizado_por
    RETURNING (xmax = 0) AS inserido`;

  async function listar(slug, colecao) {
    const { rows } = await db.q('SELECT dados FROM registros WHERE modulo_slug = $1 AND colecao = $2 ORDER BY rid', [slug, colecao]);
    return rows.map((r) => r.dados);
  }

  /* com o identificador de cada linha, na ordem da planilha */
  async function listarComIds(slug, colecao) {
    const { rows } = await db.q('SELECT item_id, dados FROM registros WHERE modulo_slug = $1 AND colecao = $2 ORDER BY rid', [slug, colecao]);
    return rows.map((r) => ({ id: r.item_id, dados: r.dados }));
  }

  async function upsert(slug, colecao, id, dados, usuarioId, t = db) {
    const r = await t.um(UPSERT, [slug, colecao, String(id), JSON.stringify(dados), usuarioId || null]);
    return r && r.inserido ? 'inserido' : 'atualizado';
  }

  const apagar = async (slug, colecao, id) =>
    (await db.q('DELETE FROM registros WHERE modulo_slug = $1 AND colecao = $2 AND item_id = $3', [slug, colecao, String(id)])).n;

  const substituirTudo = (slug, colecao, itens, usuarioId) => db.tx(async (t) => {
    await t.q('DELETE FROM registros WHERE modulo_slug = $1 AND colecao = $2', [slug, colecao]);
    for (const { id, dados } of itens) await upsert(slug, colecao, id, dados, usuarioId, t);
  });

  const lote = (slug, colecao, itens, usuarioId) => db.tx(async (t) => {
    for (const { id, dados } of itens) await upsert(slug, colecao, id, dados, usuarioId, t);
  });

  const resumo = async (slug) => (await db.q(
    'SELECT colecao, COUNT(*)::int AS total, MAX(atualizado_em) AS ultima FROM registros WHERE modulo_slug = $1 GROUP BY colecao ORDER BY colecao', [slug])).rows;

  async function cabecalho(slug, colecao) {
    const r = await db.um('SELECT cabecalho FROM colecoes WHERE modulo_slug = $1 AND colecao = $2', [slug, colecao]);
    return r && Array.isArray(r.cabecalho) ? r.cabecalho : null;
  }
  const salvarCabecalho = (slug, colecao, cab) => db.q(`INSERT INTO colecoes (modulo_slug, colecao, cabecalho) VALUES ($1, $2, $3::jsonb)
    ON CONFLICT (modulo_slug, colecao) DO UPDATE SET cabecalho = excluded.cabecalho`, [slug, colecao, JSON.stringify(cab)]);

  return { listar, listarComIds, upsert, apagar, substituirTudo, lote, resumo, cabecalho, salvarCabecalho };
}

module.exports = { criarRegistros };
