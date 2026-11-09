'use strict';
/*
 * Avisos da ferramenta Gestão de Viagens (sino e e-mail), a partir do que ela grava no banco de documentos
 * (coleção "viagens"). O HTML não escolhe quem recebe: o portal compara o status antes e depois da gravação.
 *  - solicitação nova ou reenviada (status "solicitada")  → quem tem o papel "gestao" na ferramenta
 *  - enviada para aprovação (status "aprovacao")           → quem tem o papel "aprovacao"
 *  - devolvida, aprovada, reprovada ou cancelada           → quem pediu pelo portal (solicitanteId), se não foi ele
 * Papel sem ninguém (ou ainda não cadastrado no portal): a coordenação do setor da ferramenta; sem coordenação,
 * a administração. Quem fez a gravação não recebe o próprio aviso (notificar() já tira o autor).
 */

const MODULO = 'gestao-de-viagens';
const LINK = `#/m/${MODULO}`;
const ITENS = { aereo: 'passagem aérea', rodoviario: 'passagem rodoviária', hospedagem: 'hospedagem', locacao: 'locação de veículo', outro: 'outro item' };

const caminhoViagem = (p) => /^viagens\/[^/]+$/.test(String(p || ''));
const dataBr = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const idPortal = (s) => { const m = /^mb-(\d{1,9})$/.exec(String(s || '')); return m ? Number(m[1]) : null; };
const texto = (s, max = 120) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);

function criarAvisosViagens({ db, documentos, avisos }) {
  /* status de cada viagem antes da gravação: { caminho: status } */
  async function antes(ops) {
    const saida = {};
    for (const o of (ops || []).filter((x) => x && caminhoViagem(x.path))) {
      if (o.path in saida) continue;
      const d = await documentos.ler(MODULO, o.path).catch(() => null);
      saida[o.path] = (d && d.status) || '';
    }
    return saida;
  }

  async function comPapel(papel) {
    const m = await db.um('SELECT setor_id, config FROM modulos WHERE slug = $1', [MODULO]);
    if (!m) return [];
    const cadastrado = Array.isArray(m.config && m.config.papeis) && m.config.papeis.some((p) => p && p.id === papel);
    if (cadastrado) {
      const { rows } = await db.q(`SELECT p.usuario_id FROM permissoes p JOIN usuarios u ON u.id = p.usuario_id
        WHERE p.modulo_slug = $1 AND u.ativo AND NOT p.somente_leitura AND $2 = ANY(p.papeis)`, [MODULO, papel]);
      if (rows.length) return rows.map((x) => x.usuario_id);
    }
    const coord = (await db.q(`SELECT sm.usuario_id FROM setor_membros sm JOIN usuarios u ON u.id = sm.usuario_id
      WHERE sm.setor_id = $1 AND u.ativo AND u.papel IN ('gerente', 'coordenador', 'supervisor')`, [m.setor_id])).rows.map((x) => x.usuario_id);
    if (coord.length) return coord;
    return (await db.q("SELECT id FROM usuarios WHERE papel = 'admin' AND ativo")).rows.map((x) => x.id);
  }

  function linhas(v) {
    return [
      ['Protocolo', texto(v.protocolo, 40)],
      ['Quem viaja', texto(v.colaborador) + (v.setor ? ` · ${texto(v.setor, 60)}` : '')],
      ['Trajeto', `${texto(v.origem, 80) || '—'} → ${texto(v.destino, 80) || '—'}`],
      ['Período', [dataBr(v.dataIda), dataBr(v.dataVolta)].filter(Boolean).join(' a ') || null],
      ['Motivo', texto(v.motivo, 200) || null],
    ];
  }

  /* depois da gravação: compara com o status de antes e avisa quem precisa agir ou saber */
  async function depois(anterior, autor) {
    for (const [caminho, stAntes] of Object.entries(anterior || {})) {
      const v = await documentos.ler(MODULO, caminho).catch(() => null);
      if (!v || !v.status || v.status === stAntes) continue;
      const st = v.status;
      const quem = texto(v.colaborador, 80) || 'Viagem';
      const destino = texto(v.destino, 80) || 'destino a definir';
      const periodo = [dataBr(v.dataIda), dataBr(v.dataVolta)].filter(Boolean).join(' a ');
      const base = { link: LINK, tipo: 'viagem', email: true, autor_id: autor && autor.id };
      const solicitante = idPortal(v.solicitanteId);

      if (st === 'solicitada') {
        const reenvio = stAntes === 'devolvida';
        const pedidos = ((v.pedido && v.pedido.itens) || []).map((k) => ITENS[k]).filter(Boolean).join(', ');
        await avisos.notificar(await comPapel('gestao'), {
          ...base,
          titulo: `${reenvio ? 'Solicitação de viagem corrigida' : 'Nova solicitação de viagem'} · ${quem} · ${destino}`,
          texto: `${texto(v.solicitante, 80) || 'Um colaborador'} ${reenvio ? 'reenviou' : 'pediu'} a viagem${periodo ? ` de ${periodo}` : ''}${pedidos ? ` (${pedidos})` : ''}. Confira os dados e faça a cotação na Gestão de Viagens.`,
          detalhes: { tom: 'acao', etiqueta: reenvio ? 'Solicitação reenviada' : 'Nova solicitação', linhas: [...linhas(v), ['Precisa de', pedidos || null]],
            botao: 'Abrir a Gestão de Viagens', motivo: 'você faz a cotação das viagens no portal' },
        });
      } else if (st === 'aprovacao') {
        await avisos.notificar(await comPapel('aprovacao'), {
          ...base,
          titulo: `Viagem aguardando aprovação · ${quem} · ${destino}`,
          texto: `A cotação${periodo ? ` da viagem de ${periodo}` : ''} está pronta. Abra a Gestão de Viagens para aprovar ou reprovar.`,
          detalhes: { tom: 'acao', etiqueta: 'Aguardando sua aprovação', linhas: linhas(v), botao: 'Abrir a Gestão de Viagens', motivo: 'você aprova as viagens no portal' },
        });
      }

      if (solicitante && ['devolvida', 'aprovada', 'reprovada', 'cancelada'].includes(st)) {
        const dec = v.decisao || {}, dev = v.devolucao || {};
        const msg = {
          devolvida: { tom: 'acao', etiqueta: 'Correção necessária', titulo: `Solicitação de viagem devolvida · ${destino}`,
            texto: `O Administrativo/Financeiro pediu uma correção: ${texto(dev.motivo, 500) || 'veja o motivo na ferramenta'}. Ajuste e reenvie em Minhas solicitações.` },
          aprovada: { tom: 'ok', etiqueta: 'Viagem aprovada', titulo: `Viagem aprovada · ${destino}${periodo ? ` · ${periodo}` : ''}`,
            texto: `Sua viagem foi aprovada${dec.obs ? `: ${texto(dec.obs, 500)}` : ''}. O roteiro e a ajuda de custo estão em Minhas solicitações.` },
          reprovada: { tom: 'alerta', etiqueta: 'Viagem reprovada', titulo: `Viagem reprovada · ${destino}`,
            texto: `Sua solicitação de viagem foi reprovada${dec.obs ? `. Motivo: ${texto(dec.obs, 500)}` : ''}.` },
          cancelada: { tom: 'info', etiqueta: 'Viagem cancelada', titulo: `Viagem cancelada · ${destino}`,
            texto: 'Sua solicitação de viagem foi cancelada pelo Administrativo/Financeiro. Se ainda precisar viajar, faça uma nova solicitação.' },
        }[st];
        await avisos.notificar([solicitante], {
          ...base, titulo: msg.titulo, texto: msg.texto,
          detalhes: { tom: msg.tom, etiqueta: msg.etiqueta, linhas: linhas(v), botao: 'Ver minhas solicitações', motivo: 'você pediu esta viagem pelo portal' },
        });
      }
    }
  }

  return { antes, depois };
}

module.exports = { criarAvisosViagens, MODULO };
