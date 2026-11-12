'use strict';
/*
 * Prestação de Contas — Comissão de Parceiros: o que já foi pago não muda.
 *
 * Marcado como pago (coleção "status", chave "<competência>_<parceiro>"), o relatório daquele parceiro naquela
 * competência fica travado no servidor:
 *  - lançamentos ("entries") dos condomínios dele na competência: não se altera valor nem venda, não se inclui condomínio
 *    novo e não se apaga (salvar de novo com os mesmos valores continua valendo: a ferramenta regrava o mês inteiro);
 *  - o controle de pagamento: não se desmarca o "pago" nem se troca o valor ou a data do pagamento, nem se apaga.
 * Condomínio com dois parceiros: basta um deles estar pago para o lançamento travar (mexer mudaria o relatório pago).
 *
 * Quem corrige: a administração e quem tem o papel "gestor" na ferramenta (Configurações → Acessos → Ferramentas).
 * O resto do trabalho (outras competências, cadastro de parceiros e condomínios, marcar enviado/pago) segue livre.
 */
const MODULO = 'parceiros';
const PAPEL_CORRIGE = 'gestor';
// campos do lançamento que entram no relatório (origem, pdf e afins não contam)
const CAMPOS_VALOR = ['ref', 'condoId', 'tsr', 'tarifa', 'multa', 'juros', 'encargos', 'correcao', 'qtdBoletos', 'valorBoleto', 'pctBoleto', 'venda'];

const refLabel = (ref) => { const m = /^(\d{4})-(\d{2})$/.exec(String(ref || '')); return m ? `${m[2]}/${m[1]}` : String(ref || ''); };
const dataBr = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const pago = (st) => !!st && (st.pago === true || String(st.pago).toLowerCase() === 'true');
/* "1.234,56", "1234.56", 1234.56 e "" (vazio = 0) comparados pelo número; o resto (venda, ids) pelo texto */
function igual(a, b) {
  const t = (v) => (v === true ? 'true' : v === false || v == null ? '' : String(v).trim());
  const n = (v) => { const s = t(v); if (s === '' || s === 'false') return 0; const x = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return Number.isFinite(x) ? x : null; };
  const na = n(a), nb = n(b);
  if (na != null && nb != null) return Math.abs(na - nb) < 0.005;
  return t(a) === t(b);
}
const mesmosValores = (a, b) => !!a && !!b && CAMPOS_VALOR.every((k) => igual(a[k], b[k]));
function vinculos(c) {
  let v = c && (c.vinculos || c.vinculosJSON);
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = []; } }
  return Array.isArray(v) ? v.filter((x) => x && x.partnerId) : [];
}

function criarParceirosPago({ registros, acessos }) {
  const acompanha = (m, colecao) => !!m && m.slug === MODULO && (colecao === 'entries' || colecao === 'status');

  async function podeCorrigir(req, m) {
    if (req.usuario && req.usuario.papel === 'admin') return true;
    const a = await acessos.acessoDe(req.usuario, m);
    return (a.papeis || []).includes(PAPEL_CORRIGE);
  }

  /* o status pago que trava este lançamento (null = livre) */
  async function pagoDoLancamento(e) {
    if (!e || !e.ref || !e.condoId) return null;
    const condo = await registros.obter(MODULO, 'condos', e.condoId);
    for (const v of vinculos(condo)) {
      const st = await registros.obter(MODULO, 'status', `${e.ref}_${v.partnerId}`);
      if (pago(st)) return { st, partnerId: v.partnerId };
    }
    return null;
  }
  async function nomeDo(partnerId) {
    const p = await registros.obter(MODULO, 'partners', partnerId);
    return (p && p.nome) || partnerId;
  }
  const quando = (st) => (dataBr(st.dataPagamento) ? ` em ${dataBr(st.dataPagamento)}` : '');
  const quem = 'Só a administração (ou quem tem o papel Gestor na ferramenta) corrige o que já foi pago.';

  /* Antes de gravar ("upsert") ou apagar ("delete"). atual: o registro como está; item: o que chega (null no delete).
     Devolve a mensagem de recusa, ou null para seguir. */
  async function conferir(req, m, colecao, acao, atual, item) {
    if (!acompanha(m, colecao)) return null;
    if (colecao === 'entries') {
      if (acao === 'upsert' && mesmosValores(atual, item)) return null; // regravou sem mudar valor
      // o lançamento como está e o que chega: qualquer um dos dois em competência paga trava
      const trava = (await pagoDoLancamento(atual)) || (acao === 'upsert' ? await pagoDoLancamento(item) : null);
      if (!trava || await podeCorrigir(req, m)) return null;
      const e = atual || item;
      return `A comissão de ${await nomeDo(trava.partnerId)} de ${refLabel(e.ref)} já foi paga${quando(trava.st)}: os valores desse relatório não podem mais ser alterados. ${quem}`;
    }
    // status: o pagamento marcado não se desfaz nem muda de valor
    if (!pago(atual)) return null;
    const mudou = acao === 'delete' || !pago(item) || !igual(atual.valorPago, item.valorPago) || String(atual.dataPagamento || '') !== String(item.dataPagamento || '');
    if (!mudou || await podeCorrigir(req, m)) return null;
    return `A comissão de ${await nomeDo(atual.partnerId)} de ${refLabel(atual.ref)} já está paga${quando(atual)}: o pagamento não pode ser desmarcado nem ter o valor ou a data alterados. ${quem}`;
  }

  return { acompanha, conferir, PAPEL_CORRIGE };
}

module.exports = { criarParceirosPago, mesmosValores, igual };
