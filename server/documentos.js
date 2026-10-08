'use strict';
/*
 * Banco de documentos das ferramentas feitas como artefato do Claude (window.claude.use('db')).
 * Cada documento fica em (módulo, coleção, id) com o corpo em JSONB, como no Claude:
 * coleção "meses" + id "2026-10" = documento "meses/2026-10".
 *
 * Toda gravação recebe um número de sequência (seq) crescente por módulo. A ferramenta aberta
 * pergunta "o que mudou desde o seq N" e recebe só as alterações, inclusive as exclusões
 * (o documento apagado fica com dados = NULL para avisar quem está com a tela aberta).
 */

const SEGMENTO_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
const LIMITE_DOC = 256 * 1024;
const LIMITE_DOCS = 25000;

class ErroDoc extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

/* Valida um caminho de documento ("colecao/.../id") e devolve { colecao, id }. */
function separarCaminho(caminho) {
  const s = String(caminho || '');
  const partes = s.split('/');
  if (Buffer.byteLength(s) > 1000 || partes.length > 16 || partes.length % 2 !== 0) throw new ErroDoc('invalid_argument', `Caminho de documento inválido: ${s}`);
  for (const p of partes) if (!SEGMENTO_RE.test(p) || p === '.' || p === '..') throw new ErroDoc('invalid_argument', `Trecho inválido no caminho: ${s}`);
  return { colecao: partes.slice(0, -1).join('/'), id: partes[partes.length - 1] };
}

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/* update do Claude: objetos aninhados se juntam; o resto (listas inclusive) substitui o campo. */
function mesclar(base, patch) {
  const saida = { ...base };
  for (const [k, v] of Object.entries(patch)) saida[k] = ehObjeto(v) && ehObjeto(saida[k]) ? mesclar(saida[k], v) : v;
  return saida;
}

function profundidade(v, n = 0) {
  if (n > 32) return n;
  if (v === null || typeof v !== 'object') return n;
  let max = n;
  for (const x of Object.values(v)) max = Math.max(max, profundidade(x, n + 1));
  return max;
}

function conferirCorpo(dados) {
  if (!ehObjeto(dados)) throw new ErroDoc('invalid_argument', 'O documento precisa ser um objeto.');
  if (Buffer.byteLength(JSON.stringify(dados)) > LIMITE_DOC) throw new ErroDoc('invalid_argument', 'Documento maior que 256 KB.');
  if (profundidade(dados) > 32) throw new ErroDoc('invalid_argument', 'Documento com níveis demais.');
}

/* "data/users/<id>/..." é a área particular de cada pessoa */
function donoParticular(colecao) {
  const p = colecao.split('/');
  return p[0] === 'data' && p[1] === 'users' ? p[2] || '' : null;
}

function criarDocumentos(db) {
  const visivel = (colecao, pessoa) => { const d = donoParticular(colecao); return d === null || d === pessoa; };

  /* alterações desde "desde" (0 = tudo o que existe) */
  async function mudancas(slug, desde, pessoa) {
    const d = Number(desde) || 0;
    const { rows } = d > 0
      ? await db.q('SELECT colecao, doc_id, dados, seq FROM documentos WHERE modulo_slug = $1 AND seq > $2 ORDER BY seq', [slug, d])
      : await db.q('SELECT colecao, doc_id, dados, seq FROM documentos WHERE modulo_slug = $1 AND dados IS NOT NULL ORDER BY seq', [slug]);
    let seq = d;
    for (const r of rows) seq = Math.max(seq, Number(r.seq));
    if (!rows.length && d === 0) seq = Number((await db.um('SELECT COALESCE(MAX(seq), 0) AS s FROM documentos WHERE modulo_slug = $1', [slug])).s);
    return { seq, docs: rows.filter((r) => visivel(r.colecao, pessoa)).map((r) => ({ c: r.colecao, id: r.doc_id, d: r.dados })) };
  }

  /* aplica uma lista de gravações [{op:'set'|'update'|'delete', path, data}] em ordem, numa transação */
  async function gravar(slug, ops, pessoa, usuarioId) {
    if (!Array.isArray(ops) || !ops.length || ops.length > 50) throw new ErroDoc('invalid_argument', 'Lista de gravações inválida.');
    const alvos = ops.map((o) => {
      if (!o || !['set', 'update', 'delete'].includes(o.op)) throw new ErroDoc('invalid_argument', 'Operação inválida.');
      const { colecao, id } = separarCaminho(o.path);
      const dono = donoParticular(colecao);
      if (dono !== null && dono !== pessoa) throw new ErroDoc('invalid_argument', 'Sem permissão para gravar neste caminho.');
      if (o.op !== 'delete') conferirCorpo(o.data);
      return { ...o, colecao, id };
    });
    return db.tx(async (t) => {
      // uma gravação por vez em cada módulo: o seq sai na mesma ordem em que as gravações são confirmadas
      await t.q('SELECT pg_advisory_xact_lock(hashtext($1))', ['documentos:' + slug]);
      let seq = 0;
      for (const o of alvos) {
        const atual = await t.um('SELECT dados FROM documentos WHERE modulo_slug = $1 AND colecao = $2 AND doc_id = $3', [slug, o.colecao, o.id]);
        const existe = !!(atual && atual.dados);
        let dados;
        if (o.op === 'delete') {
          if (!existe) continue;
          dados = null;
        } else if (o.op === 'update') {
          if (!existe) throw new ErroDoc('invalid_argument', `O documento ${o.path} não existe.`);
          dados = mesclar(atual.dados, o.data);
          conferirCorpo(dados);
        } else {
          dados = o.data;
          if (!atual) {
            const n = await t.um('SELECT COUNT(*)::int AS n FROM documentos WHERE modulo_slug = $1 AND dados IS NOT NULL', [slug]);
            if (n.n >= LIMITE_DOCS) throw new ErroDoc('quota_exceeded', 'Limite de documentos desta ferramenta atingido.');
          }
        }
        const r = await t.um(`INSERT INTO documentos (modulo_slug, colecao, doc_id, dados, seq, atualizado_por)
          VALUES ($1, $2, $3, $4::jsonb, nextval('documentos_seq'), $5)
          ON CONFLICT (modulo_slug, colecao, doc_id) DO UPDATE SET dados = excluded.dados, seq = excluded.seq, atualizado_em = now(), atualizado_por = excluded.atualizado_por
          RETURNING seq`, [slug, o.colecao, o.id, dados === null ? null : JSON.stringify(dados), usuarioId || null]);
        seq = Number(r.seq);
      }
      return { seq };
    });
  }

  async function ler(slug, caminho) {
    const { colecao, id } = separarCaminho(caminho);
    const r = await db.um('SELECT dados FROM documentos WHERE modulo_slug = $1 AND colecao = $2 AND doc_id = $3', [slug, colecao, id]);
    return r && r.dados ? r.dados : null;
  }

  const resumo = async (slug) => (await db.q(`SELECT colecao, COUNT(*)::int AS total, MAX(atualizado_em) AS ultima FROM documentos
    WHERE modulo_slug = $1 AND dados IS NOT NULL GROUP BY colecao ORDER BY colecao`, [slug])).rows;

  const listar = async (slug, colecao) => (await db.q(`SELECT doc_id, dados FROM documentos WHERE modulo_slug = $1 AND colecao = $2 AND dados IS NOT NULL ORDER BY doc_id`,
    [slug, colecao])).rows.map((r) => ({ id: r.doc_id, ...r.dados }));

  /* Trava curta e cooperativa (acquire do Claude). Fica na memória: o portal roda numa instância só. */
  const travas = new Map();
  async function adquirir(slug, caminho, { holder, ttlMs, data } = {}, pessoa, usuarioId) {
    separarCaminho(caminho);
    if (!holder || typeof holder !== 'string') throw new ErroDoc('invalid_argument', 'holder ausente.');
    const ttl = Math.min(600000, Math.max(1000, Number(ttlMs) || 30000));
    const chave = slug + '\n' + caminho;
    const agora = Date.now();
    const t = travas.get(chave);
    if (t && t.expira > agora && t.holder !== holder) return { acquired: false, expiresAt: new Date(t.expira).toISOString() };
    const expira = agora + ttl;
    travas.set(chave, { holder, expira });
    if (travas.size > 5000) for (const [k, v] of travas) if (v.expira < agora) travas.delete(k);
    let seq;
    if (data && ehObjeto(data)) {
      const existe = await ler(slug, caminho);
      seq = (await gravar(slug, [{ op: existe ? 'update' : 'set', path: caminho, data }], pessoa, usuarioId)).seq;
    }
    return { acquired: true, version: seq, expiresAt: new Date(expira).toISOString(), holder };
  }

  return { mudancas, gravar, ler, resumo, listar, adquirir };
}

module.exports = { criarDocumentos, separarCaminho, mesclar, ErroDoc };
