'use strict';
/*
 * Controle de Renegociações → Central de Tickets.
 *
 * Quando o CS salva uma renegociação que passou a ser "Fechado", o portal abre um ticket para o Crédito
 * (tipo "Renegociação fechada") com as condições fechadas. O condomínio é procurado na Carteira pelo nome e
 * pela UF; achando, o ticket vai direto para a assistente de crédito da Carteira (mesma regra dos tickets).
 * Não achando, cai na fila do Crédito para o líder distribuir, e quem fechou é avisado para conferir o nome.
 *
 * Renegociação que já tem ticket: o que mudou nas condições vira um comentário no mesmo ticket (antes → depois).
 * Se o ticket já estava resolvido ou cancelado, ele é reaberto para a assistente aplicar as condições novas.
 * Só contam as gravações de uma renegociação ("add" e "update"); importar a base e corrigir a planilha não
 * abrem ticket, nem as renegociações que já estavam fechadas antes de existir o ticket.
 * Nada aqui derruba a gravação da ferramenta: um erro só vai para o log.
 */
const carteira = require('./carteira');
const { PRAZO_PADRAO_HORAS } = require('./rotas/tickets');

const MODULO = 'renegociacoes';
const COLECAO = 'renegociacoes';
const SETOR = 'Crédito';
const ORIGEM = 'Controle de Renegociações';
// criado sozinho no 1º ticket; prazo e prioridade podem ser mudados depois em Equipes e tipos de demanda
const TIPO = { nome: 'Renegociação fechada', prazo_horas: 9, prioridade: 'alta' };

// colunas da planilha (SHEET_HEADERS da ferramenta), pelo nome do cabeçalho
const COLUNAS = { condominio: 'Condomínio', estado: 'Estado', status: 'Status' };
// condições levadas para o ticket, na ordem; "antes" é a coluna com o valor anterior à renegociação
const CONDICOES = [
  { campo: 'taxa', rotulo: 'Taxa de serviço', coluna: 'Taxa de Serviço (%)', antes: 'Taxa Anterior (%)', tipo: 'pct' },
  { campo: 'tarifa', rotulo: 'Tarifa bancária por boleto', coluna: 'Tarifa Bancária (R$)', antes: 'Tarifa Anterior (R$)', tipo: 'reais' },
  { campo: 'vop', rotulo: 'VOP mensal', coluna: 'VOP Mensal (R$)', tipo: 'reais' },
  { campo: 'boletos', rotulo: 'Qtd. de boletos', coluna: 'Qtd. Boletos', tipo: 'numero' },
  { campo: 'fidelizacao', rotulo: 'Fidelização', coluna: 'Fidelização', tipo: 'meses' },
  { campo: 'vigencia', rotulo: 'Início da vigência', coluna: 'Início vigência', tipo: 'data' },
  { campo: 'data', rotulo: 'Data da negociação', coluna: 'Data', tipo: 'data' },
  { campo: 'antecipacoes', rotulo: 'Antecipações', coluna: 'Antecipações (R$)', tipo: 'reais' },
  { campo: 'honorarios', rotulo: 'Honorários', coluna: 'Honorários', tipo: 'texto' },
  { campo: 'val_boletos', rotulo: 'Val. boletos', coluna: 'Val. Boletos', tipo: 'texto' },
  { campo: 'obs', rotulo: 'Observações', coluna: 'Observações', tipo: 'texto' },
  { campo: 'relatorio', rotulo: 'Relatório de garantia', coluna: 'Relatório', tipo: 'texto' },
];

const chave = (s) => carteira.semAcento(s).toLowerCase().replace(/\s+/g, ' ').trim();
const limpar = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const fechado = (status) => chave(status) === 'fechado';

/* "2,5", "1.234,56", 2.5 → número; vazio ou texto → null */
function numero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = limpar(v).replace(/^R\$\s*/, '').replace(/\s*%$/, '');
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : null;
}
const decimal = (n, casas) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/* valor da célula como aparece no ticket ('' quando vazio) */
function formatar(v, tipo, fuso) {
  const s = limpar(v);
  if (!s) return '';
  const n = numero(v);
  if (tipo === 'pct') return n == null ? s : decimal(n, 2) + '%';
  if (tipo === 'reais') return n == null ? s : 'R$ ' + decimal(n, 2);
  if (tipo === 'numero') return n == null ? s : n.toLocaleString('pt-BR');
  if (tipo === 'meses') return n == null ? s : `${n.toLocaleString('pt-BR')} ${n === 1 ? 'mês' : 'meses'}`;
  if (tipo === 'data') {
    // a ferramenta grava 31/12/2026; a planilha Google importada tem 2026-12-31T03:00:00.000Z
    let m;
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) return `${m[3]}/${m[2]}/${m[1]}`;
    const d = /^\d{4}-\d{2}-\d{2}T/.test(s) ? new Date(s) : null;
    return d && !isNaN(d) ? d.toLocaleDateString('pt-BR', { timeZone: fuso }) : s;
  }
  return s.slice(0, 2000);
}

function criarRenegociacoes({ db, seg, modulos, registros, avisos, expediente }) {
  const fuso = expediente.config.fuso;

  async function cabecalho(m) {
    return (await modulos.cabecalhoDoHtml(m, (m.config.colecoes || {})[COLECAO])) || (await registros.cabecalho(m.slug, COLECAO)) || [];
  }

  /* lê uma linha da planilha: condomínio, UF, status e as condições já formatadas */
  function leitor(cab) {
    const idx = (nome) => cab.findIndex((c) => chave(c) === chave(nome));
    const col = Object.fromEntries(Object.entries(COLUNAS).map(([k, nome]) => [k, idx(nome)]));
    const conds = CONDICOES.map((c) => ({ ...c, i: idx(c.coluna), iAntes: c.antes ? idx(c.antes) : -1 })).filter((c) => c.i >= 0);
    return (row) => {
      const cel = (i) => (i >= 0 && Array.isArray(row) ? row[i] : '');
      const condicoes = { condominio: [limpar(cel(col.condominio)), limpar(cel(col.estado)).toUpperCase()].filter(Boolean).join(' · ') };
      for (const c of conds) {
        condicoes[c.campo] = formatar(cel(c.i), c.tipo, fuso);
        if (c.iAntes >= 0) condicoes[c.campo + '_antes'] = formatar(cel(c.iAntes), c.tipo, fuso);
      }
      return { condominio: limpar(cel(col.condominio)), estado: limpar(cel(col.estado)), status: cel(col.status), temStatus: col.status >= 0, condicoes };
    };
  }

  /* linhas da descrição: "Taxa de serviço: 2,50% → 2,10%" */
  function linhasCondicoes(c) {
    const out = [];
    for (const d of CONDICOES) {
      const v = c[d.campo];
      const a = c[d.campo + '_antes'];
      if (!v && !a) continue;
      out.push(`${d.rotulo}: ${a && a !== v ? `${a} → ${v || '—'}` : v}`);
    }
    return out;
  }

  /* o que mudou entre as condições que o ticket tem e as novas */
  function mudancas(antes, depois) {
    const campos = [{ k: 'condominio', rotulo: 'Condomínio' }];
    for (const d of CONDICOES) {
      if (d.antes) campos.push({ k: d.campo + '_antes', rotulo: `${d.rotulo} (anterior)` });
      campos.push({ k: d.campo, rotulo: d.rotulo });
    }
    return campos.filter(({ k }) => k in depois && (antes[k] || '') !== (depois[k] || ''))
      .map(({ k, rotulo }) => `${rotulo}: ${antes[k] || '—'} → ${depois[k] || '—'}`);
  }

  async function tipoDeDemanda(setorId) {
    await db.q('INSERT INTO ticket_categorias (setor_id, nome, prazo_horas, prioridade) VALUES ($1, $2, $3, $4) ON CONFLICT (setor_id, nome) DO NOTHING',
      [setorId, TIPO.nome, TIPO.prazo_horas, TIPO.prioridade]);
    return db.um('SELECT * FROM ticket_categorias WHERE setor_id = $1 AND nome = $2', [setorId, TIPO.nome]);
  }

  const registrar = (t, ticketId, usuarioId, tipo, texto, interno, detalhe) =>
    t.q('INSERT INTO ticket_eventos (ticket_id, usuario_id, tipo, texto, interno, detalhe) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
      [ticketId, usuarioId, tipo, texto || null, !!interno, detalhe == null ? null : JSON.stringify(detalhe)]);
  // uma gravação por vez em cada renegociação (duas pessoas salvando juntas não abrem dois tickets)
  const travar = (t, id) => t.q('SELECT pg_advisory_xact_lock(hashtext($1))', ['renegociacao|' + id]);

  async function abrirTicket(req, id, lida) {
    const u = req.usuario;
    const setor = await db.um('SELECT id, nome FROM setores WHERE nome = $1', [SETOR]);
    if (!setor) return null;
    const cat = await tipoDeDemanda(setor.id);
    const prioridade = cat.prioridade;
    const prazo = expediente.somarHorasUteis(new Date(), cat.prazo_horas || PRAZO_PADRAO_HORAS[prioridade]);
    const cond = carteira.acharCondominio((await db.q('SELECT id, nome, comarca, situacao FROM condominios')).rows, lida.condominio, lida.estado);
    const r0 = cond ? await carteira.responsavelDoCondominio(db, cond.id, setor.id) : null;
    const auto = r0 && r0.id ? r0 : null;
    const nome = cond ? [cond.nome, cond.comarca].filter(Boolean).join(' · ') : lida.condicoes.condominio || 'condomínio sem nome';
    const titulo = `Renegociação fechada: ${nome}`.slice(0, 160);
    const descricao = [
      `${u.nome} fechou a renegociação no ${ORIGEM}. Aplicar as novas condições no Crédito.`,
      cond ? null : `Condomínio não identificado na Carteira ("${lida.condicoes.condominio}"): o líder confere e distribui.`,
      '', `Condomínio: ${nome}`, ...linhasCondicoes(lida.condicoes),
    ].filter((x) => x !== null).join('\n');

    const ticket = await db.tx(async (t) => {
      await travar(t, id);
      if (await t.um('SELECT 1 FROM renegociacao_tickets WHERE item_id = $1', [id])) return null; // outra gravação já abriu
      const { id: novo } = await t.um(`INSERT INTO tickets (titulo, descricao, setor_id, categoria_id, prioridade, solicitante_id, prazo, condominio_id, demanda_interna, responsavel_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, $9) RETURNING id`,
      [titulo, descricao, setor.id, cat.id, prioridade, u.id, prazo, cond ? cond.id : null, auto ? auto.id : null]);
      await registrar(t, novo, u.id, 'criado', null, false, { setor: setor.nome, prioridade, condominio: cond ? cond.nome : null, interna: false, origem: ORIGEM });
      if (auto) await registrar(t, novo, null, 'atribuicao', null, false, { para: auto.nome, para_id: auto.id, automatico: true });
      else if (r0) await registrar(t, novo, null, 'carteira_sem_cadastro', null, true, { carteira: r0.carteira });
      if (!cond) await registrar(t, novo, null, 'condominio_nao_identificado', null, false, { condominio: lida.condominio, uf: lida.estado });
      await t.q('INSERT INTO renegociacao_tickets (item_id, ticket_id, condicoes) VALUES ($1, $2, $3::jsonb)', [id, novo, JSON.stringify(lida.condicoes)]);
      return novo;
    });
    if (!ticket) return null;

    await seg.auditar(req, 'ticket_criado', MODULO, { ticket, setor: setor.nome, titulo, condominio: cond ? cond.nome : null, responsavel: auto ? auto.nome : null, renegociacao: id });
    const base = { ticket_id: ticket, autor_id: u.id, email: true };
    if (auto) {
      await avisos.notificar([auto.id], { ...base, tipo: 'atribuido', titulo: `Novo ticket #${ticket} para você`,
        texto: `${u.nome} fechou a renegociação de ${nome} no ${ORIGEM}. O ticket #${ticket} veio direto para você por ser condomínio da sua carteira.` });
    } else {
      const motivo = !cond ? ' O condomínio não foi identificado na Carteira: confira e distribua.'
        : r0 ? ' A assistente da Carteira não está na equipe do Crédito no portal: distribua o ticket.' : ' O condomínio não tem assistente de crédito na Carteira: distribua o ticket.';
      await avisos.notificar(await avisos.triagemDoSetor(setor.id), { ...base, tipo: 'novo', titulo: `Novo ticket para ${setor.nome}`,
        texto: `${u.nome} fechou a renegociação de ${nome} no ${ORIGEM} (ticket #${ticket}).${motivo}` });
    }
    // quem fechou confere o nome (o aviso é para a própria pessoa: sem autor)
    if (!cond) {
      await avisos.notificar([u.id], { ticket_id: ticket, autor_id: null, tipo: 'aviso', email: false, titulo: `Condomínio não identificado no ticket #${ticket}`,
        texto: `Não achei "${lida.condicoes.condominio}" na Carteira. O ticket #${ticket} foi para a fila do Crédito; confira o nome do condomínio na renegociação.` });
    }
    return { ticket, acao: 'criado' };
  }

  async function comentarMudancas(req, id, lida) {
    const u = req.usuario;
    const r = await db.tx(async (t) => {
      await travar(t, id);
      const v = await t.um('SELECT ticket_id, condicoes FROM renegociacao_tickets WHERE item_id = $1', [id]);
      const tk = v && await t.um('SELECT * FROM tickets WHERE id = $1', [v.ticket_id]);
      if (!tk) return null;
      const lista = mudancas(v.condicoes || {}, lida.condicoes);
      if (!lista.length) return null;
      const reabrir = ['resolvido', 'cancelado'].includes(tk.status);
      await registrar(t, tk.id, u.id, 'comentario', `Condições alteradas no ${ORIGEM}:\n${lista.map((x) => '• ' + x).join('\n')}`, false, null);
      if (reabrir) {
        // volta para a fila de quem atende com prazo novo; quem estiver com ele define de novo a previsão de conclusão
        const cat = tk.categoria_id && await t.um('SELECT prazo_horas FROM ticket_categorias WHERE id = $1', [tk.categoria_id]);
        const prazo = expediente.somarHorasUteis(new Date(), (cat && cat.prazo_horas) || PRAZO_PADRAO_HORAS[tk.prioridade]);
        await t.q(`UPDATE tickets SET status = 'novo', resolvido_em = NULL, prazo_conclusao = NULL, primeira_resposta_em = NULL, prazo = $2, atualizado_em = now()
          WHERE id = $1`, [tk.id, prazo]);
        await registrar(t, tk.id, u.id, 'status', 'A renegociação mudou depois do ticket encerrado.', false, { de: tk.status, para: 'novo' });
      } else await t.q('UPDATE tickets SET atualizado_em = now() WHERE id = $1', [tk.id]);
      await t.q('UPDATE renegociacao_tickets SET condicoes = $2::jsonb, atualizado_em = now() WHERE item_id = $1', [id, JSON.stringify(lida.condicoes)]);
      return { tk, lista, reabrir };
    });
    if (!r) return null;

    const { tk, lista, reabrir } = r;
    if (reabrir) await seg.auditar(req, 'ticket_status', MODULO, { ticket: tk.id, de: tk.status, para: 'novo', renegociacao: id });
    const quem = tk.responsavel_id ? [tk.responsavel_id] : await avisos.triagemDoSetor(tk.setor_id);
    const resumo = lista.slice(0, 3).join('; ') + (lista.length > 3 ? '…' : '');
    await avisos.notificar([...quem, tk.solicitante_id], {
      ticket_id: tk.id, autor_id: u.id, tipo: reabrir ? 'reaberto' : 'comentario', email: true,
      titulo: reabrir ? `Ticket #${tk.id} reaberto` : `Condições mudaram no ticket #${tk.id}`,
      texto: `${u.nome} alterou a renegociação no ${ORIGEM}${reabrir ? ' e o ticket foi reaberto' : ''}: ${resumo}`,
    });
    return { ticket: tk.id, acao: reabrir ? 'reaberto' : 'comentado' };
  }

  /* a planilha interna acompanha esta coleção? (só então vale buscar a linha anterior) */
  const acompanha = (m, colecao) => m.slug === MODULO && colecao === COLECAO;

  /* Chamada depois de gravar uma renegociação ("add" ou "update"). antes: a linha como estava (null = nova). */
  async function aoGravar(req, m, id, antes, depois) {
    try {
      const ler = leitor(await cabecalho(m));
      const lida = ler(depois);
      if (!lida.temStatus || !fechado(lida.status)) return null;
      if (await db.um('SELECT 1 FROM renegociacao_tickets WHERE item_id = $1', [id])) return await comentarMudancas(req, id, lida);
      // já estava fechada (antes do ticket automático existir): editar não abre ticket
      if (antes && fechado(ler(antes).status)) return null;
      return await abrirTicket(req, id, lida);
    } catch (e) {
      console.error('[renegociações → ticket]', e);
      return null;
    }
  }

  return { acompanha, aoGravar };
}

module.exports = { criarRenegociacoes, MODULO, TIPO };
