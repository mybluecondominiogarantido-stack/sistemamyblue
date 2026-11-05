'use strict';
/* Testes da trava de liberação (node --test): o que o gancho barra e a conferência da senha pelo hash. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { sobeAtualizacao } = require('../scripts/trava-liberacao');
const { confere, calcular } = require('../scripts/liberar');

test('barra o que sobe atualização pelo Claude', () => {
  for (const c of [
    'git push -u origin minha-branch',
    'cd /x && git -C repo push origin main',
    'gh pr create --title x',
    'gh pr merge 93',
    'gh api repos/a/b/pulls -f title=x -f head=y',
    'gh api -X PUT repos/a/b/pulls/93/merge',
    'curl -X PUT https://portal.exemplo.com/api/admin/modulos/x/arquivo --data-binary @a.html',
  ]) assert.ok(sobeAtualizacao(c), c);
});

test('deixa livre ler, testar e trabalhar na própria máquina', () => {
  for (const c of [
    'git status', 'git log --oneline -3', 'git commit -m "x"', 'git fetch origin main', 'npm test',
    'gh api repos/a/b/pulls/93 --jq .state',
    'curl -s http://localhost:3456/api/admin/modulos -X PUT -d x',
    'curl -s https://portal.exemplo.com/api/modulos',
    "git commit -q -F - <<'X'\nTrava: barra gravar pelo gh api\nX",
  ]) assert.equal(sobeAtualizacao(c), null, c);
});

test('a senha confere pelo hash (scrypt) e uma senha diferente não', () => {
  const h = { N: 2 ** 14, r: 8, p: 1, tamanho: 64, salt: crypto.randomBytes(16).toString('hex') };
  h.hash = calcular('frase de teste ficticia', h).toString('hex');
  assert.equal(confere('frase de teste ficticia', h), true);
  assert.equal(confere('frase de teste errada', h), false);
  assert.equal(confere('', h), false);
});
