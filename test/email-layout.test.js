'use strict';
/* Layout dos e-mails de aviso e fila de envio (limite de envios simultâneos do Microsoft 365). */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { montarHtml, classificar, separarLista } = require('../server/email-layout');
const { abrir } = require('../server/db');
const { criarNotificador } = require('../server/notificacoes');

let db;
after(async () => { if (db && db.fechar) await db.fechar(); });

test('a etiqueta e a cor seguem o tipo e o título do aviso', () => {
  assert.equal(classificar('versao_aguardando', 'HTML novo aguardando aprovação').tom, 'acao');
  assert.equal(classificar('versao_aprovada', 'Versão nova aprovada').tom, 'ok');
  assert.equal(classificar('implantacao', 'Passou do prazo para iniciar · IMP-1').tom, 'alerta');
  assert.equal(classificar('implantacao', 'Ainda sem ninguém designado · IMP-1').tom, 'alerta');
  assert.equal(classificar('credito', 'Pendência respondida · AC-1').etiqueta, 'Pendência respondida');
  assert.equal(classificar('credito', 'Pendência na análise de crédito · X').botao, 'Resolver pendência');
  assert.equal(classificar('contrato', 'Contrato assinado · X').tom, 'ok');
  assert.equal(classificar('contrato', 'Decisão da diretoria no contrato').etiqueta, 'Decisão da diretoria');
  assert.equal(classificar('contrato', 'Diretoria aprovou').tom, 'ok');
  assert.equal(classificar('outro', 'Qualquer coisa').tom, 'info');
});

test('pendências no texto viram lista numerada', () => {
  const a = separarLista('Ainda falta enviar: RG do síndico; Conta bancária; Modelo do boleto anterior. Anexe no portal.');
  assert.equal(a.intro, 'Ainda falta enviar:');
  assert.deepEqual(a.lista, ['RG do síndico', 'Conta bancária', 'Modelo do boleto anterior']);
  assert.equal(a.resto, 'Anexe no portal.');
  const b = separarLista('Olá. Precisamos de:\n\n1. Relatório completo\n2. Convenção\n\nO prazo volta a contar.');
  assert.deepEqual(b.lista, ['Relatório completo', 'Convenção']);
  assert.equal(b.resto, 'O prazo volta a contar.');
  assert.deepEqual(separarLista('Texto simples, sem itens.').lista, []);
});

test('o e-mail tem logo, etiqueta, quadro, botão com link e motivo; o texto do aviso é escapado', () => {
  const m = montarHtml({
    tipo: 'versao_aguardando', titulo: 'HTML novo aguardando aprovação', texto: 'Pessoa <b>Fictícia</b> enviou.', link: '#/admin/modulos',
    detalhes: { assunto: 'Aprovação pendente: “Ferramenta Fictícia”', linhas: [['Ferramenta', 'Ferramenta Fictícia'], ['Vazio', null]] },
  }, { portalUrl: 'https://portal.teste/', destinatario: { nome: 'Executiva Fictícia' } });
  assert.equal(m.subject, 'Aprovação pendente: “Ferramenta Fictícia”');
  assert.match(m.html, /src="cid:logo-myblue"/);
  assert.equal(m.inline[0].cid, 'logo-myblue');
  assert.ok(require('fs').existsSync(m.inline[0].arquivo));
  assert.match(m.html, /Aguardando sua aprovação/);
  assert.match(m.html, /href="https:\/\/portal\.teste\/#\/admin\/modulos"/);
  assert.match(m.html, /Ver prévia e aprovar/);
  assert.match(m.html, /Ferramenta Fictícia/);
  assert.doesNotMatch(m.html, />Vazio</);
  assert.match(m.html, /Olá, Executiva\./);
  assert.match(m.html, /&lt;b&gt;Fictícia&lt;\/b&gt;/);
  assert.match(m.html, /Você recebeu este e-mail porque você aprova ferramentas/);
  assert.match(m.html, /v:roundrect/);
  assert.match(m.text, /Ver prévia e aprovar: https:\/\/portal\.teste\/#\/admin\/modulos/);
});

test('o título "A · B · C" vira título e linha de referência; destaque, anexo e assinatura aparecem', () => {
  const m = montarHtml({ tipo: 'credito', titulo: 'Retorno de Análise de Crédito · AC-1 · Condomínio Fictício', texto: 'Prezados, segue o retorno.', link: '#/credito/1',
    detalhes: { destaque: 'APROVADA', anexo: 'Retorno_Ficticio.pdf', assinatura: 'Setor Fictício' } }, { portalUrl: 'https://portal.teste' });
  assert.match(m.html, /<h1[^>]*>Retorno de Análise de Crédito<\/h1>/);
  assert.match(m.html, /AC-1 · Condomínio Fictício/);
  assert.match(m.html, /APROVADA/);
  assert.match(m.html, /Retorno_Ficticio\.pdf/);
  assert.match(m.html, /Setor Fictício/);
  assert.doesNotMatch(m.html, /Olá, /); // sem destinatário e texto já começa com "Prezados"
});

test('sem PORTAL_URL o e-mail sai sem botão, mas com a logo embutida', () => {
  const m = montarHtml({ tipo: 'comissao', titulo: 'Seu demonstrativo está disponível', texto: 'Confira.', link: '#/premiacoes/1' }, {});
  assert.match(m.html, /cid:logo-myblue/);
  assert.doesNotMatch(m.html, /<a href=/);
});

test('recusa por limite do Microsoft 365 (429) espera e tenta de novo; no máximo 2 envios ao mesmo tempo', async () => {
  db = await abrir({ dataDir: ':memoria:', databaseUrl: '' });
  const novo = async (i) => (await db.um("INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES ($1, $2, 'x', 'usuario') RETURNING id", [`Pessoa ${i}`, `p${i}@exemplo.com`])).id;
  const ids = [];
  for (let i = 0; i < 5; i++) ids.push(await novo(i));
  let ativos = 0; let pico = 0; const tentativas = {};
  const enviarEmail = async (m) => {
    ativos++; pico = Math.max(pico, ativos);
    await new Promise((r) => setTimeout(r, 10));
    ativos--;
    tentativas[m.para.email] = (tentativas[m.para.email] || 0) + 1;
    if (m.para.email === 'p0@exemplo.com' && tentativas[m.para.email] === 1) throw new Error('Microsoft 365 não enviou (429): Application is over its MailboxConcurrency limit.');
    assert.match(m.html, /Portal MyBlue/);
  };
  const avisos = criarNotificador(db, { enviarEmail, silencioso: true, esperasEmail: [5, 5, 5], portalUrl: 'https://portal.teste' });
  await avisos.notificar(ids, { tipo: 'comissao', titulo: 'Seu demonstrativo está disponível', texto: 'Confira.', link: '#/premiacoes/1', email: true });
  await new Promise((r) => setTimeout(r, 300));
  const l = (await db.q('SELECT email_enviado_em, email_erro FROM notificacoes')).rows;
  assert.equal(l.length, 5);
  assert.ok(l.every((x) => x.email_enviado_em && !x.email_erro));
  assert.equal(tentativas['p0@exemplo.com'], 2);
  assert.ok(pico <= 2);
});
