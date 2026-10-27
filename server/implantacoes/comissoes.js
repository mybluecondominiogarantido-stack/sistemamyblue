'use strict';
/*
 * Parceria da implantação → Comissões de Novos Condomínios.
 * Quando a coordenação confirma o condomínio na Carteira, o portal grava o condomínio no armazenamento da ferramenta
 * (chave cnp:c:<vigência>-v<ID Vouch>, a mesma que o "Puxar da carteira" da ferramenta usa), já com a resposta que o
 * executivo deu no formulário e a situação "em_aprovacao". A gestão aprova ou devolve e o Financeiro cadastra na
 * Prestação de Contas pela própria ferramenta, como antes. Funções puras: a rota lê e grava o banco.
 */

const MODELO = 'comissoes-novos-condominios'; // id do modelo reconhecido em server/acessos.js
const PFX_CONDO = 'cnp:c:';
const PFX_PERFIL = 'cnp:p:';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const texto = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
// o mesmo slug da ferramenta (minúsculas, sem acento, só letras e números)
const slug = (s) => texto(s, 400).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const idDoCondo = (ref, codigo) => `${ref}-v${slug(codigo)}`;
const refNome = (ref) => (/^\d{4}-\d{2}$/.test(ref) ? `${MESES[Number(ref.slice(5)) - 1]}/${ref.slice(0, 4)}` : ref);
const dataBr = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(String(iso || '')) ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');

/* a resposta do executivo no formato da ferramenta; tipo = a comissão está completa (senão o executivo termina lá) */
function resposta(f, autor) {
  const base = { temParceiro: '', parceiroId: '', parceiroNome: '', recorrencia: false, compartilhado: false, parceiro2Id: '', parceiro2Nome: '', venda: false, obs: '' };
  const r = { ...base, por: autor.nome, porId: autor.id ? String(autor.id) : '', em: autor.em };
  if (f.parceria === 'nao') return { r: { ...r, temParceiro: 'nao' }, completa: true };
  const ps = (f.parceiros || []).filter((p) => p && texto(p.nome)).slice(0, 2);
  if (f.parceria !== 'sim' || !ps.length) return { r: null, completa: false };
  r.temParceiro = 'sim';
  r.parceiroId = texto(ps[0].id, 120);
  r.parceiroNome = texto(ps[0].nome);
  r.recorrencia = !!f.comissao_recorrencia;
  r.venda = !!f.comissao_venda;
  if (r.recorrencia && ps[1]) {
    r.compartilhado = true;
    r.parceiro2Id = texto(ps[1].id, 120);
    r.parceiro2Nome = texto(ps[1].nome);
  }
  return { r, completa: r.recorrencia || r.venda };
}

function regrasTexto(r) {
  if (!r) return 'sem resposta';
  if (r.temParceiro === 'nao') return 'Sem parceiro';
  const out = [];
  if (r.recorrencia) out.push(r.compartilhado ? `Recorrência 5% (${r.parceiroNome}) + 5% (${r.parceiro2Nome})` : `Recorrência 10% (${r.parceiroNome})`);
  if (r.venda) out.push(`Venda 50% da 1ª Tx Adm (${r.parceiroNome})`);
  return out.join(' · ') || `Parceiro ${r.parceiroNome}, tipo de comissão a informar`;
}

/*
 * O registro do condomínio na ferramenta. `carteira`: a linha gravada na Carteira (codigo, nome, comarca, vencimento,
 * administradora, executivo, inicio_contrato, id). `atual`: o que já está na ferramenta com a mesma chave, se houver.
 * Devolve { id, ref, registro } ou { id, ref, registro: null, motivo } quando não há o que gravar.
 */
function montar({ i, f, carteira, autor, primeiroVencimento, agora }) {
  const ref = texto(carteira.inicio_contrato, 10).slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ref) || !slug(carteira.codigo)) return { id: null, ref, registro: null, motivo: 'sem_vigencia' };
  const id = idDoCondo(ref, carteira.codigo);
  const dados = { carteiraId: carteira.id, codigo: texto(carteira.codigo, 40), nome: texto(carteira.nome), uf: texto(carteira.comarca, 2), diaVenc: texto(carteira.vencimento, 4),
    adm: texto(carteira.administradora, 120), executivo: texto(carteira.executivo, 120), primeiroVenc: dataBr(primeiroVencimento) };
  const { r, completa } = resposta(f, { ...autor, em: autor.em || agora });
  const origem = { id: i.id, protocolo: i.protocolo || '' };
  const det = `${i.protocolo || 'implantação'} — ${regrasTexto(r)}`;
  return {
    id, ref,
    registro: {
      id, ref, ...dados, status: completa ? 'em_aprovacao' : 'aguardando', resposta: r, aprovacao: null, financeiro: null, implantacao: origem,
      criadoEm: agora, criadoPor: 'Portal (implantação)', atualizadoEm: agora,
      historico: [{ em: agora, por: 'Portal', acao: completa ? 'informado na implantação' : 'veio da implantação sem o tipo de comissão: falta o executivo responder', det }],
    },
  };
}

/*
 * Junta com o que já está na ferramenta (a gestão pode ter puxado a vigência antes): sem resposta ainda, entra a da
 * implantação; já respondido ou tratado, não muda nada (só registra no histórico de onde veio).
 */
function juntar(atual, novo, agora) {
  if (!atual) return { registro: novo, situacao: 'criado' };
  if (atual.status === 'aguardando' && !atual.resposta) {
    return { registro: { ...atual, status: novo.status, resposta: novo.resposta, implantacao: novo.implantacao, primeiroVenc: atual.primeiroVenc || novo.primeiroVenc,
      atualizadoEm: agora, historico: (atual.historico || []).concat(novo.historico).slice(-40) }, situacao: 'respondido' };
  }
  return { registro: null, situacao: 'ja_estava' };
}

/* quem tem o papel Gestão na ferramenta (chaves cnp:p:<id do usuário>) */
function gestoresDaFerramenta(linhas) {
  const ids = [];
  for (const l of linhas) {
    try {
      const p = JSON.parse(l.valor);
      if (p && (p.papeis || []).includes('gestor') && /^\d+$/.test(l.chave.slice(PFX_PERFIL.length))) ids.push(Number(l.chave.slice(PFX_PERFIL.length)));
    } catch { /* registro malformado: ignora */ }
  }
  return ids;
}

module.exports = { MODELO, PFX_CONDO, PFX_PERFIL, slug, idDoCondo, refNome, resposta, regrasTexto, montar, juntar, gestoresDaFerramenta };
