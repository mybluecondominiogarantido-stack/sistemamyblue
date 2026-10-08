# Manuais do Portal MyBlue

- `Manual-Geral-Portal-MyBlue.pdf`: acesso, menu, ferramentas, Central de Tickets, avisos, painel, administração e perguntas frequentes.
- `Guia-TI-Email-Microsoft365.pdf`: passo a passo para o TI ligar o e-mail dos avisos pelo Microsoft 365 (gerado por `fonte/gerar-guia-email.js`).
- `setores/Manual-Setor-<setor>.pdf`: um por setor, com as ferramentas do setor, como recebe e trata os tickets, a rotina da equipe e do líder, os tipos de demanda sugeridos e quando acionar outros setores.

As telas usam dados fictícios. Para atualizar os manuais:

1. Conteúdo de cada setor: `fonte/setores.js`. Textos gerais e layout: `fonte/gerar-manuais.js`.
2. Telas (opcional): rode o portal em `http://localhost:3457` com um banco vazio e `node docs/manuais/fonte/capturar-telas.js <pasta>`; converta para JPEG em `fonte/img`.
3. Gere os PDFs: `node docs/manuais/fonte/gerar-manuais.js` (precisa do Playwright com Chromium).
