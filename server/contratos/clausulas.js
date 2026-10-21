'use strict';
/*
 * Cláusulas do Contrato de Garantia de Taxas Condominiais que o síndico costuma pedir para mudar, com a posição e a
 * resposta do Jurídico (Manual do Contrato MyBlue — Jurídico). O comercial marca na solicitação o que o síndico pediu;
 * o Jurídico vê o pedido com a resposta padrão, e o que é decisão da diretoria passa por ela antes da minuta.
 *
 *  - diretoria: o item só entra na minuta com a decisão da diretoria;
 *  - juridico: o comercial não promete nada; o Jurídico avalia;
 *  - detalhe: pergunta que acompanha o pedido (o comercial responde em uma linha).
 */

const NEGOCIAVEIS = [
  { chave: 'taxa_extra_ampliar', clausula: 'Cláusula 1ª, §2º', pedido: 'Ampliar a cobertura de taxa extraordinária além de 40% da ordinária',
    resposta: 'O padrão é 40%; pode chegar a 100% com aprovação; acima disso, só com aditivo e taxa própria. Não prometa percentual sem a diretoria.',
    diretoria: true, detalhe: 'Até quantos % da ordinária?' },
  { chave: 'erro_cadastral_dolo', clausula: 'Cláusula 2ª, §1º, VI', pedido: 'Condomínio só responde por erro cadastral com dolo ou culpa grave',
    resposta: 'Aceito em parte: responde mediante dolo ou culpa grave comprovados, mantido o desconto nos repasses futuros.' },
  { chave: 'pontualidade_adiar', clausula: 'Cláusula 2ª, §2º', pedido: 'Tirar ou adiar a política de pontualidade (10% ou +1 ponto na taxa administrativa)',
    resposta: 'Retirar a sanção, não. Adiar o início para o próximo orçamento (competência de janeiro), sim. Retirada só com o Jurídico e a diretoria.',
    detalhe: 'A partir de qual competência? (ex.: janeiro/2027)' },
  { chave: 'reembolso_limitar', clausula: 'Cláusula 2ª, §4º', pedido: 'Excluir ou limitar as despesas reembolsáveis (certidão de matrícula, impressão)',
    resposta: 'Cessão pontual: certidão só quando necessária, com teto e restituição se recuperada; impressão e as demais ficam, sempre com comprovante. Isenção ou mudança de valor é decisão da diretoria.',
    diretoria: true, detalhe: 'O que o síndico pediu?' },
  { chave: 'negativacao_custo', clausula: 'Cláusula 3ª', pedido: 'Custo da plataforma de negativação com a MyBlue',
    resposta: 'Pode aceitar o custo com a MyBlue; a obrigação (plataforma, login e assembleia) permanece.' },
  { chave: 'responsabilidade_myblue', clausula: 'Cláusula 4ª', pedido: 'Responsabilidade da MyBlue por excessos ou abusos na cobrança',
    resposta: 'Redação padrão: a MyBlue ressarce o condomínio por sentenças transitadas em julgado de cobranças indevidas ou vexatórias comprovadas.' },
  { chave: 'retencao_preexistente', clausula: 'Cláusula 6ª, §1º', pedido: 'Excluir ou reduzir as hipóteses de desobrigação e limitar a retenção posterior',
    resposta: 'Não elimine hipóteses; pode oferecer comunicação prévia. A retenção vale quando o fato gerador comprovado preexiste ao contrato. Exige o Jurídico.',
    juridico: true },
  { chave: 'contestacao_30', clausula: 'Cláusula 10ª', pedido: 'Ampliar o prazo para contestar a prestação de contas',
    resposta: 'Pode ampliar para 30 dias corridos, mantida a preclusão. Mais que isso, só com o Jurídico.' },
  { chave: 'foro_capital', clausula: 'Cláusula 20ª', pedido: 'Foro na capital do estado do condomínio (o padrão é Fortaleza/CE)',
    resposta: 'Aceito: capital do estado do condomínio.' },
];

/* o que não muda: o comercial não promete */
const FIXAS = [
  { clausula: 'Cláusula 2ª (declarações)', texto: 'Anticorrupção, poderes, ausência de violação e LGPD: base de conformidade, não se negociam.' },
  { clausula: 'Cláusula 5ª', texto: 'Multa ou juros para a MyBlue por atraso no repasse: não (vale a mora legal; não há cláusula penal).' },
  { clausula: 'Cláusula 7ª, §3º', texto: 'Procuração: condição mínima da garantia; na troca de síndico, atualizar em até 15 dias. Não prometa afastar a consequência.' },
  { clausula: 'Cláusula 11ª, §4º', texto: 'Cessão a terceiros: sem anuência, com aviso de 30 dias e só dos créditos já adquiridos.' },
  { clausula: 'Cláusula 11ª, §5º', texto: 'Valor por boleto: pode ser reajustado uma vez por ano, com comprovação do custo bancário. Não prometa que "nunca muda".' },
  { clausula: 'Cláusula 18ª', texto: 'Título executivo extrajudicial: não há notificação prévia antes da execução.' },
];

const porChave = new Map(NEGOCIAVEIS.map((c) => [c.chave, c]));

module.exports = { NEGOCIAVEIS, FIXAS, porChave };
