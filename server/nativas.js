'use strict';
/*
 * Telas do portal (Análise de Crédito, Solicitação de Contrato, Implantação, Jurídico) na mesma tela de acessos das
 * ferramentas em HTML: Configurações → Acessos → Ferramentas, grupo "Telas do portal".
 *
 * Estas telas são código do portal, não HTML, e cada papel delas já vinha de um lugar diferente (cadastro de executivo,
 * setor, permissões avulsas). Aqui cada papel diz de onde vem e o portal lê e grava lá mesmo, sem mudar o que as
 * telas conferem:
 *  - executivo:  cadastro de executivo de negócios (tabela executivos, ligado ao usuário; UF, região e boleto ficam em
 *                Acessos → Análise de Crédito);
 *  - setor:<n>:  fazer parte do setor (setor_membros; muda também a equipe de tickets da pessoa);
 *  - regra:<c>:  permissão do portal (regras_acesso: perfis, setores e pessoas liberadas uma a uma).
 *
 * Quem muda cada papel: a administração, todos; a gestão (gerência, coordenação, supervisão) do setor dono do papel,
 * os do setor dela (nas permissões, o mesmo de Acessos → Base de Clientes: regras.gerenciaveis). As chancelas da
 * diretoria são só da administração.
 */
const { politicaAtiva } = require('./credito/banco');

const PAPEIS = {
  executivo: { nome: 'Executivo de negócios', fonte: 'executivo', setor: 'Comercial',
    descricao: 'Pede análise de crédito, contrato e implantação dos condomínios dele e acompanha só os dele. UF, região e boleto ficam em Acessos → Análise de Crédito.' },
  analista: { nome: 'Analista de crédito', fonte: 'setor:analistas',
    descricao: 'Recebe a fila, analisa, calcula, devolve com pendência, envia à diretoria e libera o retorno. Entra no setor Análise de Crédito.' },
  equipe_implantacao: { nome: 'Equipe de implantação', fonte: 'setor:Implantação',
    descricao: 'Conduz as implantações designadas (etapas, documentos, ficha de transição). Entra no setor Implantação (e na equipe de tickets dele).' },
  equipe_juridico: { nome: 'Jurídico', fonte: 'setor:Jurídico',
    descricao: 'Recebe as demandas jurídicas no Painel do Jurídico. Entra no setor Jurídico (e na equipe de tickets dele).' },
  elaborar: { nome: 'Elabora contratos', fonte: 'regra:contratos.elaborar',
    descricao: 'Recebe as solicitações de contrato, assume, redige a minuta, responde aos ajustes e registra as condições fechadas.' },
  gestao_comercial: { nome: 'Gestão do Comercial', fonte: 'regra:comercial.gestao',
    descricao: 'Vê (só consulta) as análises, contratos e implantações de todos os executivos, com os painéis. Vem com o perfil Gerente no setor Comercial.' },
  chancela_credito: { nome: 'Chancela de crédito', fonte: 'regra:credito.diretoria',
    descricao: 'Diretoria: chancela as análises com inadimplência entre 35% e 40% ou sem o custo atual do boleto. Vê todas as análises, contratos e implantações.' },
  chancela_comercial: { nome: 'Chancela comercial', fonte: 'regra:contratos.diretoria',
    descricao: 'Diretoria: decide os itens comerciais do contrato (taxa administrativa abaixo de 2%, boleto abaixo de R$ 1,50, cobertura de taxa extra acima de 60%, cláusulas fora do padrão, taxa e boleto do condomínio de entrega) e o percentual fora do padrão nas parcerias.' },
};

const NATIVAS = [
  { slug: 'tela-credito', nome: 'Análise de Crédito', setor: 'analistas', link: '#/credito',
    papeis: ['executivo', 'analista', 'gestao_comercial', 'chancela_credito'] },
  { slug: 'tela-contratos', nome: 'Solicitação de Contrato', setor: 'Jurídico', link: '#/juridico/painel',
    papeis: ['executivo', 'elaborar', 'gestao_comercial', 'chancela_comercial', 'chancela_credito'] },
  { slug: 'tela-implantacao', nome: 'Implantação', setor: 'Implantação', link: '#/implantacao',
    papeis: ['executivo', 'equipe_implantacao', 'gestao_comercial', 'chancela_credito', 'chancela_comercial'] },
  { slug: 'tela-juridico', nome: 'Jurídico (demandas)', setor: 'Jurídico', link: '#/juridico/painel',
    papeis: ['equipe_juridico', 'elaborar', 'gestao_comercial', 'chancela_credito', 'chancela_comercial'] },
];
const porSlug = new Map(NATIVAS.map((n) => [n.slug, n]));

function criarNativas({ db, seg, regras }) {
  /* nome do setor (o dos analistas vem da política da Análise de Crédito) */
  const nomeSetor = async (n) => (n === 'analistas' ? (await politicaAtiva(db)).setor_analistas : n);
  const setorId = async (nome) => ((await db.um('SELECT id FROM setores WHERE nome = $1', [nome])) || {}).id || null;

  /* em quais telas o papel aparece (para avisar que mudar numa muda nas outras) */
  const telasDoPapel = (id) => NATIVAS.filter((n) => n.papeis.includes(id)).map((n) => n.nome);

  /* a pessoa (quem está mexendo) pode mudar este papel? */
  async function podeMudar(u, id) {
    if (u.papel === 'admin') return true;
    if (!seg.GESTORES_DE_SETOR.includes(u.papel)) return false;
    const p = PAPEIS[id];
    if (p.fonte.startsWith('regra:')) return (await regras.gerenciaveis(u)).has(p.fonte.slice(6));
    const nome = p.fonte === 'executivo' ? p.setor : await nomeSetor(p.fonte.slice(6));
    const sid = await setorId(nome);
    return !!sid && (await seg.setoresGeridos(u)).has(sid);
  }

  /* quem tem o papel: Map usuário → motivo ('' = marcado aqui, dá para tirar; texto = vem de outro lugar) */
  async function quemTem(id) {
    const p = PAPEIS[id];
    const saida = new Map();
    if (p.fonte === 'executivo') {
      for (const x of (await db.q('SELECT usuario_id FROM executivos WHERE ativo AND usuario_id IS NOT NULL')).rows) saida.set(x.usuario_id, '');
    } else if (p.fonte.startsWith('setor:')) {
      const sid = await setorId(await nomeSetor(p.fonte.slice(6)));
      if (sid) for (const x of (await db.q('SELECT usuario_id FROM setor_membros WHERE setor_id = $1', [sid])).rows) saida.set(x.usuario_id, '');
    } else {
      const chave = p.fonte.slice(6);
      const regra = (await regras.regras()).get(chave);
      for (const x of await regras.quemPodeIds(chave)) saida.set(x.id, regra.pessoas.includes(x.id) ? '' : x.motivo);
    }
    return saida;
  }

  /* lista para a tela (todas as telas, com os papéis); quem configura vê todas, mesmo as que não muda */
  const listar = () => NATIVAS.map((n) => ({ slug: n.slug, nome: n.nome, link: n.link, nativa: true }));

  async function quadro(slug, u) {
    const n = porSlug.get(slug);
    if (!n) return null;
    const papeis = [];
    const tem = {};
    for (const id of n.papeis) {
      const p = PAPEIS[id];
      papeis.push({ id, nome: p.nome, descricao: p.descricao, editavel: await podeMudar(u, id), outras_telas: telasDoPapel(id).filter((x) => x !== n.nome),
        fonte: p.fonte === 'executivo' ? 'cadastro de executivo' : p.fonte.startsWith('setor:') ? `setor ${await nomeSetor(p.fonte.slice(6))}` : 'permissão do portal' });
      tem[id] = await quemTem(id);
    }
    const { rows } = await db.q(`SELECT u.id, u.nome, u.email, u.papel, COALESCE(array_agg(s.nome ORDER BY s.ordem) FILTER (WHERE s.id IS NOT NULL), '{}') AS setores
      FROM usuarios u LEFT JOIN setor_membros sm ON sm.usuario_id = u.id LEFT JOIN setores s ON s.id = sm.setor_id
      WHERE u.ativo GROUP BY u.id ORDER BY u.nome`);
    return {
      nativa: true, slug: n.slug, nome: n.nome, link: n.link, setor_nome: await nomeSetor(n.setor), papeis,
      pessoas: rows.map((x) => {
        const marcados = [], automaticos = {};
        for (const id of n.papeis) {
          if (x.papel === 'admin') continue;
          if (!tem[id].has(x.id)) continue;
          const motivo = tem[id].get(x.id);
          if (motivo) automaticos[id] = motivo; else marcados.push(id);
        }
        return { id: x.id, nome: x.nome, email: x.email, papel: x.papel, setores: x.setores, todos_papeis: x.papel === 'admin', papeis: marcados, automaticos };
      }),
    };
  }

  /* grava as mudanças: [{ usuario_id, papel, tem }] (só o que mudou; o resto fica como está) */
  async function salvar(slug, mudancas, autor) {
    const n = porSlug.get(slug);
    if (!n) return { erro: 'Tela não encontrada.', status: 404 };
    const ativos = new Map((await db.q('SELECT id, nome, email, papel FROM usuarios WHERE ativo')).rows.map((x) => [x.id, x]));
    const lista = (Array.isArray(mudancas) ? mudancas : []).map((m) => ({ uid: Number(m && m.usuario_id), id: String(m && m.papel), tem: !!(m && m.tem) }))
      .filter((m) => n.papeis.includes(m.id) && ativos.has(m.uid) && ativos.get(m.uid).papel !== 'admin');
    for (const id of new Set(lista.map((m) => m.id))) {
      if (!(await podeMudar(autor, id))) return { erro: `O papel ${PAPEIS[id].nome} não é do seu setor. Quem muda é a administração${PAPEIS[id].fonte.startsWith('regra:credito') || PAPEIS[id].fonte.startsWith('regra:contratos.diretoria') ? '' : ' ou a gestão do setor dele'}.`, status: 403 };
    }
    const feitas = [];
    for (const m of lista) {
      const p = PAPEIS[m.id];
      const u = ativos.get(m.uid);
      if (p.fonte === 'executivo') {
        const atual = await db.um('SELECT id, ativo FROM executivos WHERE usuario_id = $1', [u.id]);
        if (m.tem) {
          if (atual && atual.ativo) continue;
          // cadastro antigo da pessoa (ou com o mesmo nome e sem usuário) volta a valer; senão, um novo, sem UF e boleto
          const alvo = atual || await db.um('SELECT id FROM executivos WHERE usuario_id IS NULL AND lower(nome) = lower($1)', [u.nome]);
          try {
            if (alvo) await db.q('UPDATE executivos SET usuario_id = $1, ativo = TRUE, atualizado_em = now() WHERE id = $2', [u.id, alvo.id]);
            else await db.q("INSERT INTO executivos (nome, email, uf, regiao, boleto, usuario_id) VALUES ($1, $2, '', '', NULL, $3)", [u.nome, u.email, u.id]);
          } catch (e) { if (e.code === '23505') return { erro: `Já existe outro executivo com o nome ${u.nome}.`, status: 409 }; throw e; }
        } else if (atual && atual.ativo) {
          // o cadastro fica (as análises antigas apontam para ele), só deixa de valer
          await db.q('UPDATE executivos SET ativo = FALSE, atualizado_em = now() WHERE id = $1', [atual.id]);
        } else continue;
      } else if (p.fonte.startsWith('setor:')) {
        const nome = await nomeSetor(p.fonte.slice(6));
        let sid = await setorId(nome);
        if (!sid && m.tem) sid = (await db.um('INSERT INTO setores (nome, ordem) VALUES ($1, 14) RETURNING id', [nome])).id;
        if (!sid) continue;
        if (m.tem) await db.q('INSERT INTO setor_membros (setor_id, usuario_id, lider) VALUES ($1, $2, FALSE) ON CONFLICT DO NOTHING', [sid, u.id]);
        else await db.q('DELETE FROM setor_membros WHERE setor_id = $1 AND usuario_id = $2', [sid, u.id]);
      } else {
        const chave = p.fonte.slice(6);
        const r = (await regras.regras()).get(chave);
        const pessoas = r.pessoas.filter((x) => x !== u.id).concat(m.tem ? [u.id] : []);
        await regras.salvar(chave, { niveis: r.niveis, setores: r.setores, pessoas }, autor);
      }
      feitas.push({ usuario: u.nome, papel: p.nome, tem: m.tem });
    }
    return { feitas };
  }

  /* telas e papéis de uma pessoa (para Acessos → Por pessoa) */
  async function daPessoa(u) {
    const saida = [];
    const cache = {};
    for (const n of NATIVAS) {
      const papeis = [];
      for (const id of n.papeis) {
        if (u.papel === 'admin') { papeis.push(PAPEIS[id].nome); continue; }
        cache[id] ||= await quemTem(id);
        if (cache[id].has(u.id)) papeis.push(PAPEIS[id].nome + (cache[id].get(u.id) ? ` (${cache[id].get(u.id)})` : ''));
      }
      if (papeis.length) saida.push({ slug: n.slug, nome: n.nome, papeis: u.papel === 'admin' ? ['todos os papéis'] : papeis });
    }
    return saida;
  }

  return { NATIVAS, PAPEIS, listar, quadro, salvar, daPessoa, podeMudar };
}

module.exports = { criarNativas, NATIVAS, PAPEIS };
