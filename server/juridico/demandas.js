'use strict';
/*
 * Demandas Jurídicas abertas no portal: o protocolo (JUR-AAAA-MM-DD-NN) e a ligação com a Central de Tickets.
 * Quem pede ao Jurídico abre um ticket para o setor Jurídico escolhendo a atividade da Tabela de prazos; o portal cria a
 * demanda ligada ao ticket, com o prazo da atividade. O Jurídico conduz pela demanda e o ticket acompanha a situação.
 */
const I = require('./importacao');

const diaBrasilia = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));

async function proximoProtocolo(t, agora = new Date()) {
  const dia = diaBrasilia(agora);
  const r = await t.um(`INSERT INTO juridico_protocolos (dia, ultimo) VALUES ($1, 1)
    ON CONFLICT (dia) DO UPDATE SET ultimo = juridico_protocolos.ultimo + 1 RETURNING ultimo`, [dia]);
  return `JUR-${dia}-${String(r.ultimo).padStart(2, '0')}`;
}

/* a situação da demanda vista no ticket de quem pediu */
const STATUS_TICKET = { pendente: null, em_andamento: 'em_andamento', aguardando_retorno: 'aguardando', pronto_assinatura: 'em_andamento',
  aguardando_assinaturas: 'em_andamento', concluido: 'resolvido', contrato_perdido: 'cancelado' };

/* atividades que se pedem pelo ticket: as da Tabela de prazos, menos as que têm tela própria (contrato de garantia e de parceria) */
const pedidoProprio = (t) => !!t.contratos || /parceri/i.test(t.nome);

/* prazo de entrega: as horas úteis do tipo (8h = 1 dia útil), contadas do dia seguinte ao pedido */
const prazoDe = (solicitada, horas, ehDiaUtil) => I.somarDiasUteis(solicitada, I.diasDoPrazo(horas), ehDiaUtil);

/* o prazo do ticket (instante): o fim do expediente do dia do prazo, em Brasília */
const fimDoDia = (dia) => new Date(`${dia}T17:00:00-03:00`);

/* grava a demanda (dentro de uma transação) com o próximo número e o protocolo do dia; devolve { id, numero, protocolo } */
async function inserir(t, x) {
  await t.q('SELECT pg_advisory_xact_lock(7240514)');
  const { n } = await t.um('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM juridico_demandas');
  const protocolo = await proximoProtocolo(t);
  return t.um(`INSERT INTO juridico_demandas (numero, protocolo, ticket_id, tipo_id, status, solicitante_id, solicitante_nome, setor, uf, cliente, condominio_id, objeto,
      observacoes, responsavel_id, solicitada_em, horas, prazo, entregue_em, criado_por, aviso_vence_em, aviso_atraso_em, canal, status_em)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $20, $21, $22) RETURNING id, numero, protocolo`,
  [n, protocolo, x.ticket_id || null, x.tipo_id, x.status, x.solicitante_id, x.solicitante_nome, x.setor, x.uf, x.cliente, x.condominio_id, x.objeto, x.observacoes,
    x.responsavel_id, x.solicitada_em, x.horas, x.prazo, x.entregue_em, x.criado_por, x.aviso_vence_em, x.canal, x.status_em]);
}

module.exports = { proximoProtocolo, STATUS_TICKET, pedidoProprio, diaBrasilia, prazoDe, inserir, fimDoDia };
