'use strict';
const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const { abrir } = require('./db');
const { criarSeguranca, hashSenha, senhaAleatoria } = require('./seguranca');
const { criarServicoModulos } = require('./modulos');
const { criarRegistros } = require('./registros');
const { rotasAuth } = require('./rotas/auth');
const { rotasAdmin } = require('./rotas/admin');
const { rotasFerramentas } = require('./rotas/ferramentas');

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
  // no Railway: usa o volume anexado e confia no proxy de HTTPS deles
  const railway = !!(e.RAILWAY_PROJECT_ID || e.RAILWAY_ENVIRONMENT_NAME || e.RAILWAY_ENVIRONMENT);
  return {
    porta: Number(e.PORT) || 3000,
    dataDir: path.resolve(e.DATA_DIR || e.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '..', 'data')),
    railway,
    railwaySemVolume: railway && !e.RAILWAY_VOLUME_MOUNT_PATH && !e.DATA_DIR,
    sessaoHoras: Number(e.SESSAO_HORAS) || 12,
    cookieSecure: e.COOKIE_SECURE === 'true',
    trustProxy: e.TRUST_PROXY || (railway ? '1' : '0'),
    adminEmail: (e.ADMIN_EMAIL || 'admin@myblue.com.br').toLowerCase(),
    adminNome: e.ADMIN_NOME || 'Administrador',
    adminSenha: e.ADMIN_SENHA || '',
    limiteHtmlMb: Number(e.LIMITE_HTML_MB) || 40,
    limiteDadosMb: Number(e.LIMITE_DADOS_MB) || 25,
    silencioso: false,
    ...sobrescrever,
  };
}

/* Cria o primeiro administrador quando o banco ainda não tem usuários. */
function garantirAdmin(db, cfg) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;
  if (n > 0) return null;
  const senha = cfg.adminSenha || senhaAleatoria();
  db.prepare("INSERT INTO usuarios (nome, email, senha_hash, papel, trocar_senha) VALUES (?, ?, ?, 'admin', ?)")
    .run(cfg.adminNome, cfg.adminEmail, hashSenha(senha), cfg.adminSenha ? 0 : 1);
  if (!cfg.silencioso) {
    console.log('\n================ PRIMEIRO ACESSO ================');
    console.log(`  Administrador: ${cfg.adminEmail}`);
    if (!cfg.adminSenha) console.log(`  Senha temporária: ${senha}   (será pedida a troca no primeiro login)`);
    console.log('=================================================\n');
  }
  return senha;
}

function criarApp(cfg) {
  const db = abrir(cfg.dataDir);
  const senhaInicial = garantirAdmin(db, cfg);
  const seg = criarSeguranca(db, cfg);
  const modulos = criarServicoModulos(db, cfg);
  const registros = criarRegistros(db);
  const ctx = { db, seg, modulos, registros, cfg };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', /^\d+$/.test(cfg.trustProxy) ? Number(cfg.trustProxy) : cfg.trustProxy);

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(seg.identificar);
  app.use('/api', seg.mesmaOrigem);

  app.get('/saude', (req, res) => res.json({ ok: true }));

  app.use(rotasAuth(ctx));
  app.use(rotasAdmin(ctx));
  app.use(rotasFerramentas(ctx));

  const publico = path.join(__dirname, '..', 'public');
  app.get('/login', (req, res) => res.sendFile(path.join(publico, 'login.html')));
  app.get('/', (req, res) => {
    if (!req.usuario) return res.redirect('/login');
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(publico, 'index.html'));
  });
  app.use(express.static(publico, { index: false, maxAge: '1h' }));

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

function conferirPastaDeDados(cfg) {
  try {
    fs.mkdirSync(cfg.dataDir, { recursive: true });
    fs.accessSync(cfg.dataDir, fs.constants.W_OK);
  } catch (e) {
    console.error(`\n[ERRO] Sem permissão para gravar em ${cfg.dataDir} (${e.code}).`);
    console.error('No Railway, confira se o volume está anexado ao serviço. Em outros servidores, ajuste o dono da pasta ou a variável DATA_DIR.\n');
    process.exit(1);
  }
  if (cfg.railwaySemVolume) {
    console.warn('\n[ATENÇÃO] Rodando no Railway SEM volume: o banco e os HTMLs serão APAGADOS a cada novo deploy.');
    console.warn('Anexe um volume ao serviço (montado em /app/data) antes de cadastrar usuários ou enviar arquivos.\n');
  }
}

function iniciar(cfg = lerConfig()) {
  conferirPastaDeDados(cfg);
  const { app, db } = criarApp(cfg);
  // cabeçalhos maiores: algumas ferramentas gravam dados via URL (JSONP), como faziam no Apps Script
  const servidor = http.createServer({ maxHeaderSize: 512 * 1024 }, app);
  servidor.listen(cfg.porta, () => {
    if (!cfg.silencioso) console.log(`Portal MyBlue rodando em http://localhost:${servidor.address().port}`);
  });
  const fechar = () => servidor.close(() => { db.close(); process.exit(0); });
  process.once('SIGTERM', fechar);
  process.once('SIGINT', fechar);
  return servidor;
}

if (require.main === module) iniciar();

module.exports = { criarApp, lerConfig, iniciar };
