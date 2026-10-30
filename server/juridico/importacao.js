'use strict';
/*
 * Importação da planilha "Acompanhamento — Atividades Jurídicas" para as Demandas Jurídicas (só leitura e conferência;
 * quem grava é server/rotas/juridico.js). A planilha tem, na mesma aba:
 *  - o Registro de Demandas: #, Atividade, Solicitante, Cliente, Setor, Estado, Objeto da demanda, Data da Solicitação,
 *    Prazo de Entrega, Data da Entrega, Status, Observações (o SLA é calculado, não é lido);
 *  - a Tabela de Prazos ao lado: Tipo de Atividade e Prazo (h úteis).
 * O portal acha a linha de títulos sozinho. O prazo de cada demanda é o que a planilha calculou (a coluna Prazo de
 * Entrega); sem ele, é a data da solicitação mais os dias úteis do tipo (horas ÷ 8, arredondado para cima).
 *
 * Os arquivos e os dados ficam no portal: nada daqui vai para o repositório (os testes usam dados fictícios).
 */

const sem = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const texto = (s, max = 500) => String(s == null ? '' : s).replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max);
const pad = (n) => String(n).padStart(2, '0');

const STATUS = ['pendente', 'em_andamento', 'aguardando_retorno', 'aguardando_assinaturas', 'concluido', 'contrato_perdido'];
const STATUS_PLANILHA = {
  pendente: 'pendente', 'em andamento': 'em_andamento', 'aguardando retorno': 'aguardando_retorno',
  'aguardando assinaturas': 'aguardando_assinaturas', 'aguardando assinatura': 'aguardando_assinaturas',
  concluido: 'concluido', concluida: 'concluido', 'contrato perdido': 'contrato_perdido',
};

/* dd/mm/aaaa, aaaa-mm-dd ou número de série do Excel (dias desde 30/12/1899) → AAAA-MM-DD ('' se não for data) */
function dia(v) {
  const s = texto(v, 40);
  if (!s) return '';
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  if (m) return valida(`${m[3].length === 2 ? 2000 + Number(m[3]) : m[3]}-${pad(m[2])}-${pad(m[1])}`);
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return valida(`${m[1]}-${m[2]}-${m[3]}`);
  m = /^(\d{5})(?:\.\d+)?$/.exec(s);
  if (m && Number(m[1]) > 20000 && Number(m[1]) < 80000) return new Date(Date.UTC(1899, 11, 30) + Number(m[1]) * 86400000).toISOString().slice(0, 10);
  return '';
}
function valida(d) {
  const [a, m, dd] = d.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, dd));
  return a > 2000 && a < 2100 && t.getUTCMonth() === m - 1 && t.getUTCDate() === dd ? d : '';
}

/* AAAA-MM-DD + n dias úteis (como o DIATRABALHO do Excel: o próprio dia não conta) */
function somarDiasUteis(inicio, n, ehDiaUtil) {
  const [a, m, d] = inicio.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  for (let i = 0, k = 0; k < n && i < 4000; i++) {
    t.setUTCDate(t.getUTCDate() + 1);
    if (ehDiaUtil(t.toISOString().slice(0, 10))) k++;
  }
  return t.toISOString().slice(0, 10);
}
const diasDoPrazo = (horas) => Math.max(1, Math.ceil(Number(horas) / 8));
const diaSemana = (s) => { const d = new Date(`${s}T12:00:00Z`).getUTCDay(); return d > 0 && d < 6; };

/* nome de condomínio sem as palavras que todo nome tem (para achar o mesmo cliente escrito de outro jeito) */
const PALAVRAS = new Set(['condominio', 'cond', 'residencial', 'res', 'edificio', 'ed', 'conjunto', 'do', 'da', 'de', 'dos', 'das', 'e', 'o', 'a']);
const essencia = (s) => sem(s).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((p) => p && !PALAVRAS.has(p)).join(' ');
function mesmoCliente(a, b) {
  const x = essencia(a), y = essencia(b);
  if (x.length < 4 || y.length < 4) return false;
  return x === y || ` ${y} `.includes(` ${x} `) || ` ${x} `.includes(` ${y} `);
}
const distanciaDias = (a, b) => Math.abs(new Date(`${a}T12:00:00Z`) - new Date(`${b}T12:00:00Z`)) / 86400000;

/* pessoa do portal pelo nome: igual (sem acento), ou o primeiro e o último nome iguais e só um candidato */
function acharPessoa(nome, usuarios) {
  const n = sem(nome);
  if (!n) return null;
  const igual = usuarios.find((u) => sem(u.nome) === n);
  if (igual) return igual;
  const p = n.split(' ');
  if (p.length < 2) {
    const so = usuarios.filter((u) => sem(u.nome).split(' ')[0] === n);
    return so.length === 1 ? so[0] : null;
  }
  const pontas = usuarios.filter((u) => { const q = sem(u.nome).split(' '); return q[0] === p[0] && q[q.length - 1] === p[p.length - 1]; });
  return pontas.length === 1 ? pontas[0] : null;
}

/* linha de títulos: a que tem Atividade, Solicitante e Status; devolve as colunas de cada título */
const TITULOS = {
  numero: ['#', 'n', 'no', 'numero'], atividade: ['atividade'], solicitante: ['solicitante'], cliente: ['cliente'], setor: ['setor'], estado: ['estado', 'uf'],
  objeto: ['objeto da demanda', 'objeto'], solicitada: ['data da solicitacao'], prazo: ['prazo de entrega'], entrega: ['data da entrega'], status: ['status'],
  observacoes: ['observacoes', 'observacao'], tipo: ['tipo de atividade'], horas: ['prazo (h uteis)', 'prazo (horas uteis)', 'prazo (h)'],
};
function acharTitulos(linhas) {
  for (let r = 0; r < Math.min(linhas.length, 40); r++) {
    const l = (linhas[r] || []).map(sem);
    if (!l.includes('atividade') || !l.includes('solicitante') || !l.includes('status')) continue;
    const col = {};
    for (const [k, nomes] of Object.entries(TITULOS)) {
      const i = l.findIndex((c) => nomes.includes(c));
      if (i >= 0) col[k] = i;
    }
    return { linha: r, col };
  }
  return null;
}

/*
 * linhas: a primeira aba da planilha (server/planilha.js);
 * portal: { usuarios: [{id, nome}], tipos: [{id, nome, horas}], contratos: [{id, protocolo, condominio, dia}],
 *           demandas: [{id, numero, tipo, cliente, solicitada_em}], ehDiaUtil(dia) }
 * Cada item: situacao 'pronta' | 'aviso' (entra, com observação) | 'duplicada' (fica de fora, a menos que seja marcada) | 'erro'.
 */
function conferir(linhas, portal) {
  const t = acharTitulos(linhas);
  if (!t) throw new Error('Não achei a linha de títulos (Atividade, Solicitante, Status). Envie a planilha "Acompanhamento — Atividades Jurídicas".');
  const { col } = t;
  for (const k of ['atividade', 'solicitante', 'solicitada', 'status']) {
    if (col[k] === undefined) throw new Error(`A planilha não tem a coluna ${{ atividade: 'Atividade', solicitante: 'Solicitante', solicitada: 'Data da Solicitação', status: 'Status' }[k]}.`);
  }
  const cel = (l, k) => (col[k] === undefined ? '' : texto((l || [])[col[k]]));
  const ehDiaUtil = portal.ehDiaUtil || diaSemana;

  // Tabela de Prazos (ao lado, nas linhas de baixo dos títulos): até a primeira linha sem tipo
  const tipos = [];
  if (col.tipo !== undefined && col.horas !== undefined) {
    for (let r = t.linha + 1; r < linhas.length; r++) {
      const nome = cel(linhas[r], 'tipo');
      const horas = Number(String(cel(linhas[r], 'horas')).replace(',', '.'));
      if (!nome || !(horas > 0)) break;
      if (!tipos.some((x) => sem(x.nome) === sem(nome))) tipos.push({ nome: texto(nome, 80), horas: Math.round(horas) });
    }
  }
  // o tipo que já está no portal vale como está (o prazo de lá é o que vale agora); os novos vêm da Tabela de Prazos
  const tipoPorNome = new Map();
  for (const x of tipos) tipoPorNome.set(sem(x.nome), { nome: x.nome, horas: x.horas, novo: true });
  for (const x of portal.tipos || []) tipoPorNome.set(sem(x.nome), { nome: x.nome, horas: x.horas, id: x.id });
  for (const x of tipos) x.novo = !!tipoPorNome.get(sem(x.nome)).novo;

  const itens = [];
  for (let r = t.linha + 1; r < linhas.length; r++) {
    const l = linhas[r];
    const atividade = cel(l, 'atividade');
    const resto = ['solicitante', 'cliente', 'objeto', 'solicitada', 'status'].some((k) => cel(l, k));
    if (!atividade && !resto) continue;
    const it = {
      linha: r + 1, numero: Number(cel(l, 'numero')) || null, tipo: atividade, solicitante_nome: texto(cel(l, 'solicitante'), 120), solicitante_id: null,
      setor: texto(cel(l, 'setor'), 80), uf: texto(cel(l, 'estado'), 10).toUpperCase(), cliente: texto(cel(l, 'cliente'), 200),
      objeto: texto(cel(l, 'objeto'), 2000), observacoes: texto(cel(l, 'observacoes'), 2000),
      solicitada_em: dia(cel(l, 'solicitada')), prazo: dia(cel(l, 'prazo')), entregue_em: dia(cel(l, 'entrega')), status: '', horas: null,
      situacao: 'pronta', avisos: [], motivo: '',
    };
    itens.push(it);
    const tp = tipoPorNome.get(sem(atividade));
    if (!atividade) { it.situacao = 'erro'; it.motivo = 'sem a atividade'; continue; }
    if (!tp) { it.situacao = 'erro'; it.motivo = `a atividade "${atividade}" não está na Tabela de Prazos`; continue; }
    it.tipo = tp.nome;
    it.horas = tp.horas;
    if (!it.solicitada_em) { it.situacao = 'erro'; it.motivo = 'sem a data da solicitação'; continue; }
    if (!it.prazo) { it.prazo = somarDiasUteis(it.solicitada_em, diasDoPrazo(tp.horas), ehDiaUtil); it.avisos.push('prazo calculado pelo portal'); }
    if (it.entregue_em && it.entregue_em < it.solicitada_em) it.avisos.push('entrega antes da solicitação');

    const st = sem(cel(l, 'status'));
    if (STATUS_PLANILHA[st]) it.status = STATUS_PLANILHA[st];
    else if (st === 'atrasado') { it.status = it.entregue_em ? 'aguardando_retorno' : 'em_andamento'; it.avisos.push('"Atrasado" agora é automático: entrou como ' + (it.entregue_em ? 'Aguardando retorno' : 'Em andamento')); }
    else { it.status = it.entregue_em ? 'concluido' : 'pendente'; it.avisos.push(st ? `status "${cel(l, 'status')}" desconhecido` : 'sem status'); }

    const p = acharPessoa(it.solicitante_nome, portal.usuarios || []);
    if (p) { it.solicitante_id = p.id; it.solicitante_nome = p.nome; } else if (it.solicitante_nome) it.avisos.push('solicitante sem cadastro no portal (fica o nome)');
    else it.avisos.push('sem solicitante');

    // a mesma demanda já no portal: pedido pela Solicitação de Contrato, ou lançada à mão
    const ct = /garantia/.test(sem(it.tipo)) && (portal.contratos || []).find((c) => mesmoCliente(c.condominio, it.cliente) && distanciaDias(c.dia, it.solicitada_em) <= 15);
    const dm = (portal.demandas || []).find((d) => sem(d.tipo) === sem(it.tipo) && sem(d.cliente) === sem(it.cliente) && d.solicitada_em === it.solicitada_em);
    if (ct) { it.situacao = 'duplicada'; it.motivo = `já está na Solicitação de Contrato (${ct.protocolo} · ${ct.condominio})`; continue; }
    if (dm) { it.situacao = 'duplicada'; it.motivo = `já lançada no portal (#${dm.numero})`; continue; }
    if (it.avisos.length) it.situacao = 'aviso';
  }
  const conta = (s) => itens.filter((x) => x.situacao === s).length;
  return { tipos, itens, resumo: { total: itens.length, prontas: conta('pronta'), avisos: conta('aviso'), duplicadas: conta('duplicada'), erros: conta('erro'), tipos: tipos.length } };
}

module.exports = { conferir, dia, somarDiasUteis, diasDoPrazo, acharPessoa, mesmoCliente, STATUS };
