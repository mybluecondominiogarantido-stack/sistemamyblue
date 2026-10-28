'use strict';
/*
 * Envio de e-mail dos avisos. Duas formas (a primeira configurada vale):
 *
 *  1. Microsoft 365 pela API Microsoft Graph (recomendado para a MyBlue): um aplicativo registrado
 *     no Entra ID (Azure), com "Application Mail.Send" liberado no Exchange só para a caixa
 *     EMAIL_REMETENTE (RBAC para aplicativos), envia como essa caixa.
 *     Variáveis: M365_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET, EMAIL_REMETENTE.
 *     Não usa senha de caixa de e-mail e não depende do SMTP AUTH com senha, que a Microsoft
 *     desliga por padrão nos tenants a partir do fim de 2026.
 *  2. SMTP comum: SMTP_HOST, SMTP_PORT, SMTP_USUARIO, SMTP_SENHA, EMAIL_REMETENTE.
 *
 * enviar({ para: { nome, email }, subject, text, html })
 *
 * Agenda (só no Microsoft 365): o convite do onboarding da Implantação é uma reunião no calendário da caixa
 * EMAIL_REMETENTE, com link do Teams. Pede "Application Calendars.ReadWrite" no aplicativo, restrito à mesma caixa.
 * agenda.criar({ assunto, html, inicio, fim, participantes: [{ nome, email }] }) → { id, link }
 * agenda.atualizar(id, mesmo formato) · agenda.cancelar(id, comentario)
 * inicio e fim: 'AAAA-MM-DDTHH:MM' no horário de Brasília.
 */

/* "Portal MyBlue <naoresponda@myblue.com.br>" → { nome, email } */
function lerRemetente(s) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(String(s || ''));
  return m ? { nome: m[1].trim(), email: m[2].trim() } : { nome: '', email: String(s || '').trim() };
}

function criarEnvioGraph(e, fetchFn) {
  const remetente = lerRemetente(e.EMAIL_REMETENTE);
  if (!remetente.email) throw new Error('Defina EMAIL_REMETENTE com a caixa que envia os avisos (ex.: naoresponda@myblue.com.br).');
  let token = null;
  let expira = 0;

  async function obterToken() {
    if (token && Date.now() < expira) return token;
    const corpo = new URLSearchParams({
      client_id: e.M365_CLIENT_ID, client_secret: e.M365_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
    });
    const r = await fetchFn(`https://login.microsoftonline.com/${encodeURIComponent(e.M365_TENANT_ID)}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: corpo.toString(),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error(`Microsoft 365 recusou o login do aplicativo: ${j.error_description || j.error || r.status}`);
    token = j.access_token;
    expira = Date.now() + Math.max(60, (Number(j.expires_in) || 3600) - 120) * 1000;
    return token;
  }

  /* chamada à Graph com o token do aplicativo (token revogado antes da hora: pega outro e tenta uma vez) */
  async function chamar(metodo, url, corpo) {
    const init = async () => ({ method: metodo, headers: { authorization: `Bearer ${await obterToken()}`, 'content-type': 'application/json' }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
    let r = await fetchFn(url, await init());
    if (r.status === 401) { token = null; r = await fetchFn(url, await init()); }
    return r;
  }
  const falhou = async (r, acao) => {
    const j = await r.json().catch(() => ({}));
    return new Error(`Microsoft 365 não ${acao} (${r.status}): ${(j.error && (j.error.message || j.error.code)) || 'erro desconhecido'}`);
  };

  const caixa = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(remetente.email)}`;
  const evento = (x) => ({
    subject: x.assunto,
    body: { contentType: 'HTML', content: x.html || '' },
    start: { dateTime: `${x.inicio}:00`, timeZone: 'E. South America Standard Time' },
    end: { dateTime: `${x.fim}:00`, timeZone: 'E. South America Standard Time' },
    attendees: (x.participantes || []).filter((p) => p && p.email).map((p) => ({ emailAddress: { address: p.email, name: p.nome || p.email }, type: 'required' })),
    isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness', allowNewTimeProposals: true,
  });
  const agenda = {
    async criar(x) {
      const r = await chamar('POST', `${caixa}/events`, evento(x));
      if (!r.ok) throw await falhou(r, 'criou o convite');
      const j = await r.json().catch(() => ({}));
      return { id: j.id, link: (j.onlineMeeting && j.onlineMeeting.joinUrl) || '' };
    },
    async atualizar(id, x) {
      const r = await chamar('PATCH', `${caixa}/events/${encodeURIComponent(id)}`, evento(x));
      if (!r.ok) throw await falhou(r, 'atualizou o convite');
      const j = await r.json().catch(() => ({}));
      return { id: j.id || id, link: (j.onlineMeeting && j.onlineMeeting.joinUrl) || '' };
    },
    async cancelar(id, comentario) {
      const r = await chamar('POST', `${caixa}/events/${encodeURIComponent(id)}/cancel`, { comment: comentario || '' });
      if (!r.ok && r.status !== 404) throw await falhou(r, 'cancelou o convite');
    },
  };

  async function enviar(msg) {
    const corpo = {
      message: {
        subject: msg.subject,
        body: { contentType: 'HTML', content: msg.html || msg.text },
        toRecipients: [{ emailAddress: { address: msg.para.email, name: msg.para.nome } }],
        ...(remetente.nome ? { from: { emailAddress: { address: remetente.email, name: remetente.nome } } } : {}),
      },
      saveToSentItems: false,
    };
    const r = await chamar('POST', `${caixa}/sendMail`, corpo);
    if (!r.ok) throw await falhou(r, 'enviou');
  }

  return { tipo: 'microsoft365', remetente: remetente.email, enviar, agenda };
}

function criarEnvioSmtp(e) {
  const porta = Number(e.SMTP_PORT) || 587;
  const remetente = e.EMAIL_REMETENTE || e.SMTP_USUARIO;
  let transporte = null;
  return {
    tipo: 'smtp',
    remetente: lerRemetente(remetente).email,
    async enviar(msg) {
      if (!transporte) {
        const nodemailer = require('nodemailer');
        transporte = nodemailer.createTransport({
          host: e.SMTP_HOST, port: porta, secure: e.SMTP_SEGURO ? e.SMTP_SEGURO === 'true' : porta === 465,
          auth: e.SMTP_USUARIO ? { user: e.SMTP_USUARIO, pass: e.SMTP_SENHA || '' } : undefined,
        });
      }
      await transporte.sendMail({
        from: remetente, to: { name: msg.para.nome, address: msg.para.email }, subject: msg.subject, text: msg.text, html: msg.html,
      });
    },
  };
}

/* Devolve { tipo, remetente, enviar } ou null quando não há e-mail configurado. */
function criarEnvioEmail(env = process.env, fetchFn = globalThis.fetch) {
  if (env.M365_TENANT_ID || env.M365_CLIENT_ID || env.M365_CLIENT_SECRET) {
    if (!env.M365_TENANT_ID || !env.M365_CLIENT_ID || !env.M365_CLIENT_SECRET) {
      throw new Error('Microsoft 365: preencha M365_TENANT_ID, M365_CLIENT_ID e M365_CLIENT_SECRET.');
    }
    return criarEnvioGraph(env, fetchFn);
  }
  if (env.SMTP_HOST) return criarEnvioSmtp(env);
  return null;
}

module.exports = { criarEnvioEmail, lerRemetente };
