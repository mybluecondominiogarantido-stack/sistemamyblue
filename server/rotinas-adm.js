'use strict';
/*
 * Avisos do Calendário de Rotinas (Administrativo/Financeiro), no sino e por e-mail, a partir do que a ferramenta grava
 * no banco de documentos. Cada documento "status/<AAAA-MM>__<atividade>" guarda o status de cada dia da rotina:
 *   { mes, atv, dias: { "<dia>": { s, obs, por, em, desde } } }   s = feito | execucao | aguardando | pausado | pendente
 * O HTML não escolhe quem recebe: o portal compara o status de cada dia antes e depois da gravação.
 *  - um dia passou a "aguardando"                        → quem tem o papel "gestora" na ferramenta
 *  - um dia saiu de "aguardando" (a gestora respondeu)    → quem tinha marcado "aguardando" (campo por), se não foi ele
 * Papel sem ninguém (ou ainda não cadastrado no portal): a coordenação do setor da ferramenta; sem coordenação,
 * a administração. Quem fez a gravação não recebe o próprio aviso (notificar() já tira o autor).
 */

const MODULO = 'rotinas-adm';
const LINK = `#/m/${MODULO}`;
const STATUS = { feito: 'Feito', execucao: 'Em execução', aguardando: 'Aguardando gestora', pausado: 'Pausado', pendente: 'Pendente' };

const caminhoStatus = (p) => /^status\/\d{4}-\d{2}__[^/]+$/.test(String(p || ''));
const idPortal = (s) => { const m = /^mb-(\d{1,9})$/.exec(String(s || '')); return m ? Number(m[1]) : null; };
const texto = (s, max = 120) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
const dataDoDia = (mes, dia) => { const m = /^(\d{4})-(\d{2})$/.exec(mes || ''); return m ? `${String(dia).padStart(2, '0')}/${m[2]}/${m[1]}` : ''; };

function criarAvisosRotinas({ db, documentos, avisos }) {
  /* status de cada dia antes da gravação: { caminho: { dia: { s, por } } } */
  async function antes(ops) {
    const saida = {};
    for (const o of (ops || []).filter((x) => x && caminhoStatus(x.path))) {
      if (o.path in saida) continue;
      const d = await documentos.ler(MODULO, o.path).catch(() => null);
      const dias = {};
      for (const [dia, e] of Object.entries((d && d.dias) || {})) if (e && typeof e === 'object') dias[dia] = { s: e.s || '', por: e.por || '' };
      saida[o.path] = dias;
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
      WHERE sm.setor_id = $1 AND u.ativo AND u.papel IN ('diretor', 'gerente', 'coordenador', 'supervisor')`, [m.setor_id])).rows.map((x) => x.usuario_id);
    if (coord.length) return coord;
    return (await db.q("SELECT id FROM usuarios WHERE papel = 'admin' AND ativo")).rows.map((x) => x.id);
  }

  /* depois da gravação: compara cada dia com o status de antes e avisa quem precisa agir ou saber */
  async function depois(anterior, autor) {
    for (const [caminho, diasAntes] of Object.entries(anterior || {})) {
      const doc = await documentos.ler(MODULO, caminho).catch(() => null);
      if (!doc || !doc.dias || typeof doc.dias !== 'object') continue;
      let atividade = null;
      for (const [dia, e] of Object.entries(doc.dias)) {
        if (!e || typeof e !== 'object') continue;
        const ant = diasAntes[dia] || { s: '', por: '' };
        const st = e.s || 'pendente', stAntes = ant.s || 'pendente';
        if (st === stAntes) continue;
        if (st !== 'aguardando' && stAntes !== 'aguardando') continue;
        if (!atividade) atividade = (await documentos.ler(MODULO, `atividades/${texto(doc.atv, 200)}`).catch(() => null)) || {};
        const nome = texto(atividade.nome, 120) || 'Rotina';
        const data = dataDoDia(doc.mes, dia);
        const linhas = [
          ['Atividade', nome],
          ['Responsável', texto(atividade.responsavel, 80) || null],
          ['Data da rotina', data || null],
          ['Observação', texto(e.obs, 300) || null],
        ];
        const base = { link: LINK, tipo: 'rotina', email: true, autor_id: autor && autor.id };

        if (st === 'aguardando') {
          await avisos.notificar(await comPapel('gestora'), {
            ...base,
            titulo: `Rotina aguardando você · ${nome}${data ? ` · ${data}` : ''}`,
            texto: `${texto(autor && autor.nome, 80) || 'Alguém da equipe'} marcou a rotina como aguardando o seu retorno${e.obs ? `: ${texto(e.obs, 300)}` : ''}. Responda no Calendário de Rotinas.`,
            detalhes: { tom: 'acao', etiqueta: 'Aguardando a gestora', linhas, botao: 'Abrir o Calendário de Rotinas', motivo: 'você é a gestora das rotinas do Administrativo/Financeiro' },
          });
        } else {
          const quemMarcou = idPortal(ant.por);
          if (!quemMarcou) continue;
          await avisos.notificar([quemMarcou], {
            ...base,
            titulo: `Rotina respondida · ${nome}${data ? ` · ${data}` : ''} · ${STATUS[st] || st}`,
            texto: `A rotina que você marcou como aguardando a gestora agora está "${STATUS[st] || st}"${e.obs ? `. Observação: ${texto(e.obs, 300)}` : ''}.`,
            detalhes: { tom: st === 'feito' ? 'ok' : 'info', etiqueta: 'Retorno da gestora', linhas, botao: 'Abrir o Calendário de Rotinas', motivo: 'você marcou esta rotina como aguardando a gestora' },
          });
        }
      }
    }
  }

  return { antes, depois };
}

module.exports = { criarAvisosRotinas, MODULO };
