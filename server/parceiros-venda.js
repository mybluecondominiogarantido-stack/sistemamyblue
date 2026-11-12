'use strict';
/*
 * Prestação de Contas — Comissão de Parceiros: gatilho da comissão de venda já paga.
 *
 * A comissão de venda (a indicação, ex.: 50% da 1ª taxa administrativa) é paga UMA vez por condomínio; só a
 * recorrência (10% ou 5%) se repete todo mês. Quando a ferramenta grava um lançamento (coleção "entries") com a
 * venda marcada e o mesmo condomínio já teve a venda lançada em outra competência, o portal avisa (sino e e-mail)
 * quem salvou e o setor Parceiros, dizendo em que competência a venda foi lançada e se já foi enviada e paga.
 *
 * "O mesmo condomínio" é o mesmo cadastro ou outro cadastro com o mesmo nome sem os termos genéricos
 * ("Condomínio Residencial Torre Paris" = "Torre Paris"): é assim que a venda escapa, recadastrando o condomínio.
 * Por isso, cadastrar um condomínio com o nome de um que já existe também avisa (possível duplicado).
 *
 * Parceiro só de venda (categoria "somentevenda"): a indicação é paga uma vez. Se o condomínio dele tem percentual no
 * vínculo, a ferramenta calcula esse percentual todo mês, como se fosse recorrência. O lançamento novo de um condomínio
 * assim avisa: com destaque se o condomínio já gerou comissão para ele numa competência anterior.
 *
 * Só avisa quando a venda passa a ficar marcada (ou o condomínio é novo); salvar de novo não repete o aviso.
 * Nada aqui derruba a gravação da ferramenta: um erro só vai para o log.
 */
const { chaveCondominio } = require('./carteira');

const MODULO = 'parceiros';
const SETOR = 'Parceiros';
const LINK = '#/m/parceiros';
// a mesma chave da Base de Clientes: sem acento, sem "Condomínio/Residencial/Edifício" no começo, II = 2
const chaveNome = (nome) => chaveCondominio(nome);
const vendaMarcada = (e) => !!e && (e.venda === true || e.venda === 1 || ['true', '1', 'sim'].includes(String(e.venda).toLowerCase()));
const refLabel = (ref) => { const m = /^(\d{4})-(\d{2})$/.exec(String(ref || '')); return m ? `${m[2]}/${m[1]}` : String(ref || ''); };
const dataBr = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
function vinculos(c) {
  let v = c && (c.vinculos || c.vinculosJSON);
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = []; } }
  return Array.isArray(v) ? v.filter((x) => x && x.partnerId) : [];
}

const valorLancado = (e) => !!e && ['tsr', 'tarifa', 'multa', 'juros', 'encargos'].some((k) => { const n = Number(String(e[k] == null ? '' : e[k]).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n > 0; });
/* parceiro "só venda" (categoria somentevenda): recebe a indicação uma vez só, nunca recorrência */
function soVenda(p) {
  let t = p && p.tags;
  if (typeof t === 'string') { try { t = JSON.parse(t); } catch { t = []; } }
  return Array.isArray(t) && t.includes('somentevenda');
}

/* a situação da venda já lançada: paga, enviada ou só lançada (pelo controle "status" da competência) */
function situacao(st) {
  if (st && st.pago) return `paga${dataBr(st.dataPagamento) ? ` em ${dataBr(st.dataPagamento)}` : ''}`;
  if (st && st.enviado) return `enviada ao parceiro${dataBr(st.dataEnvio) ? ` em ${dataBr(st.dataEnvio)}` : ''}, ainda não paga`;
  return 'lançada, ainda não enviada';
}

/* Funções puras (testadas sem banco).
 * vendasAnteriores: os outros lançamentos com venda do mesmo condomínio (mesmo cadastro ou mesmo nome), fora desta competência */
function vendasAnteriores({ entrada, condos, entries }) {
  const doCondo = condos.find((c) => c && c.id === entrada.condoId);
  const chave = doCondo ? chaveNome(doCondo.nome) : '';
  const mesmos = new Set([entrada.condoId, ...condos.filter((c) => c && chave && c.id !== entrada.condoId && chaveNome(c.nome) === chave).map((c) => c.id)]);
  return entries.filter((e) => e && e.id !== entrada.id && mesmos.has(e.condoId) && String(e.ref) !== String(entrada.ref) && vendaMarcada(e))
    .sort((a, b) => String(a.ref).localeCompare(String(b.ref)));
}
/* parceiro só de venda com percentual no condomínio: os lançamentos anteriores desse condomínio (mesmo cadastro ou mesmo nome)
   que já geraram comissão para ele. A ferramenta calcula o percentual do vínculo todo mês, então ele recebe de novo. */
function soVendaRepetida({ entrada, condos, entries, partners }) {
  const doCondo = condos.find((c) => c && c.id === entrada.condoId);
  if (!doCondo || !valorLancado(entrada)) return [];
  const chave = chaveNome(doCondo.nome);
  const mesmos = condos.filter((c) => c && (c.id === doCondo.id || (chave && chaveNome(c.nome) === chave)));
  return vinculos(doCondo).filter((v) => Number(v.rate) > 0 && soVenda(partners.find((p) => p && p.id === v.partnerId))).map((v) => {
    const ids = new Set(mesmos.filter((c) => vinculos(c).some((x) => x.partnerId === v.partnerId)).map((c) => c.id));
    const antes = entries.filter((e) => e && e.id !== entrada.id && ids.has(e.condoId) && String(e.ref) < String(entrada.ref) && valorLancado(e))
      .sort((a, b) => String(a.ref).localeCompare(String(b.ref)));
    return { partnerId: v.partnerId, rate: Number(v.rate), antes };
  });
}
/* duplicados: outros cadastros de condomínio com o mesmo nome */
function duplicados(condo, condos) {
  const chave = chaveNome(condo && condo.nome);
  return chave ? condos.filter((c) => c && c.id !== condo.id && chaveNome(c.nome) === chave) : [];
}

function criarParceirosVenda({ db, seg, registros, avisos }) {
  const acompanha = (m, colecao) => !!m && m.slug === MODULO && (colecao === 'entries' || colecao === 'condos');

  async function destinatarios(usuarioId) {
    const setor = (await db.q(`SELECT u.id FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id JOIN usuarios u ON u.id = sm.usuario_id
      WHERE s.nome = $1 AND u.ativo`, [SETOR])).rows.map((x) => x.id);
    const lista = setor.length ? setor : (await db.q("SELECT id FROM usuarios WHERE papel = 'admin' AND ativo")).rows.map((x) => x.id);
    return [...new Set([usuarioId, ...lista])];
  }
  const nomes = (lista, partners) => lista.map((v) => (partners.find((p) => p && p.id === v.partnerId) || {}).nome || v.partnerId);

  /* parceiro só de venda: avisa no primeiro lançamento de cada condomínio em cada competência (lançamento novo) */
  async function aoGravarSoVenda(req, antes, depois) {
    if (antes || !depois.condoId) return null;
    const [condos, entries, partners] = await Promise.all([registros.listar(MODULO, 'condos'), registros.listar(MODULO, 'entries'), registros.listar(MODULO, 'partners')]);
    const achados = soVendaRepetida({ entrada: depois, condos, entries, partners });
    if (!achados.length) return null;
    const condo = condos.find((c) => c && c.id === depois.condoId);
    const status = await registros.listar(MODULO, 'status');
    for (const a of achados) {
      const nome = (partners.find((p) => p && p.id === a.partnerId) || {}).nome || a.partnerId;
      const refs = [...new Set(a.antes.map((e) => e.ref))];
      const titulo = refs.length ? `Parceiro só de venda recebendo de novo: ${nome} · ${condo.nome}` : `Parceiro só de venda com comissão mensal: ${nome} · ${condo.nome}`;
      const fim = `Depois que a indicação for paga, zere o percentual de ${nome} neste condomínio (ou tire o condomínio da carteira dele) para a comissão não se repetir.`;
      const texto = refs.length
        ? `${nome} é parceiro só de venda (a indicação é paga uma vez), mas ${condo.nome} foi lançado em ${refLabel(depois.ref)} com ${String(a.rate).replace('.', ',')}% para ele, `
          + `e este condomínio já gerou comissão para ele em ${refs.map((r) => { const st = status.find((s) => s && s.ref === r && s.partnerId === a.partnerId); return `${refLabel(r)} (${situacao(st)})`; }).join(', ')}. `
          + `Não envie nem pague ${refLabel(depois.ref)} sem conferir. ${fim}`
        : `${nome} é parceiro só de venda (a indicação é paga uma vez), mas ${condo.nome} está com ${String(a.rate).replace('.', ',')}% para ele, e a ferramenta calcula esse `
          + `percentual todo mês. Se a indicação já foi paga (mesmo fora da ferramenta), não envie nem pague ${refLabel(depois.ref)}. ${fim}`;
      await avisos.notificar(await destinatarios(req.usuario.id), { link: LINK, tipo: 'aviso', email: true, titulo, texto });
      await auditar(req, 'parceiros_so_venda_repetida', { entrada: depois.id, condo: depois.condoId, ref: depois.ref, parceiro: a.partnerId, anteriores: refs });
    }
    return { achados };
  }

  async function aoGravarLancamento(req, antes, depois) {
    if (!depois || !depois.condoId) return null;
    await aoGravarSoVenda(req, antes, depois);
    if (!vendaMarcada(depois) || vendaMarcada(antes)) return null;
    const [condos, entries] = await Promise.all([registros.listar(MODULO, 'condos'), registros.listar(MODULO, 'entries')]);
    const anteriores = vendasAnteriores({ entrada: depois, condos, entries });
    if (!anteriores.length) return null;
    const [partners, status] = await Promise.all([registros.listar(MODULO, 'partners'), registros.listar(MODULO, 'status')]);
    const condoDe = (id) => condos.find((c) => c && c.id === id) || { id, nome: id };
    const condo = condoDe(depois.condoId);
    const parc = nomes(vinculos(condo), partners).join(' e ') || 'o parceiro';
    const linhas = anteriores.map((e) => {
      const c = condoDe(e.condoId);
      const sts = vinculos(c).map((v) => status.find((s) => s && s.ref === e.ref && s.partnerId === v.partnerId)).filter(Boolean);
      const st = sts.find((s) => s.pago) || sts.find((s) => s.enviado) || sts[0];
      const outro = c.id !== condo.id ? ` (cadastrado como "${c.nome}")` : '';
      return `competência ${refLabel(e.ref)}${outro}: ${situacao(st)}`;
    });
    const titulo = `Comissão de venda já lançada: ${condo.nome}`;
    const texto = `A venda de ${condo.nome} (${parc}) foi marcada na competência ${refLabel(depois.ref)}, mas este condomínio já teve a comissão de venda `
      + `lançada antes — ${linhas.join('; ')}. A venda é paga uma vez só; só a recorrência se repete. Desmarque a venda em ${refLabel(depois.ref)} `
      + `(e, se o condomínio foi cadastrado duas vezes, apague o cadastro repetido) antes de enviar ou pagar a prestação de contas.`;
    await avisos.notificar(await destinatarios(req.usuario.id), { link: LINK, tipo: 'aviso', email: true, titulo, texto });
    await auditar(req, 'parceiros_venda_repetida', { entrada: depois.id, condo: condo.id, ref: depois.ref, anteriores: anteriores.map((e) => ({ id: e.id, ref: e.ref, condo: e.condoId })) });
    return { anteriores };
  }

  async function aoGravarCondominio(req, antes, depois) {
    if (antes || !depois || !depois.id) return null; // só cadastro novo
    const condos = await registros.listar(MODULO, 'condos');
    const iguais = duplicados(depois, condos);
    if (!iguais.length) return null;
    const partners = await registros.listar(MODULO, 'partners');
    const lista = iguais.map((c) => `"${c.nome}"${vinculos(c).length ? ` (${nomes(vinculos(c), partners).join(' e ')})` : ''}`).join(', ');
    await avisos.notificar(await destinatarios(req.usuario.id), { link: LINK, tipo: 'aviso', email: true,
      titulo: `Condomínio possivelmente cadastrado duas vezes: ${depois.nome}`,
      texto: `"${depois.nome}" foi cadastrado na Prestação de Contas, mas já existe ${lista}. Com dois cadastros, o condomínio entra duas vezes no `
        + `lançamento e a comissão de venda pode ser paga de novo. Se for o mesmo condomínio, use o cadastro que já existe e apague o novo.` });
    await auditar(req, 'parceiros_condo_duplicado', { condo: depois.id, iguais: iguais.map((c) => c.id) });
    return { iguais };
  }

  const auditar = (req, acao, detalhe) => seg.auditar(req, acao, MODULO, detalhe);

  /* Chamada depois de gravar ("upsert") na coleção. antes: o registro como estava (null = novo). */
  async function aoGravar(req, m, colecao, antes, depois) {
    try {
      if (!acompanha(m, colecao)) return null;
      return colecao === 'entries' ? await aoGravarLancamento(req, antes, depois) : await aoGravarCondominio(req, antes, depois);
    } catch (e) {
      console.error('[parceiros → venda já lançada]', e);
      return null;
    }
  }

  return { acompanha, aoGravar };
}

module.exports = { criarParceirosVenda, vendasAnteriores, soVendaRepetida, soVenda, duplicados, chaveNome, vendaMarcada, situacao };
