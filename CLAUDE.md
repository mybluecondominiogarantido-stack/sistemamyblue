# Portal MyBlue — regras do projeto

## Toda ferramenta tem tutorial em vídeo, sempre em dia

- **Ferramenta nova** → criar o tutorial: entrada no catálogo (`server/tutoriais.js`, `publico: { modulo: '<slug>' }`),
  `video: true` na ferramenta em `docs/manuais/fonte/setores.js`, roteiro em `docs/tutoriais/fonte/roteiros-ferramentas.js`,
  gravar e enviar o `.mp4` + `.vtt` em Administração → Tutoriais.
- **Ferramenta atualizada** (HTML novo enviado no portal) → atualizar o roteiro se a tela ou o fluxo mudou e regravar.
  A página Administração → Tutoriais avisa "ferramenta atualizada — regravar" e lista as ferramentas sem tutorial.
- Como gravar: `docs/tutoriais/LEIAME.md`. O HTML da ferramenta vem do portal (versão em uso, botão
  Baixar em Versões anteriores, ou tabela `modulo_versoes`) e fica **fora do repositório**.

## Dados

- O repositório é público: nunca versionar HTML das ferramentas, vídeos, dados de negócio ou nomes reais.
- Vídeos só com dados fictícios (`docs/tutoriais/fonte/dados-ficticios.js`); listas reais embutidas no HTML
  são trocadas por fictícias só na cópia da gravação (`adaptarHtml`).
