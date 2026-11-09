'use strict';
/*
 * Quem pode o quê no portal (fora das ferramentas, que têm a janela "Quem abre e com qual papel"):
 * cada permissão tem uma regra { niveis, setores, pessoas } definida pela administração em
 * Configurações → Acessos → Base de Clientes (a administração muda tudo; a coordenação/supervisão libera pessoas nas permissões
 * do setor dela). A administração pode tudo, sempre.
 *
 *  - niveis: perfis que recebem a permissão ('diretor', 'gerente', 'coordenador', 'supervisor', 'usuario');
 *  - setores: se tiver algum, o perfil só vale para quem é desses setores (vazio = qualquer setor);
 *  - pessoas: liberadas uma a uma, qualquer perfil.
 *
 * Enquanto a administração não mexe, vale o padrão de cada permissão (as regras que o portal já usava).
 */

const NIVEIS = { diretor: 'Diretoria', gerente: 'Gerência', coordenador: 'Coordenação', supervisor: 'Supervisão', usuario: 'Usuário' };

const PERMISSOES = [
  { chave: 'carteira.dados', grupo: 'Base de Clientes', rotulo: 'Editar os dados do condomínio',
    descricao: 'Situação, UF, nome, vencimento, administradora, forma de envio, executivo, vigência, razão social, CNPJ e observações.',
    padrao: { niveis: [], setores: [] } },
  { chave: 'carteira.analista_cobranca', grupo: 'Base de Clientes', rotulo: 'Editar e transferir o Analista de cobrança',
    descricao: 'Quem cuida de cada condomínio na Cobrança (os tickets da Cobrança sobre o condomínio vão para essa pessoa).',
    padrao: { niveis: ['diretor', 'gerente', 'coordenador', 'supervisor'], setores: ['Cobrança'] } },
  { chave: 'carteira.analista_extrajudicial', grupo: 'Base de Clientes', rotulo: 'Editar e transferir o Analista extrajudicial (ApoioCob)',
    descricao: 'Quem cuida da cobrança extrajudicial de cada condomínio.',
    padrao: { niveis: [], setores: [] } },
  { chave: 'carteira.assistente_credito', grupo: 'Base de Clientes', rotulo: 'Editar e transferir o Assistente de crédito',
    descricao: 'Quem cuida de cada condomínio no Crédito (os tickets do Crédito sobre o condomínio vão para essa pessoa).',
    padrao: { niveis: ['diretor', 'gerente', 'coordenador', 'supervisor'], setores: ['Crédito'] } },
  { chave: 'carteira.adicionar', grupo: 'Base de Clientes', rotulo: 'Adicionar condomínios novos pela planilha de implantação',
    descricao: 'Aba "Adicionar novos": lê a planilha de implantação e cadastra os condomínios da vigência escolhida.',
    padrao: { niveis: ['diretor', 'gerente', 'coordenador', 'supervisor'], setores: [] } },
  { chave: 'carteira.cadastro', grupo: 'Base de Clientes', rotulo: 'Cadastrar e excluir condomínios, mudar o ID e importar a planilha',
    descricao: 'Botão "Novo condomínio", "Remover", o ID Vouch e a importação da planilha inteira.',
    padrao: { niveis: [], setores: [] } },
  { chave: 'carteira.marketing', grupo: 'Base de Clientes', rotulo: 'Baixar a Lista do Marketing (síndicos)',
    descricao: 'Botão "Lista do Marketing": planilha com condomínio, UF, síndico, telefone e e-mail dos condomínios ativos.',
    padrao: { niveis: ['diretor', 'gerente', 'coordenador', 'supervisor'], setores: ['Marketing'] } },
  { chave: 'credito.diretoria', grupo: 'Análise de Crédito', rotulo: 'Chancela de crédito (diretoria)',
    descricao: 'Chancela as análises com inadimplência entre 35% e 40% ou sem o custo atual do boleto (só vão ao executivo depois dela). Vê todas as análises, contratos e implantações.',
    padrao: { niveis: [], setores: [] } },
  { chave: 'contratos.diretoria', grupo: 'Solicitação de Contrato', rotulo: 'Chancela comercial (diretoria)',
    descricao: 'Decide os itens comerciais reservados à diretoria nos contratos (taxa administrativa abaixo de 2%, boleto abaixo de R$ 1,50, cobertura de taxa extra acima de 60%, cláusulas fora do padrão, taxa e boleto do condomínio de entrega) e o percentual fora do padrão nas parcerias. Enquanto ninguém for marcado, quem tem a chancela de crédito decide.',
    padrao: { niveis: [], setores: [] } },
  { chave: 'comercial.gestao', grupo: 'Comercial', rotulo: 'Gestão do Comercial',
    descricao: 'Acompanha o funil de todos os executivos: vê (só consulta) todas as análises de crédito, solicitações de contrato e implantações, com os painéis.',
    padrao: { niveis: ['diretor', 'gerente'], setores: ['Comercial'] }, distribui: ['diretor', 'gerente'] },
  { chave: 'contratos.elaborar', grupo: 'Solicitação de Contrato', rotulo: 'Elaborar as minutas de contrato (Jurídico)',
    descricao: 'Recebe as solicitações de contrato do comercial, assume, redige a minuta em até 72h úteis, responde aos ajustes e registra as condições fechadas.',
    padrao: { niveis: [], setores: [] } },
];
const porChave = new Map(PERMISSOES.map((p) => [p.chave, p]));
const GESTORES = ['diretor', 'gerente', 'coordenador', 'supervisor'];

function criarRegras(db) {
  const nomesDeSetores = async () => new Map((await db.q('SELECT id, nome FROM setores')).rows.map((s) => [s.nome, s.id]));

  /* regra em vigor de cada permissão (a gravada pela administração ou o padrão) */
  async function regras() {
    const gravadas = new Map((await db.q('SELECT chave, regra FROM regras_acesso')).rows.map((r) => [r.chave, r.regra]));
    const setores = await nomesDeSetores();
    const saida = new Map();
    for (const p of PERMISSOES) {
      const g = gravadas.get(p.chave);
      saida.set(p.chave, g ? { niveis: g.niveis || [], setores: g.setores || [], pessoas: g.pessoas || [], personalizada: true }
        : { niveis: p.padrao.niveis, setores: p.padrao.setores.map((n) => setores.get(n)).filter(Boolean), pessoas: [], personalizada: false });
    }
    return saida;
  }

  const setoresDe = async (uid) => (await db.q('SELECT setor_id FROM setor_membros WHERE usuario_id = $1', [uid])).rows.map((x) => x.setor_id);

  /* por que a pessoa tem a permissão (texto) ou null se não tem */
  function motivo(u, regra, meusSetores, nomeSetor) {
    if (u.papel === 'admin') return 'administração';
    if (regra.pessoas.includes(u.id)) return 'liberado para você';
    if (!regra.niveis.includes(u.papel)) return null;
    if (!regra.setores.length) return NIVEIS[u.papel];
    const comuns = regra.setores.filter((s) => meusSetores.includes(s));
    return comuns.length ? `${NIVEIS[u.papel]} · ${comuns.map(nomeSetor).join(', ')}` : null;
  }

  /* permissões da pessoa: Map chave → motivo */
  async function permissoesDe(u) {
    const r = await regras();
    const meus = u.papel === 'admin' ? [] : await setoresDe(u.id);
    const nomes = new Map((await db.q('SELECT id, nome FROM setores')).rows.map((s) => [s.id, s.nome]));
    const saida = new Map();
    for (const p of PERMISSOES) {
      const m = motivo(u, r.get(p.chave), meus, (id) => nomes.get(id) || '?');
      if (m) saida.set(p.chave, m);
    }
    return saida;
  }

  const pode = async (u, chave) => !!u && (u.papel === 'admin' || (await permissoesDe(u)).has(chave));

  /* quem tem cada permissão hoje (pessoas ativas, sem a administração) */
  async function quemPode() {
    const r = await regras();
    const { rows } = await db.q(`SELECT u.id, u.nome, u.papel, COALESCE(array_agg(sm.setor_id) FILTER (WHERE sm.setor_id IS NOT NULL), '{}') AS setores
      FROM usuarios u LEFT JOIN setor_membros sm ON sm.usuario_id = u.id WHERE u.ativo AND u.papel <> 'admin' GROUP BY u.id ORDER BY u.nome`);
    const nomes = new Map((await db.q('SELECT id, nome FROM setores')).rows.map((s) => [s.id, s.nome]));
    const saida = new Map();
    for (const p of PERMISSOES) {
      saida.set(p.chave, rows.map((u) => ({ id: u.id, nome: u.nome, motivo: motivo(u, r.get(p.chave), u.setores, (id) => nomes.get(id) || '?') }))
        .filter((x) => x.motivo).map((x) => ({ nome: x.nome, motivo: x.motivo === 'liberado para você' ? 'liberado individualmente' : x.motivo })));
    }
    return saida;
  }

  /* quem tem a permissão hoje, com o motivo (pessoas ativas, sem a administração): [{ id, motivo }] */
  async function quemPodeIds(chave) {
    const r = (await regras()).get(chave);
    const { rows } = await db.q(`SELECT u.id, u.papel, COALESCE(array_agg(sm.setor_id) FILTER (WHERE sm.setor_id IS NOT NULL), '{}') AS setores
      FROM usuarios u LEFT JOIN setor_membros sm ON sm.usuario_id = u.id WHERE u.ativo AND u.papel <> 'admin' GROUP BY u.id ORDER BY u.nome`);
    const nomes = new Map((await db.q('SELECT id, nome FROM setores')).rows.map((s) => [s.id, s.nome]));
    return rows.map((u) => ({ id: u.id, motivo: motivo(u, r, u.setores, (id) => nomes.get(id) || '?') })).filter((x) => x.motivo)
      .map((x) => ({ id: x.id, motivo: x.motivo === 'liberado para você' ? 'liberado individualmente' : x.motivo }));
  }

  /* ids de quem tem a permissão hoje (pessoas ativas, sem a administração) */
  async function pessoasCom(chave) {
    const r = (await regras()).get(chave);
    const { rows } = await db.q(`SELECT u.id, u.papel, COALESCE(array_agg(sm.setor_id) FILTER (WHERE sm.setor_id IS NOT NULL), '{}') AS setores
      FROM usuarios u LEFT JOIN setor_membros sm ON sm.usuario_id = u.id WHERE u.ativo AND u.papel <> 'admin' GROUP BY u.id ORDER BY u.nome`);
    return rows.filter((u) => motivo(u, r, u.setores, () => '')).map((u) => u.id);
  }

  async function salvar(chave, regra, autor) {
    const ativos = new Set((await db.q('SELECT id FROM usuarios WHERE ativo')).rows.map((x) => x.id));
    const setores = new Set((await db.q('SELECT id FROM setores')).rows.map((x) => x.id));
    const limpa = {
      niveis: [...new Set((regra.niveis || []).map(String))].filter((n) => NIVEIS[n]),
      setores: [...new Set((regra.setores || []).map(Number))].filter((s) => setores.has(s)),
      pessoas: [...new Set((regra.pessoas || []).map(Number))].filter((x) => ativos.has(x)),
    };
    await db.q(`INSERT INTO regras_acesso (chave, regra, atualizado_por) VALUES ($1, $2::jsonb, $3)
      ON CONFLICT (chave) DO UPDATE SET regra = excluded.regra, atualizado_em = now(), atualizado_por = excluded.atualizado_por`, [chave, JSON.stringify(limpa), autor.id]);
    return limpa;
  }

  const voltarAoPadrao = (chave) => db.q('DELETE FROM regras_acesso WHERE chave = $1', [chave]);

  /* Chancelas por assunto: a de crédito (credito.diretoria) e a comercial (contratos.diretoria). Enquanto ninguém tiver a
     comercial, quem tem a de crédito decide os itens comerciais (nada fica parado esperando). */
  async function chancelaComercialVazia() { return !(await pessoasCom('contratos.diretoria')).length; }
  async function podeChancelaComercial(u) {
    if (!u) return false;
    if (u.papel === 'admin' || (await pode(u, 'contratos.diretoria'))) return true;
    return (await chancelaComercialVazia()) && pode(u, 'credito.diretoria');
  }
  /* quem é avisado da chancela comercial (sem ninguém, os da chancela de crédito; o chamador cai na administração) */
  async function pessoasDaChancelaComercial() {
    const ids = await pessoasCom('contratos.diretoria');
    return ids.length ? ids : pessoasCom('credito.diretoria');
  }
  /* diretoria para ver (painéis, listas completas): qualquer uma das duas chancelas */
  async function ehDiretoria(u) { return !!u && (u.papel === 'admin' || (await pode(u, 'credito.diretoria')) || (await pode(u, 'contratos.diretoria'))); }

  /* permissões que a pessoa configura: a administração, todas; coordenação e supervisão, as que pertencem a um
     setor delas (ex.: Crédito → Assistente de crédito), liberando ou tirando pessoas. */
  async function gerenciaveis(u) {
    if (u.papel === 'admin') return new Set(PERMISSOES.map((p) => p.chave));
    if (!GESTORES.includes(u.papel)) return new Set();
    const meus = await setoresDe(u.id);
    const r = await regras();
    // distribui: perfis do setor que liberam pessoas nesta permissão (ex.: Gestão do Comercial, só a gerência); sem ele, toda a gestão do setor
    return new Set(PERMISSOES.filter((p) => (!p.distribui || p.distribui.includes(u.papel)) && r.get(p.chave).setores.some((x) => meus.includes(x))).map((p) => p.chave));
  }

  return { PERMISSOES, NIVEIS, porChave, regras, permissoesDe, pode, quemPode, quemPodeIds, pessoasCom, salvar, voltarAoPadrao, gerenciaveis,
    podeChancelaComercial, pessoasDaChancelaComercial, ehDiretoria };
}

module.exports = { criarRegras, PERMISSOES, NIVEIS };
