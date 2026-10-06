'use strict';
/*
 * Catálogo inicial do portal: setores e as centrais de ferramentas que já existem.
 *
 * Os HTMLs NÃO ficam no repositório (eles contêm dados de negócio e links de
 * planilhas). Cada módulo nasce "sem arquivo" e o administrador envia o HTML
 * pelo painel (Administração → Módulos) ou pelo comando `npm run importar-html`.
 *
 * Campos de cada módulo:
 *  - armazenamento: onde fica o localStorage da ferramenta
 *      'navegador'     → comportamento original (fica só no navegador de cada pessoa)
 *      'usuario'       → salvo no banco do portal, separado por usuário
 *      'compartilhado' → salvo no banco do portal, o mesmo para toda a equipe
 *  - adaptador: protocolo de planilha que a ferramenta usa hoje (Google Apps Script)
 *      'gas-linhas'  → leitura em linhas (cabeçalho + linhas), gravações via POST
 *      'gas-objetos' → leitura em objetos, gravações upsert/delete via JSONP
 *      'gas-posicional' → leitura em linhas; alterações apontam a linha pela posição na planilha
 *  - fonte_dados: 'google' (continua na planilha Google) ou 'interno' (banco do portal)
 *  - config.titulo: trecho do <title> usado para reconhecer o arquivo no import automático
 */

const SETORES = [
  { nome: 'Crédito', ordem: 1 },
  { nome: 'Cobrança', ordem: 2 },
  { nome: 'Sucesso do Cliente', ordem: 3 },
  { nome: 'Suprimentos', ordem: 4 },
  { nome: 'Parceiros', ordem: 5 },
];

// Substituições aplicadas ao HTML quando o módulo usa o banco interno no lugar do Google.
// aceita aspas normais ou escapadas (\") — algumas ferramentas vêm empacotadas dentro de uma string
const URL_PLANILHA = { tipo: 'regex', busca: '(SHEET_URL_BUILTIN\\s*=\\s*)(\\\\?["\'])[^"\'\\\\]*\\2', troca: '$1$2{{GAS_URL}}$2' };
const ACEITAR_URL_INTERNA = { tipo: 'texto', busca: 'function isAppsScript(url){', troca: "function isAppsScript(url){ if(String(url||'').indexOf('/api/gas/')===0) return true;" };

const MODULOS = [
  {
    slug: 'credito',
    nome: 'Central de Ferramentas — Crédito',
    descricao: 'Montador de prestação de contas, recibos de entrega, recibos de motoboy, balancetes, planilha de moradores e consumos de água e gás.',
    setor: 'Crédito',
    icone: 'calculadora',
    ordem: 1,
    armazenamento: 'navegador',
    config: { titulo: 'Setor Crédito' },
  },
  {
    slug: 'cobranca',
    nome: 'Central de Ferramentas — Cobrança / Gestão',
    descricao: 'Produtividade da equipe, geração de mailing e análise de espólio.',
    setor: 'Cobrança',
    icone: 'grafico',
    ordem: 1,
    armazenamento: 'navegador',
    config: { titulo: 'Cobrança' },
  },
  {
    slug: 'renegociacoes',
    nome: 'Controle de Renegociações e Tickets',
    descricao: 'Renegociações de contrato, perda de receita no exercício e controle de tickets do Sucesso do Cliente.',
    setor: 'Sucesso do Cliente',
    icone: 'aperto',
    ordem: 1,
    armazenamento: 'navegador',
    adaptador: 'gas-linhas',
    fonte_dados: 'google',
    config: {
      titulo: 'Controle de Renegociações',
      colecao_padrao: 'renegociacoes',
      // nome da coleção → nome da constante JS que define o cabeçalho dentro do HTML
      colecoes: { renegociacoes: 'SHEET_HEADERS', tickets: 'TICKET_HEADERS' },
      patches_interno: [
        URL_PLANILHA,
        // a ferramenta só aceita links do Google; passa a aceitar também o endereço interno
        ACEITAR_URL_INTERNA,
      ],
    },
  },
  {
    slug: 'suprimentos',
    nome: 'Controle de Pedidos — Suprimentos',
    descricao: 'Central de pedidos do setor de Suprimentos.',
    setor: 'Suprimentos',
    icone: 'caixa',
    ordem: 1,
    // os pedidos ficam na planilha (Google ou interna); o navegador guarda só uma cópia temporária
    armazenamento: 'navegador',
    adaptador: 'gas-posicional',
    fonte_dados: 'google',
    config: {
      titulo: 'Controle de Pedidos',
      colecao_padrao: 'pedidos',
      colecoes: { pedidos: null },
      // ordem das colunas que a ferramenta grava (usada quando a planilha interna ainda está vazia)
      cabecalho_padrao: ['Nº do Pedido', 'Descrição / Fornecedor', 'Valor', 'Forma de Pagamento', 'Parcelas', 'Vencimento', 'Status'],
      patches_interno: [URL_PLANILHA, ACEITAR_URL_INTERNA],
      // caso volte a ser usado um arquivo protegido por senha, o "lembrar senha" fica só no navegador
      chaves_locais: ['^staticrypt'],
    },
  },
  {
    slug: 'parceiros',
    nome: 'Prestação de Contas — Comissão de Parceiros',
    descricao: 'Lançamento e prestação de contas das comissões de parceiros, organizado por ano e mês.',
    setor: 'Parceiros',
    icone: 'carteira',
    ordem: 1,
    armazenamento: 'navegador',
    adaptador: 'gas-objetos',
    fonte_dados: 'google',
    config: {
      titulo: 'Prestação de Contas',
      colecoes: { partners: null, condos: null, entries: null, status: null },
      patches_interno: [URL_PLANILHA],
    },
  },
];

module.exports = { SETORES, MODULOS, CHAVES_DE_SISTEMA: ['colecao_padrao', 'colecoes', 'cabecalho_padrao', 'patches_interno', 'titulo'] };
