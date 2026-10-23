'use strict';
/* Avisos: o resultado do e-mail fica guardado em cada aviso (saiu ou por que falhou). */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { abrir } = require('../server/db');
const { criarNotificador } = require('../server/notificacoes');

let db;
after(async () => { if (db && db.fechar) await db.fechar(); });

test('e-mail enviado marca a hora; e-mail recusado guarda o erro; o autor não recebe o próprio aviso', async () => {
  db = await abrir({ dataDir: ':memoria:', databaseUrl: '' });
  const novo = async (nome, email) => (await db.um("INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES ($1, $2, 'x', 'usuario') RETURNING id", [nome, email])).id;
  const ok = await novo('Pessoa Fictícia', 'ficticia@exemplo.com');
  const ruim = await novo('Pessoa Recusada', 'recusada@exemplo.com');
  const autor = await novo('Autora Fictícia', 'autora@exemplo.com');
  const enviarEmail = async (m) => { if (m.para.email.startsWith('recusada')) throw new Error('caixa recusou'); };
  const avisos = criarNotificador(db, { enviarEmail, silencioso: true });
  await avisos.notificar([ok, ruim, autor], { tipo: 'contrato', titulo: 'Minuta pronta', texto: 'Teste', link: '#/contratos/1', email: true, autor_id: autor });
  await new Promise((r) => setTimeout(r, 50));
  const l = (await db.q('SELECT usuario_id, email_enviado_em, email_erro FROM notificacoes ORDER BY usuario_id')).rows;
  assert.equal(l.length, 2);
  const de = (id) => l.find((x) => x.usuario_id === id);
  assert.ok(de(ok).email_enviado_em);
  assert.equal(de(ok).email_erro, null);
  assert.equal(de(ruim).email_enviado_em, null);
  assert.match(de(ruim).email_erro, /caixa recusou/);
});
