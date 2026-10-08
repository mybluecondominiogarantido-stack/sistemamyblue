# Manuais do Portal MyBlue

- `Manual-Geral-Portal-MyBlue.pdf`: acesso e conta, menu, perfis e acessos (perfil + setor no cadastro), Central de Tickets (abrir, acompanhar, atender, líder, supervisão), avisos, painel, Carteira de condomínios, Central de Links, gestão do setor (coordenador e supervisor), administração, quem pode o quê e perguntas frequentes.
- `setores/Manual-Setor-<setor>.pdf`: um por setor (Suprimentos, Parceiros e Comissões de Novos Condomínios estão no manual da Administrativa/Financeira, como subáreas), com as ferramentas do setor, como recebe e trata os tickets, a rotina da equipe e do líder, a gestão do setor, os tipos de demanda sugeridos e quando acionar outros setores.

As telas usam dados fictícios. Para atualizar os manuais:

1. Conteúdo de cada setor (ferramentas, tipos de demanda, quando acionar outros setores): `fonte/setores.js`. Textos gerais e layout: `fonte/gerar-manuais.js`.
2. Telas (opcional): rode o portal com um banco vazio em `http://localhost:3457`
   (`PORT=3457 DATA_DIR=/tmp/portal-manual ADMIN_SENHA=Admin1234 node server/index.js`) e
   `node docs/manuais/fonte/capturar-telas.js <pasta>`. Ele usa o Chromium completo (`channel: 'chromium'`) para os campos de data e de arquivo saírem em português.
   Converta para JPEG em `fonte/img` (ex.: `convert x.png -resize '1800x>' -quality 82 -interlace Plane x.jpg`).
3. Gere os PDFs: `node docs/manuais/fonte/gerar-manuais.js` (precisa do Playwright com Chromium).
