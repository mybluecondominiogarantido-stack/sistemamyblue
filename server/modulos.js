'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
const BRIDGE_JS = fs.readFileSync(path.join(__dirname, 'bridge.js'), 'utf8');

/* JSON seguro para colocar dentro de <script> */
const jsonEmScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

function criarServicoModulos(db, cfg) {
  const COLUNAS = `m.*, s.nome AS setor_nome, s.ordem AS setor_ordem, v.enviado_em AS versao_em, v.tamanho, v.nome_original
    FROM modulos m LEFT JOIN setores s ON s.id = m.setor_id LEFT JOIN modulo_versoes v ON v.id = m.versao_id`;

  const parse = (m) => (m ? { ...m, config: m.config || {}, ativo: !!m.ativo, tem_arquivo: !!m.versao_id } : null);

  const obter = async (slug) => parse(await db.um(`SELECT ${COLUNAS} WHERE m.slug = $1`, [slug]));
  const listar = async () => (await db.q(`SELECT ${COLUNAS} ORDER BY COALESCE(s.ordem, 999), s.nome, m.ordem, m.nome`)).rows.map(parse);

  function validarHtml(buf) {
    if (!buf || !buf.length) return 'Arquivo vazio.';
    if (buf.length > cfg.limiteHtmlMb * 1024 * 1024) return `Arquivo maior que ${cfg.limiteHtmlMb} MB.`;
    const inicio = buf.subarray(0, 2048).toString('utf8').replace(/^\uFEFF/, '').trimStart().toLowerCase();
    if (!inicio.startsWith('<!doctype html') && !inicio.startsWith('<html') && !inicio.startsWith('<!--')) {
      return 'O arquivo não parece ser um HTML (precisa começar com <!DOCTYPE html> ou <html>).';
    }
    return null;
  }

  /* Grava um novo HTML como versão do módulo (no banco) e passa a usá-lo. */
  async function salvarVersao(slug, buf, nomeOriginal, usuarioId) {
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    return db.tx(async (t) => {
      const v = await t.um(`INSERT INTO modulo_versoes (modulo_slug, conteudo, nome_original, tamanho, sha256, enviado_por)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [slug, buf, nomeOriginal ? String(nomeOriginal).slice(0, 200) : null, buf.length, sha, usuarioId || null]);
      await t.q('UPDATE modulos SET versao_id = $1, atualizado_em = now() WHERE slug = $2', [v.id, slug]);
      return v.id;
    });
  }

  async function restaurarVersao(slug, versaoId) {
    const v = await db.um('SELECT id FROM modulo_versoes WHERE id = $1 AND modulo_slug = $2', [versaoId, slug]);
    if (!v) return false;
    await db.q('UPDATE modulos SET versao_id = $1, atualizado_em = now() WHERE slug = $2', [v.id, slug]);
    return true;
  }

  const listarVersoes = async (slug) => (await db.q(`SELECT v.id, v.nome_original, v.tamanho, v.sha256, v.enviado_em, u.nome AS enviado_por
    FROM modulo_versoes v LEFT JOIN usuarios u ON u.id = v.enviado_por WHERE v.modulo_slug = $1 ORDER BY v.id DESC`, [slug])).rows;

  // cache do HTML por versão (uma versão nunca muda, então o cache é sempre válido)
  const cacheHtml = new Map();
  async function lerHtml(m) {
    if (!m || !m.versao_id) return null;
    if (cacheHtml.has(m.versao_id)) return cacheHtml.get(m.versao_id);
    const r = await db.um('SELECT conteudo FROM modulo_versoes WHERE id = $1', [m.versao_id]);
    if (!r) return null;
    const html = r.conteudo.toString('utf8');
    if (cacheHtml.size > 30) cacheHtml.delete(cacheHtml.keys().next().value);
    cacheHtml.set(m.versao_id, html);
    return html;
  }

  /* Lê o cabeçalho de uma coleção a partir da constante JS do próprio HTML (ex.: SHEET_HEADERS). */
  async function cabecalhoDoHtml(m, constante) {
    if (!constante) return null;
    const html = await lerHtml(m);
    if (!html) return null;
    const re = new RegExp('(?:const|let|var)\\s+' + constante + '\\s*=\\s*(\\[[\\s\\S]*?\\])\\s*;');
    const r = re.exec(html);
    if (!r) return null;
    try {
      const arr = JSON.parse(r[1]);
      return Array.isArray(arr) && arr.every((x) => typeof x === 'string') ? arr : null;
    } catch { return null; }
  }

  function aplicarPatches(html, patches, vars) {
    let saida = html;
    const falhas = [];
    for (const p of patches || []) {
      const troca = String(p.troca).replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
      if (p.tipo === 'regex') {
        const re = new RegExp(p.busca, 'g');
        if (!re.test(saida)) { falhas.push(p.busca); continue; }
        saida = saida.replace(new RegExp(p.busca, 'g'), troca);
      } else {
        if (!saida.includes(p.busca)) { falhas.push(p.busca); continue; }
        saida = saida.split(p.busca).join(troca);
      }
    }
    return { html: saida, falhas };
  }

  /* Monta o HTML entregue ao navegador: aplica o banco interno (se ativo) e injeta a ponte de armazenamento. */
  async function montarHtml(m, usuario) {
    let html = await lerHtml(m);
    if (html == null) return null;
    const avisos = [];

    if (m.adaptador && m.adaptador !== 'claude-db' && m.fonte_dados === 'interno') {
      const r = aplicarPatches(html, m.config.patches_interno, { GAS_URL: `/api/gas/${m.slug}` });
      if (r.falhas.length) {
        avisos.push('Não foi possível ligar esta ferramenta ao banco interno (o HTML mudou). Ela está usando a fonte original. Avise a administração.');
        console.warn(`[modulos] ${m.slug}: patches não aplicados →`, r.falhas);
      } else {
        html = r.html;
      }
    }

    const conf = {
      modulo: m.slug,
      modo: m.armazenamento,
      locais: m.config.chaves_locais || [],
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, admin: usuario.papel === 'admin', foto_v: usuario.foto_v || null },
      claudeDb: m.adaptador === 'claude-db',
      avisos,
    };
    if (m.armazenamento !== 'navegador') {
      const escopo = m.armazenamento === 'compartilhado' ? '*' : `u:${usuario.id}`;
      const { rows } = await db.q('SELECT chave, valor FROM armazenamento WHERE modulo_slug = $1 AND escopo = $2', [m.slug, escopo]);
      conf.dados = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
    }
    const injecao = `<script>window.__MYBLUE__=${jsonEmScript(conf)};\n${BRIDGE_JS}</script>`;

    // injeta logo no início do <head> (antes de qualquer script da ferramenta)
    const head = /<head(\s[^>]*)?>/i.exec(html);
    if (head) return html.slice(0, head.index + head[0].length) + injecao + html.slice(head.index + head[0].length);
    const tagHtml = /<html(\s[^>]*)?>/i.exec(html);
    if (tagHtml) return html.slice(0, tagHtml.index + tagHtml[0].length) + '<head>' + injecao + '</head>' + html.slice(tagHtml.index + tagHtml[0].length);
    return injecao + html;
  }

  /* Reconhece a qual módulo um HTML pertence pelo <title>. */
  async function reconhecer(buf) {
    const t = /<title>([^<]*)<\/title>/i.exec(buf.subarray(0, 200000).toString('utf8'));
    if (!t) return null;
    const titulo = t[1];
    for (const m of await listar()) {
      if (m.config.titulo && titulo.toLowerCase().includes(String(m.config.titulo).toLowerCase())) return m.slug;
    }
    return null;
  }

  return { SLUG_RE, obter, listar, validarHtml, salvarVersao, restaurarVersao, listarVersoes, lerHtml, cabecalhoDoHtml, montarHtml, reconhecer };
}

module.exports = { criarServicoModulos, SLUG_RE };
