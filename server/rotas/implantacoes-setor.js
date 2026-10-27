'use strict';
/*
 * Setor Implantação no dia a dia (complementa server/rotas/implantacoes.js):
 *  - quem edita: a designada; outra pessoa da equipe só com autorização da coordenação (pedida ou dada direto),
 *    com escopo (tudo, só as etapas, só documentos e ficha) e prazo; a coordenação revoga quando quiser;
 *  - prazo para concluir: concluir_dias (3) dias úteis depois de assumir; pausa com pendência com o comercial (abre e
 *    fecha sozinha) ou impedimento marcado pela assistente (a coordenação é avisada com o motivo; retoma com o que foi
 *    resolvido); lembrete 1 dia útil antes e no dia; atrasado, um alerta por dia útil à assistente e à coordenação;
 *  - onboarding depois de concluir (dá para concluir antes) e a justificativa quando o prazo do onboarding vence;
 *  - documento recebido sem arquivo (em papel, já no CPD): conta como recebido na data em que foi marcado;
 *  - Obs. da aba Controle e o "Cobrar" da coordenação.
 */
const F = require('../implantacoes/formulario');
const M = require('../implantacoes/metas');
const { criarPrazos } = require('../implantacoes/prazos');

const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const ESCOPOS = { tudo: 'tudo nesta implantação', etapas: 'só as etapas', documentos: 'só documentos e ficha de repasse' };
const MOTIVOS_IMPEDIMENTO = { sindico: 'Aguardando o síndico', vouch: 'Aguardando cadastro no Vouch', administradora: 'Aguardando a administradora anterior', outro: 'Outro' };
const DIAS_LEMBRETE_IMPEDIMENTO = 3;

/* autorização ativa de uma pessoa numa implantação (hoje dentro do prazo) */
async function autorizacaoAtiva(db, implantacaoId, usuarioId, hoje = M.diaSP(Date.now())) {
  return db.um(`SELECT id, escopo, to_char(ate, 'YYYY-MM-DD') AS ate FROM implantacao_autorizacoes
    WHERE implantacao_id = $1 AND usuario_id = $2 AND situacao = 'ativa' AND (ate IS NULL OR ate >= $3::date) ORDER BY id DESC LIMIT 1`, [implantacaoId, usuarioId, hoje]);
}
/* quem tem autorização ativa (para os lembretes): escopos aceitos */
async function autorizados(db, implantacaoId, escopos, hoje = M.diaSP(Date.now())) {
  return (await db.q(`SELECT DISTINCT usuario_id FROM implantacao_autorizacoes WHERE implantacao_id = $1 AND situacao = 'ativa'
    AND (ate IS NULL OR ate >= $2::date) AND escopo = ANY($3::text[])`, [implantacaoId, hoje, escopos])).rows.map((x) => x.usuario_id);
}

/* pausas do prazo para concluir, como dias (AAAA-MM-DD) para o cálculo */
async function pausasDe(db, implantacaoId) {
  return (await db.q(`SELECT p.*, u.nome AS por_nome, ue.nome AS encerrada_por_nome FROM implantacao_pausas p
    LEFT JOIN usuarios u ON u.id = p.por LEFT JOIN usuarios ue ON ue.id = p.encerrada_por WHERE p.implantacao_id = $1 ORDER BY p.id`, [implantacaoId])).rows;
}
const comoDias = (pausas) => pausas.map((p) => ({ inicio: M.diaSP(p.inicio), fim: p.fim ? M.diaSP(p.fim) : null }));

/* situação do prazo para concluir (null antes de assumir) */
function prazoConcluir(i, pausas, params, P, hoje) {
  if (!i.iniciado_em || i.importacao_id || ['rascunho', 'cancelada'].includes(i.etapa)) return null;
  const fim = i.concluido_em ? M.diaSP(i.concluido_em) : null;
  const s = P.situacao({ inicio: M.diaSP(i.iniciado_em), n: params.concluir_dias, pausas: comoDias(pausas), fim, hoje });
  return s && { ...s, dias: params.concluir_dias, assumida: M.diaSP(i.iniciado_em) };
}

/* prazo do onboarding da implantação (o mesmo da meta): limite, se venceu e se está feito */
function prazoOnboarding(linha) {
  const o = linha && linha.onboarding;
  if (!o) return null;
  const feito = ['realizado', 'sindico_myblue'].includes(o.situacao);
  return { limite: o.limite, feito, vencido: !feito && o.status === 'nao_batida', status: o.status };
}

function rotasSetor(r, deps) {
  const { db, avisos, erro, evento, json, link, coordenacao, carregar, historicoParametros, expediente } = deps;
  const P = criarPrazos((d) => expediente.ehDiaUtil(d));
  const hojeSP = () => M.diaSP(Date.now());

  /* ---------- autorização para editar ---------- */
  r.post('/api/implantacoes/:id/autorizacoes/pedir', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, pd } = c;
    if (!pd.pedir_autorizacao) return erro(res, 403, 'Só quem é da equipe de Implantação e não conduz esta implantação pede autorização.');
    const motivo = texto(req.body && req.body.motivo, 1000);
    if (motivo.length < 5) return erro(res, 400, 'Diga por que precisa editar.');
    if (await db.um("SELECT 1 FROM implantacao_autorizacoes WHERE implantacao_id = $1 AND usuario_id = $2 AND situacao = 'pedida'", [i.id, req.usuario.id])) {
      return erro(res, 409, 'Seu pedido já está com a coordenação.');
    }
    await db.tx(async (t) => {
      await t.q('INSERT INTO implantacao_autorizacoes (implantacao_id, usuario_id, motivo) VALUES ($1, $2, $3)', [i.id, req.usuario.id, motivo]);
      await evento(t, i.id, req.usuario.id, 'autorizacao_pedida', { motivo });
    });
    await avisos.notificar(await coordenacao(), { link: link(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: true,
      titulo: `Pedido para editar · ${i.protocolo} · ${i.condominio}`,
      texto: `${req.usuario.nome} pede para editar a implantação de ${i.condominio}, que está com ${i.responsavel_nome || 'outra pessoa'}: "${motivo}"` });
    res.status(201).json({ ok: true });
  });

  /* a coordenação autoriza (respondendo a um pedido ou direto) */
  r.post('/api/implantacoes/:id/autorizacoes', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, pd } = c;
    if (!pd.autorizar) return erro(res, 403, 'Só a coordenação do setor Implantação autoriza outra pessoa a editar.');
    const b = req.body || {};
    const escopo = ESCOPOS[b.escopo] ? b.escopo : 'tudo';
    const ate = DATA.test(texto(b.ate, 10)) ? texto(b.ate, 10) : null;
    if (ate && ate < hojeSP()) return erro(res, 400, 'O prazo da autorização já passou.');
    const pedido = b.pedido_id ? await db.um("SELECT * FROM implantacao_autorizacoes WHERE id = $1 AND implantacao_id = $2 AND situacao = 'pedida'", [Number(b.pedido_id) || 0, i.id]) : null;
    if (b.pedido_id && !pedido) return erro(res, 404, 'Pedido não encontrado (ou já decidido).');
    const alvo = await db.um(`SELECT u.id, u.nome FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id JOIN usuarios u ON u.id = sm.usuario_id
      WHERE s.nome = 'Implantação' AND u.id = $1 AND u.ativo`, [pedido ? pedido.usuario_id : Number(b.usuario_id) || 0]);
    if (!alvo) return erro(res, 400, 'Escolha alguém da equipe de Implantação.');
    if (alvo.id === i.responsavel_id) return erro(res, 409, `${alvo.nome} já conduz esta implantação.`);
    const motivo = texto(b.motivo, 1000) || (pedido ? pedido.motivo : '');
    await db.tx(async (t) => {
      // uma autorização ativa por pessoa: a nova substitui a anterior
      await t.q("UPDATE implantacao_autorizacoes SET situacao = 'revogada', revogada_em = now() WHERE implantacao_id = $1 AND usuario_id = $2 AND situacao = 'ativa'", [i.id, alvo.id]);
      if (pedido) {
        await t.q("UPDATE implantacao_autorizacoes SET situacao = 'ativa', escopo = $2, ate = $3, decidida_por = $4, decidida_em = now() WHERE id = $1", [pedido.id, escopo, ate, req.usuario.id]);
      } else {
        await t.q(`INSERT INTO implantacao_autorizacoes (implantacao_id, usuario_id, situacao, escopo, ate, motivo, decidida_por, decidida_em)
          VALUES ($1, $2, 'ativa', $3, $4, $5, $6, now())`, [i.id, alvo.id, escopo, ate, motivo, req.usuario.id]);
      }
      await evento(t, i.id, req.usuario.id, 'autorizacao', { para: alvo.nome, escopo, ate });
    });
    await avisos.notificar([alvo.id], { link: link(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: true,
      titulo: `Você pode editar · ${i.protocolo} · ${i.condominio}`,
      texto: `${req.usuario.nome} autorizou você a editar a implantação de ${i.condominio} (${ESCOPOS[escopo]})${ate ? ` até ${ate.split('-').reverse().join('/')}` : ''}. Ela continua com ${i.responsavel_nome || 'quem conduz'}.` });
    res.status(201).json({ ok: true });
  });

  r.post('/api/implantacoes/:id/autorizacoes/:aid/recusar', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    if (!c.pd.autorizar) return erro(res, 403, 'Só a coordenação decide os pedidos para editar.');
    const a = await db.um("SELECT * FROM implantacao_autorizacoes WHERE id = $1 AND implantacao_id = $2 AND situacao = 'pedida'", [Number(req.params.aid) || 0, c.i.id]);
    if (!a) return erro(res, 404, 'Pedido não encontrado (ou já decidido).');
    const resposta = texto(req.body && req.body.resposta, 1000);
    await db.tx(async (t) => {
      await t.q("UPDATE implantacao_autorizacoes SET situacao = 'recusada', resposta = $2, decidida_por = $3, decidida_em = now() WHERE id = $1", [a.id, resposta, req.usuario.id]);
      await evento(t, c.i.id, req.usuario.id, 'autorizacao_recusada', { usuario_id: a.usuario_id, resposta });
    });
    await avisos.notificar([a.usuario_id], { link: link(c.i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: false,
      titulo: `Pedido para editar não autorizado · ${c.i.protocolo}`, texto: `${req.usuario.nome} não autorizou a edição de ${c.i.condominio}${resposta ? `: "${resposta}"` : '.'}` });
    res.json({ ok: true });
  });

  r.post('/api/implantacoes/:id/autorizacoes/:aid/revogar', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    if (!c.pd.autorizar) return erro(res, 403, 'Só a coordenação revoga autorizações.');
    const a = await db.um("SELECT * FROM implantacao_autorizacoes WHERE id = $1 AND implantacao_id = $2 AND situacao = 'ativa'", [Number(req.params.aid) || 0, c.i.id]);
    if (!a) return erro(res, 404, 'Autorização não encontrada (ou já encerrada).');
    await db.tx(async (t) => {
      await t.q("UPDATE implantacao_autorizacoes SET situacao = 'revogada', revogada_em = now() WHERE id = $1", [a.id]);
      await evento(t, c.i.id, req.usuario.id, 'autorizacao_revogada', { usuario_id: a.usuario_id });
    });
    await avisos.notificar([a.usuario_id], { link: link(c.i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: false,
      titulo: `Autorização encerrada · ${c.i.protocolo}`, texto: `${req.usuario.nome} encerrou sua autorização para editar ${c.i.condominio}.` });
    res.json({ ok: true });
  });

  /* ---------- impedimento: pausa o prazo para concluir ---------- */
  r.post('/api/implantacoes/:id/impedimento', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, pd } = c;
    if (!pd.impedimento) return erro(res, 403, 'Só quem conduz a implantação (depois de assumir) ou a coordenação marca um impedimento.');
    const b = req.body || {};
    const motivo = MOTIVOS_IMPEDIMENTO[b.motivo] ? b.motivo : null;
    const detalhe = texto(b.detalhe, 1000);
    if (!motivo) return erro(res, 400, 'Escolha o que impede concluir.');
    if (detalhe.length < 5) return erro(res, 400, 'Descreva o impedimento.');
    if (await db.um('SELECT 1 FROM implantacao_pausas WHERE implantacao_id = $1 AND fim IS NULL', [i.id])) return erro(res, 409, 'O prazo já está pausado.');
    await db.tx(async (t) => {
      await t.q("INSERT INTO implantacao_pausas (implantacao_id, tipo, motivo, detalhe, por) VALUES ($1, 'impedimento', $2, $3, $4)", [i.id, motivo, detalhe, req.usuario.id]);
      await evento(t, i.id, req.usuario.id, 'impedimento', { motivo: MOTIVOS_IMPEDIMENTO[motivo], detalhe });
    });
    await avisos.notificar(await coordenacao(), { link: link(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: false,
      titulo: `Prazo pausado · ${i.protocolo} · ${i.condominio}`, texto: `${req.usuario.nome} · ${MOTIVOS_IMPEDIMENTO[motivo]}: "${detalhe}"` });
    res.status(201).json({ ok: true });
  });

  /* retomar: a assistente (ou a coordenação) diz o que foi resolvido; o prazo continua de onde parou */
  r.post('/api/implantacoes/:id/impedimento/retomar', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, pd } = c;
    if (!pd.impedimento) return erro(res, 403, 'Só quem conduz a implantação ou a coordenação retoma o prazo.');
    const resolucao = texto(req.body && req.body.resolucao, 1000);
    if (resolucao.length < 5) return erro(res, 400, 'Diga o que foi resolvido.');
    const p = await db.um("SELECT * FROM implantacao_pausas WHERE implantacao_id = $1 AND fim IS NULL AND tipo = 'impedimento'", [i.id]);
    if (!p) return erro(res, 409, 'Não há impedimento marcado.');
    await db.tx(async (t) => {
      await t.q('UPDATE implantacao_pausas SET fim = now(), resolucao = $2, encerrada_por = $3 WHERE id = $1', [p.id, resolucao, req.usuario.id]);
      await evento(t, i.id, req.usuario.id, 'retomada', { resolucao });
    });
    const params = M.parametrosEm(await historicoParametros(db), M.diaSP(i.enviado_em || Date.now()));
    const s = prazoConcluir({ ...i, concluido_em: null }, await pausasDe(db, i.id), params, P, hojeSP());
    const ate = s && s.vence ? s.vence.split('-').reverse().join('/') : '';
    await avisos.notificar(await coordenacao(), { link: link(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: false,
      titulo: `Prazo retomado · ${i.protocolo} · ${i.condominio}`, texto: `${req.usuario.nome}: "${resolucao}"${ate ? ` · concluir até ${ate}` : ''}` });
    res.json({ ok: true, prazo: s });
  });

  /* ---------- onboarding depois de concluir e a justificativa quando o prazo vence ---------- */
  r.post('/api/implantacoes/:id/onboarding', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, pd } = c;
    if (!pd.onboarding) return erro(res, 403, 'O onboarding desta implantação não pode ser registrado por você agora.');
    const etapas = F.normalizarEtapas(i.etapas);
    const o = F.normalizarEtapas({ onboarding: req.body && req.body.onboarding }).onboarding;
    if (['marcado', 'realizado'].includes(o.situacao) && !DATA.test(o.data)) return erro(res, 400, 'Informe a data do onboarding.');
    if (['marcado', 'realizado'].includes(o.situacao) && !o.por) o.por = i.responsavel_id || req.usuario.id;
    etapas.onboarding = o;
    await db.tx(async (t) => {
      await t.q('UPDATE implantacoes SET etapas = $2::jsonb, atualizado_em = now() WHERE id = $1', [i.id, JSON.stringify(etapas)]);
      await evento(t, i.id, req.usuario.id, 'etapas', { mudou: ['onboarding'], etapas });
    });
    res.json({ ok: true, etapas });
  });

  r.post('/api/implantacoes/:id/onboarding-justificativa', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, pd } = c;
    if (!pd.justificar_onboarding) return erro(res, 403, 'Só quem conduz a implantação ou a coordenação justifica o onboarding.');
    const t0 = texto(req.body && req.body.texto, 1500);
    if (t0.length < 10) return erro(res, 400, 'Escreva a justificativa (por que o onboarding não foi feito no prazo).');
    const just = { texto: t0, por: req.usuario.id, por_nome: req.usuario.nome, em: new Date().toISOString() };
    await db.tx(async (t) => {
      await t.q('UPDATE implantacoes SET onboarding_justificativa = $2::jsonb, atualizado_em = now() WHERE id = $1', [i.id, JSON.stringify(just)]);
      await evento(t, i.id, req.usuario.id, 'onboarding_justificado', { texto: t0 });
    });
    res.json({ ok: true });
  });

  /* ---------- documento recebido sem arquivo ---------- */
  r.post('/api/implantacoes/:id/documentos/marcar', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, pd } = c;
    if (!pd.marcar_documentos) return erro(res, 403, 'Só quem conduz a implantação (ou tem autorização) e a coordenação marcam documento recebido.');
    const tipo = String(req.body && req.body.tipo || '');
    const observacao = texto(req.body && req.body.observacao, 500);
    if (!F.DOCUMENTOS[tipo] || ['outro', 'analise_credito'].includes(tipo)) return erro(res, 400, 'Escolha o documento.');
    if (observacao.length < 3) return erro(res, 400, 'Escreva a observação (ex.: original em papel, arquivado no CPD).');
    if (await db.um('SELECT 1 FROM implantacao_documentos WHERE implantacao_id = $1 AND tipo = $2 AND substituido_em IS NULL', [i.id, tipo])) {
      return erro(res, 409, `${F.DOCUMENTOS[tipo].nome} já está recebido.`);
    }
    await db.tx(async (t) => {
      await t.q(`INSERT INTO implantacao_documentos (implantacao_id, tipo, nome, mime, tamanho, sem_arquivo, observacao, enviado_por)
        VALUES ($1, $2, $3, 'text/plain', 0, TRUE, $4, $5)`, [i.id, tipo, 'Recebido sem arquivo', observacao, req.usuario.id]);
      await evento(t, i.id, req.usuario.id, 'documento_marcado', { tipo, nome: F.DOCUMENTOS[tipo].nome, observacao });
      await t.q('UPDATE implantacoes SET atualizado_em = now() WHERE id = $1', [i.id]);
    });
    res.status(201).json({ ok: true });
  });

  r.post('/api/implantacoes/:id/documentos/:did/desfazer', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, pd } = c;
    if (!pd.marcar_documentos) return erro(res, 403, 'Só quem conduz a implantação (ou tem autorização) e a coordenação desfazem.');
    const d = await db.um('SELECT id, tipo FROM implantacao_documentos WHERE id = $1 AND implantacao_id = $2 AND sem_arquivo AND substituido_em IS NULL', [Number(req.params.did) || 0, i.id]);
    if (!d) return erro(res, 404, 'Marcação não encontrada.');
    await db.tx(async (t) => {
      await t.q('UPDATE implantacao_documentos SET substituido_em = now(), desfeito_em = now(), desfeito_por = $2 WHERE id = $1', [d.id, req.usuario.id]);
      await evento(t, i.id, req.usuario.id, 'documento_desmarcado', { tipo: d.tipo, nome: (F.DOCUMENTOS[d.tipo] || {}).nome || d.tipo });
    });
    res.json({ ok: true });
  });

  /* ---------- Obs. da aba Controle ---------- */
  r.post('/api/implantacoes/:id/obs-controle', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, pd } = c;
    if (!pd.obs_controle) return erro(res, 403, 'Só quem conduz a implantação (ou tem autorização) e a coordenação escrevem a Obs.');
    const t0 = texto(req.body && req.body.texto, 300);
    const obs = t0 ? { texto: t0, por: req.usuario.id, por_nome: req.usuario.nome, em: new Date().toISOString() } : null;
    await db.q('UPDATE implantacoes SET obs_controle = $2::jsonb WHERE id = $1', [i.id, obs ? JSON.stringify(obs) : null]);
    res.json({ ok: true, obs });
  });

  /* ---------- Cobrar (coordenação): prazo para concluir, da ficha de repasse ou de uma etapa do pós-implantação ---------- */
  r.post('/api/implantacoes/:id/cobrar', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, p } = c;
    if (!(p.coordenacao || p.admin)) return erro(res, 403, 'Só a coordenação cobra.');
    const QUAIS = { concluir: 'a conclusão da implantação', ficha: 'a ficha de repasse', espolio: 'a análise de espólios (pós-implantação)',
      pendencias: 'o levantamento de pendências (pós-implantação)', prestacao: 'a 1ª prestação de contas (pós-implantação)' };
    const qual = QUAIS[req.body && req.body.qual] ? req.body.qual : 'concluir';
    if (!i.responsavel_id) return erro(res, 409, 'Ninguém conduz esta implantação ainda.');
    const o = QUAIS[qual];
    await db.tx(async (t) => evento(t, i.id, req.usuario.id, 'cobranca_prazo', { qual }));
    await avisos.notificar([i.responsavel_id, ...await autorizados(db, i.id, qual === 'ficha' ? ['tudo', 'documentos'] : ['tudo', 'etapas'])], {
      link: link(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: true,
      titulo: `Cobrança · ${i.protocolo} · ${i.condominio}`, texto: `${req.usuario.nome} está cobrando ${o} de ${i.condominio}, que passou do prazo.` });
    res.json({ ok: true });
  });

  return { prazoConcluir: (i, pausas, params, hoje) => prazoConcluir(i, pausas, params, P, hoje), P };
}

/* ---------- rotina: lembretes e alertas dos prazos (uma vez por dia útil, no expediente) ---------- */
function criarRotinaPrazos({ db, avisos, expediente, coordenacao, link, carregarLinhas, historicoParametros }) {
  const P = criarPrazos((d) => expediente.ehDiaUtil(d));
  return async function rotinaPrazos(agora = new Date()) {
    const m = expediente.momento(agora);
    const feito = { concluir: 0, impedimento: 0, onboarding: 0 };
    if (!m.noExpediente) return feito;
    const hoje = m.dia;
    const historico = await historicoParametros(db);
    const coord = await coordenacao();
    const fmt = (d) => d.split('-').reverse().join('/');
    // prazo para concluir
    for (const i of (await db.q(`SELECT i.*, u.nome AS responsavel_nome FROM implantacoes i LEFT JOIN usuarios u ON u.id = i.responsavel_id
        WHERE i.etapa IN ('em_implantacao','pendencia') AND i.iniciado_em IS NOT NULL AND i.importacao_id IS NULL AND (i.aviso_concluir_em IS NULL OR i.aviso_concluir_em < $1::date)`, [hoje])).rows) {
      const params = M.parametrosEm(historico, M.diaSP(i.enviado_em || i.iniciado_em));
      const pausas = await pausasDe(db, i.id);
      const s = prazoConcluir(i, pausas, params, P, hoje);
      // impedimento esquecido: lembrete a quem conduz a cada 3 dias úteis
      const aberta = pausas.find((x) => !x.fim && x.tipo === 'impedimento');
      if (aberta && P.consumidos(M.diaSP(aberta.lembrete_em || aberta.inicio), hoje, []) >= DIAS_LEMBRETE_IMPEDIMENTO) {
        await avisos.notificar([i.responsavel_id], { link: link(i.id), tipo: 'implantacao', email: false,
          titulo: `Ainda está impedida? · ${i.protocolo} · ${i.condominio}`, texto: `O prazo para concluir está pausado desde ${fmt(M.diaSP(aberta.inicio))} (${MOTIVOS_IMPEDIMENTO[aberta.motivo] || aberta.motivo}). Se já resolveu, retome o prazo na implantação.` });
        await db.q('UPDATE implantacao_pausas SET lembrete_em = $2::date WHERE id = $1', [aberta.id, hoje]);
        feito.impedimento++;
      }
      if (!s || !['vence_amanha', 'vence_hoje', 'atrasado'].includes(s.status)) continue;
      const para = [i.responsavel_id, ...await autorizados(db, i.id, ['tudo', 'etapas'])];
      if (s.status === 'atrasado') {
        const n = s.atraso === 1 ? '1 dia útil' : `${s.atraso} dias úteis`;
        await avisos.notificar(para, { link: link(i.id), tipo: 'implantacao', email: true, titulo: `Implantação atrasada · ${n} · ${i.condominio}`,
          texto: `A implantação de ${i.condominio} (${i.protocolo}) passou do prazo para concluir (${fmt(s.vence)}).` });
        await avisos.notificar(coord, { link: link(i.id), tipo: 'implantacao', email: true, titulo: `Implantação atrasada de ${i.responsavel_nome || 'quem conduz'} · ${n}`,
          texto: `${i.condominio} (${i.protocolo}) passou do prazo para concluir (${fmt(s.vence)}). Para cobrar, abra a implantação.` });
      } else {
        await avisos.notificar(para, { link: link(i.id), tipo: 'implantacao', email: true,
          titulo: `${s.status === 'vence_hoje' ? 'Concluir hoje' : 'Concluir até amanhã'} · ${i.protocolo} · ${i.condominio}`,
          texto: `O prazo para concluir a implantação de ${i.condominio} vence ${s.status === 'vence_hoje' ? 'hoje' : 'no próximo dia útil'} (${fmt(s.vence)}).` });
      }
      await db.q('UPDATE implantacoes SET aviso_concluir_em = $2::date WHERE id = $1', [i.id, hoje]);
      feito.concluir++;
    }
    // onboarding: prazo vencido sem onboarding e sem justificativa → a quem conduz e à coordenação, uma vez por dia útil
    const linhas = await carregarLinhas(db, { historico, hoje });
    for (const l of linhas) {
      const b = l._bruto;
      if (b.onboarding_justificativa || b.importacao_id || !['em_implantacao', 'pendencia', 'concluida', 'na_carteira'].includes(b.etapa) || !b.responsavel_id) continue;
      const o = prazoOnboarding(l);
      if (!o || !o.vencido || !l.na_meta) continue;
      if (b.aviso_onboarding_em && M.diaSP(b.aviso_onboarding_em) >= hoje) continue;
      await avisos.notificar([b.responsavel_id, ...coord], { link: link(b.id), tipo: 'implantacao', email: false,
        titulo: `Onboarding fora do prazo · ${b.protocolo} · ${l.condominio}`,
        texto: `O prazo do onboarding venceu em ${fmt(o.limite)}. Registre o onboarding ou escreva a justificativa na implantação.` });
      await db.q('UPDATE implantacoes SET aviso_onboarding_em = $2::date WHERE id = $1', [b.id, hoje]);
      feito.onboarding++;
    }
    return feito;
  };
}

module.exports = { rotasSetor, criarRotinaPrazos, prazoConcluir, autorizacaoAtiva, autorizados, pausasDe, prazoOnboarding, ESCOPOS, MOTIVOS_IMPEDIMENTO };
