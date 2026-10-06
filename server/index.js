'use strict';
const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const { abrir } = require('./db');
const { criarSeguranca, hashSenha, senhaAleatoria } = require('./seguranca');
const { criarServicoModulos } = require('./modulos');
const { criarRegistros } = require('./registros');
const { criarNotificador } = require('./notificacoes');
const { criarExpediente, lerExpediente } = require('./expediente');
const { rotasAuth } = require('./rotas/auth');
const { rotasAdmin } = require('./rotas/admin');
const { rotasFerramentas } = require('./rotas/ferramentas');
const { rotasTickets, rotasAdminTickets } = require('./rotas/tickets');

function carregarEnv(arquivo) {
  if (!fs.existsSync(arquivo)) return;
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function lerConfig(sobrescrever = {}) {
  carregarEnv(path.join(__dirname, '..', '.env'));
  const e = process.env;
  // no Railway: confia no proxy de HTTPS deles
  const railway = !!(e.RAILWAY_PROJECT_ID || e.RAILWAY_ENVIRONMENT_NAME || e.RAILWAY_ENVIRONMENT);
  return {
    porta: Number(e.PORT) || 3000,
    // Postgres (Supabase, Railway…). Sem ele, usa o Postgres embutido gravado em DATA_DIR.
    databaseUrl: e.DATABASE_URL || '',
    dataDir: path.resolve(e.DATA_DIR || e.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '..', 'data')),
    railway,
    semBancoPersistente: railway && !e.DATABASE_URL && !e.RAILWAY_VOLUME_MOUNT_PATH,
    sessaoHoras: Number(e.SESSAO_HORAS) || 12,
    cookieSecure: e.COOKIE_SECURE === 'true',
    trustProxy: e.TRUST_PROXY || (railway ? '1' : '0'),
    adminEmail: (e.ADMIN_EMAIL || 'admin@myblue.com.br').toLowerCase(),
    adminNome: e.ADMIN_NOME || 'Administrador',
    adminSenha: e.ADMIN_SENHA || '',
    limiteHtmlMb: Number(e.LIMITE_HTML_MB) || 40,
    limiteDadosMb: Number(e.LIMITE_DADOS_MB) || 25,
    limiteAnexoMb: Number(e.LIMITE_ANEXO_MB) || 10,
    silencioso: false,
    ...sobrescrever,
  };
}

/* Cria o primeiro administrador quando o banco ainda não tem usuários. */
async function garantirAdmin(db, cfg) {
  const { n } = await db.um('SELECT COUNT(*)::int AS n FROM usuarios');
  if (n > 0) return null;
  const senha = cfg.adminSenha || senhaAleatoria();
  await db.q("INSERT INTO usuarios (nome, email, senha_hash, papel, trocar_senha) VALUES ($1, $2, $3, 'admin', $4) ON CONFLICT (email) DO NOTHING",
    [cfg.adminNome, cfg.adminEmail, hashSenha(senha), !cfg.adminSenha]);
  if (!cfg.silencioso) {
    console.log('\n================ PRIMEIRO ACESSO ================');
    console.log(`  Administrador: ${cfg.adminEmail}`);
    if (!cfg.adminSenha) console.log(`  Senha temporária: ${senha}   (será pedida a troca no primeiro login)`);
    console.log('=================================================\n');
  }
  return senha;
}

async function criarApp(cfg) {
  const db = await abrir(cfg);
  const senhaInicial = await garantirAdmin(db, cfg);
  const seg = criarSeguranca(db, cfg);
  const modulos = criarServicoModulos(db, cfg);
  const registros = criarRegistros(db);
  const avisos = criarNotificador(db, cfg);
  const expediente = criarExpediente(lerExpediente());
  const ctx = { db, seg, modulos, registros, avisos, expediente, cfg };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', /^\d+$/.test(cfg.trustProxy) ? Number(cfg.trustProxy) : cfg.trustProxy);

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });
  app.get('/saude', async (req, res) => {
    try { await db.q('SELECT 1'); res.json({ ok: true, banco: db.tipo }); } catch { res.status(503).json({ ok: false }); }
  });
  app.use(seg.identificar);
  app.use('/api', seg.mesmaOrigem);

  app.use(rotasAuth(ctx));
  app.use(rotasAdmin(ctx));
  app.use(rotasFerramentas(ctx));
  app.use(rotasTickets(ctx));
  app.use(rotasAdminTickets(ctx));

  const publico = path.join(__dirname, '..', 'public');
  app.get('/login', (req, res) => res.sendFile(path.join(publico, 'login.html')));
  app.get('/', (req, res) => {
    if (!req.usuario) return res.redirect('/login');
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(publico, 'index.html'));
  });
  // CSS/JS/HTML: o navegador sempre confere se há versão nova (evita misturar arquivos antigos e novos após um deploy)
  app.use(express.static(publico, {
    index: false,
    setHeaders: (res, arquivo) => res.set('Cache-Control', /\.(png|jpe?g|webp|svg|ico)$/i.test(arquivo) ? 'public, max-age=86400' : 'no-cache'),
  }));

  app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ erro: 'Conteúdo grande demais.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });
    console.error('[erro]', err);
    res.status(500).json({ erro: 'Erro interno.' });
  });

  return { app, db, senhaInicial, ctx };
}

function avisos(cfg) {
  if (cfg.semBancoPersistente) {
    console.warn('\n[ATENÇÃO] Rodando no Railway SEM banco: os dados serão APAGADOS a cada novo deploy.');
    console.warn('Defina a variável DATABASE_URL (Supabase ou Postgres do Railway) antes de cadastrar usuários ou enviar arquivos.\n');
  }
}

async function iniciar(cfg = lerConfig()) {
  avisos(cfg);
  let app, db;
  try {
    ({ app, db } = await criarApp(cfg));
  } catch (e) {
    console.error('\n[ERRO] Não foi possível abrir o banco de dados:', e.message);
    if (cfg.databaseUrl) console.error('Confira a variável DATABASE_URL (endereço, usuário e senha do Postgres).\n');
    process.exit(1);
  }
  // cabeçalhos maiores: algumas ferramentas gravam dados via URL (JSONP), como faziam no Apps Script
  const servidor = http.createServer({ maxHeaderSize: 512 * 1024 }, app);
  servidor.listen(cfg.porta, () => {
    if (!cfg.silencioso) console.log(`Portal MyBlue rodando em http://localhost:${servidor.address().port}`);
  });
  const fechar = () => servidor.close(async () => { await db.fechar(); process.exit(0); });
  process.once('SIGTERM', fechar);
  process.once('SIGINT', fechar);
  return servidor;
}

if (require.main === module) iniciar();

module.exports = { criarApp, lerConfig, iniciar };
