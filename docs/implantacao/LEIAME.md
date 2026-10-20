# Implantação

Do contrato assinado à Carteira. O comercial abre a implantação a partir de uma análise de crédito liberada, preenche o
formulário (o antigo Formulário de Implantação do Microsoft Forms) e anexa os documentos; o setor **Implantação** conduz;
a coordenação confirma a entrada na Carteira. Tela própria do portal (menu **Implantação**), com os mesmos padrões da
Análise de Crédito.

## Onde está cada parte

| Parte | Arquivo |
|---|---|
| Rotas (perfil, análises disponíveis, liberação pelo gestor, formulário, documentos, envio, avisos) | `server/rotas/implantacoes.js` |
| Regras do formulário: o que vem da análise, o que falta, o que fica pendente, o comparativo | `server/implantacoes/formulario.js` |
| Tabelas `implantacoes`, `implantacao_documentos`, `implantacao_eventos`, `implantacao_liberacoes`, `implantacao_protocolos` | `server/db.js` |
| Lembrete diário de pendências (roda a cada 10 min, sai uma vez por dia útil) | `criarRotinasImplantacao` em `server/rotas/implantacoes.js`, ligado em `server/index.js` |
| Telas | `public/app.js` (bloco Implantação) |
| Testes (dados fictícios) | `test/implantacoes-formulario.test.js`, `test/implantacoes-rotas.test.js` |

## Regras

- **De onde vem:** análise do portal enviada, aprovada ou com ressalvas, sem reanálise enviada depois e sem implantação
  aberta. Abre implantação até `implantacao_validade_dias` (política de crédito, padrão **90**) depois da liberação do
  retorno. Depois disso, o comercial pede a liberação ao **gestor da Análise de Crédito** (sino e e-mail); liberada, abre
  normalmente; recusada, o caminho é a reanálise. (Os 30 dias de validade da proposta, no retorno, continuam iguais.)
- **Formulário:** vem preenchido com a análise e tudo pode ser ajustado. A análise fica ao lado de cada campo, e o que
  mudar (taxa administrativa, boleto, unidades, taxa ordinária, vencimento, desconto, isenção do síndico) aparece como
  diferença para o setor e o gestor. A convenção e o retorno da análise (PDF) entram nos documentos.
- **Obrigatórios para enviar:** os dados do formulário e quatro documentos: convenção, cadastro de moradores (Excel),
  ata de eleição do síndico e ata de previsão orçamentária.
- **Podem chegar depois:** RG/CPF ou CNH do síndico, conta bancária, comprovante de endereço do síndico, modelo do boleto
  anterior (e o CNPJ, no condomínio de entrega sem CNPJ). No envio, o executivo recebe a lista no sino; depois, um e-mail
  por dia útil até chegar. Quando um pendente chega, quem conduz (ou a coordenação) é avisado.
- **Parceria:** o executivo só diz se há e escolhe o parceiro da base de comissão (ferramenta *Prestação de Contas —
  Comissão de Parceiros*, coleção `partners`); o percentual é do setor Parceiros. Com a ferramenta ainda na planilha
  Google, a lista fica vazia e o nome é digitado.
- **Envio:** protocolo **IMP-AAAA-MM-DD-NN** (sequencial por dia, horário de Brasília). Avisos (sino e e-mail): a
  coordenação ("Nova implantação", aguardando designação) e a equipe ("Chegou uma nova implantação").

## Próximas etapas

1. Setor: designação pela coordenação (8h úteis para iniciar), lembrete a cada 4h úteis sem designação, as 5 etapas
   (documentação, cadastro no Vouch, onboarding, emissão de boletos, envio), devolução com pendência, conclusão com aviso
   ao setor Parceiros e confirmação na Carteira.
2. Outras origens: condomínio de entrega (diretoria aprova taxa e boleto; "ainda não tem CNPJ") e PDF de análise feita
   antes do portal (leitura do retorno de 4 páginas).
3. Formulário em PDF e tutoriais em vídeo.

## Dados

O repositório é público: testes e exemplos só com dados fictícios. Nomes reais (executivos, condomínios, parceiros)
entram pelo portal e ficam no banco.
