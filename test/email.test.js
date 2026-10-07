'use strict';
/* Envio de e-mail pelo Microsoft 365 (Graph), com as respostas da Microsoft simuladas. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { criarEnvioEmail, lerRemetente } = require('../server/email');

const ENV = { M365_TENANT_ID: 'tenant-123', M365_CLIENT_ID: 'app-456', M365_CLIENT_SECRET: 'segredo', EMAIL_REMETENTE: 'Portal MyBlue <naoresponda@myblue.com.br>' };
const resposta = (status, corpo) => ({ ok: status < 300, status, json: async () => corpo });

function microsoftFalsa(roteiro = {}) {
  const chamadas = [];
  let tokens = 0;
  const fetchFn = async (url, init) => {
    chamadas.push({ url, init });
    if (url.includes('login.microsoftonline.com')) {
      tokens++;
      return roteiro.token ? roteiro.token() : resposta(200, { access_token: 'tok-' + tokens, expires_in: 3599 });
    }
    return roteiro.envio ? roteiro.envio(init) : resposta(202, null);
  };
  return { fetchFn, chamadas, tokens: () => tokens };
}

test('lê o remetente com ou sem nome', () => {
  assert.deepEqual(lerRemetente('Portal MyBlue <naoresponda@myblue.com.br>'), { nome: 'Portal MyBlue', email: 'naoresponda@myblue.com.br' });
  assert.deepEqual(lerRemetente('"Portal" <a@b.com>'), { nome: 'Portal', email: 'a@b.com' });
  assert.deepEqual(lerRemetente('a@b.com'), { nome: '', email: 'a@b.com' });
});

test('sem configuração não envia; configuração incompleta avisa', () => {
  assert.equal(criarEnvioEmail({}), null);
  assert.throws(() => criarEnvioEmail({ M365_TENANT_ID: 'x' }), /M365_CLIENT_ID/);
  assert.equal(criarEnvioEmail({ SMTP_HOST: 'smtp.exemplo.com' }).tipo, 'smtp');
});

test('Microsoft 365: pega o token do aplicativo e envia pela caixa remetente', async () => {
  const ms = microsoftFalsa();
  const correio = criarEnvioEmail(ENV, ms.fetchFn);
  assert.equal(correio.tipo, 'microsoft365');
  await correio.enviar({ para: { nome: 'Marcos Lima', email: 'marcos@myblue.com.br' }, subject: '[Ticket #1] Teste', text: 'oi', html: '<p>oi</p>' });
  await correio.enviar({ para: { nome: 'Lia', email: 'lia@myblue.com.br' }, subject: 'x', text: 'x', html: 'x' });

  const [tok, envio] = ms.chamadas;
  assert.equal(tok.url, 'https://login.microsoftonline.com/tenant-123/oauth2/v2.0/token');
  const form = new URLSearchParams(tok.init.body);
  assert.equal(form.get('grant_type'), 'client_credentials');
  assert.equal(form.get('scope'), 'https://graph.microsoft.com/.default');
  assert.equal(form.get('client_id'), 'app-456');

  assert.equal(envio.url, 'https://graph.microsoft.com/v1.0/users/naoresponda%40myblue.com.br/sendMail');
  assert.equal(envio.init.headers.authorization, 'Bearer tok-1');
  const corpo = JSON.parse(envio.init.body);
  assert.equal(corpo.message.toRecipients[0].emailAddress.address, 'marcos@myblue.com.br');
  assert.equal(corpo.message.body.contentType, 'HTML');
  assert.equal(corpo.message.from.emailAddress.name, 'Portal MyBlue');
  assert.equal(corpo.saveToSentItems, false);
  assert.equal(ms.tokens(), 1, 'o token é reaproveitado');
});

test('Microsoft 365: renova o token recusado e mostra o erro da Microsoft', async () => {
  let n = 0;
  const ms = microsoftFalsa({ envio: () => (++n === 1 ? resposta(401, {}) : resposta(202, null)) });
  await criarEnvioEmail(ENV, ms.fetchFn).enviar({ para: { nome: 'A', email: 'a@b.com' }, subject: 's', text: 't', html: 'h' });
  assert.equal(ms.tokens(), 2);

  const negado = microsoftFalsa({ envio: () => resposta(403, { error: { code: 'ErrorAccessDenied', message: 'Access is denied.' } }) });
  await assert.rejects(criarEnvioEmail(ENV, negado.fetchFn).enviar({ para: { nome: 'A', email: 'a@b.com' }, subject: 's', text: 't', html: 'h' }), /403.*Access is denied/);

  const semLogin = microsoftFalsa({ token: () => resposta(401, { error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret provided.' }) });
  await assert.rejects(criarEnvioEmail(ENV, semLogin.fetchFn).enviar({ para: { nome: 'A', email: 'a@b.com' }, subject: 's', text: 't', html: 'h' }), /Invalid client secret/);
});
