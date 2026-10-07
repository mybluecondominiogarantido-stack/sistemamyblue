'use strict';
/*
 * Central de Tickets: demandas internas entre setores.
 *
 * Fluxo: quem abre escolhe o setor, o tipo de demanda e o condomínio (ou "interno"); se o setor
 * tem pessoa definida na carteira do condomínio (ex.: Crédito, Cobrança), o ticket já vai para ela;
 * senão cai na fila do setor e o líder distribui para uma pessoa (ou alguém do setor assume); o responsável trata,
 * comenta e resolve. Pode ser transferido para outro setor.
 *
 * Quem vê um ticket: quem abriu, o responsável, as pessoas do setor dele e a administração.
 * Notas internas e anexos internos: só o setor, o responsável e a administração.
 */
const express = require('express');
const carteira = require('../carteira');

const PRIORIDADES = ['baixa', 'media', 'alta', 'urgente'];
const STATUS = ['novo', 'em_andamento', 'aguardando', 'resolvido', 'cancelado'];
const EM_ABERTO = "('novo','em_andamento','aguardando')";
// prazo usado quando o tipo de demanda não define um, em horas de expediente
// (dia útil de 9 h: urgente 4 h, alta 1 dia útil, média 3 dias úteis, baixa 5 dias úteis)
const PRAZO_PADRAO_HORAS = { urgente: 4, alta: 9, media: 27, baixa: 45 };

const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
// administração e supervisão: veem e direcionam os tickets de todos os setores
const ehGestor = (u) => u.papel === 'admin' || !!u.supervisor_tickets;

function rotasTickets({ db, seg, cfg, avisos, expediente }) {
  const r = express.Router();
  const json = express.json({ limit: '1mb' });
  const limiteAnexo = (cfg.limiteAnexoMb || 10) * 1024 * 1024;
  r.use('/api/tickets', seg.exigirLogin);
  const erro = (res, status, msg) => res.status(status).json({ erro: msg });

  /* setores de que a pessoa faz parte: Map setor_id → { lider } */
  async function equipesDe(u) {
    const { rows } = await db.q('SELECT setor_id, lider FROM setor_membros WHERE usuario_id = $1', [u.id]);
    return new Map(rows.map((x) => [x.setor_id, { lider: !!x.lider }]));
  }

  /* o que a pessoa pode fazer neste ticket */
  function papeis(u, t, equipes) {
    const admin = ehGestor(u);
    const membro = equipes.has(t.setor_id);
    const lider = admin || (membro && equipes.get(t.setor_id).lider);
    const responsavel = t.responsavel_id === u.id;
    const solicitante = t.solicitante_id === u.id;
    const equipe = admin || membro || responsavel; // trata o ticket
    const aberto = ['novo', 'em_andamento', 'aguardando'].includes(t.status);
    return {
      ver: equipe || solicitante,
      equipe,
      lider,
      atribuir: lider, // escolhe qualquer pessoa do setor
      assumir: (admin || membro) && !responsavel && aberto,
      interno: equipe,
      cancelar: (equipe || solicitante) && aberto,
      reabrir: (equipe || solicitante) && !aberto,
    };
  }

  async function carregar(id) {
    return db.um('SELECT * FROM tickets WHERE id = $1', [Number(id) || 0]);
  }

  /* busca o ticket e confere se a pessoa pode vê-lo */
  async function ticketVisivel(req, res) {
    const t = await carregar(req.params.id);
    const equipes = await equipesDe(req.usuario);
    if (!t || !papeis(req.usuario, t, equipes).ver) { erro(res, 404, 'Ticket não encontrado.'); return null; }
    return { t, equipes, p: papeis(req.usuario, t, equipes) };
  }

  async function registrar(t, ticketId, usuarioId, tipo, textoEv, interno, detalhe) {
    await t.q('INSERT INTO ticket_eventos (ticket_id, usuario_id, tipo, texto, interno, detalhe) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
      [ticketId, usuarioId, tipo, textoEv || null, !!interno, detalhe == null ? null : JSON.stringify(detalhe)]);
  }

  const ehMembro = async (setorId, usuarioId) => !!(await db.um('SELECT 1 FROM setor_membros WHERE setor_id = $1 AND usuario_id = $2', [setorId, usuarioId]));

  /* ===================== dados para os formulários ===================== */
  r.get('/api/tickets/meta', async (req, res) => {
    const equipes = await equipesDe(req.usuario);
    const setores = (await db.q('SELECT id, nome, ordem FROM setores ORDER BY ordem, nome')).rows;
    const cats = (await db.q('SELECT id, setor_id, nome, prazo_horas, prioridade FROM ticket_categorias WHERE ativo ORDER BY nome')).rows;
    const membros = (await db.q(`SELECT sm.setor_id, sm.lider, u.id, u.nome FROM setor_membros sm JOIN usuarios u ON u.id = sm.usuario_id
      WHERE u.ativo ORDER BY u.nome`)).rows;
    const admin = ehGestor(req.usuario);
    const responsavel = await carteira.carregarRegras(db);
    const conds = (await db.q('SELECT id, nome, comarca, situacao, pessoas FROM condominios WHERE na_carteira ORDER BY nome, comarca')).rows;
    res.json({
      // condomínios da carteira e, por setor, quem recebe o ticket automaticamente
      condominios: conds.map((c) => {
        const resp = {};
        for (const s of setores) { const x = responsavel(c, s.id); if (x && x.id) resp[s.id] = x.nome; }
        return { id: c.id, nome: c.nome, comarca: c.comarca, distratado: c.situacao !== 'ATIVO', resp };
      }),
      setores: setores.map((s) => ({
        ...s,
        categorias: cats.filter((c) => c.setor_id === s.id),
        // a lista de pessoas só vai para quem é do setor (para atribuir)
        membros: admin || equipes.has(s.id) ? membros.filter((m) => m.setor_id === s.id).map((m) => ({ id: m.id, nome: m.nome, lider: !!m.lider })) : undefined,
        meu: equipes.has(s.id) ? { lider: equipes.get(s.id).lider } : null,
      })),
      prazo_padrao_horas: PRAZO_PADRAO_HORAS,
      expediente: expediente.config,
    });
  });

  /* contadores do menu */
  r.get('/api/tickets/resumo', async (req, res) => {
    const u = req.usuario;
    const equipes = await equipesDe(u);
    const lider = [...equipes].filter(([, e]) => e.lider).map(([id]) => id);
    const meus = await db.um(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE prazo < now())::int AS atrasados
      FROM tickets WHERE responsavel_id = $1 AND status IN ${EM_ABERTO}`, [u.id]);
    const setores = ehGestor(u) ? null : [...equipes.keys()];
    const fila = await db.um(`SELECT COUNT(*)::int AS n FROM tickets WHERE responsavel_id IS NULL AND status IN ${EM_ABERTO}
      ${setores ? 'AND setor_id = ANY($1::int[])' : ''}`, setores ? [setores] : []);
    res.json({ minha_fila: meus.n, minha_fila_atrasados: meus.atrasados, sem_responsavel: fila.n, lider_de: lider });
  });

  /* ===================== listagem ===================== */
  r.get('/api/tickets', async (req, res) => {
    const u = req.usuario;
    const equipes = await equipesDe(u);
    const args = [];
    const p = (v) => { args.push(v); return '$' + args.length; };
    const where = [];
    const vis = String(req.query.vis || 'minha');
    if (vis === 'minha') where.push('t.responsavel_id = ' + p(u.id));
    else if (vis === 'abertos') where.push('t.solicitante_id = ' + p(u.id));
    else if (vis === 'setor') {
      if (ehGestor(u) && !equipes.size) where.push('TRUE');
      else where.push('t.setor_id = ANY(' + p([...equipes.keys()]) + '::int[])');
    } else if (vis === 'todos') {
      if (!ehGestor(u)) return erro(res, 403, 'Apenas a administração e a supervisão veem todos os tickets.');
    } else return erro(res, 400, 'Visão inválida.');

    const st = String(req.query.status || 'abertos');
    if (st === 'abertos') where.push(`t.status IN ${EM_ABERTO}`);
    else if (STATUS.includes(st)) where.push('t.status = ' + p(st));
    else if (st !== 'todos') return erro(res, 400, 'Status inválido.');
    if (req.query.setor) where.push('t.setor_id = ' + p(Number(req.query.setor)));
    if (req.query.condominio === 'interno') where.push('t.demanda_interna');
    else if (req.query.condominio) where.push('t.condominio_id = ' + p(Number(req.query.condominio)));
    if (req.query.responsavel === 'nenhum') where.push('t.responsavel_id IS NULL');
    else if (req.query.responsavel) where.push('t.responsavel_id = ' + p(Number(req.query.responsavel)));
    if (req.query.prioridade && PRIORIDADES.includes(req.query.prioridade)) where.push('t.prioridade = ' + p(req.query.prioridade));
    if (req.query.atrasados === '1') where.push(`t.prazo < now() AND t.status IN ${EM_ABERTO}`);
    const busca = texto(req.query.q, 100);
    if (busca) {
      const n = Number(busca.replace(/^#/, ''));
      where.push(`(t.titulo ILIKE ${p('%' + busca + '%')} OR t.descricao ILIKE $${args.length} OR cd.nome ILIKE $${args.length}${Number.isInteger(n) && n > 0 ? ' OR t.id = ' + p(n) : ''})`);
    }
    const limite = Math.min(Number(req.query.limite) || 200, 500);
    const { rows } = await db.q(`SELECT t.id, t.titulo, t.status, t.prioridade, t.prazo, t.criado_em, t.atualizado_em, t.resolvido_em,
        t.setor_id, s.nome AS setor_nome, c.nome AS categoria_nome, t.condominio_id, cd.nome AS condominio_nome, t.demanda_interna,
        t.solicitante_id, us.nome AS solicitante_nome, t.responsavel_id, ur.nome AS responsavel_nome,
        (t.prazo < now() AND t.status IN ${EM_ABERTO}) AS atrasado,
        (SELECT COUNT(*)::int FROM ticket_eventos e WHERE e.ticket_id = t.id AND e.tipo = 'comentario') AS comentarios
      FROM tickets t JOIN setores s ON s.id = t.setor_id
      LEFT JOIN ticket_categorias c ON c.id = t.categoria_id LEFT JOIN condominios cd ON cd.id = t.condominio_id
      LEFT JOIN usuarios us ON us.id = t.solicitante_id LEFT JOIN usuarios ur ON ur.id = t.responsavel_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY (t.status IN ${EM_ABERTO}) DESC,
        CASE t.prioridade WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
        t.prazo NULLS LAST, t.id DESC
      LIMIT ${p(limite)}`, args);
    res.json({ tickets: rows });
  });

  /* ===================== abrir ticket ===================== */
  r.post('/api/tickets', json, async (req, res) => {
    const b = req.body || {};
    const titulo = texto(b.titulo, 160);
    const descricao = texto(b.descricao, 10000);
    if (!titulo) return erro(res, 400, 'Informe o assunto do ticket.');
    const setor = await db.um('SELECT id, nome FROM setores WHERE id = $1', [Number(b.setor_id) || 0]);
    if (!setor) return erro(res, 400, 'Escolha o setor que vai atender.');
    let cat = null;
    if (b.categoria_id) {
      cat = await db.um('SELECT * FROM ticket_categorias WHERE id = $1 AND setor_id = $2 AND ativo', [Number(b.categoria_id), setor.id]);
      if (!cat) return erro(res, 400, 'Tipo de demanda inválido para este setor.');
    }
    // condomínio da carteira ou demanda interna (não é de condomínio)
    const interna = b.interno === true || b.condominio_id === 'interno';
    let cond = null;
    if (!interna) {
      cond = await db.um('SELECT id, nome FROM condominios WHERE id = $1', [Number(b.condominio_id) || 0]);
      if (!cond) return erro(res, 400, 'Escolha o condomínio (ou "Interno", se não for de um condomínio).');
    }
    const prioridade = PRIORIDADES.includes(b.prioridade) ? b.prioridade : cat ? cat.prioridade : 'media';
    const horas = cat && cat.prazo_horas ? cat.prazo_horas : PRAZO_PADRAO_HORAS[prioridade];
    const prazo = expediente.somarHorasUteis(new Date(), horas);
    // pessoa da carteira do condomínio neste setor (ex.: assistente de crédito, analista de cobrança)
    const auto = cond ? await carteira.responsavelAutomatico(db, cond.id, setor.id) : null;
    const id = await db.tx(async (t) => {
      const { id: novo } = await t.um(`INSERT INTO tickets (titulo, descricao, setor_id, categoria_id, prioridade, solicitante_id, prazo, condominio_id, demanda_interna, responsavel_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [titulo, descricao, setor.id, cat ? cat.id : null, prioridade, req.usuario.id, prazo, cond ? cond.id : null, interna, auto ? auto.id : null]);
      await registrar(t, novo, req.usuario.id, 'criado', null, false, { setor: setor.nome, prioridade, condominio: cond ? cond.nome : 'Interno' });
      if (auto) await registrar(t, novo, null, 'atribuicao', null, false, { para: auto.nome, para_id: auto.id, automatico: true, condominio: cond.nome });
      return novo;
    });
    await seg.auditar(req, 'ticket_criado', null, { ticket: id, setor: setor.nome, titulo, condominio: cond ? cond.nome : 'Interno', responsavel: auto ? auto.nome : null });
    const sobre = cond ? ` (${cond.nome})` : '';
    if (auto) {
      await avisos.notificar([auto.id], {
        ticket_id: id, autor_id: req.usuario.id, tipo: 'atribuido', email: true,
        titulo: `Novo ticket #${id} para você`, texto: `${req.usuario.nome} abriu o ticket #${id} para ${setor.nome}${sobre}: ${titulo}. Veio direto para você por ser o condomínio da sua carteira.`,
      });
    } else {
      await avisos.notificar(await avisos.triagemDoSetor(setor.id), {
        ticket_id: id, autor_id: req.usuario.id, tipo: 'novo', email: true,
        titulo: `Novo ticket para ${setor.nome}`, texto: `${req.usuario.nome} abriu o ticket #${id} para ${setor.nome}${sobre}: ${titulo}`,
      });
    }
    res.status(201).json({ id, responsavel: auto ? { id: auto.id, nome: auto.nome } : null });
  });

  /* ===================== detalhe ===================== */
  r.get('/api/tickets/:id', async (req, res) => {
    const v = await ticketVisivel(req, res);
    if (!v) return;
    const { t, p } = v;
    const info = await db.um(`SELECT s.nome AS setor_nome, c.nome AS categoria_nome, us.nome AS solicitante_nome, us.email AS solicitante_email,
        ur.nome AS responsavel_nome, cd.nome AS condominio_nome, cd.comarca AS condominio_comarca, cd.razao_social AS condominio_razao_social, cd.cnpj AS condominio_cnpj
        FROM tickets t JOIN setores s ON s.id = t.setor_id LEFT JOIN ticket_categorias c ON c.id = t.categoria_id LEFT JOIN condominios cd ON cd.id = t.condominio_id
        LEFT JOIN usuarios us ON us.id = t.solicitante_id LEFT JOIN usuarios ur ON ur.id = t.responsavel_id WHERE t.id = $1`, [t.id]);
    const eventos = (await db.q(`SELECT e.id, e.tipo, e.texto, e.interno, e.detalhe, e.criado_em, e.usuario_id, u.nome AS usuario_nome
      FROM ticket_eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id WHERE e.ticket_id = $1 ${p.interno ? '' : 'AND NOT e.interno'} ORDER BY e.id`, [t.id])).rows;
    const anexos = (await db.q(`SELECT a.id, a.nome, a.tipo, a.tamanho, a.interno, a.enviado_em, u.nome AS enviado_por_nome
      FROM ticket_anexos a LEFT JOIN usuarios u ON u.id = a.enviado_por WHERE a.ticket_id = $1 ${p.interno ? '' : 'AND NOT a.interno'} ORDER BY a.id`, [t.id])).rows;
    await db.q('UPDATE notificacoes SET lida = TRUE WHERE usuario_id = $1 AND ticket_id = $2 AND NOT lida', [req.usuario.id, t.id]);
    const atrasado = !!(t.prazo && new Date(t.prazo) < new Date() && ['novo', 'em_andamento', 'aguardando'].includes(t.status));
    res.json({ ticket: { ...t, ...info, atrasado }, eventos, anexos, pode: p });
  });

  /* ===================== comentário / nota interna ===================== */
  r.post('/api/tickets/:id/comentarios', json, async (req, res) => {
    const v = await ticketVisivel(req, res);
    if (!v) return;
    const { t, p } = v;
    const msg = texto(req.body && req.body.texto, 10000);
    if (!msg) return erro(res, 400, 'Escreva o comentário.');
    const interno = !!(req.body && req.body.interno);
    if (interno && !p.interno) return erro(res, 403, 'Notas internas são só da equipe do setor.');
    await db.tx(async (tx) => {
      await registrar(tx, t.id, req.usuario.id, 'comentario', msg, interno, null);
      // 1ª resposta: primeiro retorno visível de alguém da equipe (que não seja quem abriu)
      const primeira = !interno && p.equipe && req.usuario.id !== t.solicitante_id && !t.primeira_resposta_em;
      await tx.q(`UPDATE tickets SET atualizado_em = now()${primeira ? ', primeira_resposta_em = now()' : ''} WHERE id = $1`, [t.id]);
    });
    // nota interna: só o responsável; comentário: quem abriu e o responsável
    await avisos.notificar(interno ? [t.responsavel_id] : [t.solicitante_id, t.responsavel_id], {
      ticket_id: t.id, autor_id: req.usuario.id, tipo: 'comentario', email: false,
      titulo: `${interno ? 'Nota interna' : 'Novo comentário'} no ticket #${t.id}`, texto: `${req.usuario.nome}: ${msg.slice(0, 300)}`,
    });
    res.status(201).json({ ok: true });
  });

  /* avisos de cada mudança (no portal e, nas principais, por e-mail) */
  async function avisarMudancas(u, t, eventos, motivo) {
    const base = { ticket_id: t.id, autor_id: u.id };
    for (const [tipo, , det] of eventos) {
      if (tipo === 'atribuicao' && det.para_id) {
        await avisos.notificar([det.para_id], { ...base, tipo: 'atribuido', email: true,
          titulo: `Ticket #${t.id} passado para você`, texto: `${u.nome} passou para você o ticket #${t.id}: ${t.titulo}${motivo ? ` (${motivo})` : ''}` });
      } else if (tipo === 'transferencia') {
        const novo = await db.um('SELECT setor_id FROM tickets WHERE id = $1', [t.id]);
        // foi direto para a pessoa da carteira do condomínio: ela é avisada pela atribuição
        const direto = eventos.some(([tp, , d]) => tp === 'atribuicao' && d.automatico);
        if (!direto) await avisos.notificar(await avisos.triagemDoSetor(novo.setor_id), { ...base, tipo: 'novo', email: true,
          titulo: `Ticket #${t.id} transferido para ${det.para}`, texto: `${u.nome} transferiu de ${det.de} para ${det.para} o ticket #${t.id}: ${t.titulo}${motivo ? ` (${motivo})` : ''}` });
        await avisos.notificar([t.solicitante_id], { ...base, tipo: 'transferido', email: false,
          titulo: `Seu ticket #${t.id} foi para ${det.para}`, texto: `${u.nome} transferiu seu ticket de ${det.de} para ${det.para}.` });
      } else if (tipo === 'status' && ['resolvido', 'cancelado'].includes(det.para)) {
        await avisos.notificar([t.solicitante_id, t.responsavel_id], { ...base, tipo: det.para, email: true,
          titulo: `Ticket #${t.id} ${det.para}`, texto: `${u.nome} marcou como ${det.para} o ticket #${t.id}: ${t.titulo}${motivo ? `. ${motivo}` : ''}` });
      } else if (tipo === 'status' && ['resolvido', 'cancelado'].includes(det.de)) {
        const quem = t.responsavel_id ? [t.responsavel_id] : await avisos.triagemDoSetor(t.setor_id);
        await avisos.notificar([...quem, t.solicitante_id], { ...base, tipo: 'reaberto', email: true,
          titulo: `Ticket #${t.id} reaberto`, texto: `${u.nome} reabriu o ticket #${t.id}: ${t.titulo}${motivo ? `. Motivo: ${motivo}` : ''}` });
      } else if (tipo === 'status' || tipo === 'prazo' || tipo === 'prioridade') {
        await avisos.notificar([t.solicitante_id, t.responsavel_id], { ...base, tipo, email: false,
          titulo: `Ticket #${t.id} atualizado`, texto: `${u.nome} alterou ${tipo === 'status' ? 'a situação' : tipo === 'prazo' ? 'o prazo' : 'a prioridade'} do ticket #${t.id}.` });
      }
    }
  }

  /* ===================== mudanças: status, responsável, prioridade, prazo, setor ===================== */
  r.patch('/api/tickets/:id', json, async (req, res) => {
    const v = await ticketVisivel(req, res);
    if (!v) return;
    const { t, p } = v;
    const b = req.body || {};
    const u = req.usuario;
    const sets = [];
    const eventos = [];
    const args = [];
    const set = (col, val) => { args.push(val); sets.push(`${col} = $${args.length}`); };
    const motivo = texto(b.motivo, 2000) || null;

    if (b.status !== undefined && b.status !== t.status) {
      if (!STATUS.includes(b.status)) return erro(res, 400, 'Status inválido.');
      const permitido = p.equipe || (b.status === 'cancelado' && p.cancelar) || (b.status === 'em_andamento' && p.reabrir);
      if (!permitido) return erro(res, 403, 'Você não pode mudar a situação deste ticket.');
      set('status', b.status);
      if (b.status === 'resolvido') sets.push('resolvido_em = now()');
      else if (t.resolvido_em) sets.push('resolvido_em = NULL');
      if (p.equipe && u.id !== t.solicitante_id && !t.primeira_resposta_em) sets.push('primeira_resposta_em = now()');
      eventos.push(['status', motivo, { de: t.status, para: b.status }]);
    }

    if (b.setor_id !== undefined && Number(b.setor_id) !== t.setor_id) {
      if (!p.equipe) return erro(res, 403, 'Só a equipe que atende pode transferir o ticket.');
      const novo = await db.um('SELECT id, nome FROM setores WHERE id = $1', [Number(b.setor_id) || 0]);
      if (!novo) return erro(res, 400, 'Setor inválido.');
      let cat = null;
      if (b.categoria_id) {
        cat = await db.um('SELECT id, nome FROM ticket_categorias WHERE id = $1 AND setor_id = $2 AND ativo', [Number(b.categoria_id), novo.id]);
        if (!cat) return erro(res, 400, 'Tipo de demanda inválido para o novo setor.');
      }
      const antigo = await db.um('SELECT nome FROM setores WHERE id = $1', [t.setor_id]);
      set('setor_id', novo.id);
      set('categoria_id', cat ? cat.id : null);
      // vai para a pessoa da carteira do condomínio no novo setor, se houver; senão para a fila, sem responsável
      const auto = await carteira.responsavelAutomatico(db, t.condominio_id, novo.id);
      set('responsavel_id', auto ? auto.id : null);
      if (b.status === undefined && t.status !== 'novo' && ['em_andamento', 'aguardando'].includes(t.status)) sets.push("status = 'novo'");
      eventos.push(['transferencia', motivo, { de: antigo && antigo.nome, para: novo.nome, categoria: cat ? cat.nome : null }]);
      if (auto) eventos.push(['atribuicao', null, { para: auto.nome, para_id: auto.id, automatico: true }]);
    } else if (b.responsavel_id !== undefined) {
      const alvo = b.responsavel_id === null || b.responsavel_id === '' ? null : Number(b.responsavel_id);
      if (alvo !== t.responsavel_id) {
        // sem ser líder: só assumir para si ou devolver à fila o que está com você
        const proprio = (alvo === u.id && p.assumir) || (alvo === null && t.responsavel_id === u.id);
        if (!p.atribuir && !proprio) return erro(res, 403, 'Só o líder do setor distribui tickets para outras pessoas.');
        let nome = null;
        if (alvo !== null) {
          const pessoa = await db.um('SELECT id, nome FROM usuarios WHERE id = $1 AND ativo', [alvo]);
          if (!pessoa) return erro(res, 400, 'Pessoa inválida.');
          if (!(await ehMembro(t.setor_id, alvo)) && !(ehGestor(u) && alvo === u.id)) return erro(res, 400, 'A pessoa precisa fazer parte do setor do ticket.');
          nome = pessoa.nome;
        }
        set('responsavel_id', alvo);
        if (alvo !== null && t.status === 'novo' && b.status === undefined) sets.push("status = 'em_andamento'");
        eventos.push(['atribuicao', motivo, { para: nome, para_id: alvo }]);
      }
    }

    if (b.prioridade !== undefined && b.prioridade !== t.prioridade) {
      if (!p.equipe) return erro(res, 403, 'Só a equipe que atende muda a prioridade.');
      if (!PRIORIDADES.includes(b.prioridade)) return erro(res, 400, 'Prioridade inválida.');
      set('prioridade', b.prioridade);
      eventos.push(['prioridade', null, { de: t.prioridade, para: b.prioridade }]);
    }

    if (b.prazo !== undefined) {
      if (!p.equipe) return erro(res, 403, 'Só a equipe que atende muda o prazo.');
      const novo = b.prazo ? new Date(b.prazo) : null;
      if (novo && isNaN(novo)) return erro(res, 400, 'Prazo inválido.');
      if (String(novo && novo.toISOString()) !== String(t.prazo && new Date(t.prazo).toISOString())) {
        set('prazo', novo);
        eventos.push(['prazo', motivo, { de: t.prazo, para: novo }]);
      }
    }

    if (!sets.length) return res.json({ ok: true, sem_mudanca: true });
    args.push(t.id);
    await db.tx(async (tx) => {
      await tx.q(`UPDATE tickets SET ${sets.join(', ')}, atualizado_em = now() WHERE id = $${args.length}`, args);
      for (const [tipo, txt, det] of eventos) await registrar(tx, t.id, u.id, tipo, txt, false, det);
    });
    for (const [tipo, , det] of eventos) {
      if (tipo === 'atribuicao' || tipo === 'transferencia' || tipo === 'status') await seg.auditar(req, 'ticket_' + tipo, null, { ticket: t.id, ...det });
    }
    await avisarMudancas(u, t, eventos, motivo);
    res.json({ ok: true });
  });

  /* ===================== anexos ===================== */
  const corpoAnexo = express.raw({ type: () => true, limit: limiteAnexo });
  r.post('/api/tickets/:id/anexos', corpoAnexo, async (req, res) => {
    const v = await ticketVisivel(req, res);
    if (!v) return;
    const { t, p } = v;
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!buf.length) return erro(res, 400, 'Arquivo vazio.');
    let nome = 'arquivo';
    try { nome = decodeURIComponent(String(req.headers['x-nome-arquivo'] || 'arquivo')); } catch { /* mantém padrão */ }
    nome = nome.replace(/[\\/\r\n"]/g, '_').slice(0, 200) || 'arquivo';
    const tipo = /^[\w.+-]+\/[\w.+-]+$/.test(String(req.headers['content-type'] || '')) ? String(req.headers['content-type']) : 'application/octet-stream';
    const interno = req.headers['x-interno'] === '1';
    if (interno && !p.interno) return erro(res, 403, 'Anexos internos são só da equipe do setor.');
    const id = await db.tx(async (tx) => {
      const a = await tx.um(`INSERT INTO ticket_anexos (ticket_id, nome, tipo, tamanho, conteudo, interno, enviado_por)
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`, [t.id, nome, tipo, buf.length, buf, interno, req.usuario.id]);
      await registrar(tx, t.id, req.usuario.id, 'anexo', null, interno, { anexo: a.id, nome, tamanho: buf.length });
      await tx.q('UPDATE tickets SET atualizado_em = now() WHERE id = $1', [t.id]);
      return a.id;
    });
    res.status(201).json({ id });
  });

  const IMAGENS = /^image\/(png|jpeg|gif|webp)$/;
  r.get('/api/tickets/:id/anexos/:aid', async (req, res) => {
    const v = await ticketVisivel(req, res);
    if (!v) return;
    const a = await db.um('SELECT * FROM ticket_anexos WHERE id = $1 AND ticket_id = $2', [Number(req.params.aid) || 0, v.t.id]);
    if (!a || (a.interno && !v.p.interno)) return erro(res, 404, 'Anexo não encontrado.');
    // só imagens abrem no navegador; o resto é sempre baixado (nunca executa HTML enviado)
    const imagem = IMAGENS.test(a.tipo);
    res.set('Content-Type', imagem ? a.tipo : 'application/octet-stream');
    res.set('Content-Disposition', `${imagem && req.query.ver === '1' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.nome)}`);
    res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    res.set('Cache-Control', 'private, no-store');
    res.send(a.conteudo);
  });

  /* ===================== painel de indicadores ===================== */
  r.get('/api/tickets/painel/indicadores', async (req, res) => {
    const u = req.usuario;
    const equipes = await equipesDe(u);
    if (!ehGestor(u) && !equipes.size) return erro(res, 403, 'O painel mostra os setores de que você faz parte.');
    const dias = Math.min(Math.max(Number(req.query.dias) || 30, 1), 365);
    const args = [dias];
    let escopo = 'TRUE';
    if (!ehGestor(u)) { args.push([...equipes.keys()]); escopo = 't.setor_id = ANY($2::int[])'; }
    if (req.query.setor) { args.push(Number(req.query.setor)); escopo += ` AND t.setor_id = $${args.length}`; }
    const periodo = "t.resolvido_em >= now() - ($1::int * interval '1 day')";
    const metricas = `COUNT(*) FILTER (WHERE t.status IN ${EM_ABERTO})::int AS abertos,
      COUNT(*) FILTER (WHERE t.status IN ${EM_ABERTO} AND t.responsavel_id IS NULL)::int AS sem_responsavel,
      COUNT(*) FILTER (WHERE t.status IN ${EM_ABERTO} AND t.prazo < now())::int AS atrasados,
      COUNT(*) FILTER (WHERE t.status = 'resolvido' AND ${periodo})::int AS resolvidos,
      COUNT(*) FILTER (WHERE t.status = 'resolvido' AND ${periodo} AND (t.prazo IS NULL OR t.resolvido_em <= t.prazo))::int AS no_prazo,
      ROUND(AVG(EXTRACT(EPOCH FROM (t.resolvido_em - t.criado_em)) / 3600) FILTER (WHERE t.status = 'resolvido' AND ${periodo})::numeric, 1)::float AS horas_resolucao,
      ROUND(AVG(EXTRACT(EPOCH FROM (t.primeira_resposta_em - t.criado_em)) / 3600) FILTER (WHERE t.criado_em >= now() - ($1::int * interval '1 day') AND t.primeira_resposta_em IS NOT NULL)::numeric, 1)::float AS horas_primeira_resposta,
      COUNT(*) FILTER (WHERE t.criado_em >= now() - ($1::int * interval '1 day'))::int AS criados`;
    const geral = await db.um(`SELECT ${metricas} FROM tickets t WHERE ${escopo}`, args);
    const porSetor = (await db.q(`SELECT s.id, s.nome, ${metricas} FROM tickets t JOIN setores s ON s.id = t.setor_id WHERE ${escopo}
      GROUP BY s.id, s.nome, s.ordem ORDER BY s.ordem, s.nome`, args)).rows;
    const porPessoa = (await db.q(`SELECT u.id, u.nome, ${metricas} FROM tickets t JOIN usuarios u ON u.id = t.responsavel_id WHERE ${escopo}
      GROUP BY u.id, u.nome ORDER BY abertos DESC, u.nome`, args)).rows;
    const porStatus = (await db.q(`SELECT t.status, COUNT(*)::int AS n FROM tickets t WHERE $1::int > 0 AND ${escopo} AND t.status IN ${EM_ABERTO} GROUP BY t.status`, args)).rows;
    const porCategoria = (await db.q(`SELECT COALESCE(c.nome, 'Sem tipo') AS nome, s.nome AS setor, COUNT(*)::int AS n FROM tickets t
      JOIN setores s ON s.id = t.setor_id LEFT JOIN ticket_categorias c ON c.id = t.categoria_id
      WHERE ${escopo} AND t.criado_em >= now() - ($1::int * interval '1 day') GROUP BY c.nome, s.nome ORDER BY n DESC LIMIT 15`, args)).rows;
    res.json({ dias, geral, por_setor: porSetor, por_pessoa: porPessoa, por_status: porStatus, por_categoria: porCategoria });
  });

  /* ===================== avisos (sino) ===================== */
  r.get('/api/notificacoes', seg.exigirLogin, async (req, res) => {
    const desde = Number(req.query.desde) || 0;
    const lista = (await db.q(`SELECT id, ticket_id, tipo, titulo, texto, lida, criado_em FROM notificacoes WHERE usuario_id = $1
      ${desde ? 'AND id > $2' : ''} ORDER BY id DESC LIMIT 30`, desde ? [req.usuario.id, desde] : [req.usuario.id])).rows;
    const { n } = await db.um('SELECT COUNT(*)::int AS n FROM notificacoes WHERE usuario_id = $1 AND NOT lida', [req.usuario.id]);
    res.json({ notificacoes: lista, nao_lidas: n, email_ativo: avisos.emailAtivo });
  });

  r.post('/api/notificacoes/lidas', seg.exigirLogin, json, async (req, res) => {
    const b = req.body || {};
    if (b.todas) await db.q('UPDATE notificacoes SET lida = TRUE WHERE usuario_id = $1 AND NOT lida', [req.usuario.id]);
    else if (b.ticket_id) await db.q('UPDATE notificacoes SET lida = TRUE WHERE usuario_id = $1 AND ticket_id = $2', [req.usuario.id, Number(b.ticket_id)]);
    else if (Array.isArray(b.ids)) await db.q('UPDATE notificacoes SET lida = TRUE WHERE usuario_id = $1 AND id = ANY($2::int[])', [req.usuario.id, b.ids.map(Number).filter(Number.isInteger)]);
    res.json({ ok: true });
  });

  return r;
}

/* ===================== administração: equipes e tipos de demanda ===================== */
function rotasAdminTickets({ db, seg, avisos }) {
  const r = express.Router();
  const json = express.json({ limit: '1mb' });
  r.use('/api/admin/equipes', seg.exigirLogin, seg.exigirAdmin);
  r.use('/api/admin/categorias', seg.exigirLogin, seg.exigirAdmin);
  r.use('/api/admin/carteira', seg.exigirLogin, seg.exigirAdmin);
  const erro = (res, status, msg) => res.status(status).json({ erro: msg });
  const ehDuplicado = (e) => e && (e.code === '23505' || /duplicate key|unique/i.test(String(e.message)));

  r.post('/api/admin/equipes/email-teste', async (req, res) => {
    try {
      await avisos.emailTeste(req.usuario);
    } catch (e) {
      return erro(res, 400, e.message);
    }
    await seg.auditar(req, 'email_teste', null, { tipo: avisos.emailTipo });
    res.json({ ok: true, para: req.usuario.email });
  });

  /* ===================== carteira de condomínios ===================== */
  /* situação da carteira e, para cada coluna de pessoas, quem foi (ou não) encontrado na equipe do setor */
  r.get('/api/admin/carteira', async (req, res) => {
    const tot = await db.um(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE situacao = 'ATIVO')::int AS ativos, MAX(atualizado_em) AS atualizado_em
      FROM condominios WHERE na_carteira`);
    const colunas = (await db.q('SELECT coluna, setor_id FROM condominio_colunas ORDER BY coluna')).rows;
    const conds = (await db.q('SELECT id, nome, pessoas FROM condominios WHERE na_carteira')).rows;
    const responsavel = await carteira.carregarRegras(db);
    const lista = colunas.map((c) => {
      const pessoas = new Map();
      for (const cd of conds) {
        const nome = cd.pessoas && cd.pessoas[c.coluna];
        if (!nome) continue;
        if (!pessoas.has(nome)) {
          // só a coluna atual: a pessoa achada é a desta coluna (o setor pode ter mais de uma)
          const r0 = c.setor_id ? responsavel({ pessoas: { [c.coluna]: nome } }, c.setor_id) : null;
          pessoas.set(nome, { nome, condominios: 0, usuario: r0 && r0.id && r0.coluna === c.coluna ? { id: r0.id, nome: r0.nome } : null });
        }
        pessoas.get(nome).condominios++;
      }
      return { ...c, pessoas: [...pessoas.values()].sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR')) };
    });
    res.json({ ...tot, colunas: lista });
  });

  r.post('/api/admin/carteira', express.raw({ type: () => true, limit: '10mb' }), async (req, res) => {
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!buf.length) return erro(res, 400, 'Envie o arquivo CSV da carteira.');
    let r0;
    try { r0 = await carteira.importar(db, buf); } catch (e) { return erro(res, 400, e.message); }
    await seg.auditar(req, 'carteira_importada', null, r0);
    res.json(r0);
  });

  r.put('/api/admin/carteira/colunas', json, async (req, res) => {
    const mapa = req.body && typeof req.body.colunas === 'object' && req.body.colunas;
    if (!mapa) return erro(res, 400, 'Informe o setor de cada coluna.');
    const setores = new Set((await db.q('SELECT id FROM setores')).rows.map((x) => x.id));
    await db.tx(async (t) => {
      for (const [coluna, setor] of Object.entries(mapa)) {
        const id = setor === null || setor === '' ? null : Number(setor);
        if (id !== null && !setores.has(id)) continue;
        await t.q('UPDATE condominio_colunas SET setor_id = $2 WHERE coluna = $1', [coluna, id]);
      }
    });
    await seg.auditar(req, 'carteira_colunas', null, mapa);
    res.json({ ok: true });
  });

  r.get('/api/admin/equipes', async (req, res) => {
    const setores = (await db.q('SELECT id, nome, ordem FROM setores ORDER BY ordem, nome')).rows;
    const membros = (await db.q('SELECT setor_id, usuario_id, lider FROM setor_membros')).rows;
    const cats = (await db.q(`SELECT c.*, (SELECT COUNT(*)::int FROM tickets t WHERE t.categoria_id = c.id) AS tickets
      FROM ticket_categorias c ORDER BY c.ativo DESC, c.nome`)).rows;
    const usuarios = (await db.q('SELECT id, nome, email, ativo FROM usuarios ORDER BY ativo DESC, nome')).rows;
    res.json({
      setores: setores.map((s) => ({
        ...s,
        membros: membros.filter((m) => m.setor_id === s.id).map((m) => ({ usuario_id: m.usuario_id, lider: !!m.lider })),
        categorias: cats.filter((c) => c.setor_id === s.id),
      })),
      usuarios,
      email: { ativo: avisos.emailAtivo, tipo: avisos.emailTipo, remetente: avisos.emailRemetente },
    });
  });

  r.put('/api/admin/equipes/:setor/membros', json, async (req, res) => {
    const setorId = Number(req.params.setor);
    const setor = await db.um('SELECT id, nome FROM setores WHERE id = $1', [setorId]);
    if (!setor) return erro(res, 404, 'Setor não encontrado.');
    const lista = Array.isArray(req.body && req.body.membros) ? req.body.membros : null;
    if (!lista) return erro(res, 400, 'Lista de pessoas inválida.');
    const validos = new Set((await db.q('SELECT id FROM usuarios')).rows.map((x) => x.id));
    const membros = new Map();
    for (const m of lista) if (m && validos.has(Number(m.usuario_id))) membros.set(Number(m.usuario_id), !!m.lider);
    await db.tx(async (t) => {
      await t.q('DELETE FROM setor_membros WHERE setor_id = $1', [setorId]);
      for (const [uid, lider] of membros) await t.q('INSERT INTO setor_membros (setor_id, usuario_id, lider) VALUES ($1, $2, $3)', [setorId, uid, lider]);
    });
    await seg.auditar(req, 'equipe_editada', null, { setor: setor.nome, membros: membros.size, lideres: [...membros.values()].filter(Boolean).length });
    res.json({ ok: true });
  });

  function dadosCategoria(b) {
    const nome = texto(b.nome, 100);
    if (!nome) return { erro: 'Informe o nome do tipo de demanda.' };
    const prazo = b.prazo_horas === '' || b.prazo_horas == null ? null : Number(b.prazo_horas);
    if (prazo !== null && (!Number.isInteger(prazo) || prazo < 1 || prazo > 24 * 365)) return { erro: 'Prazo em horas inválido.' };
    return { nome, prazo_horas: prazo, prioridade: PRIORIDADES.includes(b.prioridade) ? b.prioridade : 'media' };
  }

  r.post('/api/admin/equipes/:setor/categorias', json, async (req, res) => {
    const setor = await db.um('SELECT id, nome FROM setores WHERE id = $1', [Number(req.params.setor)]);
    if (!setor) return erro(res, 404, 'Setor não encontrado.');
    const d = dadosCategoria(req.body || {});
    if (d.erro) return erro(res, 400, d.erro);
    try {
      const { id } = await db.um('INSERT INTO ticket_categorias (setor_id, nome, prazo_horas, prioridade) VALUES ($1, $2, $3, $4) RETURNING id',
        [setor.id, d.nome, d.prazo_horas, d.prioridade]);
      await seg.auditar(req, 'categoria_criada', null, { setor: setor.nome, ...d });
      res.status(201).json({ id });
    } catch (e) {
      if (ehDuplicado(e)) return erro(res, 409, 'Este setor já tem um tipo de demanda com esse nome.');
      throw e;
    }
  });

  r.patch('/api/admin/categorias/:id', json, async (req, res) => {
    const atual = await db.um('SELECT * FROM ticket_categorias WHERE id = $1', [Number(req.params.id)]);
    if (!atual) return erro(res, 404, 'Tipo de demanda não encontrado.');
    const d = dadosCategoria({ ...atual, ...req.body });
    if (d.erro) return erro(res, 400, d.erro);
    const ativo = req.body.ativo === undefined ? atual.ativo : !!req.body.ativo;
    try {
      await db.q('UPDATE ticket_categorias SET nome = $1, prazo_horas = $2, prioridade = $3, ativo = $4 WHERE id = $5', [d.nome, d.prazo_horas, d.prioridade, ativo, atual.id]);
    } catch (e) {
      if (ehDuplicado(e)) return erro(res, 409, 'Este setor já tem um tipo de demanda com esse nome.');
      throw e;
    }
    await seg.auditar(req, 'categoria_editada', null, { id: atual.id, ...d, ativo });
    res.json({ ok: true });
  });

  r.delete('/api/admin/categorias/:id', async (req, res) => {
    // tickets antigos continuam existindo, só ficam "sem tipo"
    await db.q('DELETE FROM ticket_categorias WHERE id = $1', [Number(req.params.id)]);
    await seg.auditar(req, 'categoria_removida', null, { id: Number(req.params.id) });
    res.json({ ok: true });
  });

  return r;
}

module.exports = { rotasTickets, rotasAdminTickets, PRIORIDADES, STATUS, PRAZO_PADRAO_HORAS };
