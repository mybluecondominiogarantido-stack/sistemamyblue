# Tutoriais em vídeo do Portal MyBlue

Vídeos curtos com o portal sendo usado de verdade, com cursor, cliques destacados e legendas.
Tudo é gravado num portal de teste, com **dados fictícios** (pessoas, condomínios, pedidos, síndicos).

No portal, os vídeos ficam em **Tutoriais** (menu). Cada pessoa vê só os vídeos do perfil, do setor e
das ferramentas dela. O catálogo (título, descrição e para quem é cada vídeo) está em
`server/tutoriais.js`. Os arquivos de vídeo **não** ficam no repositório: a administração envia em
**Administração → Tutoriais em vídeo** (arraste todos os `.mp4` e `.vtt` de uma vez; cada arquivo vai
para o tutorial com o mesmo nome).

## Gravar

Precisa do Playwright com Chromium, do `ffmpeg` e do ImageMagick (`convert`).

```
LANG=pt_BR.UTF-8 node docs/tutoriais/fonte/gravar-tutoriais.js <pasta-de-saída> [nome …]
```

- Sem nomes, grava todos. Cada vídeo sobe um portal novo, com banco temporário e o cenário de
  `fonte/cenario.js`.
- Os vídeos das ferramentas usam o HTML real de cada uma, que não fica no repositório. Informe o
  caminho de cada arquivo:
  `FERRAMENTAS='{"suprimentos":"/caminho/Controle_de_Pedidos.html","boletos":"…"}' node …`
  Sem o arquivo, o vídeo daquela ferramenta é pulado.
- As ferramentas carregam bibliotecas (Excel, PDF, ZIP) do cdnjs. Sem internet na gravação, instale os mesmos
  pacotes numa pasta com o npm e informe a pasta em `BIBLIOTECAS=/caminho` (a lista está em `PACOTES`, em
  `fonte/gravador.js`; use as versões que o HTML pede, ex.: `xlsx@0.18.5`, `pdfjs-dist@3.11.174`).
- A tela da gravação tem 1280 px de largura. No layout novo, as tabelas que não cabem viram cartões empilhados;
  se isso acontecer, ponha `largura: 1600` no roteiro (o vídeo continua 1920×1080).
- Saem dois arquivos por vídeo: `<nome>.mp4` (1920×1080, legenda na faixa de baixo) e `<nome>.vtt`
  (o passo a passo, que vira a lista clicável ao lado do vídeo no portal).

## Arquivos

| Arquivo | O que tem |
|---|---|
| `fonte/gravador.js` | Grava a tela pelo screencast do Chromium, desenha o cursor e os cliques, monta a faixa de legenda e gera o MP4 e o VTT. |
| `fonte/cenario.js` | As pessoas, setores, carteira, tickets e links fictícios. |
| `fonte/dados-ficticios.js` | Dados inventados do Controle de Boletos. |
| `fonte/roteiros.js` | O passo a passo de cada vídeo do portal (perfis). |
| `fonte/roteiros-ferramentas.js` | O passo a passo de cada ferramenta. |
| `fonte/ferramentas/` | Os roteiros das ferramentas mais novas, um arquivo por ferramenta. |
| `fonte/fontes/` | A fonte Nunito Sans das legendas (licença SIL Open Font License). |

Para um vídeo novo: inclua o tutorial no catálogo (`server/tutoriais.js`), escreva o roteiro com o
mesmo `nome` e grave só ele (`… gravar-tutoriais.js <pasta> <nome>`).
