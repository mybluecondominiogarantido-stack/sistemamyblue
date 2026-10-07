'use strict';
const crypto = require('crypto');

const COOKIE = 'mb_sessao';
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(senha), sal, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${sal.toString('base64')}$${h.toString('base64')}`;
}

function conferirSenha(senha, armazenado) {
  try {
    const [alg, N, r, p, sal, h] = String(armazenado).split('$');
    if (alg !== 'scrypt') return false;
    const esperado = Buffer.from(h, 'base64');
    const calc = crypto.scryptSync(String(senha), Buffer.from(sal, 'base64'), esperado.length, { N: +N, r: +r, p: +p });
    return crypto.timingSafeEqual(esperado, calc);
  } catch {
    return false;
  }
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

  /* Identifica o usuário (se houver sessão válida). Renova a sessão quando passou da metade. */
  async function identificar(req, res, next) {
    try {
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
          req.usuario = { id: s.id, nome: s.nome, email: s.email, papel: s.papel, trocar_senha: !!s.trocar_senha, foto_v: s.foto_em ? new Date(s.foto_em).getTime() : null, supervisor_tickets: !!s.supervisor_tickets, editor_links: !!s.editor_links };
        } else if (s) {
          await db.q('DELETE FROM sessoes WHERE token_hash = $1', [th]);
        }
      }
      next();
    } catch (e) {
      next(e);
    }
  }

  async function modulosDoUsuario(usuario) {
    const { rows } = await db.q('SELECT modulo_slug FROM permissoes WHERE usuario_id = $1', [usuario.id]);
    return new Set(rows.map((r) => r.modulo_slug));
  }

  async function podeAcessar(usuario, slug) {
    if (!usuario) return false;
    if (usuario.papel === 'admin') return true;
    return !!(await db.um('SELECT 1 FROM permissoes WHERE usuario_id = $1 AND modulo_slug = $2', [usuario.id, slug]));
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

  /* Bloqueia requisições que alteram dados vindas de outro site (proteção CSRF). */
  function mesmaOrigem(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
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

  /* Limite de tentativas de login (por IP + e-mail). */
  const tentativas = new Map();
  const JANELA = 15 * 60 * 1000;
  const MAX = 8;
  function bloqueado(chave) {
    const t = tentativas.get(chave);
    if (!t) return false;
    if (Date.now() - t.inicio > JANELA) { tentativas.delete(chave); return false; }
    return t.n >= MAX;
  }
  function registrarFalha(chave) {
    const t = tentativas.get(chave);
    if (!t || Date.now() - t.inicio > JANELA) tentativas.set(chave, { inicio: Date.now(), n: 1 });
    else t.n++;
  }
  const limparFalhas = (chave) => tentativas.delete(chave);

  setInterval(() => db.q('DELETE FROM sessoes WHERE expira_em < now()').catch(() => {}), 3600 * 1000).unref();

  return {
    auditar, iniciarSessao, encerrarSessao, identificar, exigirLogin, exigirAdmin, mesmaOrigem,
    podeAcessar, modulosDoUsuario, bloqueado, registrarFalha, limparFalhas,
  };
}

module.exports = { criarSeguranca, hostsDoPortal, hashSenha, conferirSenha, validarNovaSenha, senhaAleatoria, HASH_FALSO, sha256, COOKIE };
