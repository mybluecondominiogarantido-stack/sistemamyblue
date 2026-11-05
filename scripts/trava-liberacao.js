#!/usr/bin/env node
'use strict';
/*
 * Gancho do Claude Code (PreToolUse, Bash): barra o que sobe atualização pelo Claude sem a liberação da
 * Mariana Nascimento (scripts/liberar.js). Barra: enviar ao GitHub (git push), abrir, aprovar ou juntar PR,
 * gravar pelo gh api, e enviar ao portal publicado (escrita em /api/admin, fora do localhost).
 * Ler, testar e trabalhar na própria máquina continuam livres.
 */
const fs = require('fs');

function sobeAtualizacao(cmd) {
  const c = String(cmd || '');
  if (/\bgit\b[^\n;&|]*\bpush\b/.test(c)) return 'enviar ao GitHub (git push)';
  if (/\bgh\s+pr\s+(create|merge|ready|review)\b/.test(c)) return 'abrir, aprovar ou juntar pull request';
  // gh api: só o trecho do próprio comando (até a próxima quebra, ; & ou |) conta, para não confundir com texto citado
  const ghApi = c.match(/\bgh\s+api\b[^\n;&|]*/g) || [];
  if (ghApi.some((t) => /(\s-X\s*|--method\s+)(POST|PUT|PATCH|DELETE)\b|\s-(f|F)\s|--(raw-)?field\b|--input\b/i.test(t))) return 'gravar no GitHub pelo gh api';
  if (/\b(curl|wget)\b/.test(c) && /\/api\/admin\//.test(c) && !/\b(localhost|127\.0\.0\.1)\b/.test(c) &&
    /(\s-X\s*|--request\s+)(POST|PUT|PATCH|DELETE)\b|\s(-d|--data[a-z-]*|-T|--upload-file|-F|--form)\b/i.test(c)) return 'enviar ao portal publicado';
  return null;
}

function principal() {
  let entrada = {};
  try { entrada = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (e) { return 0; }
  if (entrada.tool_name && entrada.tool_name !== 'Bash') return 0;
  const motivo = sobeAtualizacao(entrada.tool_input && entrada.tool_input.command);
  if (!motivo) return 0;
  const { liberadoAte, hashPublicado } = require('./liberar');
  if (liberadoAte()) return 0;
  // antes de a Mariana definir a senha (nem na main nem aqui) não há com o que conferir: a trava ainda não vale
  if (!hashPublicado()) return 0;
  process.stderr.write(`Bloqueado: ${motivo} pelo Claude precisa da liberação da Mariana Nascimento. ` +
    'Pergunte na conversa se quem está pedindo é a Mariana e peça a senha de liberação; com a senha, rode ' +
    "printf '%s' '<senha>' | node scripts/liberar.js e tente de novo. Não escreva a senha em arquivo, commit ou PR.\n");
  return 2;
}

if (require.main === module) process.exit(principal());
module.exports = { sobeAtualizacao };
