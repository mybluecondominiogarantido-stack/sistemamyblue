'use strict';
/*
 * Acessos às ferramentas, decididos num lugar só (o portal):
 *  - quem abre cada ferramenta: administração (todas), coordenação/supervisão (as dos setores dela) e
 *    as pessoas liberadas na ferramenta (tabela permissoes), de qualquer setor;
 *  - como abre: edita ou só consulta (permissoes.somente_leitura; o servidor recusa gravações);
 *  - com qual papel dentro da ferramenta (ex.: Gestão, Financeiro). O HTML recebe os papéis em
 *    window.__MYBLUE__.usuario.papeis (e claude.use('user').can('papel:<id>')).
 *
 * Ferramentas que já tinham uma aba "Acessos" própria (MODELOS) continuam guardando os papéis no formato
 * delas: o portal lê e grava nesse formato, então a tela do portal e a aba da ferramenta mostram o mesmo,
 * sem precisar mudar o HTML.
 */

const ID_PAPEL_RE = /^[a-z][a-z0-9_-]{0,29}$/;

const MODELOS = [
  {
    id: 'comissoes-novos-condominios',
    nome: 'Comissões de Novos Condomínios',
    reconhecer: (html) => html.includes("const PFX = 'cnp:'") && html.includes("K_PERFIL = PFX + 'p:'"),
    papeis: [
      { id: 'executivo', nome: 'Executivo comercial', descricao: 'Responde, na aba Comercial, pelos condomínios dele: parceiro e tipo de comissão.' },
      { id: 'gestor', nome: 'Gestão', descricao: 'Aprova ou devolve as respostas do comercial. Enquanto ninguém tiver este papel, todos veem todas as abas.' },
      { id: 'financeiro', nome: 'Financeiro', descricao: 'Cadastra na Prestação de Contas o que a gestão aprovou.' },
    ],
    // armazenamento da ferramenta: chave cnp:p:<id do usuário> → { id, papeis, executivo, nome, ... }
    espelho: { tipo: 'armazenamento', prefixo: 'cnp:p:', idNoDoc: (uid) => String(uid) },
  },
  {
    id: 'analise-de-espolio',
    nome: 'Análise de Espólio',
    reconhecer: (html) => html.includes("perfis:'perfis'") && html.includes("const PAPEIS = { gestao: 'Gestão', solicitante: 'Solicitante' }"),
    papeis: [
      { id: 'gestao', nome: 'Gestão', descricao: 'Recebe as solicitações, faz as análises e configura a ferramenta.' },
      { id: 'solicitante', nome: 'Solicitante', descricao: 'Pede análises e acompanha as próprias solicitações.' },
    ],
    // banco de documentos da ferramenta: perfis/mb-<id do usuário> → { id, nome, papeis, nomeCarteira, ... }
    espelho: { tipo: 'documentos', colecao: 'perfis', prefixo: 'mb-', idNoDoc: (uid) => `mb-${uid}` },
  },
];

function criarAcessos({ db, seg, modulos, documentos }) {
  /* modelo reconhecido no HTML em uso (guardado por versão: só relê quando chega um HTML novo) */
  const cacheModelo = new Map();
  async function modeloDe(m) {
    if (!m || !m.versao_id) return null;
    const c = cacheModelo.get(m.slug);
    if (c && c.versao === m.versao_id) return c.modelo;
    let modelo = null;
    try {
      const html = await modulos.lerHtml(m);
      modelo = (html && MODELOS.find((x) => x.reconhecer(html))) || null;
    } catch { modelo = null; }
    cacheModelo.set(m.slug, { versao: m.versao_id, modelo });
    return modelo;
  }

  /* papéis que a ferramenta tem: os do modelo reconhecido ou os definidos pela administração */
  async function papeisDaFerramenta(m) {
    const modelo = await modeloDe(m);
    if (modelo) return { modelo, lista: modelo.papeis };
    const lista = Array.isArray(m.config.papeis) ? m.config.papeis.filter((p) => p && ID_PAPEL_RE.test(p.id)) : [];
    return { modelo: null, lista };
  }

  const escopoArm = (m) => (m.armazenamento === 'compartilhado' ? '*' : null);

  /* papéis de cada pessoa (Map id → [papéis]); nas ferramentas de modelo, lidos do formato da própria ferramenta */
  async function papeisPorPessoa(m, modelo) {
    const saida = new Map();
    if (!modelo) {
      for (const r of (await db.q('SELECT usuario_id, papeis FROM permissoes WHERE modulo_slug = $1', [m.slug])).rows) saida.set(r.usuario_id, r.papeis || []);
      return saida;
    }
    const e = modelo.espelho;
    const uidDe = (k) => (k.startsWith(e.prefixo) && /^\d{1,9}$/.test(k.slice(e.prefixo.length)) ? k.slice(e.prefixo.length) : null);
    const validos = new Set(modelo.papeis.map((p) => p.id));
    const guardar = (uid, dados) => {
      const n = Number(uid);
      if (n && dados && Array.isArray(dados.papeis)) saida.set(n, dados.papeis.filter((p) => validos.has(p)));
    };
    if (e.tipo === 'armazenamento') {
      const escopo = escopoArm(m);
      if (!escopo) return saida;
      const { rows } = await db.q('SELECT chave, valor FROM armazenamento WHERE modulo_slug = $1 AND escopo = $2 AND starts_with(chave, $3)', [m.slug, escopo, e.prefixo]);
      for (const r of rows) { try { guardar(uidDe(r.chave), JSON.parse(r.valor)); } catch { /* valor malformado */ } }
    } else {
      for (const d of await documentos.listar(m.slug, e.colecao)) guardar(uidDe(d.id), d);
    }
    return saida;
  }

  /* grava os papéis no formato da ferramenta (só de quem mudou; os outros campos do registro ficam como estão) */
  async function espelhar(m, modelo, mudancas, autor) {
    const e = modelo.espelho;
    const em = new Date().toISOString();
    const nomes = new Map((await db.q('SELECT id, nome FROM usuarios WHERE id = ANY($1::int[])', [[...mudancas.keys()]])).rows.map((u) => [u.id, u.nome]));
    if (e.tipo === 'armazenamento') {
      const escopo = escopoArm(m);
      if (!escopo) return;
      await db.tx(async (t) => {
        for (const [uid, papeis] of mudancas) {
          const chave = e.prefixo + uid;
          const atual = await t.um('SELECT valor FROM armazenamento WHERE modulo_slug = $1 AND escopo = $2 AND chave = $3', [m.slug, escopo, chave]);
          let base = {};
          try { base = atual ? JSON.parse(atual.valor) || {} : {}; } catch { base = {}; }
          const novo = { executivo: '', ...base, id: e.idNoDoc(uid), papeis, nome: base.nome || nomes.get(uid) || '', atualizadoPor: autor.nome, atualizadoEm: em };
          await t.q(`INSERT INTO armazenamento (modulo_slug, escopo, chave, valor, atualizado_por) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (modulo_slug, escopo, chave) DO UPDATE SET valor = excluded.valor, atualizado_em = now(), atualizado_por = excluded.atualizado_por,
              versao = armazenamento.versao + 1`, [m.slug, escopo, chave, JSON.stringify(novo), autor.id]);
        }
      });
    } else {
      const ops = [];
      for (const [uid, papeis] of mudancas) {
        const caminho = `${e.colecao}/${e.prefixo}${uid}`;
        const atual = (await documentos.ler(m.slug, caminho)) || {};
        ops.push({ op: 'set', path: caminho,
          data: { nomeCarteira: '', ...atual, id: e.idNoDoc(uid), nome: atual.nome || nomes.get(uid) || '', papeis, atualizadoEm: em, atualizadoPor: autor.nome } });
      }
      for (let i = 0; i < ops.length; i += 50) await documentos.gravar(m.slug, ops.slice(i, i + 50), `mb-${autor.id}`, autor.id);
    }
  }

  /* quem abre a ferramenta sem precisar ser marcado: administração e coordenação/supervisão do setor dela */
  const gestoresDoSetor = async (setorId) => (setorId ? (await db.q(`SELECT sm.usuario_id FROM setor_membros sm JOIN usuarios u ON u.id = sm.usuario_id
    WHERE sm.setor_id = $1 AND u.papel = ANY($2::text[])`, [setorId, seg.GESTORES_DE_SETOR])).rows.map((x) => x.usuario_id) : []);

  /* O que a pessoa pode na ferramenta: { abre, somente_leitura, papeis } (comPapeis = false: só abre e só consulta) */
  async function acessoDe(usuario, m, { comPapeis = true } = {}) {
    const nada = { abre: false, somente_leitura: true, papeis: [] };
    if (!usuario || !m) return nada;
    const linha = await db.um('SELECT somente_leitura, papeis FROM permissoes WHERE usuario_id = $1 AND modulo_slug = $2', [usuario.id, m.slug]);
    const gestor = usuario.papel === 'admin' || (seg.GESTORES_DE_SETOR.includes(usuario.papel) && (await gestoresDoSetor(m.setor_id)).includes(usuario.id));
    if (!gestor && (!linha || m.pendente)) return nada; // ferramenta aguardando aprovação: só administração e coordenação do setor
    if (!comPapeis) return { abre: true, somente_leitura: !gestor && !!linha.somente_leitura, papeis: [] };
    const { modelo, lista } = await papeisDaFerramenta(m);
    let papeis = [];
    if (modelo) papeis = (await papeisPorPessoa(m, modelo)).get(usuario.id) || [];
    else if (linha) papeis = (linha.papeis || []).filter((p) => lista.some((x) => x.id === p));
    return { abre: true, somente_leitura: !gestor && !!linha.somente_leitura, papeis };
  }

  /* quadro de acessos de uma ferramenta: todas as pessoas ativas, com o que cada uma tem */
  async function quadro(m) {
    const { modelo, lista } = await papeisDaFerramenta(m);
    const papeis = await papeisPorPessoa(m, modelo);
    const linhas = new Map((await db.q('SELECT usuario_id, somente_leitura FROM permissoes WHERE modulo_slug = $1', [m.slug])).rows.map((r) => [r.usuario_id, r]));
    const gestores = new Set(await gestoresDoSetor(m.setor_id));
    const { rows } = await db.q(`SELECT u.id, u.nome, u.email, u.papel, COALESCE(array_agg(s.nome ORDER BY s.ordem) FILTER (WHERE s.id IS NOT NULL), '{}') AS setores,
      COALESCE(array_agg(s.id) FILTER (WHERE s.id IS NOT NULL), '{}') AS setor_ids
      FROM usuarios u LEFT JOIN setor_membros sm ON sm.usuario_id = u.id LEFT JOIN setores s ON s.id = sm.setor_id
      WHERE u.ativo GROUP BY u.id ORDER BY u.nome`);
    return {
      modelo: modelo ? modelo.nome : null,
      papeis: lista,
      pessoas: rows.map((u) => {
        const automatico = u.papel === 'admin' ? 'administração' : gestores.has(u.id) ? 'coordenação do setor' : null;
        const l = linhas.get(u.id);
        return { id: u.id, nome: u.nome, email: u.email, papel: u.papel, setores: u.setores, do_setor: (u.setor_ids || []).includes(m.setor_id),
          automatico, abre: !!(automatico || l), liberado: !!l, somente_leitura: !automatico && !!(l && l.somente_leitura), papeis: papeis.get(u.id) || [] };
      }),
    };
  }

  /* Grava o quadro: [{ usuario_id, somente_leitura, papeis }] = todas as pessoas liberadas nesta ferramenta.
     Quem é administração ou coordenação do setor só guarda os papéis (abre de qualquer jeito). */
  async function salvar(m, acessos, autor) {
    const { modelo, lista } = await papeisDaFerramenta(m);
    const validos = new Set(lista.map((p) => p.id));
    const ativos = new Map((await db.q('SELECT id, papel FROM usuarios WHERE ativo')).rows.map((u) => [u.id, u.papel]));
    const gestores = new Set(await gestoresDoSetor(m.setor_id));
    const pedido = new Map();
    for (const a of acessos) {
      const uid = Number(a && a.usuario_id);
      if (!ativos.has(uid)) continue;
      pedido.set(uid, { somente_leitura: !!a.somente_leitura, papeis: [...new Set((Array.isArray(a.papeis) ? a.papeis : []).map(String))].filter((p) => validos.has(p)) });
    }
    const automatico = (uid) => ativos.get(uid) === 'admin' || gestores.has(uid);
    const antes = await papeisPorPessoa(m, modelo);
    const linhasAntes = new Map((await db.q('SELECT usuario_id, somente_leitura FROM permissoes WHERE modulo_slug = $1', [m.slug])).rows.map((r) => [r.usuario_id, r]));
    await db.tx(async (t) => {
      // pessoas desativadas ficam com a liberação como estava (voltam com ela se forem reativadas)
      for (const uid of linhasAntes.keys()) if (ativos.has(uid) && !pedido.has(uid)) await t.q('DELETE FROM permissoes WHERE usuario_id = $1 AND modulo_slug = $2', [uid, m.slug]);
      for (const [uid, a] of pedido) {
        // administração e coordenação do setor só ficam com linha se tiverem papel (para guardá-lo)
        if (automatico(uid) && !a.papeis.length && !modelo) { await t.q('DELETE FROM permissoes WHERE usuario_id = $1 AND modulo_slug = $2', [uid, m.slug]); continue; }
        if (automatico(uid) && modelo) { await t.q('DELETE FROM permissoes WHERE usuario_id = $1 AND modulo_slug = $2', [uid, m.slug]); continue; }
        await t.q(`INSERT INTO permissoes (usuario_id, modulo_slug, somente_leitura, papeis) VALUES ($1, $2, $3, $4::text[])
          ON CONFLICT (usuario_id, modulo_slug) DO UPDATE SET somente_leitura = excluded.somente_leitura, papeis = excluded.papeis`,
        [uid, m.slug, automatico(uid) ? false : a.somente_leitura, modelo ? [] : a.papeis]);
      }
    });
    if (modelo) {
      // no formato da ferramenta: quem saiu ou ficou sem papel perde os papéis; só grava o que mudou
      const mudancas = new Map();
      const igual = (x, y) => x.length === y.length && x.every((p) => y.includes(p));
      for (const uid of new Set([...antes.keys(), ...pedido.keys()])) {
        if (!ativos.has(uid)) continue; // pessoas desativadas ficam como estão na ferramenta
        const novo = pedido.has(uid) ? pedido.get(uid).papeis : [];
        if (!igual(novo, antes.get(uid) || [])) mudancas.set(uid, novo);
      }
      if (mudancas.size) await espelhar(m, modelo, mudancas, autor);
    }
    return { pessoas: pedido.size };
  }

  /* o que entra em window.__MYBLUE__ */
  async function paraFerramenta(usuario, m) {
    const a = await acessoDe(usuario, m);
    const { lista } = await papeisDaFerramenta(m);
    return { papeis: a.papeis, somente_leitura: a.somente_leitura, papeis_da_ferramenta: lista.map((p) => ({ id: p.id, nome: p.nome })) };
  }

  return { MODELOS, ID_PAPEL_RE, modeloDe, papeisDaFerramenta, acessoDe, quadro, salvar, paraFerramenta, gestoresDoSetor };
}

module.exports = { criarAcessos, MODELOS, ID_PAPEL_RE };
