'use strict';
/*
 * Bibliotecas das ferramentas (pdf.js, SheetJS, jsPDF…) entregues pelo próprio portal.
 * As ferramentas carregam essas bibliotecas de CDNs públicas. Se a rede da empresa bloquear ou a CDN cair,
 * a ferramenta fica em branco. O portal troca esses endereços por /cdn/<cdn>/<caminho> ao entregar a página
 * (modulos.montarHtml) e serve o arquivo daqui: busca na CDN uma vez e guarda no banco (tabela cdn_cache).
 * Se não tiver a cópia e a CDN não responder ao servidor, devolve o endereço original para o navegador tentar.
 */
const CDNS = {
  cdnjs: 'https://cdnjs.cloudflare.com',
  jsdelivr: 'https://cdn.jsdelivr.net',
  unpkg: 'https://unpkg.com',
};
const CAMINHO_OK = /^[A-Za-z0-9@._+\-/]+$/;
const LIMITE_BYTES = 15 * 1024 * 1024;
const LIMITE_CACHE_BYTES = Number(process.env.LIMITE_CDN_MB || 200) * 1024 * 1024; // o que passar disso fica só na memória
/* Só tipos que não rodam como página: o arquivo sai na origem do portal, então SVG e HTML (que executam script quando
   abertos direto) nunca são entregues daqui. Outros tipos vão direto para a CDN (redirect). O tipo vem sempre da extensão. */
const TIPOS = {
  js: 'application/javascript; charset=utf-8', mjs: 'application/javascript; charset=utf-8', cjs: 'application/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', map: 'application/json; charset=utf-8', wasm: 'application/wasm',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', png: 'image/png',
  bcmap: 'application/octet-stream', pfb: 'application/octet-stream',
};
const ROTEIRO = /^application\/javascript/;
/* endereço sem extensão (ex.: unpkg.com/pacote@1): só se a CDN disser que é script, estilo ou JSON */
function tipoSemExtensao(tipoDaCdn) {
  const t = String(tipoDaCdn || '').toLowerCase();
  if (/^(application|text)\/(x-)?javascript|^application\/ecmascript/.test(t)) return TIPOS.js;
  if (/^text\/css/.test(t)) return TIPOS.css;
  if (/^application\/json/.test(t)) return TIPOS.json;
  return null;
}

/* troca os endereços das CDNs conhecidas pelo endereço do portal (no HTML e nas strings do JS da ferramenta).
   prefixo: '/t/<chave>' na ferramenta isolada (ela não tem o cookie do portal) */
function trocarCdns(html, prefixo = '') {
  let s = html;
  for (const [nome, base] of Object.entries(CDNS)) {
    const host = base.replace('https://', '');
    const local = prefixo + '/cdn/' + nome + '/';
    s = s.split('https://' + host + '/').join(local).split('"//' + host + '/').join('"' + local).split("'//" + host + "/").join("'" + local);
  }
  return s;
}

function rotasCdn({ db }) {
  const express = require('express');
  const r = express.Router();
  const memoria = new Map(); // url → { tipo, corpo }
  let bytesMemoria = 0;
  const buscando = new Map(); // url → Promise (evita buscar o mesmo arquivo várias vezes ao mesmo tempo)

  let bytesNoBanco = null;

  async function buscarNaCdn(url) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetch(url, { signal: ctl.signal, redirect: 'follow' });
      if (!r.ok || Number(r.headers.get('content-length') || 0) > LIMITE_BYTES) { ctl.abort(); return null; }
      const partes = [];
      let total = 0;
      for await (const p of r.body) {
        total += p.length;
        if (total > LIMITE_BYTES) { ctl.abort(); return null; }
        partes.push(p);
      }
      return { tipo: r.headers.get('content-type') || '', corpo: Buffer.concat(partes) };
    } catch (e) {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  async function guardar(url, x) {
    if (bytesNoBanco == null) bytesNoBanco = Number((await db.um('SELECT COALESCE(SUM(tamanho), 0)::bigint AS n FROM cdn_cache')).n);
    if (bytesNoBanco + x.corpo.length > LIMITE_CACHE_BYTES) return;
    const r = await db.q(`INSERT INTO cdn_cache (url, tipo, conteudo, tamanho) VALUES ($1, $2, $3, $4)
      ON CONFLICT (url) DO NOTHING`, [url, x.tipo, x.corpo, x.corpo.length]);
    if (r.n) bytesNoBanco += x.corpo.length;
  }

  async function obter(url, tipoPadrao) {
    const m = memoria.get(url);
    if (m) return m;
    const linha = await db.um('SELECT tipo, conteudo FROM cdn_cache WHERE url = $1', [url]);
    let arq = linha ? { tipo: linha.tipo, corpo: Buffer.from(linha.conteudo) } : null;
    if (arq && !tipoPadrao && !tipoSemExtensao(arq.tipo)) return null; // cópia antiga de um tipo que não é mais entregue: vai para a CDN
    if (!arq) {
      if (!buscando.has(url)) {
        buscando.set(url, (async () => {
          const x = await buscarNaCdn(url);
          if (!x) return null;
          x.tipo = tipoPadrao || tipoSemExtensao(x.tipo);
          if (!x.tipo) return null;
          await guardar(url, x).catch(() => {});
          return x;
        })().finally(() => buscando.delete(url)));
      }
      arq = await buscando.get(url);
    }
    if (arq && bytesMemoria + arq.corpo.length < 80 * 1024 * 1024) { memoria.set(url, arq); bytesMemoria += arq.corpo.length; }
    return arq;
  }

  r.get(/^\/cdn\/(cdnjs|jsdelivr|unpkg)\/(.+)$/, async (req, res) => {
    if (!req.usuario) return res.status(401).type('text').send('Faça login para continuar.');
    const nome = req.params[0];
    const caminho = req.params[1];
    if (!CAMINHO_OK.test(caminho) || caminho.split('/').some((p) => p === '..' || p === '.')) return res.status(400).type('text').send('Endereço inválido.');
    const url = CDNS[nome] + '/' + caminho;
    // extensão começa por letra: "pacote@1.0.0" não tem extensão, "xlsx.full.min.js" tem
    const ext = ((/\.([a-z][a-z0-9]*)$/i.exec(caminho.slice(caminho.lastIndexOf('/') + 1)) || [])[1] || '').toLowerCase();
    // tipo que o portal não entrega (svg, html…): o navegador busca direto na CDN, fora da origem do portal
    if (ext && !TIPOS[ext]) return res.redirect(302, url);
    const arq = await obter(url, ext ? TIPOS[ext] : null);
    // sem cópia e sem resposta da CDN (ou tipo não permitido): o navegador tenta direto
    if (!arq) return res.redirect(302, url);
    // o que não é script não roda nada se for aberto direto
    if (!ROTEIRO.test(arq.tipo)) res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    // endereço com versão fixa (ex.: xlsx/0.18.5/…) não muda: o navegador pode guardar por um ano
    const versionado = /\/v?\d+\.\d+[^/]*\//.test('/' + caminho) || /@\d+\.\d+/.test(caminho);
    res.set('Cache-Control', versionado ? 'private, max-age=31536000, immutable' : 'private, max-age=86400');
    res.type(arq.tipo).send(arq.corpo);
  });

  return r;
}

module.exports = { rotasCdn, trocarCdns, CDNS };
