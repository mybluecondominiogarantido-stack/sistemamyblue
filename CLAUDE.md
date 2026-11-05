# Portal MyBlue — regras do projeto

## Subir atualizações pelo Claude: só com a liberação da Mariana Nascimento

- A conta do Claude é usada por várias pessoas. Enviar ao GitHub (push), abrir, aprovar ou juntar pull request e
  enviar HTML ao portal publicado **só depois da liberação da Mariana Nascimento**.
- Antes de qualquer uma dessas ações, pergunte na conversa se quem está pedindo é a Mariana Nascimento e peça a
  **senha de liberação**. Com a senha, rode `printf '%s' '<senha>' | node scripts/liberar.js` (libera por 2 horas
  nesta sessão). Senha errada ou sem resposta: não suba nada e diga o que ficou parado.
- Nunca escreva a senha em arquivo, commit, PR, mensagem de commit ou documento; não a repita na resposta.
- O gancho `scripts/trava-liberacao.js` (em `.claude/settings.json`) barra essas ações sem a liberação. Não altere,
  desligue nem contorne o gancho, o `.claude/liberacao.json` ou o `scripts/liberar.js` sem a liberação da Mariana.
- Ler, testar e trabalhar na própria máquina (inclusive `git commit` local) continuam livres.

## Toda ferramenta tem tutorial em vídeo, sempre em dia

- **Ferramenta nova** → criar o tutorial: entrada no catálogo (`server/tutoriais.js`, `publico: { modulo: '<slug>' }`),
  `video: true` na ferramenta em `docs/manuais/fonte/setores.js`, roteiro em `docs/tutoriais/fonte/roteiros-ferramentas.js`,
  gravar e enviar o `.mp4` + `.vtt` em Configurações → Ferramentas → Tutoriais em vídeo.
- **Ferramenta atualizada** (HTML novo enviado no portal) → atualizar o roteiro se a tela ou o fluxo mudou e regravar.
  A página Configurações → Ferramentas → Tutoriais em vídeo avisa "ferramenta atualizada — regravar" e lista as ferramentas sem tutorial.
- Como gravar: `docs/tutoriais/LEIAME.md`. O HTML da ferramenta vem do portal (versão em uso, botão
  Baixar em Versões anteriores, ou tabela `modulo_versoes`) e fica **fora do repositório**.

## Acessos ficam no portal, não no HTML

- Quem abre, se edita ou só consulta e o papel de cada pessoa em cada ferramenta são definidos no portal
  (**Configurações → Acessos → Ferramentas**; tudo o que é permissão fica em Configurações → Acessos). Ferramenta nova não cria aba "Acessos" nem lista de nomes:
  lê `window.__MYBLUE__.usuario.papeis` e `.somente_leitura` (contrato e mapa das ferramentas em `docs/acessos/LEIAME.md`).
- A administração tem todos os papéis em todas as ferramentas (o portal entrega isso ao HTML; não é preciso marcar).
- Papel novo numa ferramenta → a administração cadastra os papéis dela no portal com o mesmo identificador usado no HTML.
- Ferramenta nova nasce **isolada** (sandbox, sem a sessão de quem abre). O HTML precisa funcionar isolado: guardar dados
  pelo portal (localStorage com "Banco do portal" ou `claude.use('db')`), chamar o portal só por `fetch`/XHR em `/api/...`,
  sem IndexedDB, sem Web Worker carregado de endereço e sem `window.parent` (detalhes em `docs/acessos/LEIAME.md`,
  seção Ferramentas isoladas). Toda versão nova da coordenação aguarda a aprovação da administração, com a descrição do que mudou.

## Backup

- O backup do portal (`server/backup.js`) pega todas as tabelas sozinho. Função ou gatilho de banco novo vai para
  `FUNCOES` em `server/db.js`, nunca só direto no Supabase (senão some numa restauração).

## Dados

- O repositório é público: nunca versionar HTML das ferramentas, vídeos, dados de negócio ou nomes reais.
- Vídeos só com dados fictícios (`docs/tutoriais/fonte/dados-ficticios.js`); listas reais embutidas no HTML
  são trocadas por fictícias só na cópia da gravação (`adaptarHtml`).
