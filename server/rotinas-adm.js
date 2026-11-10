'use strict';
/*
 * Controle de Rotinas (Administrativo/Financeiro, slug "rotinas-adm"): avisos no sino e por e-mail e o painel com o que
 * vem do portal (Análise de Crédito e tickets de estorno). A ferramenta grava no banco de documentos:
 *   status/<AAAA-MM>__<atividade>: { mes, atv, dias: { "<dia>": { s, obs, por, em, desde, orig } } }
 *     s = feito | execucao | aguardando_sup | aguardando_coord | pausado | pendente  ("aguardando" antigo = aguardando_sup)
 *     orig = quem marcou primeiro o "aguardando" (o Assistente), quando a Supervisão encaminha à Coordenação
 *   pedidos/<id>: { atv, mes, numero, tipo, chegou, incluido, fiscal, pago, fluig, conf: { s: 'ok'|'devolvido', motivo, por, em }, por }
 * O HTML não escolhe quem recebe: o portal compara o antes e o depois da gravação.
 *  - um dia passou a "aguardando_sup"                      → quem tem o papel "supervisao"
 *  - um dia passou a "aguardando_coord"                    → quem tem o papel "coordenacao" (e quem marcou é avisado do encaminhamento)
 *  - um dia saiu de "aguardando" (foi respondido)          → quem tinha marcado (por) e quem marcou primeiro (orig)
 *  - um pedido foi devolvido pela Supervisão               → quem lançou o pedido
 * Papel sem ninguém (ou ainda não cadastrado no portal): a coordenação do setor da ferramenta; sem coordenação,
 * a administração. Quem fez a gravação não recebe o próprio aviso (notificar() já tira o autor).
 */

const MODULO = 'rotinas-adm';
const LINK = `#/m/${MODULO}`;
const NOME = 'Controle de Rotinas';
const STATUS = { feito: 'Feito', execucao: 'Em execução', aguardando_sup: 'Aguardando supervisão', aguardando_coord: 'Aguardando coordenação', pausado: 'Pausado', pendente: 'Pendente' };
const AGUARDA = { aguardando: 'supervisao', aguardando_sup: 'supervisao', aguardando_coord: 'coordenacao' };
const NOME_PAPEL = { supervisao: 'Supervisão', coordenacao: 'Coordenação' };
const CATEGORIA_ESTORNO = 'Estorno a cliente';

const caminhoStatus = (p) => /^status\/\d{4}-\d{2}__[^/]+$/.test(String(p || ''));
const caminhoPedido = (p) => /^pedidos\/[^/]+$/.test(String(p || ''));
const idPortal = (s) => { const m = /^mb-(\d{1,9})$/.exec(String(s || '')); return m ? Number(m[1]) : null; };
const texto = (s, max = 120) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
const dataDoDia = (mes, dia) => { const m = /^(\d{4})-(\d{2})$/.exec(mes || ''); return m ? `${String(dia).padStart(2, '0')}/${m[2]}/${m[1]}` : ''; };
const norm = (s) => (s === 'aguardando' ? 'aguardando_sup' : s || 'pendente');

function criarAvisosRotinas({ db, documentos, avisos, acessos }) {
  /* estado antes da gravação: { caminho: { tipo, dias | conf } } */
  async function antes(ops) {
    const saida = {};
    for (const o of (ops || []).filter((x) => x && (caminhoStatus(x.path) || caminhoPedido(x.path)))) {
      if (o.path in saida) continue;
      const d = await documentos.ler(MODULO, o.path).catch(() => null);
      if (caminhoPedido(o.path)) { saida[o.path] = { tipo: 'pedido', conf: (d && d.conf && d.conf.s) || '' }; continue; }
      const dias = {};
      for (const [dia, e] of Object.entries((d && d.dias) || {})) if (e && typeof e === 'object') dias[dia] = { s: e.s || '', por: e.por || '', orig: e.orig || '' };
      saida[o.path] = { tipo: 'status', dias };
    }
    return saida;
  }

  async function modulo() { return db.um('SELECT slug, setor_id, config FROM modulos WHERE slug = $1', [MODULO]); }

  async function comPapel(papel) {
    const m = await modulo();
    if (!m) return [];
    const cadastrado = Array.isArray(m.config && m.config.papeis) && m.config.papeis.some((p) => p && p.id === papel);
    if (cadastrado) {
      const { rows } = await db.q(`SELECT p.usuario_id FROM permissoes p JOIN usuarios u ON u.id = p.usuario_id
        WHERE p.modulo_slug = $1 AND u.ativo AND NOT p.somente_leitura AND $2 = ANY(p.papeis)`, [MODULO, papel]);
      if (rows.length) return rows.map((x) => x.usuario_id);
    }
    const coord = (await db.q(`SELECT sm.usuario_id FROM setor_membros sm JOIN usuarios u ON u.id = sm.usuario_id
      WHERE sm.setor_id = $1 AND u.ativo AND u.papel IN ('diretor', 'gerente', 'coordenador', 'supervisor')`, [m.setor_id])).rows.map((x) => x.usuario_id);
    if (coord.length) return coord;
    return (await db.q("SELECT id FROM usuarios WHERE papel = 'admin' AND ativo")).rows.map((x) => x.id);
  }

  const base = (autor) => ({ link: LINK, tipo: 'rotina', email: true, autor_id: autor && autor.id });
  const quem = (autor) => texto(autor && autor.nome, 80) || 'Alguém da equipe';

  async function avisarStatus(caminho, diasAntes, autor) {
    const doc = await documentos.ler(MODULO, caminho).catch(() => null);
    if (!doc || !doc.dias || typeof doc.dias !== 'object') return;
    let atividade = null;
    for (const [dia, e] of Object.entries(doc.dias)) {
      if (!e || typeof e !== 'object') continue;
      const ant = diasAntes[dia] || { s: '', por: '', orig: '' };
      const st = norm(e.s), stAntes = norm(ant.s);
      if (st === stAntes) continue;
      const papelNovo = AGUARDA[st], papelAntes = AGUARDA[stAntes];
      if (!papelNovo && !papelAntes) continue;
      if (!atividade) atividade = (await documentos.ler(MODULO, `atividades/${texto(doc.atv, 200)}`).catch(() => null)) || {};
      const nome = texto(atividade.nome, 120) || 'Rotina';
      const data = dataDoDia(doc.mes, dia);
      const linhas = [
        ['Atividade', nome],
        ['Data da rotina', data || null],
        ['Observação', texto(e.obs, 300) || null],
      ];
      const sufixo = `${nome}${data ? ` · ${data}` : ''}`;
      const obs = e.obs ? `: ${texto(e.obs, 300)}` : '';

      if (papelNovo) {
        await avisos.notificar(await comPapel(papelNovo), {
          ...base(autor),
          titulo: `Rotina aguardando você · ${sufixo}`,
          texto: `${quem(autor)} marcou a rotina como aguardando o retorno da ${NOME_PAPEL[papelNovo]}${obs}. Responda no ${NOME}.`,
          detalhes: { tom: 'acao', etiqueta: STATUS[st], linhas, botao: `Abrir o ${NOME}`, motivo: `você tem o papel ${NOME_PAPEL[papelNovo]} no ${NOME}` },
        });
        // encaminhada da Supervisão para a Coordenação: quem marcou fica sabendo
        if (papelAntes && papelAntes !== papelNovo) {
          const ids = [...new Set([idPortal(ant.orig), idPortal(ant.por)].filter(Boolean))];
          if (ids.length) {
            await avisos.notificar(ids, {
              ...base(autor),
              titulo: `Rotina encaminhada à ${NOME_PAPEL[papelNovo]} · ${sufixo}`,
              texto: `A rotina que você marcou como aguardando foi encaminhada à ${NOME_PAPEL[papelNovo]}${obs}.`,
              detalhes: { tom: 'info', etiqueta: 'Encaminhada', linhas, botao: `Abrir o ${NOME}`, motivo: 'você marcou esta rotina como aguardando retorno' },
            });
          }
        }
        continue;
      }
      // saiu de "aguardando": respondida
      const ids = [...new Set([idPortal(ant.por), idPortal(ant.orig)].filter(Boolean))];
      if (!ids.length) continue;
      await avisos.notificar(ids, {
        ...base(autor),
        titulo: `Rotina respondida · ${sufixo} · ${STATUS[st] || st}`,
        texto: `A rotina que estava aguardando a ${NOME_PAPEL[papelAntes]} agora está "${STATUS[st] || st}"${e.obs ? `. Observação: ${texto(e.obs, 300)}` : ''}.`,
        detalhes: { tom: st === 'feito' ? 'ok' : 'info', etiqueta: `Retorno da ${NOME_PAPEL[papelAntes]}`, linhas, botao: `Abrir o ${NOME}`, motivo: 'você marcou esta rotina como aguardando retorno' },
      });
    }
  }

  async function avisarPedido(caminho, confAntes, autor) {
    const p = await documentos.ler(MODULO, caminho).catch(() => null);
    if (!p || !p.conf || p.conf.s !== 'devolvido' || confAntes === 'devolvido') return;
    const dono = idPortal(p.por);
    if (!dono) return;
    const atividade = (await documentos.ler(MODULO, `atividades/${texto(p.atv, 200)}`).catch(() => null)) || {};
    await avisos.notificar([dono], {
      ...base(autor),
      titulo: `Pedido devolvido pela Supervisão · ${texto(p.numero, 40) || 'sem número'}`,
      texto: `${quem(autor)} devolveu o pedido ${texto(p.numero, 40)}${p.conf.motivo ? `: ${texto(p.conf.motivo, 300)}` : ''}. Corrija e lance de novo no ${NOME}.`,
      detalhes: { tom: 'acao', etiqueta: 'Pedido devolvido', linhas: [['Rotina', texto(atividade.nome, 120) || null], ['Pedido', texto(p.numero, 40) || null], ['Tipo', texto(p.tipo, 10) || null], ['Motivo', texto(p.conf.motivo, 300) || null]], botao: `Abrir o ${NOME}`, motivo: 'você lançou este pedido' },
    });
  }

  /* depois da gravação: compara com o que havia antes e avisa quem precisa agir ou saber */
  async function depois(anterior, autor) {
    for (const [caminho, a] of Object.entries(anterior || {})) {
      if (a.tipo === 'pedido') await avisarPedido(caminho, a.conf, autor);
      else await avisarStatus(caminho, a.dias || {}, autor);
    }
  }

  /* ---------- painel: o que vem do portal ---------- */
  const PODE_CREDITO = ['supervisao', 'coordenacao'];
  async function painel(usuario, mesTxt) {
    const m = await modulo();
    if (!m) return { credito: null, estornos: [] };
    const mes = /^\d{4}-\d{2}$/.test(String(mesTxt || '')) ? mesTxt : null;
    const a = acessos ? await acessos.acessoDe(usuario, m) : { papeis: [] };
    const cadastrados = new Set(((m.config && m.config.papeis) || []).map((p) => p && p.id));
    const veCredito = usuario.papel === 'admin' || PODE_CREDITO.some((p) => (a.papeis || []).includes(p)) || !PODE_CREDITO.some((p) => cadastrados.has(p));

    let credito = null;
    if (veCredito) {
      const EM = "('fila','em_analise','diretoria','validada')";
      const c = await db.um(`SELECT
          COUNT(*) FILTER (WHERE etapa = 'fila')::int AS fila,
          COUNT(*) FILTER (WHERE etapa IN ('em_analise','validada'))::int AS em_analise,
          COUNT(*) FILTER (WHERE etapa = 'pendencia')::int AS pendencia,
          COUNT(*) FILTER (WHERE etapa = 'diretoria')::int AS diretoria,
          COUNT(*) FILTER (WHERE etapa IN ${EM} AND prazo_analista < now())::int AS fora_prazo,
          COUNT(*) FILTER (WHERE etapa = 'enviada' AND to_char(enviada_em AT TIME ZONE 'America/Fortaleza', 'YYYY-MM') = $1)::int AS liberadas,
          COUNT(*) FILTER (WHERE etapa = 'enviada' AND to_char(enviada_em AT TIME ZONE 'America/Fortaleza', 'YYYY-MM') = $1 AND (prazo_analista IS NULL OR enviada_em <= prazo_analista))::int AS liberadas_no_prazo
        FROM analises`, [mes || new Date().toISOString().slice(0, 7)]);
      const lista = (await db.q(`SELECT id, protocolo, condominio, etapa, prazo_analista, (etapa IN ${EM} AND prazo_analista < now()) AS atrasada
        FROM analises WHERE etapa IN ('pendencia','fila','em_analise','diretoria','validada') ORDER BY prazo_analista NULLS LAST, id LIMIT 50`)).rows;
      credito = { ...c, lista: lista.map((x) => ({ id: x.id, protocolo: x.protocolo || '', condominio: texto(x.condominio, 120), etapa: x.etapa, prazo: x.prazo_analista, atrasada: !!x.atrasada })) };
    }

    // tickets de estorno do setor da ferramenta (sem a descrição: CPF e dados bancários ficam só no ticket)
    const nomeCat = texto((m.config && m.config.categoria_estorno) || CATEGORIA_ESTORNO, 100);
    const estornos = (await db.q(`SELECT t.id, t.titulo, t.status, t.criado_em, t.primeira_resposta_em, t.prazo, t.prazo_conclusao, t.resolvido_em,
          cd.nome AS condominio, u.nome AS responsavel
        FROM tickets t JOIN ticket_categorias c ON c.id = t.categoria_id
        LEFT JOIN condominios cd ON cd.id = t.condominio_id LEFT JOIN usuarios u ON u.id = t.responsavel_id
        WHERE c.setor_id = $1 AND lower(c.nome) = lower($2) AND t.status <> 'cancelado'
          AND (t.status IN ('novo','em_andamento','aguardando') OR t.criado_em >= now() - interval '120 days')
        ORDER BY t.criado_em DESC LIMIT 300`, [m.setor_id, nomeCat])).rows;
    return {
      credito,
      categoria_estorno: nomeCat,
      estornos: estornos.map((t) => ({ id: t.id, titulo: texto(t.titulo, 160), status: t.status, condominio: texto(t.condominio, 120), responsavel: texto(t.responsavel, 80),
        criado_em: t.criado_em, primeira_resposta_em: t.primeira_resposta_em, prazo: t.prazo, prazo_conclusao: t.prazo_conclusao, resolvido_em: t.resolvido_em })),
    };
  }

  return { antes, depois, painel };
}

module.exports = { criarAvisosRotinas, MODULO };
