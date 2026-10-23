'use strict';
/*
 * Cláusulas do Contrato de Garantia de Taxas Condominiais que o síndico costuma pedir para mudar, com a posição e a
 * resposta do Jurídico (Manual do Contrato MyBlue — Jurídico). O comercial marca na solicitação o que o síndico pediu;
 * o Jurídico vê o pedido com a resposta padrão, e o que é decisão da diretoria passa por ela antes da minuta.
 *
 *  - diretoria: o item só entra na minuta com a decisão da diretoria;
 *  - juridico: o comercial não promete nada; o Jurídico avalia;
 *  - detalhe: pergunta que acompanha o pedido (o comercial responde em uma linha), exemplo: o texto de exemplo dela;
 *  - antigo: não é mais oferecido ao comercial, mas continua para mostrar as solicitações que já o tinham.
 */

const NEGOCIAVEIS = [
  { chave: 'taxa_extra_ampliar', clausula: 'Cláusula 1ª, §2º', pedido: 'Ampliar a cobertura de taxa extraordinária além de 40% da ordinária',
    resposta: 'O padrão é 40%; pode chegar a 100% com aprovação; acima disso, só com aditivo e taxa própria. Não prometa percentual sem a diretoria.',
    diretoria: true, detalhe: 'Até quantos % da ordinária?' },
  { chave: 'pontualidade_retirar', clausula: 'Cláusula 2ª, §2º', pedido: 'Retirar a política de pontualidade (10% ou +1 ponto na taxa administrativa)',
    resposta: 'Retirar a sanção, não: retirada só com o Jurídico e a diretoria. O que se aceita é adiar o início.', diretoria: true },
  { chave: 'pontualidade_adiar', clausula: 'Cláusula 2ª, §2º', pedido: 'Adiar a política de pontualidade',
    resposta: 'Adiar o início para o próximo orçamento (competência de janeiro), sim.',
    detalhe: 'Para quando?', exemplo: 'Ex.: para a próxima assembleia ordinária, 30, 60 ou 90 dias' },
  { chave: 'contestacao_30', clausula: 'Cláusula 10ª', pedido: 'Ampliar o prazo para contestar a prestação de contas',
    resposta: 'Pode ampliar para 30 dias corridos, mantida a preclusão. Mais que isso, só com o Jurídico.',
    detalhe: 'Prazo solicitado pelo cliente (dias)', exemplo: 'Ex.: 30' },
  { chave: 'foro_capital', clausula: 'Cláusula 20ª', pedido: 'Foro na capital do estado do condomínio (o padrão é Fortaleza/CE)',
    resposta: 'Aceito: capital do estado do condomínio.' },
  // não são mais oferecidos (ajustes de out/2026): ficam só para as solicitações que já os tinham
  { chave: 'erro_cadastral_dolo', clausula: 'Cláusula 2ª, §1º, VI', pedido: 'Condomínio só responde por erro cadastral com dolo ou culpa grave',
    resposta: 'Aceito em parte: responde mediante dolo ou culpa grave comprovados, mantido o desconto nos repasses futuros.', antigo: true },
  { chave: 'reembolso_limitar', clausula: 'Cláusula 2ª, §4º', pedido: 'Excluir ou limitar as despesas reembolsáveis (certidão de matrícula, impressão)',
    resposta: 'Cessão pontual: certidão só quando necessária, com teto e restituição se recuperada; impressão e as demais ficam, sempre com comprovante. Isenção ou mudança de valor é decisão da diretoria.',
    diretoria: true, detalhe: 'O que o síndico pediu?', antigo: true },
  { chave: 'negativacao_custo', clausula: 'Cláusula 3ª', pedido: 'Custo da plataforma de negativação com a MyBlue',
    resposta: 'Pode aceitar o custo com a MyBlue; a obrigação (plataforma, login e assembleia) permanece.', antigo: true },
  { chave: 'responsabilidade_myblue', clausula: 'Cláusula 4ª', pedido: 'Responsabilidade da MyBlue por excessos ou abusos na cobrança',
    resposta: 'Redação padrão: a MyBlue ressarce o condomínio por sentenças transitadas em julgado de cobranças indevidas ou vexatórias comprovadas.', antigo: true },
  { chave: 'retencao_preexistente', clausula: 'Cláusula 6ª, §1º', pedido: 'Excluir ou reduzir as hipóteses de desobrigação e limitar a retenção posterior',
    resposta: 'Não elimine hipóteses; pode oferecer comunicação prévia. A retenção vale quando o fato gerador comprovado preexiste ao contrato. Exige o Jurídico.',
    juridico: true, antigo: true },
];

const porChave = new Map(NEGOCIAVEIS.map((c) => [c.chave, c]));

module.exports = { NEGOCIAVEIS, porChave };
