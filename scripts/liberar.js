#!/usr/bin/env node
'use strict';
/*
 * Liberação para subir atualizações pelo Claude (Claude Code): só a Mariana Nascimento libera, com a senha de liberação.
 * A senha nunca fica guardada: o repositório guarda só o hash (scrypt) em .claude/liberacao.json, e a conferência usa o
 * da main publicada (mexer no arquivo local não adianta). Quem libera ganha 2 horas nesta sessão; o gancho
 * scripts/trava-liberacao.js barra envio ao GitHub, PR e envio de HTML ao portal sem essa liberação.
 *
 *   printf '%s' 'a senha' | node scripts/liberar.js              confere e libera por 2 horas
 *   node scripts/liberar.js --encerrar                           encerra a liberação desta sessão
 *   printf '%s' 'senha nova' | node scripts/liberar.js --definir  troca o hash (o arquivo novo só vale depois de entrar na main)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const ARQ_HASH = path.join(RAIZ, '.claude', 'liberacao.json');
const ARQ_ATE = path.join(RAIZ, '.claude', '.liberacao-ate');
const ARQ_TENTATIVAS = path.join(RAIZ, '.claude', '.liberacao-tentativas');
const VALIDADE_MS = 2 * 60 * 60 * 1000;
const MAX_ERROS = 5;
const ESPERA_MS = 15 * 60 * 1000;

/* o hash que vale: o da main publicada; antes de a trava entrar na main, o do arquivo local */
function hashPublicado() {
  try {
    return JSON.parse(execFileSync('git', ['show', 'origin/main:.claude/liberacao.json'], { cwd: RAIZ, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8'));
  } catch (e) { /* ainda não está na main */ }
  try { return JSON.parse(fs.readFileSync(ARQ_HASH, 'utf8')); } catch (e) { return null; }
}

function calcular(senha, h) {
  return crypto.scryptSync(String(senha).normalize('NFC'), Buffer.from(h.salt, 'hex'), h.tamanho || 64, { N: h.N, r: h.r, p: h.p, maxmem: 256 * 1024 * 1024 });
}

function confere(senha, h) {
  if (!h || !h.hash || !senha) return false;
  const esperado = Buffer.from(h.hash, 'hex');
  const obtido = calcular(senha, h);
  return esperado.length === obtido.length && crypto.timingSafeEqual(esperado, obtido);
}

function liberadoAte() {
  try { const ate = JSON.parse(fs.readFileSync(ARQ_ATE, 'utf8')).ate; return Number(ate) > Date.now() ? Number(ate) : 0; } catch (e) { return 0; }
}

function lerEntrada() {
  try { return fs.readFileSync(0, 'utf8').replace(/\r?\n$/, ''); } catch (e) { return ''; }
}

function hora(ms) { return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); }

function principal() {
  const arg = process.argv[2];
  fs.mkdirSync(path.dirname(ARQ_ATE), { recursive: true });
  if (arg === '--encerrar') {
    try { fs.unlinkSync(ARQ_ATE); } catch (e) { /* já não estava liberado */ }
    console.log('Liberação encerrada.');
    return 0;
  }
  if (arg === '--definir') {
    const senha = lerEntrada();
    if (senha.length < 12) { console.error('Use uma senha de liberação com pelo menos 12 caracteres (uma frase curta é o ideal).'); return 1; }
    const h = { algoritmo: 'scrypt', N: 2 ** 15, r: 8, p: 1, tamanho: 64, salt: crypto.randomBytes(16).toString('hex') };
    h.hash = calcular(senha, h).toString('hex');
    fs.writeFileSync(ARQ_HASH, JSON.stringify({ quem: 'Mariana Nascimento', ...h }, null, 2) + '\n');
    console.log('Hash da senha de liberação gravado em .claude/liberacao.json. Ele passa a valer quando entrar na main.');
    return 0;
  }
  // limite de tentativas: depois de 5 erros, espera 15 minutos
  let t = { erros: 0, desde: 0 };
  try { t = JSON.parse(fs.readFileSync(ARQ_TENTATIVAS, 'utf8')); } catch (e) { /* primeira tentativa */ }
  if (t.erros >= MAX_ERROS && Date.now() - t.desde < ESPERA_MS) {
    console.error(`Tentativas demais. Tente de novo depois das ${hora(t.desde + ESPERA_MS)}.`);
    return 1;
  }
  const h = hashPublicado();
  if (!h) { console.error('Não há senha de liberação definida (.claude/liberacao.json).'); return 1; }
  if (!confere(lerEntrada(), h)) {
    const erros = t.erros >= MAX_ERROS ? 1 : t.erros + 1;
    fs.writeFileSync(ARQ_TENTATIVAS, JSON.stringify({ erros, desde: Date.now() }));
    console.error('Senha de liberação incorreta. Nada foi liberado.');
    return 1;
  }
  try { fs.unlinkSync(ARQ_TENTATIVAS); } catch (e) { /* sem erros anteriores */ }
  const ate = Date.now() + VALIDADE_MS;
  fs.writeFileSync(ARQ_ATE, JSON.stringify({ ate }));
  console.log(`Liberado até as ${hora(ate)} (horário de Brasília), nesta sessão.`);
  return 0;
}

if (require.main === module) process.exit(principal());
module.exports = { confere, calcular, liberadoAte, hashPublicado };
