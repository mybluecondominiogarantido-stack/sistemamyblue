#!/usr/bin/env node
'use strict';
/*
 * Cria um administrador ou redefine a senha de um usuário existente (vira admin).
 *
 *   npm run criar-admin -- email@myblue.com.br "Nome da Pessoa"
 * A senha temporária é mostrada na tela e precisa ser trocada no primeiro acesso.
 */
const { lerConfig } = require('../server/index');
const { abrir } = require('../server/db');
const { hashSenha, senhaAleatoria } = require('../server/seguranca');

const [email, ...nomePartes] = process.argv.slice(2);
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Uso: npm run criar-admin -- email@empresa.com.br "Nome"');
  process.exit(1);
}
const nome = nomePartes.join(' ') || 'Administrador';
const db = abrir(lerConfig({ silencioso: true }).dataDir);
const senha = senhaAleatoria();
const existe = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email.toLowerCase());
if (existe) {
  db.prepare("UPDATE usuarios SET senha_hash = ?, papel = 'admin', ativo = 1, trocar_senha = 1, atualizado_em = datetime('now') WHERE id = ?").run(hashSenha(senha), existe.id);
  db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(existe.id);
  console.log(`Senha redefinida e perfil de administrador garantido para ${email}.`);
} else {
  db.prepare("INSERT INTO usuarios (nome, email, senha_hash, papel, trocar_senha) VALUES (?, ?, ?, 'admin', 1)").run(nome, email.toLowerCase(), hashSenha(senha));
  console.log(`Administrador criado: ${email}`);
}
db.prepare("INSERT INTO auditoria (acao, detalhe) VALUES ('admin_via_linha_de_comando', ?)").run(JSON.stringify({ email }));
console.log(`Senha temporária: ${senha}  (será pedida a troca no primeiro login)`);
db.close();
