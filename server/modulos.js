'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
const BRIDGE_JS = fs.readFileSync(path.join(__dirname, 'bridge.js'), 'utf8');

/* JSON seguro para colocar dentro de <script> */
const jsonEmScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

function criarServicoModulos(db, cfg) {
  const pastaModulos = path.join(cfg.dataDir, 'modulos');
  fs.mkdirSync(pastaModulos, { recursive: true });

  const st = {
    um: db.prepare(`SELECT m.*, s.nome AS setor_nome, s.ordem AS setor_ordem, v.arquivo, v.enviado_em AS versao_em, v.tamanho, v.nome_original
      FROM modulos m LEFT JOIN setores s ON s.id = m.setor_id LEFT JOIN modulo_versoes v ON v.id = m.versao_id WHERE m.slug = ?`),
    todos: db.prepare(`SELECT m.*, s.nome AS setor_nome, s.ordem AS setor_ordem, v.arquivo, v.enviado_em AS versao_em, v.tamanho, v.nome_original
      FROM modulos m LEFT JOIN setores s ON s.id = m.setor_id LEFT JOIN modulo_versoes v ON v.id = m.versao_id
      ORDER BY COALESCE(s.ordem, 999), s.nome, m.ordem, m.nome`),
    novaVersao: db.prepare('INSERT INTO modulo_versoes (modulo_slug, arquivo, nome_original, tamanho, sha256, enviado_por) VALUES (?, ?, ?, ?, ?, ?)'),
    usarVersao: db.prepare("UPDATE modulos SET versao_id = ?, atualizado_em = datetime('now') WHERE slug = ?"),
    versoes: db.prepare(`SELECT v.id, v.nome_original, v.tamanho, v.sha256, v.enviado_em, u.nome AS enviado_por
      FROM modulo_versoes v LEFT JOIN usuarios u ON u.id = v.enviado_por WHERE v.modulo_slug = ? ORDER BY v.id DESC`),
    versao: db.prepare('SELECT * FROM modulo_versoes WHERE id = ? AND modulo_slug = ?'),
    lerArmazenamento: db.prepare('SELECT chave, valor FROM armazenamento WHERE modulo_slug = ? AND escopo = ?'),
  };

  const parse = (m) => {
    if (!m) return null;
    let config = {};
    try { config = JSON.parse(m.config || '{}'); } catch { config = {}; }
    return { ...m, config, ativo: !!m.ativo, tem_arquivo: !!m.versao_id };
  };

  const obter = (slug) => parse(st.um.get(slug));
  const listar = () => st.todos.all().map(parse);

  function validarHtml(buf) {
    if (!buf || !buf.length) return 'Arquivo vazio.';
    if (buf.length > cfg.limiteHtmlMb * 1024 * 1024) return `Arquivo maior que ${cfg.limiteHtmlMb} MB.`;
    const inicio = buf.subarray(0, 2048).toString('utf8').replace(/^﻿/, '').trimStart().toLowerCase();
    if (!inicio.startsWith('<!doctype html') && !inicio.startsWith('<html') && !inicio.startsWith('<!--')) {
      return 'O arquivo não parece ser um HTML (precisa começar com <!DOCTYPE html> ou <html>).';
    }
    return null;
  }

  /* Grava um novo HTML como versão do módulo e passa a usá-lo. */
  function salvarVersao(slug, buf, nomeOriginal, usuarioId) {
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    const pasta = path.join(pastaModulos, slug);
    fs.mkdirSync(pasta, { recursive: true });
    const nome = `${Date.now()}-${sha.slice(0, 10)}.html`;
    fs.writeFileSync(path.join(pasta, nome), buf);
    const info = st.novaVersao.run(slug, path.join(slug, nome), nomeOriginal ? String(nomeOriginal).slice(0, 200) : null, buf.length, sha, usuarioId || null);
    st.usarVersao.run(info.lastInsertRowid, slug);
    cacheHtml.delete(slug);
    return info.lastInsertRowid;
  }

  function restaurarVersao(slug, versaoId) {
    const v = st.versao.get(versaoId, slug);
    if (!v) return false;
    st.usarVersao.run(v.id, slug);
    cacheHtml.delete(slug);
    return true;
  }

  const listarVersoes = (slug) => st.versoes.all(slug);

  function removerArquivos(slug) {
    if (!SLUG_RE.test(slug)) return;
    fs.rmSync(path.join(pastaModulos, slug), { recursive: true, force: true });
    cacheHtml.delete(slug);
  }

  // cache do HTML original por módulo (os arquivos podem ter alguns MB)
  const cacheHtml = new Map();
  function lerHtml(m) {
    if (!m || !m.arquivo) return null;
    const c = cacheHtml.get(m.slug);
    if (c && c.versao === m.versao_id) return c.html;
    const html = fs.readFileSync(path.join(pastaModulos, m.arquivo), 'utf8');
    cacheHtml.set(m.slug, { versao: m.versao_id, html });
    return html;
  }

  /* Lê o cabeçalho de uma coleção a partir da constante JS do próprio HTML (ex.: SHEET_HEADERS). */
  function cabecalhoDoHtml(m, constante) {
    if (!constante) return null;
    const html = lerHtml(m);
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
  function montarHtml(m, usuario) {
    let html = lerHtml(m);
    if (html == null) return null;
    const avisos = [];

    if (m.adaptador && m.fonte_dados === 'interno') {
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
      usuario: { id: usuario.id, nome: usuario.nome },
      avisos,
    };
    if (m.armazenamento !== 'navegador') {
      const escopo = m.armazenamento === 'compartilhado' ? '*' : `u:${usuario.id}`;
      conf.dados = Object.fromEntries(st.lerArmazenamento.all(m.slug, escopo).map((r) => [r.chave, r.valor]));
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
  function reconhecer(buf) {
    const t = /<title>([^<]*)<\/title>/i.exec(buf.subarray(0, 200000).toString('utf8'));
    if (!t) return null;
    const titulo = t[1];
    for (const m of listar()) {
      if (m.config.titulo && titulo.toLowerCase().includes(String(m.config.titulo).toLowerCase())) return m.slug;
    }
    return null;
  }

  return { SLUG_RE, obter, listar, validarHtml, salvarVersao, restaurarVersao, listarVersoes, removerArquivos, lerHtml, cabecalhoDoHtml, montarHtml, reconhecer };
}

module.exports = { criarServicoModulos, SLUG_RE };
