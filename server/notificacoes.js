'use strict';
/*
 * Avisos da Central de Tickets.
 *  - No portal: cada aviso vira uma linha em "notificacoes" (sino com contador, som e alerta do navegador).
 *  - Por e-mail: enviado quando o SMTP está configurado (variáveis SMTP_*). Sem SMTP, só o aviso no portal.
 * Nada aqui derruba a requisição: falha de e-mail só vai para o log.
 */

function configEmail(cfg) {
  const e = process.env;
  const host = cfg.smtpHost !== undefined ? cfg.smtpHost : e.SMTP_HOST;
  if (!host) return null;
  const porta = Number(e.SMTP_PORT) || 587;
  return {
    host,
    port: porta,
    secure: e.SMTP_SEGURO ? e.SMTP_SEGURO === 'true' : porta === 465,
    auth: e.SMTP_USUARIO ? { user: e.SMTP_USUARIO, pass: e.SMTP_SENHA || '' } : undefined,
    remetente: e.EMAIL_REMETENTE || e.SMTP_USUARIO,
  };
}

const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function criarNotificador(db, cfg) {
  const smtp = configEmail(cfg);
  let transporte = null;
  // envio de teste (cfg.enviarEmail) ou SMTP real
  const enviar = cfg.enviarEmail || (smtp && (async (msg) => {
    if (!transporte) {
      const nodemailer = require('nodemailer');
      transporte = nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.secure, auth: smtp.auth });
    }
    await transporte.sendMail({ from: smtp.remetente, ...msg });
  }));
  if (!enviar && !cfg.silencioso) console.log('[avisos] SMTP não configurado: avisos de tickets só aparecem dentro do portal.');

  const urlPortal = () => String(process.env.PORTAL_URL || cfg.portalUrl || '').replace(/\/+$/, '');

  function montarEmail(n, ticket) {
    const link = urlPortal() ? `${urlPortal()}/#/tickets/${ticket.id}` : null;
    const assunto = `[Ticket #${ticket.id}] ${n.titulo}`;
    const linhas = [n.texto, '', `Ticket #${ticket.id}: ${ticket.titulo}`, ticket.setor_nome ? `Setor: ${ticket.setor_nome}` : null,
      ticket.prazo ? `Prazo: ${new Date(ticket.prazo).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : null,
      link ? `\nAbrir no portal: ${link}` : null].filter((x) => x !== null);
    const html = `<div style="font-family:Arial,sans-serif;color:#13323a;max-width:560px">
      <p style="font-size:15px">${escHtml(n.texto)}</p>
      <div style="border:1px solid #dde8ec;border-radius:12px;padding:14px 16px;margin:14px 0">
        <div style="font-size:12px;color:#6f8a94;font-weight:bold">TICKET #${ticket.id}${ticket.setor_nome ? ' · ' + escHtml(ticket.setor_nome) : ''}</div>
        <div style="font-size:16px;font-weight:bold;margin-top:4px">${escHtml(ticket.titulo)}</div>
        ${ticket.descricao ? `<div style="white-space:pre-wrap;color:#3c5660;margin-top:8px">${escHtml(String(ticket.descricao).slice(0, 1500))}</div>` : ''}
      </div>
      ${link ? `<p><a href="${escHtml(link)}" style="background:#199cb1;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:bold">Abrir no portal</a></p>` : ''}
      <p style="font-size:12px;color:#9db3bc">Portal MyBlue · Central de Tickets</p></div>`;
    return { subject: assunto, text: linhas.join('\n'), html };
  }

  /*
   * usuarios: ids de quem recebe (quem fez a ação é retirado)
   * n: { ticket_id, tipo, titulo, texto, email (bool), autor_id }
   */
  async function notificar(usuarios, n) {
    try {
      const ids = [...new Set(usuarios.filter((x) => x != null && x !== n.autor_id).map(Number))];
      if (!ids.length) return;
      const destino = (await db.q('SELECT id, nome, email FROM usuarios WHERE id = ANY($1::int[]) AND ativo', [ids])).rows;
      for (const u of destino) {
        await db.q('INSERT INTO notificacoes (usuario_id, ticket_id, tipo, titulo, texto) VALUES ($1, $2, $3, $4, $5)',
          [u.id, n.ticket_id, n.tipo, n.titulo, n.texto]);
      }
      if (!n.email || !enviar) return;
      const ticket = await db.um('SELECT t.id, t.titulo, t.descricao, t.prazo, s.nome AS setor_nome FROM tickets t JOIN setores s ON s.id = t.setor_id WHERE t.id = $1', [n.ticket_id]);
      if (!ticket) return;
      const msg = montarEmail(n, ticket);
      // e-mail sai em segundo plano: a tela não espera o servidor de e-mail
      for (const u of destino) {
        Promise.resolve(enviar({ to: `"${u.nome.replace(/["\r\n]/g, '')}" <${u.email}>`, ...msg }))
          .catch((e) => console.error('[avisos] falha ao enviar e-mail para', u.email, '-', e.message));
      }
    } catch (e) {
      console.error('[avisos]', e.message);
    }
  }

  /* quem recebe os tickets novos de um setor: líderes; se não houver líder, a equipe toda */
  async function triagemDoSetor(setorId) {
    const { rows } = await db.q(`SELECT sm.usuario_id, sm.lider FROM setor_membros sm JOIN usuarios u ON u.id = sm.usuario_id
      WHERE sm.setor_id = $1 AND u.ativo`, [setorId]);
    const lideres = rows.filter((r) => r.lider).map((r) => r.usuario_id);
    return lideres.length ? lideres : rows.map((r) => r.usuario_id);
  }

  return { notificar, triagemDoSetor, emailAtivo: !!enviar };
}

module.exports = { criarNotificador };
