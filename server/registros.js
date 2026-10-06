'use strict';
/*
 * "Planilhas" internas: cada módulo tem coleções (equivalentes às abas do Google Sheets)
 * com registros identificados por um ID. Usado pelos adaptadores compatíveis com o
 * Apps Script das ferramentas e pela importação/exportação de dados.
 */
function criarRegistros(db) {
  const st = {
    listar: db.prepare('SELECT item_id, dados FROM registros WHERE modulo_slug = ? AND colecao = ? ORDER BY rid'),
    obter: db.prepare('SELECT rid FROM registros WHERE modulo_slug = ? AND colecao = ? AND item_id = ?'),
    inserir: db.prepare('INSERT INTO registros (modulo_slug, colecao, item_id, dados, atualizado_por) VALUES (?, ?, ?, ?, ?)'),
    atualizar: db.prepare("UPDATE registros SET dados = ?, atualizado_em = datetime('now'), atualizado_por = ? WHERE rid = ?"),
    apagar: db.prepare('DELETE FROM registros WHERE modulo_slug = ? AND colecao = ? AND item_id = ?'),
    apagarColecao: db.prepare('DELETE FROM registros WHERE modulo_slug = ? AND colecao = ?'),
    contar: db.prepare('SELECT colecao, COUNT(*) AS total, MAX(atualizado_em) AS ultima FROM registros WHERE modulo_slug = ? GROUP BY colecao'),
    cabecalho: db.prepare('SELECT cabecalho FROM colecoes WHERE modulo_slug = ? AND colecao = ?'),
    salvarCabecalho: db.prepare(`INSERT INTO colecoes (modulo_slug, colecao, cabecalho) VALUES (?, ?, ?)
      ON CONFLICT(modulo_slug, colecao) DO UPDATE SET cabecalho = excluded.cabecalho`),
  };

  const listar = (slug, colecao) => st.listar.all(slug, colecao).map((r) => JSON.parse(r.dados));

  function upsert(slug, colecao, id, dados, usuarioId) {
    const existente = st.obter.get(slug, colecao, String(id));
    if (existente) st.atualizar.run(JSON.stringify(dados), usuarioId || null, existente.rid);
    else st.inserir.run(slug, colecao, String(id), JSON.stringify(dados), usuarioId || null);
    return existente ? 'atualizado' : 'inserido';
  }

  const apagar = (slug, colecao, id) => st.apagar.run(slug, colecao, String(id)).changes;

  const substituirTudo = db.transaction((slug, colecao, itens, usuarioId) => {
    st.apagarColecao.run(slug, colecao);
    for (const { id, dados } of itens) upsert(slug, colecao, id, dados, usuarioId);
  });

  const lote = db.transaction((slug, colecao, itens, usuarioId) => {
    for (const { id, dados } of itens) upsert(slug, colecao, id, dados, usuarioId);
  });

  const resumo = (slug) => st.contar.all(slug);

  function cabecalho(slug, colecao) {
    const r = st.cabecalho.get(slug, colecao);
    if (!r || !r.cabecalho) return null;
    try { return JSON.parse(r.cabecalho); } catch { return null; }
  }
  const salvarCabecalho = (slug, colecao, cab) => st.salvarCabecalho.run(slug, colecao, JSON.stringify(cab));

  return { listar, upsert, apagar, substituirTudo, lote, resumo, cabecalho, salvarCabecalho };
}

module.exports = { criarRegistros };
