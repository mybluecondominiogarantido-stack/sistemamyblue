'use strict';
/*
 * Convite do onboarding no Outlook (agenda do Microsoft 365, veja server/email.js).
 * Ao salvar o onboarding como "marcado", o portal cria uma reunião de 1h com link do Teams no calendário da caixa
 * que envia os avisos, para: a assistente que conduz (e quem faz, se for outra pessoa), as pessoas do setor CS
 * (sem a liderança) e o síndico (e-mail do formulário). Mudar a data ou a hora atualiza o convite;
 * sair de "marcado" (a marcar, síndico MyBlue) cancela. "Realizado" mantém o convite como está.
 * O que foi feito fica em implantacoes.onboarding_convite: { id, quando, para, em } ou { erro, em }.
 * Sem Microsoft 365 configurado, nada é enviado (o onboarding salva normalmente).
 */
const SETOR_CS = 'CS';

const somaHora = (hora) => {
  const [h, m] = hora.split(':').map(Number);
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
const dataBr = (d) => d.split('-').reverse().join('/');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* quem recebe: assistente que conduz, quem faz (se outra pessoa), setor CS (sem a liderança) e o síndico */
async function participantes(db, i, onboarding, gestores = ['coordenador', 'supervisor']) {
  const ids = [...new Set([i.responsavel_id, onboarding.por].filter(Boolean))];
  const gente = ids.length ? (await db.q('SELECT nome, email FROM usuarios WHERE id = ANY($1::int[]) AND ativo', [ids])).rows : [];
  const cs = (await db.q(`SELECT u.nome, u.email, u.papel, sm.lider FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id JOIN usuarios u ON u.id = sm.usuario_id
    WHERE s.nome = $1 AND u.ativo ORDER BY u.nome`, [SETOR_CS])).rows.filter((x) => !x.lider && !gestores.includes(x.papel));
  const f = i.formulario || {};
  const sindico = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(f.sindico_email || '').trim()) ? [{ nome: f.sindico_nome || 'Síndico', email: String(f.sindico_email).trim() }] : [];
  const vistos = new Set();
  return [...gente, ...cs, ...sindico].map((x) => ({ nome: x.nome, email: String(x.email || '').trim() }))
    .filter((x) => x.email && !vistos.has(x.email.toLowerCase()) && vistos.add(x.email.toLowerCase()));
}

function montar(i, onboarding, para) {
  const f = i.formulario || {};
  const nome = f.nome || i.condominio;
  return {
    assunto: `Onboarding · ${nome}`,
    inicio: `${onboarding.data}T${onboarding.hora}`,
    fim: `${onboarding.data}T${somaHora(onboarding.hora)}`,
    participantes: para,
    html: `<p>Reunião de boas-vindas (onboarding) do <b>${esc(nome)}</b> com o síndico${f.sindico_nome ? ` ${esc(f.sindico_nome)}` : ''}.</p>` +
      `<p>${dataBr(onboarding.data)}, das ${esc(onboarding.hora)} às ${somaHora(onboarding.hora)} (horário de Brasília), pelo Teams.</p>` +
      `<p>Implantação ${esc(i.protocolo || '')}${f.administradora ? ` · administradora ${esc(f.administradora)}` : ''}.</p>`,
  };
}

/* Acerta o convite depois de salvar o onboarding. Devolve { situacao, mensagem } para a tela; nunca lança. */
async function acertarConvite({ db, agenda, gestores }, i, onboarding) {
  const atual = i.onboarding_convite || null;
  const marcado = onboarding.situacao === 'marcado' && /^\d{4}-\d{2}-\d{2}$/.test(onboarding.data) && /^\d{2}:\d{2}$/.test(onboarding.hora);
  const guardar = (v) => db.q('UPDATE implantacoes SET onboarding_convite = $2::jsonb WHERE id = $1', [i.id, v ? JSON.stringify(v) : null]);
  if (!agenda) return { situacao: 'sem_agenda', mensagem: '' };
  try {
    if (marcado) {
      const quando = `${onboarding.data}T${onboarding.hora}`;
      const para = await participantes(db, i, onboarding, gestores);
      if (atual && atual.id && atual.quando === quando) return { situacao: 'mantido', mensagem: '' };
      const x = montar(i, onboarding, para);
      const r = atual && atual.id ? await agenda.atualizar(atual.id, x) : await agenda.criar(x);
      await guardar({ id: r.id, quando, para: para.map((p) => p.email), em: new Date().toISOString() });
      return { situacao: atual && atual.id ? 'atualizado' : 'enviado',
        mensagem: `${atual && atual.id ? 'Convite do Outlook atualizado' : 'Convite do Outlook enviado'} (${dataBr(onboarding.data)}, ${onboarding.hora} às ${somaHora(onboarding.hora)}, no Teams) para ${para.map((p) => p.nome).join(', ')}.` };
    }
    // realizado: o convite fica como está; a marcar ou síndico MyBlue: cancela
    if (atual && atual.id && onboarding.situacao !== 'realizado') {
      await agenda.cancelar(atual.id, 'O onboarding foi desmarcado no portal.');
      await guardar(null);
      return { situacao: 'cancelado', mensagem: 'Convite do Outlook cancelado: os convidados recebem o cancelamento.' };
    }
    return { situacao: 'nada', mensagem: '' };
  } catch (e) {
    console.error('[implantação] convite do onboarding:', e.message);
    await guardar({ ...(atual || {}), erro: e.message, em: new Date().toISOString() }).catch(() => {});
    return { situacao: 'erro', mensagem: `O onboarding foi salvo, mas o convite do Outlook não saiu: ${e.message}` };
  }
}

module.exports = { acertarConvite, participantes, montar, SETOR_CS };
