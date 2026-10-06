'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const { hashSenha, validarNovaSenha, senhaAleatoria } = require('../seguranca');
const { SLUG_RE } = require('../modulos');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ICONES = ['app', 'calculadora', 'grafico', 'aperto', 'caixa', 'carteira', 'documento', 'pessoas', 'ticket', 'casa', 'calendario', 'escudo'];

function rotasAdmin({ db, seg, modulos, registros, cfg }) {
  const r = express.Router();
  const json = express.json({ limit: '2mb' });
  r.use('/api/admin', seg.exigirLogin, seg.exigirAdmin);

  const st = {
    usuarios: db.prepare(`SELECT id, nome, email, papel, ativo, trocar_senha, criado_em, ultimo_login FROM usuarios ORDER BY ativo DESC, nome`),
    usuario: db.prepare('SELECT id, nome, email, papel, ativo, trocar_senha FROM usuarios WHERE id = ?'),
    permissoesTodas: db.prepare('SELECT usuario_id, modulo_slug FROM permissoes'),
    criarUsuario: db.prepare('INSERT INTO usuarios (nome, email, senha_hash, papel, trocar_senha) VALUES (?, ?, ?, ?, 1)'),
    editarUsuario: db.prepare("UPDATE usuarios SET nome = ?, email = ?, papel = ?, ativo = ?, atualizado_em = datetime('now') WHERE id = ?"),
    senhaUsuario: db.prepare("UPDATE usuarios SET senha_hash = ?, trocar_senha = 1, atualizado_em = datetime('now') WHERE id = ?"),
    limparPermissoes: db.prepare('DELETE FROM permissoes WHERE usuario_id = ?'),
    darPermissao: db.prepare('INSERT OR IGNORE INTO permissoes (usuario_id, modulo_slug) VALUES (?, ?)'),
    encerrarSessoes: db.prepare('DELETE FROM sessoes WHERE usuario_id = ?'),
    adminsAtivos: db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE papel = 'admin' AND ativo = 1 AND id != ?"),
    setores: db.prepare('SELECT s.id, s.nome, s.ordem, (SELECT COUNT(*) FROM modulos m WHERE m.setor_id = s.id) AS modulos FROM setores s ORDER BY s.ordem, s.nome'),
    criarSetor: db.prepare('INSERT INTO setores (nome, ordem) VALUES (?, ?)'),
    editarSetor: db.prepare('UPDATE setores SET nome = ?, ordem = ? WHERE id = ?'),
    apagarSetor: db.prepare('DELETE FROM setores WHERE id = ?'),
    criarModulo: db.prepare(`INSERT INTO modulos (slug, nome, descricao, setor_id, icone, ordem, armazenamento, config) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    editarModulo: db.prepare(`UPDATE modulos SET nome = ?, descricao = ?, setor_id = ?, icone = ?, ordem = ?, ativo = ?, armazenamento = ?, fonte_dados = ?, config = ?, atualizado_em = datetime('now') WHERE slug = ?`),
    apagarModulo: db.prepare('DELETE FROM modulos WHERE slug = ?'),
    permissoesModulo: db.prepare('SELECT usuario_id FROM permissoes WHERE modulo_slug = ?'),
    armazenamentoResumo: db.prepare(`SELECT escopo, COUNT(*) AS chaves, SUM(LENGTH(valor)) AS bytes, MAX(atualizado_em) AS ultima FROM armazenamento WHERE modulo_slug = ? GROUP BY escopo`),
    armazenamentoTudo: db.prepare('SELECT escopo, chave, valor, atualizado_em FROM armazenamento WHERE modulo_slug = ? ORDER BY escopo, chave'),
  };

  const erro = (res, status, msg) => res.status(status).json({ erro: msg });

  /* link do Apps Script que veio embutido no HTML original (ajuda na importação) */
  function urlPlanilhaDoHtml(m) {
    try {
      const html = modulos.lerHtml(m);
      const r = html && /SHEET_URL_BUILTIN\s*=\s*["'](https:\/\/script\.google\.com\/[^"']+)["']/.exec(html);
      return r ? r[1] : null;
    } catch { return null; }
  }

  /* ===================== usuários ===================== */
  r.get('/api/admin/usuarios', (req, res) => {
    const perms = {};
    for (const p of st.permissoesTodas.all()) (perms[p.usuario_id] ||= []).push(p.modulo_slug);
    res.json({ usuarios: st.usuarios.all().map((u) => ({ ...u, ativo: !!u.ativo, trocar_senha: !!u.trocar_senha, modulos: perms[u.id] || [] })) });
  });

  function dadosUsuario(body) {
    const nome = String(body.nome || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const papel = body.papel === 'admin' ? 'admin' : 'usuario';
    if (!nome || nome.length > 120) return { erro: 'Informe o nome (até 120 caracteres).' };
    if (!EMAIL_RE.test(email) || email.length > 200) return { erro: 'E-mail inválido.' };
    const lista = Array.isArray(body.modulos) ? body.modulos.map(String) : [];
    const existentes = new Set(modulos.listar().map((m) => m.slug));
    return { nome, email, papel, modulos: lista.filter((s) => existentes.has(s)) };
  }

  const salvarPermissoes = db.transaction((id, lista) => {
    st.limparPermissoes.run(id);
    for (const s of lista) st.darPermissao.run(id, s);
  });

  r.post('/api/admin/usuarios', json, (req, res) => {
    const d = dadosUsuario(req.body || {});
    if (d.erro) return erro(res, 400, d.erro);
    let senha = req.body.senha ? String(req.body.senha) : '';
    if (senha) { const e = validarNovaSenha(senha); if (e) return erro(res, 400, e); } else senha = senhaAleatoria();
    let id;
    try {
      id = st.criarUsuario.run(d.nome, d.email, hashSenha(senha), d.papel).lastInsertRowid;
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return erro(res, 409, 'Já existe um usuário com este e-mail.');
      throw e;
    }
    salvarPermissoes(id, d.modulos);
    seg.auditar(req, 'usuario_criado', null, { id, email: d.email, papel: d.papel, modulos: d.modulos });
    res.status(201).json({ id, senha_temporaria: senha });
  });

  r.patch('/api/admin/usuarios/:id', json, (req, res) => {
    const id = Number(req.params.id);
    const atual = st.usuario.get(id);
    if (!atual) return erro(res, 404, 'Usuário não encontrado.');
    const d = dadosUsuario({ ...atual, ...req.body });
    if (d.erro) return erro(res, 400, d.erro);
    const ativo = req.body.ativo === undefined ? !!atual.ativo : !!req.body.ativo;
    if ((atual.papel === 'admin' && (d.papel !== 'admin' || !ativo)) && st.adminsAtivos.get(id).n === 0) {
      return erro(res, 400, 'Não é possível remover o último administrador ativo.');
    }
    try {
      st.editarUsuario.run(d.nome, d.email, d.papel, ativo ? 1 : 0, id);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return erro(res, 409, 'Já existe um usuário com este e-mail.');
      throw e;
    }
    if (Array.isArray(req.body.modulos)) salvarPermissoes(id, d.modulos);
    if (!ativo) st.encerrarSessoes.run(id);
    seg.auditar(req, 'usuario_editado', null, { id, email: d.email, papel: d.papel, ativo, modulos: Array.isArray(req.body.modulos) ? d.modulos : undefined });
    res.json({ ok: true });
  });

  r.post('/api/admin/usuarios/:id/senha', json, (req, res) => {
    const id = Number(req.params.id);
    if (!st.usuario.get(id)) return erro(res, 404, 'Usuário não encontrado.');
    let senha = req.body && req.body.senha ? String(req.body.senha) : '';
    if (senha) { const e = validarNovaSenha(senha); if (e) return erro(res, 400, e); } else senha = senhaAleatoria();
    st.senhaUsuario.run(hashSenha(senha), id);
    st.encerrarSessoes.run(id);
    seg.auditar(req, 'senha_redefinida', null, { id });
    res.json({ senha_temporaria: senha });
  });

  /* ===================== setores ===================== */
  r.get('/api/admin/setores', (req, res) => res.json({ setores: st.setores.all() }));

  r.post('/api/admin/setores', json, (req, res) => {
    const nome = String((req.body && req.body.nome) || '').trim();
    if (!nome || nome.length > 80) return erro(res, 400, 'Informe o nome do setor.');
    try {
      const id = st.criarSetor.run(nome, Number(req.body.ordem) || 0).lastInsertRowid;
      seg.auditar(req, 'setor_criado', null, { id, nome });
      res.status(201).json({ id });
    } catch { erro(res, 409, 'Já existe um setor com este nome.'); }
  });

  r.patch('/api/admin/setores/:id', json, (req, res) => {
    const nome = String((req.body && req.body.nome) || '').trim();
    if (!nome) return erro(res, 400, 'Informe o nome do setor.');
    try {
      st.editarSetor.run(nome, Number(req.body.ordem) || 0, Number(req.params.id));
      seg.auditar(req, 'setor_editado', null, { id: Number(req.params.id), nome });
      res.json({ ok: true });
    } catch { erro(res, 409, 'Já existe um setor com este nome.'); }
  });

  r.delete('/api/admin/setores/:id', (req, res) => {
    st.apagarSetor.run(Number(req.params.id));
    seg.auditar(req, 'setor_removido', null, { id: Number(req.params.id) });
    res.json({ ok: true });
  });

  /* ===================== módulos ===================== */
  r.get('/api/admin/modulos', (req, res) => {
    res.json({
      modulos: modulos.listar().map((m) => ({
        ...m,
        usuarios: st.permissoesModulo.all(m.slug).map((x) => x.usuario_id),
        dados_registros: m.adaptador ? registros.resumo(m.slug) : [],
        dados_armazenamento: st.armazenamentoResumo.all(m.slug),
        google_url_detectada: m.adaptador ? urlPlanilhaDoHtml(m) : null,
      })),
      icones: ICONES,
    });
  });

  r.post('/api/admin/modulos', json, (req, res) => {
    const b = req.body || {};
    const slug = String(b.slug || '').trim().toLowerCase();
    if (!SLUG_RE.test(slug)) return erro(res, 400, 'Identificador inválido: use letras minúsculas, números e hífen (ex.: juridico-contratos).');
    const nome = String(b.nome || '').trim();
    if (!nome) return erro(res, 400, 'Informe o nome do módulo.');
    if (modulos.obter(slug)) return erro(res, 409, 'Já existe um módulo com este identificador.');
    const arm = ['navegador', 'usuario', 'compartilhado'].includes(b.armazenamento) ? b.armazenamento : 'compartilhado';
    st.criarModulo.run(slug, nome, String(b.descricao || ''), b.setor_id ? Number(b.setor_id) : null,
      ICONES.includes(b.icone) ? b.icone : 'app', Number(b.ordem) || 0, arm, '{}');
    seg.auditar(req, 'modulo_criado', slug, { nome });
    res.status(201).json({ slug });
  });

  r.patch('/api/admin/modulos/:slug', json, (req, res) => {
    const m = modulos.obter(req.params.slug);
    if (!m) return erro(res, 404, 'Módulo não encontrado.');
    const b = { ...m, ...req.body };
    const nome = String(b.nome || '').trim();
    if (!nome) return erro(res, 400, 'Informe o nome do módulo.');
    const arm = ['navegador', 'usuario', 'compartilhado'].includes(b.armazenamento) ? b.armazenamento : m.armazenamento;
    const fonte = m.adaptador && ['google', 'interno'].includes(b.fonte_dados) ? b.fonte_dados : m.fonte_dados;
    const config = { ...m.config };
    if (Array.isArray(req.body.chaves_locais)) config.chaves_locais = req.body.chaves_locais.map(String).filter(Boolean).slice(0, 30);
    if (typeof req.body.google_url === 'string') config.google_url = req.body.google_url.trim();
    st.editarModulo.run(nome, String(b.descricao || ''), b.setor_id ? Number(b.setor_id) : null, ICONES.includes(b.icone) ? b.icone : m.icone,
      Number(b.ordem) || 0, b.ativo ? 1 : 0, arm, fonte, JSON.stringify(config), m.slug);
    if (Array.isArray(req.body.usuarios)) {
      db.transaction(() => {
        db.prepare('DELETE FROM permissoes WHERE modulo_slug = ?').run(m.slug);
        for (const id of req.body.usuarios) st.darPermissao.run(Number(id), m.slug);
      })();
    }
    seg.auditar(req, 'modulo_editado', m.slug, {
      nome, armazenamento: arm, fonte_dados: fonte, ativo: !!b.ativo,
      ...(arm !== m.armazenamento ? { armazenamento_anterior: m.armazenamento } : {}),
      ...(fonte !== m.fonte_dados ? { fonte_anterior: m.fonte_dados } : {}),
    });
    res.json({ ok: true });
  });

  r.delete('/api/admin/modulos/:slug', (req, res) => {
    const m = modulos.obter(req.params.slug);
    if (!m) return erro(res, 404, 'Módulo não encontrado.');
    if (String(req.query.confirmar) !== m.slug) return erro(res, 400, 'Confirme digitando o identificador do módulo.');
    st.apagarModulo.run(m.slug);
    modulos.removerArquivos(m.slug);
    seg.auditar(req, 'modulo_removido', m.slug, { nome: m.nome });
    res.json({ ok: true });
  });

  /* envio do HTML (corpo bruto) */
  r.put('/api/admin/modulos/:slug/arquivo', express.raw({ type: () => true, limit: `${cfg.limiteHtmlMb}mb` }), (req, res) => {
    const m = modulos.obter(req.params.slug);
    if (!m) return erro(res, 404, 'Módulo não encontrado.');
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const problema = modulos.validarHtml(buf);
    if (problema) return erro(res, 400, problema);
    const nomeOriginal = req.headers['x-nome-arquivo'] ? decodeURIComponent(String(req.headers['x-nome-arquivo'])) : null;
    const reconhecido = modulos.reconhecer(buf);
    const id = modulos.salvarVersao(m.slug, buf, nomeOriginal, req.usuario.id);
    seg.auditar(req, 'arquivo_enviado', m.slug, { versao: id, nome: nomeOriginal, bytes: buf.length });
    // aviso se o arquivo parece ser de outra ferramenta
    const aviso = reconhecido && reconhecido !== m.slug ? `Atenção: este arquivo parece ser da ferramenta "${modulos.obter(reconhecido).nome}".` : null;
    const m2 = modulos.obter(m.slug);
    let avisoPatch = null;
    if (m2.adaptador) {
      const html = modulos.lerHtml(m2);
      const faltando = (m2.config.patches_interno || []).filter((p) => (p.tipo === 'regex' ? !new RegExp(p.busca).test(html) : !html.includes(p.busca)));
      if (faltando.length) avisoPatch = 'Este HTML não tem os pontos de ligação esperados: o banco interno não poderá ser usado com esta versão.';
    }
    res.json({ ok: true, versao: id, aviso, aviso_banco: avisoPatch });
  });

  /* envio em lote: reconhece cada HTML pelo título */
  r.post('/api/admin/modulos/reconhecer', express.raw({ type: () => true, limit: `${cfg.limiteHtmlMb}mb` }), (req, res) => {
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const problema = modulos.validarHtml(buf);
    if (problema) return erro(res, 400, problema);
    res.json({ slug: modulos.reconhecer(buf) });
  });

  r.get('/api/admin/modulos/:slug/versoes', (req, res) => res.json({ versoes: modulos.listarVersoes(req.params.slug) }));

  r.post('/api/admin/modulos/:slug/versoes/:id/usar', (req, res) => {
    if (!modulos.restaurarVersao(req.params.slug, Number(req.params.id))) return erro(res, 404, 'Versão não encontrada.');
    seg.auditar(req, 'versao_restaurada', req.params.slug, { versao: Number(req.params.id) });
    res.json({ ok: true });
  });

  /* ===================== dados dos módulos ===================== */
  function colecoesDoModulo(m) {
    const nomes = new Set(Object.keys(m.config.colecoes || {}));
    for (const x of registros.resumo(m.slug)) nomes.add(x.colecao);
    return [...nomes];
  }

  r.get('/api/admin/modulos/:slug/dados', (req, res) => {
    const m = modulos.obter(req.params.slug);
    if (!m) return erro(res, 404, 'Módulo não encontrado.');
    const saida = { modulo: m.slug, nome: m.nome, exportado_em: new Date().toISOString(), colecoes: {}, armazenamento: st.armazenamentoTudo.all(m.slug) };
    for (const c of colecoesDoModulo(m)) {
      const cab = modulos.cabecalhoDoHtml(m, (m.config.colecoes || {})[c]) || registros.cabecalho(m.slug, c);
      saida.colecoes[c] = { cabecalho: cab, registros: registros.listar(m.slug, c) };
    }
    seg.auditar(req, 'dados_exportados', m.slug, null);
    res.set('Content-Disposition', `attachment; filename="myblue-${m.slug}-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(saida);
  });

  r.get('/api/admin/modulos/:slug/dados/:colecao.csv', (req, res) => {
    const m = modulos.obter(req.params.slug);
    if (!m || !m.adaptador) return erro(res, 404, 'Módulo sem planilha interna.');
    const c = req.params.colecao;
    const linhas = registros.listar(m.slug, c);
    let cab, matriz;
    if (m.adaptador === 'gas-linhas') {
      cab = modulos.cabecalhoDoHtml(m, (m.config.colecoes || {})[c]) || registros.cabecalho(m.slug, c) || [];
      matriz = linhas;
    } else {
      const ks = new Set();
      linhas.forEach((o) => Object.keys(o).forEach((k) => ks.add(k)));
      cab = [...ks];
      matriz = linhas.map((o) => cab.map((k) => o[k]));
    }
    const cel = (v) => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = '﻿' + [cab, ...matriz].map((l) => l.map(cel).join(';')).join('\r\n');
    res.set('Content-Disposition', `attachment; filename="myblue-${m.slug}-${c}.csv"`);
    res.type('text/csv').send(csv);
  });

  /* importa os dados lidos da planilha Google (o navegador do admin lê a planilha e envia para cá) */
  r.post('/api/admin/modulos/:slug/importar', express.json({ limit: `${cfg.limiteDadosMb}mb` }), (req, res) => {
    const m = modulos.obter(req.params.slug);
    if (!m || !m.adaptador) return erro(res, 404, 'Módulo sem planilha interna.');
    const colecao = String((req.body && req.body.colecao) || '');
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(colecao)) return erro(res, 400, 'Coleção inválida.');
    const dados = req.body.dados;
    if (!Array.isArray(dados)) return erro(res, 400, 'Dados inválidos.');
    let itens;
    if (m.adaptador === 'gas-linhas') {
      if (!dados.every(Array.isArray)) return erro(res, 400, 'Esperava linhas da planilha.');
      const [cab, ...rows] = dados;
      if (cab) registros.salvarCabecalho(m.slug, colecao, cab);
      const vistos = new Set();
      itens = [];
      rows.forEach((row, i) => {
        if (!row.some((v) => v !== '' && v != null)) return;
        let id = row[0] != null && String(row[0]).trim() !== '' ? String(row[0]) : `sheet-${i + 1}`;
        if (vistos.has(id)) return; // mantém a primeira ocorrência (mesma regra do "remover duplicados")
        vistos.add(id);
        itens.push({ id, dados: row });
      });
    } else {
      itens = [];
      const vistos = new Set();
      for (const o of dados) {
        if (!o || typeof o !== 'object') continue;
        const id = o.id != null && o.id !== '' ? o.id : o.key;
        if (id == null || id === '' || vistos.has(String(id))) continue;
        vistos.add(String(id));
        itens.push({ id, dados: o });
      }
    }
    registros.substituirTudo(m.slug, colecao, itens, req.usuario.id);
    seg.auditar(req, 'dados_importados', m.slug, { colecao, total: itens.length, origem: 'google' });
    res.json({ ok: true, total: itens.length });
  });

  /* ===================== auditoria ===================== */
  r.get('/api/admin/auditoria', (req, res) => {
    const where = [];
    const args = [];
    if (req.query.usuario) { where.push('usuario_id = ?'); args.push(Number(req.query.usuario)); }
    if (req.query.modulo) { where.push('modulo_slug = ?'); args.push(String(req.query.modulo)); }
    if (req.query.acao) { where.push('acao LIKE ?'); args.push(String(req.query.acao) + '%'); }
    if (req.query.ocultar_aberturas === '1') where.push("acao NOT IN ('modulo_aberto','dados_gravados')");
    const limite = Math.min(Number(req.query.limite) || 100, 500);
    const pagina = Math.max(Number(req.query.pagina) || 0, 0);
    const sql = `SELECT id, quando, usuario_email, acao, modulo_slug, detalhe, ip FROM auditoria ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ? OFFSET ?`;
    const eventos = db.prepare(sql).all(...args, limite, pagina * limite).map((e) => ({ ...e, detalhe: e.detalhe ? JSON.parse(e.detalhe) : null }));
    res.json({ eventos });
  });

  /* ===================== backup do banco ===================== */
  r.get('/api/admin/backup', async (req, res) => {
    const nome = `myblue-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`;
    const destino = path.join(cfg.dataDir, nome);
    try {
      await db.backup(destino);
      seg.auditar(req, 'backup_baixado', null, null);
      res.download(destino, nome, () => fs.unlink(destino, () => {}));
    } catch (e) {
      console.error('[backup]', e);
      erro(res, 500, 'Não foi possível gerar o backup.');
    }
  });

  return r;
}

module.exports = { rotasAdmin, ICONES };
