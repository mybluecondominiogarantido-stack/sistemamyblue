'use strict';
const crypto = require('crypto');

const COOKIE = 'mb_sessao';
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(senha), sal, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${sal.toString('base64')}$${h.toString('base64')}`;
}

/* Confere a senha sem travar o servidor: o cálculo (proposital, ~50 ms) roda fora da linha principal do Node,
   então tentativas de login em série não deixam o portal lento para quem já está usando. */
function conferirSenha(senha, armazenado) {
  return new Promise((ok) => {
    try {
      const [alg, N, r, p, sal, h] = String(armazenado).split('$');
      if (alg !== 'scrypt') return ok(false);
      const esperado = Buffer.from(h, 'base64');
      crypto.scrypt(String(senha), Buffer.from(sal, 'base64'), esperado.length, { N: +N, r: +r, p: +p }, (e, calc) => {
        ok(!e && calc.length === esperado.length && crypto.timingSafeEqual(esperado, calc));
      });
    } catch {
      ok(false);
    }
  });
}

// hash fixo para gastar o mesmo tempo quando o e-mail não existe (não revela quais e-mails são válidos)
const HASH_FALSO = hashSenha(crypto.randomBytes(12).toString('hex'));

function validarNovaSenha(senha) {
  const s = String(senha || '');
  if (s.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (s.length > 200) return 'Senha longa demais.';
  if (s !== s.trim()) return 'A senha não pode começar nem terminar com espaço.';
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return 'Use letras e números na senha.';
  return null;
}

function senhaAleatoria() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  const bytes = crypto.randomBytes(12);
  for (const b of bytes) s += alfabeto[b % alfabeto.length];
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12) + '7';
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function lerCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const parte of raw.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    const k = parte.slice(0, i).trim();
    try { out[k] = decodeURIComponent(parte.slice(i + 1).trim()); } catch { /* ignora cookie malformado */ }
  }
  return out;
}

/* Endereços pelos quais o portal está sendo acessado. Atrás de proxy (Railway, Nginx),
   o endereço público chega em X-Forwarded-Host. Um site de terceiros não consegue
   forjar esses cabeçalhos no navegador da vítima, então aceitar os dois é seguro. */
function hostsDoPortal(req) {
  const hosts = new Set();
  if (req.headers.host) hosts.add(req.headers.host);
  const fwd = req.headers['x-forwarded-host'];
  if (fwd) String(fwd).split(',').forEach((h) => hosts.add(h.trim()));
  return hosts;
}

/* Supervisão da Central de Tickets (ver e direcionar os tickets de todos os setores): vem com os perfis Coordenador e
   Supervisor; para os demais, é a marcação no cadastro. Decidido aqui, num lugar só. */
const GESTORES_DE_SETOR = ['coordenador', 'supervisor'];
const veTodosOsTickets = (papel, marcado) => !!marcado || GESTORES_DE_SETOR.includes(papel);

function criarSeguranca(db, cfg) {
  const duracaoMs = cfg.sessaoHoras * 3600 * 1000;

  /* Grava no histórico. Nunca derruba a requisição se o histórico falhar. */
  async function auditar(req, acao, modulo, detalhe, usuario) {
    const u = usuario || (req && req.usuario) || null;
    try {
      await db.q('INSERT INTO auditoria (usuario_id, usuario_email, acao, modulo_slug, detalhe, ip) VALUES ($1, $2, $3, $4, $5::jsonb, $6)',
        [u ? u.id : null, u ? u.email : null, acao, modulo || null, detalhe == null ? null : JSON.stringify(detalhe), req ? req.ip : null]);
    } catch (e) {
      console.error('[auditoria]', e.message);
    }
  }

  async function iniciarSessao(req, res, usuario) {
    const token = crypto.randomBytes(32).toString('base64url');
    await db.q('INSERT INTO sessoes (token_hash, usuario_id, expira_em, ip, user_agent) VALUES ($1, $2, $3, $4, $5)',
      [sha256(token), usuario.id, new Date(Date.now() + duracaoMs), req.ip, String(req.headers['user-agent'] || '').slice(0, 300)]);
    res.setHeader('Set-Cookie', montarCookie(req, token, duracaoMs));
  }

  function montarCookie(req, valor, maxAgeMs) {
    const seguro = cfg.cookieSecure || req.secure;
    return `${COOKIE}=${encodeURIComponent(valor)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${seguro ? '; Secure' : ''}`;
  }

  async function encerrarSessao(req, res) {
    const token = lerCookies(req)[COOKIE];
    if (token) await db.q('DELETE FROM sessoes WHERE token_hash = $1', [sha256(token)]);
    res.setHeader('Set-Cookie', montarCookie(req, '', 0));
  }

  /* ---------- chave da ferramenta isolada ----------
     Ferramenta isolada roda numa origem à parte (sandbox): o navegador não manda o cookie do portal para ela.
     Ela fala com o servidor por uma chave no endereço (/t/<chave>/api/… ou /api/gas/<ferramenta>/<chave>), presa
     à sessão de quem abriu (vale enquanto a sessão valer) e a UMA ferramenta: <ferramenta>.<início do hash da sessão>.<assinatura>.
     A assinatura usa o hash inteiro da sessão, que só o servidor conhece, então a ferramenta não fabrica a chave de outra. */
  const CHAVE_RE = '([a-z0-9][a-z0-9-]{1,40})\\.([0-9a-f]{24})\\.([A-Za-z0-9_-]{32})';
  const PREFIXO_CHAVE = new RegExp('^/t/' + CHAVE_RE + '(/.*)$');
  const GAS_COM_CHAVE = new RegExp('^/api/gas/([a-z0-9][a-z0-9-]{1,40})/' + CHAVE_RE + '([?].*)?$');
  const assinar = (hashSessao, slug) => crypto.createHmac('sha256', hashSessao).update('ferramenta:' + slug).digest('base64url').slice(0, 32);

  function chaveFerramenta(req, slug) {
    const token = lerCookies(req)[COOKIE];
    if (!token) return null;
    const th = sha256(token);
    return `${slug}.${th.slice(0, 24)}.${assinar(th, slug)}`;
  }

  async function identificarPorChave(req, slug, inicio, assinatura) {
    const s = await db.um(`SELECT s.token_hash, s.expira_em, u.id, u.nome, u.email, u.papel, u.ativo, u.trocar_senha, u.foto_em, u.supervisor_tickets, u.editor_links
      FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE left(s.token_hash, 24) = $1`, [inicio]);
    if (!s || !s.ativo || new Date(s.expira_em) <= new Date()) return;
    const esperado = Buffer.from(assinar(s.token_hash, slug));
    if (!crypto.timingSafeEqual(esperado, Buffer.from(assinatura.padEnd(esperado.length).slice(0, esperado.length)))) return;
    req.usuario = { id: s.id, nome: s.nome, email: s.email, papel: s.papel, trocar_senha: !!s.trocar_senha, foto_v: s.foto_em ? new Date(s.foto_em).getTime() : null, supervisor_tickets: veTodosOsTickets(s.papel, s.supervisor_tickets), editor_links: !!s.editor_links };
    req.ferramenta = slug;
  }

  /* Identifica o usuário (se houver sessão válida). Renova a sessão quando passou da metade. */
  async function identificar(req, res, next) {
    try {
      // pedido de ferramenta isolada: só a chave vale (cookie, se vier, é ignorado)
      let m = PREFIXO_CHAVE.exec(req.url);
      if (m) {
        req.viaChave = true;
        req.url = m[4];
        await identificarPorChave(req, m[1], m[2], m[3]);
        return next();
      }
      m = GAS_COM_CHAVE.exec(req.url);
      if (m) {
        req.viaChave = true;
        req.url = `/api/gas/${m[1]}${m[5] || ''}`;
        if (m[1] === m[2]) await identificarPorChave(req, m[2], m[3], m[4]);
        return next();
      }
      const token = lerCookies(req)[COOKIE];
      if (token) {
        const th = sha256(token);
        const s = await db.um(`SELECT s.expira_em, u.id, u.nome, u.email, u.papel, u.ativo, u.trocar_senha, u.foto_em, u.supervisor_tickets, u.editor_links
          FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = $1`, [th]);
        if (s && s.ativo && new Date(s.expira_em) > new Date()) {
          if (new Date(s.expira_em) - Date.now() < duracaoMs / 2) {
            await db.q('UPDATE sessoes SET expira_em = $1 WHERE token_hash = $2', [new Date(Date.now() + duracaoMs), th]);
            res.setHeader('Set-Cookie', montarCookie(req, token, duracaoMs));
          }
          req.usuario = { id: s.id, nome: s.nome, email: s.email, papel: s.papel, trocar_senha: !!s.trocar_senha, foto_v: s.foto_em ? new Date(s.foto_em).getTime() : null, supervisor_tickets: veTodosOsTickets(s.papel, s.supervisor_tickets), editor_links: !!s.editor_links };
        } else if (s) {
          await db.q('DELETE FROM sessoes WHERE token_hash = $1', [th]);
        }
      }
      next();
    } catch (e) {
      next(e);
    }
  }

  /* Setores que a pessoa gerencia: o administrador, todos (null); coordenador e supervisor, os setores do cadastro dele;
     os demais, nenhum. O setor de cada pessoa fica em setor_membros (é também a equipe dela na Central de Tickets). */
  async function setoresGeridos(usuario) {
    if (!usuario) return new Set();
    if (usuario.papel === 'admin') return null;
    if (!GESTORES_DE_SETOR.includes(usuario.papel)) return new Set();
    return new Set((await db.q('SELECT setor_id FROM setor_membros WHERE usuario_id = $1', [usuario.id])).rows.map((x) => x.setor_id));
  }

  /* ferramentas que a pessoa abre: as liberadas para ela (de qualquer setor) e, para coordenador e supervisor,
     todas as dos setores dele (inclusive as que aguardam a aprovação da administração) */
  async function modulosDoUsuario(usuario) {
    const { rows } = await db.q(`SELECT p.modulo_slug FROM permissoes p JOIN modulos m ON m.slug = p.modulo_slug WHERE p.usuario_id = $1 AND NOT m.pendente
      UNION SELECT m.slug FROM modulos m JOIN setor_membros sm ON sm.setor_id = m.setor_id
        WHERE sm.usuario_id = $1 AND $2`, [usuario.id, GESTORES_DE_SETOR.includes(usuario.papel)]);
    return new Set(rows.map((r) => r.modulo_slug));
  }

  /* ferramenta desativada: só a administração abre, lê ou grava os dados dela */
  async function podeAcessar(usuario, slug) {
    if (!usuario) return false;
    if (usuario.papel === 'admin') return true;
    if (!(await modulosDoUsuario(usuario)).has(slug)) return false;
    const m = await db.um('SELECT ativo FROM modulos WHERE slug = $1', [slug]);
    return !!(m && m.ativo);
  }

  const exigirLogin = (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ erro: 'Faça login para continuar.' });
    if (req.usuario.trocar_senha && !req.path.startsWith('/api/auth/')) {
      return res.status(403).json({ erro: 'Troque sua senha antes de continuar.', trocar_senha: true });
    }
    next();
  };

  const exigirAdmin = (req, res, next) => {
    if (!req.usuario || req.usuario.papel !== 'admin') return res.status(403).json({ erro: 'Acesso restrito à administração.' });
    next();
  };

  /* O que uma ferramenta isolada pode pedir com a chave dela: os dados dela, a carteira (consulta), abrir ticket com
     anexo (Análise de Espólio), as rotas da Gestão de Premiações (só se a ferramenta for de premiação), fotos e bibliotecas.
     O resto (administração, tickets dos outros, dados de outras ferramentas) fica fechado mesmo para quem é admin. */
  async function permitidoParaFerramenta(req) {
    const s = req.ferramenta;
    const p = req.path;
    const ler = req.method === 'GET' || req.method === 'HEAD';
    if (p === `/api/armazenamento/${s}` || p === `/api/gas/${s}`) return true;
    if (p === `/api/db/${s}` || p === `/api/db/${s}/trava` || p === `/api/db/${s}/pessoas`) return true;
    if (ler && (/^\/api\/carteira(\/\d+)?$/.test(p) || /^\/api\/usuarios\/\d+\/foto$/.test(p) || p.startsWith('/cdn/'))) return true;
    if (req.method === 'POST' && (p === '/api/tickets' || /^\/api\/tickets\/\d+\/anexos$/.test(p))) return true;
    if (p.startsWith('/api/comissao/')) {
      const m = await db.um('SELECT config FROM modulos WHERE slug = $1', [s]);
      return !!(m && m.config && m.config.relatorios_comissao);
    }
    return false;
  }

  /* Pedidos com a chave: respondem a qualquer origem (a ferramenta isolada tem origem "null"); a chave é o que autentica,
     não um cookie, então não há CSRF. Fora do que a ferramenta pode pedir, recusa. */
  async function escopoDaChave(req, res, next) {
    if (!req.viaChave) return next();
    // a ferramenta pode pedir com credentials: 'include'; nem assim o cookie vale aqui (só a chave)
    if (req.headers.origin === 'null') res.set({ 'Access-Control-Allow-Origin': 'null', 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' });
    else res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length');
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE');
      res.set('Access-Control-Allow-Headers', String(req.headers['access-control-request-headers'] || 'Content-Type').slice(0, 300));
      res.set('Access-Control-Max-Age', '600');
      return res.status(204).end();
    }
    try {
      if (!req.usuario) return res.status(401).json({ erro: 'A sessão desta ferramenta terminou. Recarregue a página.', code: 'revoked' });
      if (!(await permitidoParaFerramenta(req))) return res.status(403).json({ erro: 'Esta ferramenta não tem acesso a este recurso do portal.', code: 'permission_denied' });
      next();
    } catch (e) { next(e); }
  }

  /* Bloqueia requisições que alteram dados vindas de outro site (proteção CSRF). */
  function mesmaOrigem(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.viaChave) return next();
    const origem = req.headers.origin;
    if (origem && origem !== 'null') {
      let host;
      try { host = new URL(origem).host; } catch { host = null; }
      if (!hostsDoPortal(req).has(host)) return res.status(403).json({ erro: 'Origem não permitida.' });
    } else if (origem === 'null') {
      return res.status(403).json({ erro: 'Origem não permitida.' });
    }
    next();
  }

  /* Limite de tentativas de login erradas: 8 por IP + e-mail (protege a conta) e 30 por IP (quem testa a mesma senha
     em muitas contas). Fica na memória: zera quando o servidor reinicia. */
  const tentativas = new Map();
  const JANELA = 15 * 60 * 1000;
  const MAX = 8;
  const MAX_IP = 30;
  const chaveIp = (chave) => 'ip:' + String(chave).split('|')[0];
  function contagem(chave) {
    const t = tentativas.get(chave);
    if (!t) return 0;
    if (Date.now() - t.inicio > JANELA) { tentativas.delete(chave); return 0; }
    return t.n;
  }
  const bloqueado = (chave) => contagem(chave) >= MAX || contagem(chaveIp(chave)) >= MAX_IP;
  function registrarFalha(chave) {
    for (const k of [chave, chaveIp(chave)]) {
      const t = tentativas.get(k);
      if (!t || Date.now() - t.inicio > JANELA) tentativas.set(k, { inicio: Date.now(), n: 1 });
      else t.n++;
    }
    // e-mails inventados não fazem a lista crescer sem fim
    while (tentativas.size > 20000) tentativas.delete(tentativas.keys().next().value);
  }
  const limparFalhas = (chave) => tentativas.delete(chave);
  setInterval(() => { for (const [k, t] of tentativas) if (Date.now() - t.inicio > JANELA) tentativas.delete(k); }, 5 * 60 * 1000).unref();

  setInterval(() => db.q('DELETE FROM sessoes WHERE expira_em < now()').catch(() => {}), 3600 * 1000).unref();

  return {
    auditar, iniciarSessao, encerrarSessao, identificar, escopoDaChave, chaveFerramenta, exigirLogin, exigirAdmin, mesmaOrigem,
    podeAcessar, modulosDoUsuario, setoresGeridos, GESTORES_DE_SETOR, bloqueado, registrarFalha, limparFalhas,
  };
}

module.exports = { criarSeguranca, veTodosOsTickets, hostsDoPortal, hashSenha, conferirSenha, validarNovaSenha, senhaAleatoria, HASH_FALSO, sha256, COOKIE };
