'use strict';
const express = require('express');
const zlib = require('zlib');
const { hashSenha, validarNovaSenha, senhaAleatoria } = require('../seguranca');
const { SLUG_RE } = require('../modulos');
const { criarZip } = require('../zip');
const { MODULO: MODULO_BOLETOS } = require('../boletos-carteira');
const { gerarBackup } = require('../backup');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ICONES = ['app', 'calculadora', 'grafico', 'aperto', 'caixa', 'carteira', 'documento', 'pessoas', 'ticket', 'casa', 'calendario', 'escudo'];
const ehDuplicado = (e) => e && (e.code === '23505' || /duplicate key|unique/i.test(String(e.message)));

function rotasAdmin({ db, seg, modulos, registros, documentos, acessos, regras, boletosCarteira, avisos, cfg }) {
  const ehDocs = (m) => m && m.adaptador === 'claude-db';
  const r = express.Router();
  const json = express.json({ limit: '2mb' });
  const gestorDeSetor = (u) => seg.GESTORES_DE_SETOR.includes(u.papel);

  // Coordenador e supervisor gerenciam o(s) setor(es) do cadastro deles: usuários, ferramentas (HTML, quem abre e com
  // qual papel, inclusive pessoas de outros setores; ferramenta nova aguarda a aprovação da administração), equipe e
  // tipos de demanda (rotas da Central de Tickets). O resto da administração é só do administrador.
  const FERRAMENTA_SETOR = /^\/modulos\/([a-z0-9][a-z0-9-]{1,40})\/(arquivo|versoes|versoes\/\d+\/usar|versoes\/\d+\/arquivo|acesso|carteira)$/;
  const metodosDe = (acao) => (acao === 'arquivo' ? ['PUT'] : acao === 'acesso' ? ['GET', 'PUT'] : acao === 'carteira' ? ['GET', 'POST'] : acao === 'versoes' || acao.endsWith('/arquivo') ? ['GET'] : ['POST']);
  r.use('/api/admin', seg.exigirLogin, async (req, res, next) => {
    try {
      if (req.usuario.papel === 'admin') return next();
      if (!gestorDeSetor(req.usuario)) return seg.exigirAdmin(req, res, next);
      req.setoresGeridos = await seg.setoresGeridos(req.usuario);
      if (/^\/usuarios(\/|$)/.test(req.path)) return next();
      if (/^\/(equipes|categorias)(\/|$)/.test(req.path) && req.path !== '/equipes/email-teste') return next(); // o escopo é conferido lá
      if (req.path === '/modulos' && (req.method === 'GET' || req.method === 'POST')) return next(); // o setor da ferramenta nova é conferido lá
      if (/^\/carteira\/acessos(\/|$)/.test(req.path)) return next(); // cada permissão é conferida lá
      const x = FERRAMENTA_SETOR.exec(req.path);
      if (x && metodosDe(x[2]).includes(req.method)) {
        const m = await modulos.obter(x[1]);
        if (m && m.setor_id && req.setoresGeridos.has(m.setor_id)) { req.moduloSetor = m; return next(); }
        return erro(res, 403, 'Esta ferramenta não é de um setor seu.');
      }
      return seg.exigirAdmin(req, res, next);
    } catch (e) { return next(e); }
  });

  const erro = (res, status, msg) => res.status(status).json({ erro: msg });

  /* link do Apps Script que veio embutido no HTML original (ajuda na importação) */
  async function urlPlanilhaDoHtml(m) {
    try {
      const html = await modulos.lerHtml(m);
      const r2 = html && /SHEET_URL_BUILTIN\s*=\s*\\?["'](https:\/\/script\.google\.com\/[^"'\\]+)\\?["']/.exec(html);
      return r2 ? r2[1] : null;
    } catch { return null; }
  }

  /* ===================== usuários ===================== */
  const PAPEIS = ['admin', 'coordenador', 'supervisor', 'usuario'];

  /* O que quem está logado pode fazer com usuários. Administrador: tudo (null).
     Coordenador e supervisor: usuários comuns dos setores dele (ou que ele criou), com as ferramentas e os setores dele. */
  const GERENCIAVEIS = `SELECT u.id FROM usuarios u WHERE u.papel = 'usuario' AND (u.criado_por = $1 OR EXISTS (
    SELECT 1 FROM setor_membros b WHERE b.usuario_id = u.id AND b.setor_id = ANY($2::int[])))`;
  async function escopoDe(req) {
    if (req.usuario.papel === 'admin') return null;
    const setores = req.setoresGeridos || await seg.setoresGeridos(req.usuario);
    const lista = [...setores];
    const mods = new Set((await modulos.listar()).filter((m) => m.setor_id && setores.has(m.setor_id)).map((m) => m.slug));
    const ids = new Set((await db.q(GERENCIAVEIS, [req.usuario.id, lista])).rows.map((x) => x.id));
    return { setores, modulos: mods, gerencia: (id) => ids.has(Number(id)), ids };
  }

  const setoresDosUsuarios = async () => {
    const m = {};
    for (const x of (await db.q('SELECT usuario_id, setor_id FROM setor_membros ORDER BY setor_id')).rows) (m[x.usuario_id] ||= []).push(x.setor_id);
    return m;
  };

  r.get('/api/admin/usuarios', async (req, res) => {
    const esc = await escopoDe(req);
    const perms = {};
    for (const p of (await db.q('SELECT usuario_id, modulo_slug FROM permissoes')).rows) (perms[p.usuario_id] ||= []).push(p.modulo_slug);
    const setoresU = await setoresDosUsuarios();
    let { rows } = await db.q('SELECT id, nome, email, papel, ativo, trocar_senha, supervisor_tickets, editor_links, criado_em, ultimo_login, foto_em FROM usuarios ORDER BY ativo DESC, nome');
    if (esc) rows = rows.filter((u) => esc.gerencia(u.id));
    const todosSetores = (await db.q('SELECT id, nome, ordem FROM setores ORDER BY ordem, nome')).rows;
    const saida = {
      usuarios: rows.map(({ foto_em, ...u }) => ({ ...u, foto_v: foto_em ? new Date(foto_em).getTime() : null, modulos: perms[u.id] || [], setores: setoresU[u.id] || [] })),
      setores: esc ? todosSetores.filter((x) => esc.setores.has(x.id)) : todosSetores,
    };
    if (esc) {
      // coordenador e supervisor não abrem Módulos e dados: recebem aqui só as ferramentas dos setores deles
      const todos = await modulos.listar();
      saida.modulos_disponiveis = todos.filter((m) => esc.modulos.has(m.slug))
        .map((m) => ({ slug: m.slug, nome: m.nome, ativo: m.ativo, setor_nome: m.setor_nome, setor_ordem: m.setor_ordem }));
      saida.nomes_modulos = Object.fromEntries(todos.map((m) => [m.slug, m.nome]));
      saida.nomes_setores = Object.fromEntries(todosSetores.map((x) => [x.id, x.nome]));
    }
    res.json(saida);
  });

  async function dadosUsuario(body) {
    const nome = String(body.nome || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const papel = PAPEIS.includes(body.papel) ? body.papel : 'usuario';
    if (!nome || nome.length > 120) return { erro: 'Informe o nome (até 120 caracteres).' };
    if (!EMAIL_RE.test(email) || email.length > 200) return { erro: 'E-mail inválido.' };
    const lista = Array.isArray(body.modulos) ? body.modulos.map(String) : [];
    const existentes = new Set((await db.q('SELECT slug FROM modulos')).rows.map((m) => m.slug));
    const setoresValidos = new Set((await db.q('SELECT id FROM setores')).rows.map((x) => x.id));
    const setores = Array.isArray(body.setores) ? [...new Set(body.setores.map(Number))].filter((x) => setoresValidos.has(x)) : null;
    if (setores && ['coordenador', 'supervisor'].includes(papel) && !setores.length) return { erro: 'Escolha o setor que esta pessoa coordena ou supervisiona.' };
    return { nome, email, papel, supervisor_tickets: !!body.supervisor_tickets, editor_links: !!body.editor_links, modulos: lista.filter((s) => existentes.has(s)), setores };
  }

  // quem continua liberado numa ferramenta mantém o "só consulta" e os papéis que tinha nela
  const salvarPermissoes = (id, lista) => db.tx(async (t) => {
    await t.q('DELETE FROM permissoes WHERE usuario_id = $1 AND NOT (modulo_slug = ANY($2::text[]))', [id, lista]);
    for (const s of lista) await t.q('INSERT INTO permissoes (usuario_id, modulo_slug) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, s]);
  });

  /* setores da pessoa (= equipes da Central de Tickets); quem continua no setor mantém a marcação de líder */
  const salvarSetores = (id, lista) => db.tx(async (t) => {
    await t.q('DELETE FROM setor_membros WHERE usuario_id = $1 AND NOT (setor_id = ANY($2::int[]))', [id, lista]);
    for (const s of lista) await t.q('INSERT INTO setor_membros (setor_id, usuario_id, lider) VALUES ($1, $2, FALSE) ON CONFLICT DO NOTHING', [s, id]);
  });

  r.post('/api/admin/usuarios', json, async (req, res) => {
    const esc = await escopoDe(req);
    const d = await dadosUsuario(req.body || {});
    if (d.erro) return erro(res, 400, d.erro);
    if (esc) {
      // coordenador e supervisor criam só usuário comum, sem permissões extras, nos setores e com as ferramentas deles
      if (d.papel !== 'usuario') return erro(res, 403, 'Coordenador e supervisor criam apenas usuários comuns. Coordenadores, supervisores e administradores são criados pela administração.');
      const setores = (d.setores || []).filter((x) => esc.setores.has(x));
      if (!setores.length) return erro(res, 400, 'Escolha o setor da pessoa.');
      Object.assign(d, { supervisor_tickets: false, editor_links: false, setores, modulos: d.modulos.filter((s) => esc.modulos.has(s)) });
    }
    let senha = req.body.senha ? String(req.body.senha) : '';
    if (senha) { const e = validarNovaSenha(senha); if (e) return erro(res, 400, e); } else senha = senhaAleatoria();
    let id;
    try {
      id = (await db.um("INSERT INTO usuarios (nome, email, senha_hash, papel, trocar_senha, supervisor_tickets, editor_links, criado_por) VALUES ($1, $2, $3, $4, TRUE, $5, $6, $7) RETURNING id",
        [d.nome, d.email, hashSenha(senha), d.papel, d.supervisor_tickets, d.editor_links, req.usuario.id])).id;
    } catch (e) {
      if (ehDuplicado(e)) return erro(res, 409, 'Já existe um usuário com este e-mail.');
      throw e;
    }
    await salvarPermissoes(id, d.modulos);
    if (d.setores) await salvarSetores(id, d.setores);
    await seg.auditar(req, 'usuario_criado', null, { id, email: d.email, papel: d.papel, supervisor_tickets: d.supervisor_tickets, editor_links: d.editor_links, modulos: d.modulos, setores: d.setores || [] });
    res.status(201).json({ id, senha_temporaria: senha });
  });

  r.patch('/api/admin/usuarios/:id', json, async (req, res) => {
    const id = Number(req.params.id);
    const esc = await escopoDe(req);
    if (esc && !esc.gerencia(id)) return erro(res, 404, 'Usuário não encontrado.');
    const atual = await db.um('SELECT id, nome, email, papel, ativo, supervisor_tickets, editor_links FROM usuarios WHERE id = $1', [id]);
    if (!atual) return erro(res, 404, 'Usuário não encontrado.');
    const pedido = { ...req.body };
    if (esc) {
      // não muda perfil nem permissões extras; nas ferramentas e nos setores, só mexe nos dele (o resto continua como está)
      for (const k of ['papel', 'supervisor_tickets', 'editor_links']) delete pedido[k];
      if (Array.isArray(pedido.modulos)) {
        const atuais = (await db.q('SELECT modulo_slug FROM permissoes WHERE usuario_id = $1', [id])).rows.map((x) => x.modulo_slug);
        pedido.modulos = [...atuais.filter((s) => !esc.modulos.has(s)), ...pedido.modulos.map(String).filter((s) => esc.modulos.has(s))];
      }
      if (Array.isArray(pedido.setores)) {
        const atuais = (await db.q('SELECT setor_id FROM setor_membros WHERE usuario_id = $1', [id])).rows.map((x) => x.setor_id);
        pedido.setores = [...atuais.filter((x) => !esc.setores.has(x)), ...pedido.setores.map(Number).filter((x) => esc.setores.has(x))];
      }
    }
    const d = await dadosUsuario({ ...atual, ...pedido });
    if (d.erro) return erro(res, 400, d.erro);
    const ativo = req.body.ativo === undefined ? !!atual.ativo : !!req.body.ativo;
    if (atual.papel === 'admin' && (d.papel !== 'admin' || !ativo)) {
      const outros = await db.um("SELECT COUNT(*)::int AS n FROM usuarios WHERE papel = 'admin' AND ativo AND id <> $1", [id]);
      if (outros.n === 0) return erro(res, 400, 'Não é possível remover o último administrador ativo.');
    }
    try {
      await db.q('UPDATE usuarios SET nome = $1, email = $2, papel = $3, ativo = $4, supervisor_tickets = $5, editor_links = $6, atualizado_em = now() WHERE id = $7', [d.nome, d.email, d.papel, ativo, d.supervisor_tickets, d.editor_links, id]);
    } catch (e) {
      if (ehDuplicado(e)) return erro(res, 409, 'Já existe um usuário com este e-mail.');
      throw e;
    }
    if (Array.isArray(pedido.modulos)) await salvarPermissoes(id, d.modulos);
    if (d.setores) await salvarSetores(id, d.setores);
    if (!ativo) await db.q('DELETE FROM sessoes WHERE usuario_id = $1', [id]);
    await seg.auditar(req, 'usuario_editado', null, { id, email: d.email, papel: d.papel, ativo, supervisor_tickets: d.supervisor_tickets, editor_links: d.editor_links,
      modulos: Array.isArray(pedido.modulos) ? d.modulos : undefined, setores: d.setores || undefined });
    res.json({ ok: true });
  });

  async function acessosForaDoEscopo(id, esc) {
    const u = await db.um('SELECT supervisor_tickets, editor_links FROM usuarios WHERE id = $1', [id]);
    const motivos = [];
    if (u.supervisor_tickets) motivos.push('vê os tickets de todos os setores');
    if (u.editor_links) motivos.push('edita a Central de Links');
    const setores = (await db.q('SELECT s.id, s.nome FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id WHERE sm.usuario_id = $1', [id])).rows;
    const outros = setores.filter((x) => !esc.setores.has(x.id)).map((x) => x.nome);
    if (outros.length) motivos.push('faz parte de ' + outros.join(', '));
    const mods = (await db.q('SELECT m.slug, m.nome FROM permissoes p JOIN modulos m ON m.slug = p.modulo_slug WHERE p.usuario_id = $1', [id])).rows;
    const deFora = mods.filter((m) => !esc.modulos.has(m.slug)).map((m) => m.nome);
    if (deFora.length) motivos.push('abre ' + deFora.join(', '));
    return motivos;
  }

  r.post('/api/admin/usuarios/:id/senha', json, async (req, res) => {
    const id = Number(req.params.id);
    const esc = await escopoDe(req);
    if ((esc && !esc.gerencia(id)) || !(await db.um('SELECT 1 FROM usuarios WHERE id = $1', [id]))) return erro(res, 404, 'Usuário não encontrado.');
    // quem tem acesso além dos setores de quem pede (outro setor, ferramenta de fora, marcações da administração) só tem
    // a senha redefinida pela administração: com a senha temporária, quem pede entraria com os acessos da pessoa
    const fora = esc ? await acessosForaDoEscopo(id, esc) : [];
    if (fora.length) return erro(res, 403, `Esta pessoa tem acessos fora dos seus setores (${fora.join('; ')}). Peça à administração para redefinir a senha dela.`);
    let senha = req.body && req.body.senha ? String(req.body.senha) : '';
    if (senha) { const e = validarNovaSenha(senha); if (e) return erro(res, 400, e); } else senha = senhaAleatoria();
    await db.q('UPDATE usuarios SET senha_hash = $1, trocar_senha = TRUE, atualizado_em = now() WHERE id = $2', [hashSenha(senha), id]);
    await db.q('DELETE FROM sessoes WHERE usuario_id = $1', [id]);
    await seg.auditar(req, 'senha_redefinida', null, { id });
    res.json({ senha_temporaria: senha });
  });

  /* ===================== setores ===================== */
  r.get('/api/admin/setores', async (req, res) => {
    const { rows } = await db.q(`SELECT s.id, s.nome, s.ordem, (SELECT COUNT(*)::int FROM modulos m WHERE m.setor_id = s.id) AS modulos,
      (SELECT COUNT(*)::int FROM tickets t WHERE t.setor_id = s.id) AS tickets FROM setores s ORDER BY s.ordem, s.nome`);
    res.json({ setores: rows });
  });

  r.post('/api/admin/setores', json, async (req, res) => {
    const nome = String((req.body && req.body.nome) || '').trim();
    if (!nome || nome.length > 80) return erro(res, 400, 'Informe o nome do setor.');
    try {
      const { id } = await db.um('INSERT INTO setores (nome, ordem) VALUES ($1, $2) RETURNING id', [nome, Number(req.body.ordem) || 0]);
      await seg.auditar(req, 'setor_criado', null, { id, nome });
      res.status(201).json({ id });
    } catch (e) {
      if (ehDuplicado(e)) return erro(res, 409, 'Já existe um setor com este nome.');
      throw e;
    }
  });

  r.patch('/api/admin/setores/:id', json, async (req, res) => {
    const nome = String((req.body && req.body.nome) || '').trim();
    if (!nome) return erro(res, 400, 'Informe o nome do setor.');
    try {
      await db.q('UPDATE setores SET nome = $1, ordem = $2 WHERE id = $3', [nome, Number(req.body.ordem) || 0, Number(req.params.id)]);
      await seg.auditar(req, 'setor_editado', null, { id: Number(req.params.id), nome });
      res.json({ ok: true });
    } catch (e) {
      if (ehDuplicado(e)) return erro(res, 409, 'Já existe um setor com este nome.');
      throw e;
    }
  });

  r.delete('/api/admin/setores/:id', async (req, res) => {
    if (await db.um('SELECT 1 FROM tickets WHERE setor_id = $1 LIMIT 1', [Number(req.params.id)])) {
      return erro(res, 409, 'Este setor tem tickets: transfira-os para outro setor antes de remover.');
    }
    await db.q('DELETE FROM setores WHERE id = $1', [Number(req.params.id)]);
    await seg.auditar(req, 'setor_removido', null, { id: Number(req.params.id) });
    res.json({ ok: true });
  });

  /* ===================== módulos ===================== */
  r.get('/api/admin/modulos', async (req, res) => {
    if (req.setoresGeridos) {
      // coordenador e supervisor: só as ferramentas dos setores deles; em "quem pode abrir", só as pessoas que eles gerenciam
      const esc = await escopoDe(req);
      const meus = (await modulos.listar()).filter((m) => m.setor_id && req.setoresGeridos.has(m.setor_id));
      const perms = (await db.q('SELECT usuario_id, modulo_slug FROM permissoes')).rows;
      const setores = (await db.q('SELECT id, nome FROM setores WHERE id = ANY($1::int[]) ORDER BY ordem, nome', [[...req.setoresGeridos]])).rows;
      return res.json({ setores, icones: ICONES, modulos: meus.map((m) => ({ slug: m.slug, nome: m.nome, icone: m.icone, ativo: m.ativo, setor_id: m.setor_id, setor_nome: m.setor_nome, setor_ordem: m.setor_ordem, pendente: m.pendente,
        tem_arquivo: m.tem_arquivo, versao_id: m.versao_id, versao_em: m.versao_em, tamanho: m.tamanho, nome_original: m.nome_original,
        usuarios: perms.filter((p) => p.modulo_slug === m.slug && esc.gerencia(p.usuario_id)).map((p) => p.usuario_id) })) });
    }
    const lista = [];
    for (const m of await modulos.listar()) {
      lista.push({
        ...m,
        usuarios: (await db.q('SELECT usuario_id FROM permissoes WHERE modulo_slug = $1', [m.slug])).rows.map((x) => x.usuario_id),
        dados_registros: ehDocs(m) ? await documentos.resumo(m.slug) : m.adaptador ? await registros.resumo(m.slug) : [],
        dados_armazenamento: (await db.q(`SELECT escopo, COUNT(*)::int AS chaves, SUM(LENGTH(valor))::int AS bytes, MAX(atualizado_em) AS ultima
          FROM armazenamento WHERE modulo_slug = $1 GROUP BY escopo`, [m.slug])).rows,
        google_url_detectada: m.adaptador && !ehDocs(m) ? await urlPlanilhaDoHtml(m) : null,
      });
    }
    res.json({ modulos: lista, icones: ICONES });
  });

  r.post('/api/admin/modulos', json, async (req, res) => {
    const b = req.body || {};
    const slug = String(b.slug || '').trim().toLowerCase();
    if (!SLUG_RE.test(slug)) return erro(res, 400, 'Identificador inválido: use letras minúsculas, números e hífen (ex.: juridico-contratos).');
    const nome = String(b.nome || '').trim();
    if (!nome) return erro(res, 400, 'Informe o nome do módulo.');
    if (await modulos.obter(slug)) return erro(res, 409, 'Já existe um módulo com este identificador.');
    const arm = ['navegador', 'usuario', 'compartilhado'].includes(b.armazenamento) ? b.armazenamento : 'compartilhado';
    // coordenação: só no próprio setor, e a ferramenta fica aguardando a aprovação da administração
    const daCoordenacao = !!req.setoresGeridos;
    const setorId = b.setor_id ? Number(b.setor_id) : null;
    if (daCoordenacao && !(setorId && req.setoresGeridos.has(setorId))) return erro(res, 403, 'Escolha um dos seus setores para a ferramenta nova.');
    await db.q(`INSERT INTO modulos (slug, nome, descricao, setor_id, icone, ordem, armazenamento, config, pendente, criado_por) VALUES ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb, $8, $9)`,
      [slug, nome, String(b.descricao || ''), setorId, ICONES.includes(b.icone) ? b.icone : 'app', Number(b.ordem) || 0, daCoordenacao ? 'compartilhado' : arm, daCoordenacao, req.usuario.id]);
    await seg.auditar(req, 'modulo_criado', slug, { nome, pendente: daCoordenacao });
    if (daCoordenacao && avisos) {
      const admins = (await db.q("SELECT id FROM usuarios WHERE papel = 'admin' AND ativo")).rows.map((x) => x.id);
      await avisos.notificar(admins, { tipo: 'ferramenta_nova', titulo: 'Ferramenta nova aguardando aprovação',
        texto: `${req.usuario.nome} cadastrou "${nome}". Confira o HTML em Módulos e dados e aprove para liberar às pessoas.`, link: '#/admin/modulos', email: true, autor_id: req.usuario.id });
    }
    res.status(201).json({ slug, pendente: daCoordenacao });
  });

  r.patch('/api/admin/modulos/:slug', json, async (req, res) => {
    const m = await modulos.obter(req.params.slug);
    if (!m) return erro(res, 404, 'Módulo não encontrado.');
    const b = { ...m, ...req.body };
    const nome = String(b.nome || '').trim();
    if (!nome) return erro(res, 400, 'Informe o nome do módulo.');
    const arm = ['navegador', 'usuario', 'compartilhado'].includes(b.armazenamento) ? b.armazenamento : m.armazenamento;
    const fonte = m.adaptador && ['google', 'interno'].includes(b.fonte_dados) ? b.fonte_dados : m.fonte_dados;
    const config = { ...m.config };
    // expressões inválidas quebrariam a ponte de armazenamento da ferramenta: ficam de fora
    const expressoes = (l) => l.map(String).map((x) => x.trim()).filter((x) => { try { return x && !!new RegExp(x); } catch (e) { return false; } }).slice(0, 30);
    if (Array.isArray(req.body.chaves_locais)) config.chaves_locais = expressoes(req.body.chaves_locais);
    if (Array.isArray(req.body.chaves_livres)) config.chaves_livres = expressoes(req.body.chaves_livres);
    if (typeof req.body.google_url === 'string') config.google_url = req.body.google_url.trim();
    await db.q(`UPDATE modulos SET nome = $1, descricao = $2, setor_id = $3, icone = $4, ordem = $5, ativo = $6, armazenamento = $7, fonte_dados = $8,
      config = $9::jsonb, atualizado_em = now() WHERE slug = $10`, [nome, String(b.descricao || ''), b.setor_id ? Number(b.setor_id) : null,
      ICONES.includes(b.icone) ? b.icone : m.icone, Number(b.ordem) || 0, !!b.ativo, arm, fonte, JSON.stringify(config), m.slug]);
    if (Array.isArray(req.body.usuarios)) {
      const ids = req.body.usuarios.map(Number).filter(Number.isInteger);
      await db.tx(async (t) => {
        await t.q('DELETE FROM permissoes WHERE modulo_slug = $1 AND NOT (usuario_id = ANY($2::int[]))', [m.slug, ids]);
        for (const id of ids) await t.q('INSERT INTO permissoes (usuario_id, modulo_slug) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, m.slug]);
      });
    }
    await seg.auditar(req, 'modulo_editado', m.slug, {
      nome, armazenamento: arm, fonte_dados: fonte, ativo: !!b.ativo,
      ...(arm !== m.armazenamento ? { armazenamento_anterior: m.armazenamento } : {}),
      ...(fonte !== m.fonte_dados ? { fonte_anterior: m.fonte_dados } : {}),
    });
    res.json({ ok: true });
  });

  r.delete('/api/admin/modulos/:slug', async (req, res) => {
    const m = await modulos.obter(req.params.slug);
    if (!m) return erro(res, 404, 'Módulo não encontrado.');
    if (String(req.query.confirmar) !== m.slug) return erro(res, 400, 'Confirme digitando o identificador do módulo.');
    await db.q('DELETE FROM modulos WHERE slug = $1', [m.slug]); // versões, dados e permissões saem em cascata
    await seg.auditar(req, 'modulo_removido', m.slug, { nome: m.nome });
    res.json({ ok: true });
  });

  /* envio do HTML (corpo bruto) */
  const corpoBruto = express.raw({ type: () => true, limit: `${cfg.limiteHtmlMb}mb` });

  r.put('/api/admin/modulos/:slug/arquivo', corpoBruto, async (req, res) => {
    const m = await modulos.obter(req.params.slug);
    if (!m) return erro(res, 404, 'Módulo não encontrado.');
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const problema = modulos.validarHtml(buf);
    if (problema) return erro(res, 400, problema);
    let nomeOriginal = null;
    try { nomeOriginal = req.headers['x-nome-arquivo'] ? decodeURIComponent(String(req.headers['x-nome-arquivo'])) : null; } catch { /* nome malformado: fica sem */ }
    const reconhecido = await modulos.reconhecer(buf);
    const id = await modulos.salvarVersao(m.slug, buf, nomeOriginal, req.usuario.id);
    await seg.auditar(req, 'arquivo_enviado', m.slug, { versao: id, nome: nomeOriginal, bytes: buf.length });
    // aviso se o arquivo parece ser de outra ferramenta
    const aviso = reconhecido && reconhecido !== m.slug ? `Atenção: este arquivo parece ser da ferramenta "${(await modulos.obter(reconhecido)).nome}".` : null;
    let avisoPatch = null;
    let fonteAutomatica = null;
    if (!m.adaptador && /claude\.use\(\s*["']db["']/.test(buf.toString('utf8'))) {
      // ferramenta feita como artefato do Claude (window.claude.use('db')): os documentos ficam no banco do portal
      await db.q("UPDATE modulos SET adaptador = 'claude-db', fonte_dados = 'interno', atualizado_em = now() WHERE slug = $1", [m.slug]);
      await seg.auditar(req, 'modulo_editado', m.slug, { adaptador: 'claude-db', motivo: 'HTML usa o banco do Claude' });
      fonteAutomatica = 'interno';
    }
    if (m.adaptador && /SHEET_URL_BUILTIN\s*=\s*\\?["']\/api\/gas\//.test(buf.toString('utf8'))) {
      // HTML já ligado ao banco do portal (sem planilha Google): o módulo passa a usar a planilha interna
      if (m.fonte_dados !== 'interno') {
        await db.q("UPDATE modulos SET fonte_dados = 'interno', atualizado_em = now() WHERE slug = $1", [m.slug]);
        await seg.auditar(req, 'modulo_editado', m.slug, { fonte_dados: 'interno', fonte_anterior: m.fonte_dados, motivo: 'HTML sem planilha Google' });
      }
      fonteAutomatica = 'interno';
    }
    if (m.adaptador && !fonteAutomatica) {
      const html = buf.toString('utf8');
      const faltando = (m.config.patches_interno || []).filter((p) => (p.tipo === 'regex' ? !new RegExp(p.busca).test(html) : !html.includes(p.busca)));
      if (faltando.length) avisoPatch = 'Este HTML não tem os pontos de ligação esperados: o banco interno não poderá ser usado com esta versão.';
    }
    res.json({ ok: true, versao: id, aviso, aviso_banco: avisoPatch, fonte_dados: fonteAutomatica });
  });

  /* envio em lote: reconhece cada HTML pelo título */
  r.post('/api/admin/modulos/reconhecer', corpoBruto, async (req, res) => {
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const problema = modulos.validarHtml(buf);
    if (problema) return erro(res, 400, problema);
    res.json({ slug: await modulos.reconhecer(buf) });
  });

  /* Quem abre a ferramenta, se edita ou só consulta e com qual papel. Administração em qualquer ferramenta;
     coordenação e supervisão nas dos setores dela, podendo liberar pessoas de qualquer setor. */
  r.get('/api/admin/modulos/:slug/acesso', async (req, res) => {
    const m = req.moduloSetor || await modulos.obter(req.params.slug);
    if (!m) return erro(res, 404, 'Módulo não encontrado.');
    res.json({ modulo: { slug: m.slug, nome: m.nome, setor_id: m.setor_id, setor_nome: m.setor_nome, pendente: m.pendente }, ...(await acessos.quadro(m)),
      pode_definir_papeis: req.usuario.papel === 'admin' });
  });

  /* Controle de Emissão de Boletos: conferir o cadastro com a carteira de condomínios e aplicar */
  r.get('/api/admin/modulos/:slug/carteira', async (req, res) => {
    if (req.params.slug !== MODULO_BOLETOS) return erro(res, 404, 'Esta ferramenta não usa a carteira.');
    const p = await boletosCarteira.previa();
    if (!p) return erro(res, 404, 'Módulo não encontrado.');
    res.json(p);
  });
  r.post('/api/admin/modulos/:slug/carteira', json, async (req, res) => {
    if (req.params.slug !== MODULO_BOLETOS) return erro(res, 404, 'Esta ferramenta não usa a carteira.');
    const chaves = (req.body || {}).chaves;
    if (!Array.isArray(chaves) || chaves.some((k) => typeof k !== 'string')) return erro(res, 400, 'Informe o que aplicar.');
    const r2 = await boletosCarteira.aplicar({ escolhidas: chaves, usuario: req.usuario });
    await seg.auditar(req, 'boletos_carteira_aplicada', MODULO_BOLETOS, { comp: r2.comp, condominios: r2.aplicadas, escolhidas: chaves.length });
    res.json(r2);
  });

  r.put('/api/admin/modulos/:slug/acesso', json, async (req, res) => {
    const m = req.moduloSetor || await modulos.obter(req.params.slug);
    if (!m) return erro(res, 404, 'Módulo não encontrado.');
    const b = req.body || {};
    let lista = Array.isArray(b.acessos) ? b.acessos : null;
    if (!lista && Array.isArray(b.usuarios)) {
      // formato antigo (só quem abre): mantém o "só consulta" e os papéis de quem já estava liberado
      const atual = new Map((await acessos.quadro(m)).pessoas.map((p) => [p.id, p]));
      lista = b.usuarios.map(Number).map((id) => ({ usuario_id: id, somente_leitura: atual.has(id) && atual.get(id).somente_leitura, papeis: atual.has(id) ? atual.get(id).papeis : [] }));
    }
    if (!lista) return erro(res, 400, 'Lista de pessoas inválida.');
    const r2 = await acessos.salvar(m, lista, req.usuario);
    await seg.auditar(req, 'modulo_acesso', m.slug, { acessos: lista.slice(0, 200).map((a) => ({ id: Number(a.usuario_id), consulta: !!a.somente_leitura, papeis: a.papeis || [] })) });
    res.json({ ok: true, ...r2 });
  });

  /* papéis de uma ferramenta que não é de modelo conhecido (o HTML lê em window.__MYBLUE__.usuario.papeis) */
  r.put('/api/admin/modulos/:slug/papeis', json, async (req, res) => {
    const m = await modulos.obter(req.params.slug);
    if (!m) return erro(res, 404, 'Módulo não encontrado.');
    if (await acessos.modeloDe(m)) return erro(res, 400, 'Os papéis desta ferramenta vêm do próprio HTML e não podem ser mudados aqui.');
    const vistos = new Set();
    const lista = [];
    for (const p of Array.isArray(req.body && req.body.papeis) ? req.body.papeis : []) {
      const id = String((p && p.id) || '').trim().toLowerCase();
      const nome = String((p && p.nome) || '').trim().slice(0, 60);
      if (!acessos.ID_PAPEL_RE.test(id)) return erro(res, 400, `Identificador de papel inválido: "${id}". Use letras minúsculas, números, - ou _.`);
      if (!nome) return erro(res, 400, `Dê um nome ao papel "${id}".`);
      if (vistos.has(id)) continue;
      vistos.add(id);
      lista.push({ id, nome, descricao: String((p && p.descricao) || '').trim().slice(0, 200) });
    }
    if (lista.length > 12) return erro(res, 400, 'No máximo 12 papéis por ferramenta.');
    await db.q("UPDATE modulos SET config = jsonb_set(config, '{papeis}', $2::jsonb), atualizado_em = now() WHERE slug = $1", [m.slug, JSON.stringify(lista)]);
    // quem tinha um papel que deixou de existir perde só esse papel
    await db.q('UPDATE permissoes SET papeis = ARRAY(SELECT x FROM unnest(papeis) x WHERE x = ANY($2::text[])) WHERE modulo_slug = $1', [m.slug, lista.map((p) => p.id)]);
    await seg.auditar(req, 'modulo_papeis', m.slug, { papeis: lista.map((p) => p.id) });
    res.json({ ok: true, papeis: lista });
  });

  /* ===================== Carteira: quem edita o quê ===================== */
  // a administração configura tudo; coordenação e supervisão liberam pessoas nas permissões do setor delas
  r.get('/api/admin/carteira/acessos', async (req, res) => {
    const vigentes = await regras.regras();
    const quem = await regras.quemPode();
    const minhas = await regras.gerenciaveis(req.usuario);
    const admin = req.usuario.papel === 'admin';
    const { rows: pessoas } = await db.q(`SELECT u.id, u.nome, u.papel, COALESCE(array_agg(s.nome ORDER BY s.ordem) FILTER (WHERE s.id IS NOT NULL), '{}') AS setores
      FROM usuarios u LEFT JOIN setor_membros sm ON sm.usuario_id = u.id LEFT JOIN setores s ON s.id = sm.setor_id
      WHERE u.ativo AND u.papel <> 'admin' GROUP BY u.id ORDER BY u.nome`);
    res.json({
      admin,
      niveis: regras.NIVEIS,
      setores: (await db.q('SELECT id, nome FROM setores ORDER BY ordem, nome')).rows,
      pessoas,
      admins: (await db.q("SELECT nome FROM usuarios WHERE ativo AND papel = 'admin' ORDER BY nome")).rows.map((x) => x.nome),
      permissoes: regras.PERMISSOES.filter((p) => p.chave.startsWith('carteira.')).map((p) => ({ chave: p.chave, rotulo: p.rotulo, descricao: p.descricao,
        regra: vigentes.get(p.chave), quem: quem.get(p.chave), pode_configurar: minhas.has(p.chave), pode_mudar_regra: admin })),
    });
  });

  r.put('/api/admin/carteira/acessos/:chave', json, async (req, res) => {
    const p = regras.porChave.get(req.params.chave);
    if (!p) return erro(res, 404, 'Permissão não encontrada.');
    if (!(await regras.gerenciaveis(req.usuario)).has(p.chave)) return erro(res, 403, 'Esta permissão não é do seu setor. Quem configura é a administração.');
    const atual = (await regras.regras()).get(p.chave);
    const b = req.body || {};
    // coordenação e supervisão: só as pessoas liberadas individualmente; níveis e setores ficam com a administração
    const pedido = req.usuario.papel === 'admin' ? { niveis: b.niveis, setores: b.setores, pessoas: b.pessoas } : { niveis: atual.niveis, setores: atual.setores, pessoas: b.pessoas };
    const salva = await regras.salvar(p.chave, pedido, req.usuario);
    await seg.auditar(req, 'regra_acesso', null, { chave: p.chave, ...salva });
    res.json({ ok: true, regra: salva });
  });

  r.delete('/api/admin/carteira/acessos/:chave', async (req, res) => {
    if (req.usuario.papel !== 'admin') return erro(res, 403, 'Só a administração volta a regra para o padrão.');
    if (!regras.porChave.has(req.params.chave)) return erro(res, 404, 'Permissão não encontrada.');
    await regras.voltarAoPadrao(req.params.chave);
    await seg.auditar(req, 'regra_acesso', null, { chave: req.params.chave, padrao: true });
    res.json({ ok: true });
  });

  /* ferramenta nova da coordenação: a administração confere e libera */
  r.post('/api/admin/modulos/:slug/aprovar', async (req, res) => {
    const m = await modulos.obter(req.params.slug);
    if (!m) return erro(res, 404, 'Módulo não encontrado.');
    if (!m.pendente) return erro(res, 400, 'Esta ferramenta não está aguardando aprovação.');
    if (!m.tem_arquivo) return erro(res, 400, 'Esta ferramenta ainda não tem HTML. Peça para enviarem o arquivo antes de aprovar.');
    await db.q('UPDATE modulos SET pendente = FALSE, atualizado_em = now() WHERE slug = $1', [m.slug]);
    await seg.auditar(req, 'modulo_aprovado', m.slug, { nome: m.nome });
    if (avisos) {
      const gestores = await acessos.gestoresDoSetor(m.setor_id);
      await avisos.notificar([m.criado_por, ...gestores], { tipo: 'ferramenta_aprovada', titulo: 'Ferramenta aprovada',
        texto: `"${m.nome}" foi aprovada e já aparece para as pessoas liberadas.`, link: '#/admin/modulos', email: true, autor_id: req.usuario.id });
    }
    res.json({ ok: true });
  });

  r.get('/api/admin/modulos/:slug/versoes', async (req, res) => res.json({ versoes: await modulos.listarVersoes(req.params.slug) }));

  /* todas as ferramentas, na versão em uso, num .zip (para revisar ou corrigir fora do portal) */
  r.get('/api/admin/modulos-em-uso.zip', async (req, res) => {
    if (req.usuario.papel !== 'admin') return erro(res, 403, 'Só a administração baixa todas as ferramentas.');
    const { rows } = await db.q(`SELECT m.slug, m.nome, v.id, v.conteudo, v.nome_original, v.sha256, v.enviado_em
      FROM modulos m JOIN modulo_versoes v ON v.id = m.versao_id ORDER BY m.slug`);
    const arquivos = rows.map((x) => ({ nome: `${x.slug}.html`, dados: Buffer.from(x.conteudo) }));
    arquivos.push({ nome: 'LEIAME.txt', dados: ['Ferramentas do Portal MyBlue — versão em uso de cada uma', `Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, '',
      ...rows.map((x) => `${x.slug}.html — ${x.nome} · versão ${x.id} · enviada em ${new Date(x.enviado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · arquivo original "${x.nome_original || ''}" · sha256 ${x.sha256 || ''}`)].join('\r\n') });
    await seg.auditar(req, 'versoes_exportadas', null, { modulos: rows.map((x) => `${x.slug}#${x.id}`) });
    res.set('Content-Disposition', `attachment; filename="ferramentas-myblue-${new Date().toISOString().slice(0, 10)}.zip"`);
    res.set('Cache-Control', 'no-store');
    res.type('application/zip').send(criarZip(arquivos));
  });

  /* baixa o HTML de uma versão, como foi enviado (cópia de segurança da ferramenta) */
  r.get('/api/admin/modulos/:slug/versoes/:id/arquivo', async (req, res) => {
    const v = await db.um('SELECT conteudo, nome_original FROM modulo_versoes WHERE id = $1 AND modulo_slug = $2', [Number(req.params.id) || 0, req.params.slug]);
    if (!v) return erro(res, 404, 'Versão não encontrada.');
    const nome = String(v.nome_original || `${req.params.slug}-versao-${req.params.id}.html`).replace(/["\\\r\n]/g, '_');
    res.set('Content-Disposition', `attachment; filename="${nome.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nome)}`);
    res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    await seg.auditar(req, 'versao_baixada', req.params.slug, { versao: Number(req.params.id) });
    res.type('application/octet-stream').send(v.conteudo);
  });

  r.post('/api/admin/modulos/:slug/versoes/:id/usar', async (req, res) => {
    if (!(await modulos.restaurarVersao(req.params.slug, Number(req.params.id)))) return erro(res, 404, 'Versão não encontrada.');
    await seg.auditar(req, 'versao_restaurada', req.params.slug, { versao: Number(req.params.id) });
    res.json({ ok: true });
  });

  /* ===================== dados dos módulos ===================== */
  async function colecoesDoModulo(m) {
    const nomes = new Set(Object.keys(m.config.colecoes || {}));
    for (const x of await (ehDocs(m) ? documentos : registros).resumo(m.slug)) nomes.add(x.colecao);
    return [...nomes];
  }
  const cabecalhoDe = async (m, c) => (await modulos.cabecalhoDoHtml(m, (m.config.colecoes || {})[c])) || (await registros.cabecalho(m.slug, c)) || m.config.cabecalho_padrao || null;

  r.get('/api/admin/modulos/:slug/dados', async (req, res) => {
    const m = await modulos.obter(req.params.slug);
    if (!m) return erro(res, 404, 'Módulo não encontrado.');
    const armazenamento = (await db.q('SELECT escopo, chave, valor, atualizado_em FROM armazenamento WHERE modulo_slug = $1 ORDER BY escopo, chave', [m.slug])).rows;
    const saida = { modulo: m.slug, nome: m.nome, exportado_em: new Date().toISOString(), colecoes: {}, armazenamento };
    for (const c of await colecoesDoModulo(m)) {
      saida.colecoes[c] = ehDocs(m) ? { documentos: await documentos.listar(m.slug, c) } : { cabecalho: await cabecalhoDe(m, c), registros: await registros.listar(m.slug, c) };
    }
    await seg.auditar(req, 'dados_exportados', m.slug, null);
    res.set('Content-Disposition', `attachment; filename="myblue-${m.slug}-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(saida);
  });

  r.get('/api/admin/modulos/:slug/dados/:colecao.csv', async (req, res) => {
    const m = await modulos.obter(req.params.slug);
    if (!m || !m.adaptador) return erro(res, 404, 'Módulo sem planilha interna.');
    const c = req.params.colecao;
    const linhas = ehDocs(m) ? await documentos.listar(m.slug, c) : await registros.listar(m.slug, c);
    let cab, matriz;
    if (m.adaptador !== 'gas-objetos' && !ehDocs(m)) {
      cab = (await cabecalhoDe(m, c)) || [];
      matriz = linhas;
    } else {
      const ks = new Set();
      linhas.forEach((o) => Object.keys(o).forEach((k) => ks.add(k)));
      cab = [...ks];
      matriz = linhas.map((o) => cab.map((k) => o[k]));
    }
    // texto que começa com = + - @ vira fórmula no Excel: ganha um apóstrofo na frente (números negativos ficam como estão)
    const cel = (v) => {
      let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d[\d.,]*$/.test(s)) s = "'" + s;
      return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = '﻿' + [cab, ...matriz].map((l) => l.map(cel).join(';')).join('\r\n');
    res.set('Content-Disposition', `attachment; filename="myblue-${m.slug}-${c}.csv"`);
    res.type('text/csv').send(csv);
  });

  /* importa os documentos de uma ferramenta do Claude (arquivo { documentos: { "colecao/id": {...} } }) */
  r.post('/api/admin/modulos/:slug/documentos', express.json({ limit: `${cfg.limiteDadosMb}mb` }), async (req, res) => {
    const m = await modulos.obter(req.params.slug);
    if (!ehDocs(m)) return erro(res, 404, 'Este módulo não usa o banco de documentos.');
    const b = req.body || {};
    if (b.modulo && b.modulo !== m.slug) return erro(res, 400, `Este arquivo é do módulo "${b.modulo}", não de "${m.slug}".`);
    try {
      const r2 = await documentos.substituirTudo(m.slug, b.documentos, req.usuario.id);
      await seg.auditar(req, 'documentos_importados', m.slug, { total: r2.total, origem: b.origem || null });
      res.json({ ok: true, total: r2.total });
    } catch (e) {
      if (e && e.status) return erro(res, e.status, e.message);
      throw e;
    }
  });

  /* importa os dados lidos da planilha Google (o navegador do admin lê a planilha e envia para cá) */
  r.post('/api/admin/modulos/:slug/importar', express.json({ limit: `${cfg.limiteDadosMb}mb` }), async (req, res) => {
    const m = await modulos.obter(req.params.slug);
    if (!m || !m.adaptador || ehDocs(m)) return erro(res, 404, 'Módulo sem planilha interna.');
    const colecao = String((req.body && req.body.colecao) || '');
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(colecao)) return erro(res, 400, 'Coleção inválida.');
    const dados = req.body.dados;
    if (!Array.isArray(dados)) return erro(res, 400, 'Dados inválidos.');
    const itens = [];
    const vistos = new Set();
    if (m.adaptador !== 'gas-objetos') {
      if (!dados.every(Array.isArray)) return erro(res, 400, 'Esperava linhas da planilha.');
      const [cab, ...rows] = dados;
      if (cab) await registros.salvarCabecalho(m.slug, colecao, cab);
      rows.forEach((row, i) => {
        if (!row.some((v) => v !== '' && v != null)) return;
        // planilha posicional: sem coluna de ID (o nº do pedido se repete nas parcelas), mantém todas as linhas na ordem
        if (m.adaptador === 'gas-posicional') { itens.push({ id: `sheet-${String(i + 1).padStart(6, '0')}`, dados: row }); return; }
        const id = row[0] != null && String(row[0]).trim() !== '' ? String(row[0]) : `sheet-${i + 1}`;
        if (vistos.has(id)) return; // mantém a primeira ocorrência (mesma regra do "remover duplicados")
        vistos.add(id);
        itens.push({ id, dados: row });
      });
    } else {
      for (const o of dados) {
        if (!o || typeof o !== 'object') continue;
        const id = o.id != null && o.id !== '' ? o.id : o.key;
        if (id == null || id === '' || vistos.has(String(id))) continue;
        vistos.add(String(id));
        itens.push({ id, dados: o });
      }
    }
    await registros.substituirTudo(m.slug, colecao, itens, req.usuario.id);
    await seg.auditar(req, 'dados_importados', m.slug, { colecao, total: itens.length, origem: 'google' });
    res.json({ ok: true, total: itens.length });
  });

  /* ===================== auditoria ===================== */
  r.get('/api/admin/auditoria', async (req, res) => {
    const where = [];
    const args = [];
    const p = (v) => { args.push(v); return '$' + args.length; };
    if (req.query.usuario) where.push('usuario_id = ' + p(Number(req.query.usuario)));
    if (req.query.modulo) where.push('modulo_slug = ' + p(String(req.query.modulo)));
    if (req.query.acao) where.push('acao LIKE ' + p(String(req.query.acao) + '%'));
    if (req.query.ocultar_aberturas === '1') where.push("acao NOT IN ('modulo_aberto','dados_gravados')");
    const limite = Math.min(Number(req.query.limite) || 100, 500);
    const pagina = Math.max(Number(req.query.pagina) || 0, 0);
    const sql = `SELECT id, quando, usuario_email, acao, modulo_slug, detalhe, ip FROM auditoria ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY id DESC LIMIT ${p(limite)} OFFSET ${p(pagina * limite)}`;
    res.json({ eventos: (await db.q(sql, args)).rows });
  });

  /* ===================== backup (todas as tabelas, sai aos pedaços e comprimido) ===================== */
  r.get('/api/admin/backup', async (req, res) => {
    const gz = zlib.createGzip();
    let parou = false;
    res.on('close', () => { if (!res.writableFinished) parou = true; });
    res.set('Content-Type', 'application/gzip');
    res.set('Content-Disposition', `attachment; filename="myblue-backup-${new Date().toISOString().slice(0, 10)}.jsonl.gz"`);
    res.set('Cache-Control', 'no-store');
    gz.pipe(res);
    try {
      const linhas = await gerarBackup(db, gz, { deveParar: () => parou });
      gz.end();
      await seg.auditar(req, 'backup_baixado', null, { linhas });
    } catch (e) {
      if (!parou) console.error('[backup]', e);
      gz.destroy();
      res.destroy();
    }
  });

  return r;
}

module.exports = { rotasAdmin, ICONES };
