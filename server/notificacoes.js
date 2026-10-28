'use strict';
/*
 * Avisos do portal (Central de Tickets e demonstrativos de comissão).
 *  - No portal: cada aviso vira uma linha em "notificacoes" (sino com contador, som e alerta do navegador).
 *  - Por e-mail: Microsoft 365 (Graph) ou SMTP, quando configurado (veja server/email.js). Sem isso, só o aviso no portal.
 * Nada aqui derruba a requisição: falha de e-mail só vai para o log.
 */

const { criarEnvioEmail } = require('./email');
const { montarHtml } = require('./email-layout');

function criarNotificador(db, cfg) {
  let correio = null;
  try {
    correio = cfg.enviarEmail ? { tipo: 'teste', remetente: 'teste', enviar: cfg.enviarEmail } : criarEnvioEmail();
  } catch (e) {
    console.error('[avisos] e-mail desligado:', e.message);
  }
  const enviar = correio && correio.enviar;
  if (!cfg.silencioso) console.log(correio ? `[avisos] e-mail dos tickets: ${correio.tipo} (${correio.remetente})` : '[avisos] e-mail não configurado: avisos de tickets só aparecem dentro do portal.');

  const urlPortal = () => String(process.env.PORTAL_URL || cfg.portalUrl || '').replace(/\/+$/, '');

  const prazoBr = (d) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

  /* aviso de ticket: o layout padrão com o quadro do ticket (número, setor, prazo) e a descrição */
  function montarEmail(n, ticket, para) {
    const d = n.detalhes || {};
    return montarHtml({
      ...n, link: `#/tickets/${ticket.id}`,
      detalhes: {
        assunto: `[Ticket #${ticket.id}] ${n.titulo}`, botao: 'Abrir ticket', motivo: 'você participa deste ticket',
        linhas: [['Ticket', `#${ticket.id} · ${ticket.titulo}`], ['Setor', ticket.setor_nome], ['Prazo', ticket.prazo ? prazoBr(ticket.prazo) : null]],
        pre: ticket.descricao ? String(ticket.descricao).slice(0, 1500) : null,
        ...d,
      },
    }, { portalUrl: urlPortal(), destinatario: para });
  }

  /* aviso que não é de ticket: layout padrão com o botão para a tela do portal (n.link, ex.: "#/comissoes") */
  function montarEmailSimples(n, para) {
    return montarHtml(n, { portalUrl: urlPortal(), destinatario: para });
  }

  /*
   * Fila de envio: no máximo 2 e-mails ao mesmo tempo (o Microsoft 365 recusa com 429 "MailboxConcurrency" quando
   * muitos saem juntos, ex.: demonstrativos do mês). Recusa por limite tenta de novo em 3 s, 10 s e 30 s.
   */
  const ESPERAS = cfg.esperasEmail || [3000, 10000, 30000];
  const limite = (e) => /\((429|503)\)|MailboxConcurrency|ApplicationThrottled|throttl/i.test(String((e && e.message) || e));
  const fila = [];
  let ativos = 0;
  function enfileirar(tarefa) {
    return new Promise((ok, falha) => { fila.push({ tarefa, ok, falha }); proximo(); });
  }
  function proximo() {
    while (ativos < 2 && fila.length) {
      const { tarefa, ok, falha } = fila.shift();
      ativos++;
      (async () => {
        for (let i = 0; ; i++) {
          try { return await tarefa(); } catch (e) {
            if (!limite(e) || i >= ESPERAS.length) throw e;
            await new Promise((r) => setTimeout(r, ESPERAS[i]));
          }
        }
      })().then(ok, falha).finally(() => { ativos--; proximo(); });
    }
  }

  /*
   * usuarios: ids de quem recebe (quem fez a ação é retirado)
   * n: { ticket_id, link, tipo, titulo, texto, email (bool), autor_id, detalhes? }
   * detalhes: só para o e-mail (quadro, lista, botão…), veja server/email-layout.js
   */
  async function notificar(usuarios, n) {
    try {
      const ids = [...new Set(usuarios.filter((x) => x != null && x !== n.autor_id).map(Number))];
      if (!ids.length) return;
      const destino = (await db.q('SELECT id, nome, email FROM usuarios WHERE id = ANY($1::int[]) AND ativo', [ids])).rows;
      const avisoDe = {};
      for (const u of destino) {
        avisoDe[u.id] = (await db.um('INSERT INTO notificacoes (usuario_id, ticket_id, tipo, titulo, texto, link) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
          [u.id, n.ticket_id || null, n.tipo, n.titulo, n.texto, n.link || null])).id;
      }
      if (!n.email || !enviar) return;
      let ticket = null;
      if (n.ticket_id) {
        ticket = await db.um('SELECT t.id, t.titulo, t.descricao, t.prazo, s.nome AS setor_nome FROM tickets t JOIN setores s ON s.id = t.setor_id WHERE t.id = $1', [n.ticket_id]);
        if (!ticket) return;
      }
      // e-mail sai em segundo plano (pela fila): a tela não espera o servidor de e-mail
      // o resultado fica no aviso (email_enviado_em ou email_erro)
      for (const u of destino) {
        const para = { nome: u.nome, email: u.email };
        const msg = ticket ? montarEmail(n, ticket, para) : montarEmailSimples(n, para);
        enfileirar(() => enviar({ para, ...msg }))
          .then(() => db.q('UPDATE notificacoes SET email_enviado_em = now(), email_erro = NULL WHERE id = $1', [avisoDe[u.id]]))
          .catch((e) => {
            console.error('[avisos] falha ao enviar e-mail para', u.email, '-', e.message);
            return db.q('UPDATE notificacoes SET email_erro = $2 WHERE id = $1', [avisoDe[u.id], String(e.message || e).slice(0, 500)]).catch(() => {});
          });
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

  /* e-mail de teste pela administração: aqui o erro volta para a tela */
  async function emailTeste(u) {
    if (!enviar) throw new Error('O envio de e-mail não está configurado no servidor.');
    const m = montarHtml({
      tipo: 'teste', titulo: 'Teste de e-mail — Portal MyBlue', link: null,
      texto: 'Os avisos do portal estão chegando por e-mail, neste layout.',
      detalhes: {
        tom: 'ok', etiqueta: 'E-mail funcionando', botao: 'Abrir o portal', motivo: 'a administração pediu um e-mail de teste',
        nota: urlPortal() ? null : 'Falta definir PORTAL_URL para os e-mails terem a logo e o link do portal.',
      },
    }, { portalUrl: urlPortal(), destinatario: u });
    await enviar({ para: { nome: u.nome, email: u.email }, ...m });
  }

  // agenda do Microsoft 365 (convite do onboarding da Implantação); sem Graph, null
  const agenda = cfg.agenda || (correio && correio.agenda) || null;
  return { notificar, triagemDoSetor, emailTeste, agenda, emailAtivo: !!enviar, emailTipo: correio ? correio.tipo : null, emailRemetente: correio ? correio.remetente : null };
}

module.exports = { criarNotificador };
