'use strict';
/*
 * Base de Clientes ← Controle de Síndicos.
 * O Controle de Síndicos (ferramenta do CS, slug "sindicos") guarda os contatos na coleção "contatos":
 * { cond: "Nome do condomínio - UF", sind, tel, email, ativo, ... }, uma linha por pessoa.
 * Aqui os contatos ativos são ligados ao condomínio da Base de Clientes pelo nome e pela UF (mesma regra das
 * ferramentas que guardam só o nome) e viram o síndico, o telefone e o e-mail da ficha do condomínio.
 * Valor vazio no Controle de Síndicos nunca apaga o que já está na Base de Clientes.
 */
const { CAMPOS, acharCondominio } = require('./carteira');

const MODULO = 'sindicos';
const COLECAO = 'contatos';
const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
// campo da Base de Clientes ← campo do contato
const MAPA = [['sindico_nome', 'sind'], ['sindico_telefone', 'tel'], ['sindico_email', 'email']];
const MAX = Object.fromEntries(CAMPOS.filter((c) => MAPA.some(([k]) => k === c.campo)).map((c) => [c.campo, c.max]));

const limpar = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/* "Alpes Residence - CE" → { nome: "Alpes Residence", uf: "CE" }; sem UF no fim → uf "" */
function separarUf(cond) {
  const s = limpar(cond);
  const m = s.match(/^(.*?)\s*-\s*([A-Za-z]{2})$/);
  return m && UFS.has(m[2].toUpperCase()) ? { nome: m[1], uf: m[2].toUpperCase() } : { nome: s, uf: '' };
}

/* valores diferentes (sem repetir) separados por " / ", sem passar do tamanho do campo */
function juntar(valores, max) {
  const vistos = new Set();
  let out = '';
  for (const v of valores.map(limpar).filter(Boolean)) {
    const k = v.toLowerCase();
    if (vistos.has(k)) continue;
    vistos.add(k);
    const novo = out ? `${out} / ${v}` : v;
    if (novo.length > max) continue;
    out = novo;
  }
  return out;
}

/* Acha o condomínio do contato: pelo nome na UF; sem achar, pelo nome em qualquer UF (só se o achado não tiver outra UF). */
function condominioDo(lista, cond) {
  const { nome, uf } = separarUf(cond);
  let c = acharCondominio(lista, nome, uf);
  if (!c && uf) {
    c = acharCondominio(lista, nome, '');
    if (c && limpar(c.comarca) && limpar(c.comarca).toUpperCase() !== uf) c = null;
  }
  return c;
}

/* contatos (Controle de Síndicos) × condomínios (Base de Clientes) → o que muda em cada condomínio */
function planejar(contatos, condominios) {
  const ativos = contatos.filter((r) => r && r.ativo !== false && limpar(r.cond) && (limpar(r.sind) || limpar(r.tel) || limpar(r.email)));
  const porCond = new Map();
  const naoAchados = new Map();
  for (const r of ativos) {
    const c = condominioDo(condominios, r.cond);
    if (!c) { naoAchados.set(limpar(r.cond), (naoAchados.get(limpar(r.cond)) || []).concat(limpar(r.sind))); continue; }
    if (!porCond.has(c.id)) porCond.set(c.id, { c, rows: [] });
    porCond.get(c.id).rows.push(r);
  }
  const mudancas = [];
  let iguais = 0;
  for (const { c, rows } of porCond.values()) {
    const campos = {};
    for (const [campo, origem] of MAPA) {
      const v = juntar(rows.map((r) => r[origem]), MAX[campo]);
      const atual = limpar(c[campo]);
      if (v && v !== atual) campos[campo] = [atual, v];
    }
    if (!Object.keys(campos).length) { iguais++; continue; }
    const tipo = Object.values(campos).every(([de]) => !de) ? 'preencher' : 'atualizar';
    mudancas.push({ id: c.id, codigo: c.codigo, nome: c.nome, comarca: c.comarca, situacao: c.situacao, tipo, campos });
  }
  mudancas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const comContato = new Set(porCond.keys());
  return {
    contatos: ativos.length,
    ligados: porCond.size,
    iguais,
    mudancas,
    nao_achados: [...naoAchados.entries()].map(([cond, sinds]) => ({ cond, sindicos: sinds.filter(Boolean) }))
      .sort((a, b) => a.cond.localeCompare(b.cond, 'pt-BR')),
    sem_contato: condominios.filter((c) => c.situacao === 'ATIVO' && !comContato.has(c.id) && !limpar(c.sindico_nome)).length,
  };
}

module.exports = { MODULO, COLECAO, planejar, separarUf, juntar };
