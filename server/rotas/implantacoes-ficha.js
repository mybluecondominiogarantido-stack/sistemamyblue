'use strict';
/*
 * Ficha de repasse (complementa server/rotas/implantacoes.js): abre na conclusão da implantação, já preenchida
 * (server/implantacoes/ficha.js); quem conduz completa os campos em azul e envia à assistente de crédito do condomínio
 * na Carteira (sem ela, à supervisão de Crédito, que escolhe e o portal grava na Carteira). A assistente de crédito
 * confirma o recebimento ou devolve com uma pergunta; cada envio é uma versão (até 3; mais, só com a liberação da
 * coordenação de Implantação), com o PDF no papel timbrado (-v1, -v2…) para o CPD.
 * Prazo: ficha_dias (5) dias úteis da conclusão até o primeiro envio; devolução e nova versão não reabrem.
 */
const FI = require('../implantacoes/ficha');
const M = require('../implantacoes/metas');
const formularioPdf = require('../implantacoes/formulario-pdf');
const carteira = require('../carteira');

const SETOR_CREDITO = 'Crédito';
const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const nomeArquivo = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');

function rotasFicha(r, deps) {
  const { db, seg, avisos, erro, evento, json, link, perfil, pode, coordenacao, pessoasDoSetor, administradores, historicoParametros, autorizacaoAtiva, autorizados, P } = deps;
  const linkFicha = (id) => `#/implantacao/${id}/ficha`;

  async function supervisaoCredito() {
    const s = await pessoasDoSetor(db, seg, SETOR_CREDITO);
    return s.gestores.length ? s.gestores : administradores(db);
  }
  const membrosCredito = async () => (await db.q(`SELECT u.id, u.nome FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id JOIN usuarios u ON u.id = sm.usuario_id
    WHERE s.nome = $1 AND u.ativo ORDER BY u.nome`, [SETOR_CREDITO])).rows;
  /* a assistente de crédito do condomínio na Carteira (pelo condomínio ligado ou pelo ID Vouch) */
  async function daCarteira(i) {
    const vouch = (i.etapas && i.etapas.vouch && i.etapas.vouch.id) || '';
    const c = i.condominio_id ? await db.um('SELECT assistente_credito FROM condominios WHERE id = $1', [i.condominio_id])
      : vouch ? await db.um('SELECT assistente_credito FROM condominios WHERE codigo = $1', [String(vouch)]) : null;
    if (!c || !c.assistente_credito) return null;
    return carteira.acharPessoa(c.assistente_credito, await membrosCredito());
  }

  async function prazoFicha(ficha) {
    if (!ficha) return null;
    const inicio = M.diaSP(ficha.aberta_em);
    const params = M.parametrosEm(await historicoParametros(db), inicio);
    const s = P.situacao({ inicio, n: params.ficha_dias, pausas: [], fim: ficha.primeiro_envio_em ? M.diaSP(ficha.primeiro_envio_em) : null, hoje: M.diaSP(Date.now()) });
    return s && { ...s, dias: params.ficha_dias, aberta: inicio };
  }

  /* contexto para montar a ficha: análise, contrato, documentos e nomes */
  async function contexto(i, ficha, usuario) {
    const analise = i.analise_id ? await db.um('SELECT formulario FROM analises WHERE id = $1', [i.analise_id]) : null;
    const ct = i.contrato_id ? await db.um('SELECT protocolo, fechado, fechado_em FROM contratos WHERE id = $1', [i.contrato_id])
      : i.analise_id ? await db.um("SELECT protocolo, fechado, fechado_em FROM contratos WHERE analise_id = $1 AND fechado_em IS NOT NULL ORDER BY id DESC LIMIT 1", [i.analise_id]) : null;
    const documentos = (await db.q('SELECT tipo, nome, enviado_em, substituido_em, sem_arquivo, observacao FROM implantacao_documentos WHERE implantacao_id = $1 ORDER BY id', [i.id])).rows;
    const nomes = await db.um(`SELECT e.nome AS executivo, ur.nome AS responsavel, ud.nome AS destino FROM implantacoes i LEFT JOIN executivos e ON e.id = i.executivo_id
      LEFT JOIN usuarios ur ON ur.id = i.responsavel_id LEFT JOIN usuarios ud ON ud.id = $2 WHERE i.id = $1`, [i.id, ficha ? ficha.destino_id : null]);
    return { analise: analise && analise.formulario, contrato: ct && ct.fechado_em ? ct : null, documentos, executivo: nomes.executivo, responsavel: nomes.responsavel,
      destino: nomes.destino, emitido_por: usuario && usuario.nome };
  }

  /* abre a ficha (na conclusão; para implantações concluídas antes da ficha existir, quem conduz abre) */
  // (lê o banco antes da transação: dentro dela só o INSERT)
  async function preparar(i) {
    const ctx = await contexto(i, null);
    const hoje = M.diaSP(Date.now());
    const params = M.parametrosEm(await historicoParametros(db), hoje);
    return { dados: FI.dadosIniciais(i, { analise: ctx.analise, contrato: ctx.contrato && ctx.contrato.fechado }), prazo: P.vencimento(hoje, params.ficha_dias, []) };
  }
  const abrir = (t, i, { dados, prazo }) => t.q('INSERT INTO implantacao_fichas (implantacao_id, prazo, dados) VALUES ($1, $2, $3::jsonb) ON CONFLICT (implantacao_id) DO NOTHING',
    [i.id, prazo, JSON.stringify(dados)]);
  async function aoConcluir(i) {
    const novo = await preparar(i);
    await db.tx((t) => abrir(t, i, novo));
    const prazo = novo.prazo;
    const fmt = prazo ? prazo.split('-').reverse().join('/') : '';
    if (i.responsavel_id) await avisos.notificar([i.responsavel_id], { link: linkFicha(i.id), tipo: 'implantacao', email: false,
      titulo: `Ficha de repasse aberta · ${i.condominio}`, texto: `A ficha de repasse de ${i.condominio} já vem preenchida: complete os campos em azul e envie ao Crédito até ${fmt}.` });
  }

  /* quem é quem na ficha: Implantação (quem conduz, autorizada, coordenação), Crédito (destino e supervisão) */
  async function carregarFicha(req, res) {
    const i = await db.um('SELECT i.*, ur.nome AS responsavel_nome FROM implantacoes i LEFT JOIN usuarios ur ON ur.id = i.responsavel_id WHERE i.id = $1', [Number(req.params.id) || 0]);
    if (!i) { erro(res, 404, 'Implantação não encontrada.'); return null; }
    const u = req.usuario;
    const p = await perfil(u);
    const aut = p.equipe && i.responsavel_id !== u.id ? await autorizacaoAtiva(db, i.id, u.id) : null;
    const pd = pode(p, i, u, aut);
    const ficha = await db.um('SELECT * FROM implantacao_fichas WHERE implantacao_id = $1', [i.id]);
    const supervisao = u.papel === 'admin' || (await supervisaoCredito()).includes(u.id);
    const destino = !!(ficha && ficha.destino_id === u.id);
    const recebeu = ficha ? !!(await db.um('SELECT 1 FROM implantacao_ficha_versoes WHERE implantacao_id = $1 AND para_id = $2', [i.id, u.id])) : false;
    if (!pd.ver && !(ficha && (supervisao || destino || recebeu))) { erro(res, 404, 'Implantação não encontrada.'); return null; }
    const concluida = ['concluida', 'na_carteira'].includes(i.etapa);
    const editar = concluida && !!ficha && pd.marcar_documentos;
    const limite = FI.LIMITE_VERSOES + (ficha ? ficha.versoes_extra : 0);
    const pf = {
      abrir: concluida && !ficha && pd.marcar_documentos,
      editar,
      enviar: editar && ficha.versao < limite,
      liberar: !!ficha && (p.coordenacao || p.admin) && ficha.versao >= limite,
      escolher: !!ficha && ficha.versao > 0 && !ficha.destino_id && supervisao,
      confirmar: !!ficha && ficha.situacao === 'enviada' && !!ficha.destino_id && (destino || supervisao),
      devolver: !!ficha && ficha.situacao === 'enviada' && !!ficha.destino_id && (destino || supervisao),
      responder: editar && ficha.situacao === 'devolvida',
      cobrar: !!ficha && !ficha.primeiro_envio_em && (p.coordenacao || p.admin),
      ver_implantacao: pd.ver,
    };
    return { i, p, pd, ficha, pf, limite };
  }

  r.get('/api/implantacoes/:id/ficha', async (req, res) => {
    const c = await carregarFicha(req, res);
    if (!c) return;
    const { i, ficha, pf, limite } = c;
    if (!ficha) return res.json({ ficha: null, pode: pf, implantacao: { id: i.id, protocolo: i.protocolo, condominio: i.condominio, etapa: i.etapa } });
    const versoes = (await db.q(`SELECT v.versao, v.motivo, v.enviada_em, v.confirmada_em, ue.nome AS enviada_por_nome, up.nome AS para_nome, uc.nome AS confirmada_por_nome
      FROM implantacao_ficha_versoes v LEFT JOIN usuarios ue ON ue.id = v.enviada_por LEFT JOIN usuarios up ON up.id = v.para_id LEFT JOIN usuarios uc ON uc.id = v.confirmada_por
      WHERE v.implantacao_id = $1 ORDER BY v.versao`, [i.id])).rows;
    const eventos = (await db.q(`SELECT ev.tipo, ev.detalhe, ev.criado_em, u.nome AS usuario_nome FROM implantacao_eventos ev LEFT JOIN usuarios u ON u.id = ev.usuario_id
      WHERE ev.implantacao_id = $1 AND ev.tipo LIKE 'ficha%' ORDER BY ev.id`, [i.id])).rows;
    const ultima = versoes.length ? await db.um('SELECT conteudo FROM implantacao_ficha_versoes WHERE implantacao_id = $1 AND versao = $2', [i.id, ficha.versao]) : null;
    // quem pode editar vê o rascunho (o que vai na próxima versão); o Crédito vê a última versão enviada
    const ctx = await contexto(i, ficha, req.usuario);
    const rascunho = FI.montar(i, ficha.dados, ctx);
    const conteudo = pf.editar || !ultima ? rascunho : ultima.conteudo;
    const destino = ficha.destino_id ? await db.um('SELECT id, nome FROM usuarios WHERE id = $1', [ficha.destino_id]) : null;
    const devolucao = ficha.situacao === 'devolvida' ? eventos.filter((e) => e.tipo === 'ficha_devolvida').pop() || null : null;
    res.json({
      implantacao: { id: i.id, protocolo: i.protocolo, condominio: i.condominio, etapa: i.etapa, responsavel_id: i.responsavel_id, responsavel_nome: i.responsavel_nome },
      ficha: { situacao: ficha.situacao, versao: ficha.versao, limite, aberta_em: ficha.aberta_em, primeiro_envio_em: ficha.primeiro_envio_em, atualizado_em: ficha.atualizado_em,
        destino, prazo: await prazoFicha(ficha), devolucao,
        alterada: !!(ultima && JSON.stringify(FI.diferencas(ultima.conteudo, rascunho)) !== '[]'), mudou: ultima ? FI.diferencas(ultima.conteudo, rascunho) : [] },
      dados: pf.editar ? FI.normalizarDados(ficha.dados) : null, conteudo, faltas: pf.editar ? FI.faltas(ficha.dados) : [],
      versoes, eventos, pode: pf,
      credito: pf.escolher ? await membrosCredito() : [],
    });
  });

  r.post('/api/implantacoes/:id/ficha/abrir', json, async (req, res) => {
    const c = await carregarFicha(req, res);
    if (!c) return;
    if (!c.pf.abrir) return erro(res, c.ficha ? 409 : 403, c.ficha ? 'A ficha de repasse já está aberta.' : 'Só quem conduz a implantação abre a ficha, depois de concluir.');
    const novo = await preparar(c.i);
    await db.tx(async (t) => { await abrir(t, c.i, novo); await evento(t, c.i.id, req.usuario.id, 'ficha_aberta', {}); });
    res.status(201).json({ ok: true });
  });

  r.put('/api/implantacoes/:id/ficha', json, async (req, res) => {
    const c = await carregarFicha(req, res);
    if (!c) return;
    if (!c.pf.editar) return erro(res, 403, 'Só quem conduz a implantação (ou tem autorização para documentos e ficha) e a coordenação editam a ficha.');
    const dados = FI.normalizarDados(req.body && req.body.dados);
    await db.q('UPDATE implantacao_fichas SET dados = $2::jsonb, atualizado_em = now() WHERE implantacao_id = $1', [c.i.id, JSON.stringify(dados)]);
    res.json({ ok: true, faltas: FI.faltas(dados) });
  });

  /* enviar ao Crédito: cada envio é uma versão; a partir da 2ª, com o motivo */
  r.post('/api/implantacoes/:id/ficha/enviar', json, async (req, res) => {
    const c = await carregarFicha(req, res);
    if (!c) return;
    const { i, ficha, pf, limite } = c;
    if (!pf.editar) return erro(res, 403, 'Só quem conduz a implantação (ou tem autorização para documentos e ficha) e a coordenação enviam a ficha.');
    if (!pf.enviar) return erro(res, 409, `A ficha já teve ${ficha.versao} versões (o limite é ${limite}): uma nova versão só com a liberação da coordenação de Implantação.`);
    const b = req.body || {};
    if (b.dados) await db.q('UPDATE implantacao_fichas SET dados = $2::jsonb, atualizado_em = now() WHERE implantacao_id = $1', [i.id, JSON.stringify(FI.normalizarDados(b.dados))]);
    const dados = b.dados ? FI.normalizarDados(b.dados) : ficha.dados;
    const falta = FI.faltas(dados);
    if (falta.length) return res.status(400).json({ erro: 'Complete a ficha antes de enviar.', faltas: falta });
    const versao = ficha.versao + 1;
    const motivo = texto(b.motivo, 1000);
    const resposta = texto(b.resposta, 1500);
    if (versao > 1 && motivo.length < 5) return erro(res, 400, 'Diga o que mudou nesta versão.');
    if (ficha.situacao === 'devolvida' && resposta.length < 3) return erro(res, 400, 'Responda a pergunta da assistente de crédito.');
    // para quem: a mesma pessoa das versões anteriores; senão a assistente de crédito da Carteira; senão a supervisão escolhe
    let destino = ficha.destino_id ? await db.um('SELECT id, nome FROM usuarios WHERE id = $1 AND ativo', [ficha.destino_id]) : null;
    if (!destino) destino = await daCarteira(i);
    const ctx = await contexto(i, { destino_id: destino ? destino.id : null }, req.usuario);
    const conteudo = FI.montar(i, dados, { ...ctx, quando: new Date() });
    await db.tx(async (t) => {
      if (resposta) await evento(t, i.id, req.usuario.id, 'ficha_resposta', { versao: ficha.versao, resposta });
      await t.q('INSERT INTO implantacao_ficha_versoes (implantacao_id, versao, conteudo, motivo, enviada_por, para_id) VALUES ($1, $2, $3::jsonb, $4, $5, $6)',
        [i.id, versao, JSON.stringify(conteudo), motivo, req.usuario.id, destino ? destino.id : null]);
      await t.q(`UPDATE implantacao_fichas SET versao = $2, situacao = 'enviada', destino_id = $3, com_supervisao = $4, primeiro_envio_em = COALESCE(primeiro_envio_em, now()),
        atualizado_em = now() WHERE implantacao_id = $1`, [i.id, versao, destino ? destino.id : null, !destino]);
      await evento(t, i.id, req.usuario.id, 'ficha_enviada', { versao, motivo, para: destino ? destino.nome : 'supervisão de Crédito' });
    });
    if (destino) {
      await avisos.notificar([destino.id], { link: linkFicha(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: true,
        titulo: `Ficha de repasse${versao > 1 ? ` (versão ${versao})` : ''} · ${i.condominio}`,
        texto: `${req.usuario.nome} enviou a ficha de repasse de ${i.condominio}${versao > 1 ? `, versão ${versao} (${motivo})` : ''}, que fica com você. Abra no portal e confirme o recebimento.${resposta ? ` Resposta à sua pergunta: "${resposta}"` : ''}` });
    } else {
      await avisos.notificar(await supervisaoCredito(), { link: linkFicha(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: true,
        titulo: `Ficha de repasse para distribuir · ${i.condominio}`,
        texto: `${req.usuario.nome} enviou a ficha de repasse de ${i.condominio}, que ainda não tem assistente de crédito na Carteira. Escolha a assistente no portal.` });
    }
    res.json({ ok: true, versao, para: destino ? destino.nome : null });
  });

  /* a supervisão de Crédito escolhe a assistente (e o portal grava na Carteira, se o condomínio já estiver lá) */
  r.post('/api/implantacoes/:id/ficha/destino', json, async (req, res) => {
    const c = await carregarFicha(req, res);
    if (!c) return;
    const { i, pf } = c;
    if (!pf.escolher) return erro(res, 403, 'Só a supervisão de Crédito escolhe a assistente, quando a Carteira ainda não tem.');
    const alvo = (await membrosCredito()).find((x) => x.id === Number(req.body && req.body.usuario_id));
    if (!alvo) return erro(res, 400, 'Escolha alguém do setor Crédito.');
    await db.tx(async (t) => {
      await t.q('UPDATE implantacao_fichas SET destino_id = $2, atualizado_em = now() WHERE implantacao_id = $1', [i.id, alvo.id]);
      await t.q('UPDATE implantacao_ficha_versoes SET para_id = $2 WHERE implantacao_id = $1 AND para_id IS NULL', [i.id, alvo.id]);
      if (i.condominio_id) await t.q("UPDATE condominios SET assistente_credito = $2, atualizado_em = now(), atualizado_por = $3 WHERE id = $1 AND assistente_credito = ''", [i.condominio_id, alvo.nome, req.usuario.id]);
      await evento(t, i.id, req.usuario.id, 'ficha_destino', { para: alvo.nome });
    });
    await avisos.notificar([alvo.id], { link: linkFicha(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: true,
      titulo: `Ficha de repasse · ${i.condominio}`, texto: `${req.usuario.nome} encaminhou a você a ficha de repasse de ${i.condominio}, que fica com você. Abra no portal e confirme o recebimento.` });
    if (i.responsavel_id) await avisos.notificar([i.responsavel_id], { link: linkFicha(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: false,
      titulo: `Ficha de repasse encaminhada · ${i.condominio}`, texto: `A supervisão de Crédito encaminhou a ficha de ${i.condominio} para ${alvo.nome}.` });
    res.json({ ok: true });
  });

  r.post('/api/implantacoes/:id/ficha/confirmar', json, async (req, res) => {
    const c = await carregarFicha(req, res);
    if (!c) return;
    const { i, ficha, pf } = c;
    if (!pf.confirmar) return erro(res, 403, 'Só a assistente de crédito que recebeu a ficha confirma.');
    await db.tx(async (t) => {
      await t.q('UPDATE implantacao_ficha_versoes SET confirmada_por = $3, confirmada_em = now() WHERE implantacao_id = $1 AND versao = $2', [i.id, ficha.versao, req.usuario.id]);
      await t.q("UPDATE implantacao_fichas SET situacao = 'recebida', atualizado_em = now() WHERE implantacao_id = $1", [i.id]);
      await evento(t, i.id, req.usuario.id, 'ficha_recebida', { versao: ficha.versao });
    });
    await avisos.notificar([i.responsavel_id, ...await autorizados(db, i.id, ['tudo', 'documentos'])].filter(Boolean), { link: linkFicha(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: false,
      titulo: `Ficha de repasse recebida · ${i.condominio}`, texto: `${req.usuario.nome} confirmou o recebimento da ficha de repasse (versão ${ficha.versao}).` });
    res.json({ ok: true });
  });

  r.post('/api/implantacoes/:id/ficha/devolver', json, async (req, res) => {
    const c = await carregarFicha(req, res);
    if (!c) return;
    const { i, ficha, pf } = c;
    if (!pf.devolver) return erro(res, 403, 'Só a assistente de crédito que recebeu a ficha devolve.');
    const pergunta = texto(req.body && req.body.pergunta, 1500);
    if (pergunta.length < 5) return erro(res, 400, 'Escreva a pergunta para a assistente de implantação.');
    await db.tx(async (t) => {
      await t.q("UPDATE implantacao_fichas SET situacao = 'devolvida', atualizado_em = now() WHERE implantacao_id = $1", [i.id]);
      await evento(t, i.id, req.usuario.id, 'ficha_devolvida', { versao: ficha.versao, pergunta });
    });
    await avisos.notificar([i.responsavel_id, ...await autorizados(db, i.id, ['tudo', 'documentos'])].filter(Boolean), { link: linkFicha(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: true,
      titulo: `Ficha de repasse devolvida com pergunta · ${i.condominio}`, texto: `${req.usuario.nome} devolveu a versão ${ficha.versao}: "${pergunta}"` });
    res.json({ ok: true });
  });

  /* responder sem mudar a ficha: volta a mesma versão, com a resposta */
  r.post('/api/implantacoes/:id/ficha/responder', json, async (req, res) => {
    const c = await carregarFicha(req, res);
    if (!c) return;
    const { i, ficha, pf } = c;
    if (!pf.responder) return erro(res, 403, 'Só quem conduz a implantação responde a devolução.');
    const resposta = texto(req.body && req.body.resposta, 1500);
    if (resposta.length < 3) return erro(res, 400, 'Escreva a resposta.');
    await db.tx(async (t) => {
      await t.q("UPDATE implantacao_fichas SET situacao = 'enviada', atualizado_em = now() WHERE implantacao_id = $1", [i.id]);
      await evento(t, i.id, req.usuario.id, 'ficha_resposta', { versao: ficha.versao, resposta });
    });
    if (ficha.destino_id) await avisos.notificar([ficha.destino_id], { link: linkFicha(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: true,
      titulo: `Resposta sobre a ficha de repasse · ${i.condominio}`, texto: `${req.usuario.nome} respondeu (versão ${ficha.versao}, sem mudar a ficha): "${resposta}". Confirme o recebimento no portal.` });
    res.json({ ok: true });
  });

  /* depois do limite de versões, a coordenação libera mais uma, com motivo */
  r.post('/api/implantacoes/:id/ficha/liberar', json, async (req, res) => {
    const c = await carregarFicha(req, res);
    if (!c) return;
    const { i, pf } = c;
    if (!pf.liberar) return erro(res, 403, 'Só a coordenação de Implantação libera nova versão, depois do limite.');
    const motivo = texto(req.body && req.body.motivo, 1000);
    if (motivo.length < 5) return erro(res, 400, 'Diga por que liberar mais uma versão.');
    await db.tx(async (t) => {
      await t.q('UPDATE implantacao_fichas SET versoes_extra = versoes_extra + 1, atualizado_em = now() WHERE implantacao_id = $1', [i.id]);
      await evento(t, i.id, req.usuario.id, 'ficha_liberada', { motivo });
    });
    if (i.responsavel_id) await avisos.notificar([i.responsavel_id], { link: linkFicha(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: false,
      titulo: `Nova versão da ficha liberada · ${i.condominio}`, texto: `${req.usuario.nome} liberou mais uma versão da ficha de repasse: "${motivo}"` });
    res.json({ ok: true });
  });

  /* PDF: de uma versão enviada (?versao=N) ou o rascunho (quem edita) */
  r.get('/api/implantacoes/:id/ficha.pdf', async (req, res) => {
    const c = await carregarFicha(req, res);
    if (!c) return;
    const { i, ficha, pf } = c;
    if (!ficha) return erro(res, 404, 'A ficha de repasse ainda não foi aberta.');
    const n = Number(req.query.versao) || null;
    let conteudo, sufixo;
    if (n) {
      const v = await db.um('SELECT conteudo FROM implantacao_ficha_versoes WHERE implantacao_id = $1 AND versao = $2', [i.id, n]);
      if (!v) return erro(res, 404, 'Versão não encontrada.');
      conteudo = v.conteudo; sufixo = `-v${n}`;
    } else if (pf.editar || !ficha.versao) {
      conteudo = FI.montar(i, ficha.dados, await contexto(i, ficha, req.usuario)); sufixo = '-rascunho';
    } else {
      conteudo = (await db.um('SELECT conteudo FROM implantacao_ficha_versoes WHERE implantacao_id = $1 AND versao = $2', [i.id, ficha.versao])).conteudo; sufixo = `-v${ficha.versao}`;
    }
    let pdf;
    try { pdf = await formularioPdf.gerarPdf(FI.paraPdf(conteudo), { timbrado: true }); } catch (e) { return erro(res, 500, e.message); }
    const nome = `Ficha_de_repasse_${nomeArquivo(i.condominio)}_${i.protocolo || ''}${sufixo}.pdf`;
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nome)}`);
    res.set('Cache-Control', 'private, no-store');
    res.send(pdf);
  });

  return { aoConcluir, prazoFicha };
}

/* rotina: lembrete na véspera e no dia, e atraso uma vez por dia útil (à assistente e à coordenação) até o primeiro envio */
function criarRotinaFichas({ db, avisos, expediente, coordenacao, historicoParametros, autorizados, P }) {
  return async function rotinaFichas(agora = new Date()) {
    const m = expediente.momento(agora);
    const feito = { ficha: 0 };
    if (!m.noExpediente) return feito;
    const hoje = m.dia;
    const historico = await historicoParametros(db);
    const coord = await coordenacao();
    const fmt = (d) => d.split('-').reverse().join('/');
    for (const x of (await db.q(`SELECT f.*, i.condominio, i.protocolo, i.responsavel_id, u.nome AS responsavel_nome FROM implantacao_fichas f JOIN implantacoes i ON i.id = f.implantacao_id
        LEFT JOIN usuarios u ON u.id = i.responsavel_id WHERE f.primeiro_envio_em IS NULL AND i.etapa IN ('concluida','na_carteira') AND (f.aviso_prazo_em IS NULL OR f.aviso_prazo_em < $1::date)`, [hoje])).rows) {
      const inicio = M.diaSP(x.aberta_em);
      const s = P.situacao({ inicio, n: M.parametrosEm(historico, inicio).ficha_dias, pausas: [], hoje });
      if (!s || !['vence_amanha', 'vence_hoje', 'atrasado'].includes(s.status)) continue;
      const link = `#/implantacao/${x.implantacao_id}/ficha`;
      const para = [x.responsavel_id, ...await autorizados(db, x.implantacao_id, ['tudo', 'documentos'])].filter(Boolean);
      if (s.status === 'atrasado') {
        const n = s.atraso === 1 ? '1 dia útil' : `${s.atraso} dias úteis`;
        await avisos.notificar(para, { link, tipo: 'implantacao', email: true, titulo: `Ficha de repasse atrasada · ${n} · ${x.condominio}`,
          texto: `A ficha de repasse de ${x.condominio} (${x.protocolo}) passou do prazo para enviar ao Crédito (${fmt(s.vence)}).` });
        await avisos.notificar(coord, { link, tipo: 'implantacao', email: true, titulo: `Ficha de repasse atrasada de ${x.responsavel_nome || 'quem conduz'} · ${n}`,
          texto: `${x.condominio} (${x.protocolo}): o prazo para enviar a ficha era ${fmt(s.vence)}. Para cobrar, abra a ficha.` });
      } else {
        await avisos.notificar(para, { link, tipo: 'implantacao', email: true,
          titulo: `Ficha de repasse vence ${s.status === 'vence_hoje' ? 'hoje' : 'amanhã'} · ${x.condominio}`,
          texto: `Envie a ficha de repasse de ${x.condominio} ao Crédito até ${fmt(s.vence)}${s.status === 'vence_hoje' ? ' (hoje)' : ''}.` });
      }
      await db.q('UPDATE implantacao_fichas SET aviso_prazo_em = $2::date WHERE implantacao_id = $1', [x.implantacao_id, hoje]);
      feito.ficha++;
    }
    return feito;
  };
}

module.exports = { rotasFicha, criarRotinaFichas };
