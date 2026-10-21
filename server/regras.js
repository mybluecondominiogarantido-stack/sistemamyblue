'use strict';
/*
 * Quem pode o quê no portal (fora das ferramentas, que têm a janela "Quem abre e com qual papel"):
 * cada permissão tem uma regra { niveis, setores, pessoas } definida pela administração em
 * Módulos e dados → Carteira: quem edita (a coordenação/supervisão libera pessoas nas permissões do setor dela, em
 * Ferramentas do setor → Carteira de condomínios: quem edita). A administração pode tudo, sempre.
 *
 *  - niveis: perfis que recebem a permissão ('coordenador', 'supervisor', 'usuario');
 *  - setores: se tiver algum, o perfil só vale para quem é desses setores (vazio = qualquer setor);
 *  - pessoas: liberadas uma a uma, qualquer perfil.
 *
 * Enquanto a administração não mexe, vale o padrão de cada permissão (as regras que o portal já usava).
 */

const NIVEIS = { coordenador: 'Coordenação', supervisor: 'Supervisão', usuario: 'Usuário' };

const PERMISSOES = [
  { chave: 'carteira.dados', grupo: 'Carteira de condomínios', rotulo: 'Editar os dados do condomínio',
    descricao: 'Situação, UF, nome, vencimento, administradora, forma de envio, executivo, vigência, razão social, CNPJ e observações.',
    padrao: { niveis: [], setores: [] } },
  { chave: 'carteira.analista_cobranca', grupo: 'Carteira de condomínios', rotulo: 'Editar e transferir o Analista de cobrança',
    descricao: 'Quem cuida de cada condomínio na Cobrança (os tickets da Cobrança sobre o condomínio vão para essa pessoa).',
    padrao: { niveis: ['coordenador', 'supervisor'], setores: ['Cobrança'] } },
  { chave: 'carteira.analista_extrajudicial', grupo: 'Carteira de condomínios', rotulo: 'Editar e transferir o Analista extrajudicial (ApoioCob)',
    descricao: 'Quem cuida da cobrança extrajudicial de cada condomínio.',
    padrao: { niveis: [], setores: [] } },
  { chave: 'carteira.assistente_credito', grupo: 'Carteira de condomínios', rotulo: 'Editar e transferir o Assistente de crédito',
    descricao: 'Quem cuida de cada condomínio no Crédito (os tickets do Crédito sobre o condomínio vão para essa pessoa).',
    padrao: { niveis: ['coordenador', 'supervisor'], setores: ['Crédito'] } },
  { chave: 'carteira.adicionar', grupo: 'Carteira de condomínios', rotulo: 'Adicionar condomínios novos pela planilha de implantação',
    descricao: 'Aba "Adicionar novos": lê a planilha de implantação e cadastra os condomínios da vigência escolhida.',
    padrao: { niveis: ['coordenador', 'supervisor'], setores: [] } },
  { chave: 'carteira.cadastro', grupo: 'Carteira de condomínios', rotulo: 'Cadastrar e excluir condomínios, mudar o ID e importar a planilha',
    descricao: 'Botão "Novo condomínio", "Remover", o ID Vouch e a importação da planilha inteira.',
    padrao: { niveis: [], setores: [] } },
  { chave: 'credito.diretoria', grupo: 'Análise de Crédito', rotulo: 'Chancelar análises de crédito (diretoria)',
    descricao: 'Análises com inadimplência acima de 35% só vão ao executivo depois da chancela (CEO e Diretor Comercial).',
    padrao: { niveis: [], setores: [] } },
  { chave: 'contratos.elaborar', grupo: 'Solicitação de Contrato', rotulo: 'Elaborar as minutas de contrato (Jurídico)',
    descricao: 'Recebe as solicitações de contrato do comercial, assume, redige a minuta em até 72h úteis e responde aos ajustes.',
    padrao: { niveis: ['coordenador', 'supervisor', 'usuario'], setores: ['Jurídico'] } },
];
const porChave = new Map(PERMISSOES.map((p) => [p.chave, p]));

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

  /* permissões que a pessoa configura: a administração, todas; coordenação e supervisão, as que pertencem a um
     setor delas (ex.: Crédito → Assistente de crédito), liberando ou tirando pessoas. */
  async function gerenciaveis(u) {
    if (u.papel === 'admin') return new Set(PERMISSOES.map((p) => p.chave));
    if (!['coordenador', 'supervisor'].includes(u.papel)) return new Set();
    const meus = await setoresDe(u.id);
    const r = await regras();
    return new Set(PERMISSOES.filter((p) => r.get(p.chave).setores.some((x) => meus.includes(x))).map((p) => p.chave));
  }

  return { PERMISSOES, NIVEIS, porChave, regras, permissoesDe, pode, quemPode, pessoasCom, salvar, voltarAoPadrao, gerenciaveis };
}

module.exports = { criarRegras, PERMISSOES, NIVEIS };
