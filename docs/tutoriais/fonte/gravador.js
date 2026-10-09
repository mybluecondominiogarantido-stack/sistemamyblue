'use strict';
/*
 * Gravador dos vídeos tutoriais do Portal MyBlue.
 *
 * Sobe um portal próprio com banco temporário, abre o Chromium e grava a tela pelo
 * screencast do navegador (sem perder nitidez), com cursor visível, destaque nos cliques
 * e legendas explicando cada passo. O vídeo sai em MP4 (H.264), 1920×1080.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');

const RAIZ = path.join(__dirname, '..', '..', '..');
const LOGO = 'data:image/png;base64,' + fs.readFileSync(path.join(RAIZ, 'public', 'img', 'logo.png')).toString('base64');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const QUADRO_MS = 40; // 25 quadros por segundo
const LARGURA = 1920;
const ALTURA_TELA = 960; // a tela do portal; os 120 px de baixo são a faixa de legenda
const FONTES = path.join(__dirname, 'fontes');

/* ---------- legendas ---------- */
const tempoAss = (ms) => { const c = Math.round(ms / 10); return `${Math.floor(c / 360000)}:${String(Math.floor(c / 6000) % 60).padStart(2, '0')}:${String(Math.floor(c / 100) % 60).padStart(2, '0')}.${String(c % 100).padStart(2, '0')}`; };
const tempoVtt = (ms) => new Date(ms).toISOString().slice(11, 23);
const semTags = (h) => String(h).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
function textoAss(legs) {
  // destaque (<b>) em azul-claro e mais forte
  const corpo = (h) => String(h).replace(/<b>/g, '{\\fnNunito Sans ExtraBold\\c&HEEE07F&}').replace(/<\/b>/g, '{\\fnNunito Sans SemiBold\\c&HFFFFFF&}')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\n/g, ' ');
  const linhas = legs.map((l) => {
    const longa = semTags(l.html).length > 68; // duas linhas: sobe um pouco para ficar centralizada na faixa
    return `Dialogue: 0,${tempoAss(l.ini)},${tempoAss(l.fim)},Leg,,0,0,${longa ? 20 : 46},,${corpo(l.html)}` +
      (l.etapa ? `\nDialogue: 0,${tempoAss(l.ini)},${tempoAss(l.fim)},Etapa,,0,0,0,,{\\an4\\pos(56,${ALTURA_TELA + 62})}${semTags(l.etapa).toUpperCase()}` : '');
  });
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${LARGURA}
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Leg,Nunito Sans SemiBold,40,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,340,70,38,1
Style: Etapa,Nunito Sans ExtraBold,23,&H00EEE07F,&H00EEE07F,&H00000000,&H00000000,0,0,0,0,100,100,1.5,0,1,0,0,4,56,1620,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${linhas.join('\n')}
`;
}
function textoVtt(legs) {
  return 'WEBVTT\n\n' + legs.map((l) => `${tempoVtt(l.ini)} --> ${tempoVtt(l.fim)}\n${l.etapa ? semTags(l.etapa) + ' — ' : ''}${semTags(l.html)}`).join('\n\n') + '\n';
}

/* ---------- portal próprio ---------- */
async function subirPortal(porta) {
  const dir = path.join(os.tmpdir(), 'portal-tutorial-' + porta);
  fs.rmSync(dir, { recursive: true, force: true });
  const srv = spawn('node', ['server/index.js'], {
    cwd: RAIZ, env: { ...process.env, DATABASE_URL: '', DATA_DIR: dir, ADMIN_SENHA: 'Admin1234', PORT: String(porta) },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const base = 'http://localhost:' + porta;
  for (let i = 0; i < 120; i++) { try { if ((await fetch(base + '/saude')).ok) break; } catch {} await espera(500); }
  return { base, parar: () => srv.kill() };
}

/* cliente HTTP com sessão (para montar o cenário sem gravar) */
function cliente(base) {
  let cookie = '';
  return async function api(metodo, url, corpo, tipo) {
    const bruto = typeof corpo === 'string' || Buffer.isBuffer(corpo);
    const r = await fetch(base + url, {
      method: metodo,
      headers: { cookie, origin: base, 'content-type': tipo || (bruto ? 'text/html' : 'application/json') },
      body: corpo == null ? undefined : bruto ? corpo : JSON.stringify(corpo),
    });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const txt = await r.text();
    try { return JSON.parse(txt); } catch { return txt; }
  };
}

/* ---------- sobreposições desenhadas na página (só no quadro principal) ---------- */
function sobreposicoes(logo) {
  if (window.top !== window) return;
  const css = `
  #__cur{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transition:transform var(--d,0ms) cubic-bezier(.45,.05,.25,1);will-change:transform}
  #__cur svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
  .__clique{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:3px solid #199cb1;background:rgba(25,156,177,.18);z-index:2147483646;pointer-events:none;animation:__cl .55s ease-out forwards}
  @keyframes __cl{from{transform:scale(.3);opacity:1}to{transform:scale(1.25);opacity:0}}
  #__cartao{position:fixed;inset:0;z-index:2147483644;display:flex;align-items:center;justify-content:center;background:linear-gradient(150deg,#0c77be 0%,#199cb1 70%,#4fc1cf 100%);color:#fff;opacity:0;transition:opacity .45s;pointer-events:none;font-family:"Quicksand","Nunito Sans",Arial,sans-serif}
  #__cartao.vis{opacity:1}
  #__cartao .cx{max-width:980px;padding:0 60px}
  #__cartao .ch{font:800 15px/1 "Nunito Sans",Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;opacity:.85}
  #__cartao h1{font-size:54px;line-height:1.08;margin:16px 0 18px;font-weight:700}
  #__cartao p{font:600 21px/1.45 "Nunito Sans",Arial,sans-serif;opacity:.93;margin:0}
  #__cartao ul{font:600 19px/1.5 "Nunito Sans",Arial,sans-serif;margin:18px 0 0;padding-left:24px;opacity:.95}
  #__cartao .lg{position:absolute;left:60px;bottom:48px;background:#fff;border-radius:14px;padding:10px 16px}
  #__cartao .lg img{height:38px;display:block}
  #__cartao .ft{position:absolute;right:60px;bottom:58px;font:700 14px "Nunito Sans",Arial,sans-serif;opacity:.8}`;
  function montar() {
    if (document.getElementById('__cur')) return;
    const st = document.createElement('style'); st.textContent = css; document.documentElement.appendChild(st);
    const c = document.createElement('div'); c.id = '__cur';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2.5l15 8.6-6.6 1.6 3.9 7.2-2.6 1.4-3.9-7.2L4.6 19z" fill="#fff" stroke="#13323a" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    const p = window.__posCursor || [640, 400];
    c.style.transform = `translate(${p[0] - 4}px,${p[1] - 2}px)`;
    const k = document.createElement('div'); k.id = '__cartao';
    document.documentElement.append(c, k);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
  window.__tut = {
    montar,
    cursor(x, y, d) { montar(); const c = document.getElementById('__cur'); c.style.setProperty('--d', d + 'ms'); c.style.transform = `translate(${x - 4}px,${y - 2}px)`; },
    clique(x, y) { const e = document.createElement('div'); e.className = '__clique'; e.style.left = x + 'px'; e.style.top = y + 'px'; document.documentElement.appendChild(e); setTimeout(() => e.remove(), 700); },
    cartao(chapeu, titulo, texto, itens) {
      montar(); const k = document.getElementById('__cartao');
      if (!titulo) { k.classList.remove('vis'); return; }
      k.innerHTML = `<div class="cx"><div class="ch">${chapeu}</div><h1>${titulo}</h1>${texto ? `<p>${texto}</p>` : ''}${itens ? `<ul>${itens.map((i) => `<li>${i}</li>`).join('')}</ul>` : ''}</div>
        <div class="lg"><img src="${logo}"></div><div class="ft">Portal MyBlue · tutorial</div>`;
      k.classList.add('vis');
    },
  };
}

/* ---------- gravação ---------- */
class Tutorial {
  constructor(navegador, base, arquivo) { this.br = navegador; this.base = base; this.arquivo = arquivo; this.pos = [640, 400]; }

  async abrir() {
    this.ctx = await this.br.newContext({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1.5, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await this.ctx.addInitScript(sobreposicoes, LOGO);
    this.p = await this.ctx.newPage();
    this.erros = [];
    this.p.on('pageerror', (e) => this.erros.push(e.message));
    this.p.on('dialog', (d) => d.accept().catch(() => {})); // confirmações das ferramentas: aceita
    // a cada navegação, o cursor volta para onde estava
    this.p.on('framenavigated', (f) => { if (f === this.p.mainFrame()) this.p.evaluate((p) => { window.__posCursor = p; }, this.pos).catch(() => {}); });
    return this;
  }

  /* entra sem gravar (sessão pronta antes de começar o vídeo) */
  async entrar(email, senha) {
    await this.p.goto(this.base + '/login');
    await this.p.fill('#email', email); await this.p.fill('#senha', senha);
    await Promise.all([this.p.waitForURL((u) => !String(u).includes('/login')), this.p.click('#btEntrar')]);
    await this.p.waitForTimeout(1200);
  }

  async gravar() {
    fs.mkdirSync(path.dirname(this.arquivo), { recursive: true });
    // 1ª passada: a tela, quase sem perda; as legendas entram na 2ª passada (terminar)
    this.bruto = this.arquivo.replace(/\.mp4$/, '.bruto.mkv');
    this.ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '25', '-c:v', 'mjpeg', '-i', '-',
      '-vf', `scale=${LARGURA}:${ALTURA_TELA}:force_original_aspect_ratio=decrease,pad=${LARGURA}:${ALTURA_TELA}:(ow-iw)/2:(oh-ih)/2:color=white`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '14', this.bruto], { stdio: ['pipe', 'inherit', 'inherit'] });
    this.fim = new Promise((r) => this.ff.on('close', r));
    this.cdp = await this.ctx.newCDPSession(this.p);
    this.t0 = Date.now(); this.escritos = 0; this.ultimo = null; this.legendas = [];
    this.cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
      this.cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      this.preencher();
      this.ultimo = Buffer.from(data, 'base64');
    });
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: LARGURA, maxHeight: ALTURA_TELA, everyNthFrame: 1 });
    // a tela parada não gera quadros novos: repete o último para manter o tempo certo
    this.relogio = setInterval(() => this.preencher(), 200);
    await espera(300);
  }

  preencher() {
    if (!this.ultimo) return;
    const devido = Math.floor((Date.now() - this.t0) / QUADRO_MS);
    while (this.escritos < devido) { this.ff.stdin.write(this.ultimo); this.escritos++; }
  }

  agora() { return Date.now() - this.t0; }

  /* deu erro no meio do roteiro: para tudo e não deixa vídeo pela metade */
  async abortar() {
    clearInterval(this.relogio);
    if (this.cdp) await this.cdp.send('Page.stopScreencast').catch(() => {});
    if (this.ff) { this.ff.stdin.end(); await this.fim; }
    if (this.p) await this.p.screenshot({ path: this.arquivo.replace(/\.mp4$/, '.erro.png') }).catch(() => {});
    await this.ctx.close().catch(() => {});
    if (this.bruto) fs.rmSync(this.bruto, { force: true });
  }

  async terminar() {
    await espera(400); this.preencher();
    clearInterval(this.relogio);
    await this.cdp.send('Page.stopScreencast').catch(() => {});
    this.ff.stdin.end(); await this.fim;
    await this.ctx.close();
    const total = this.escritos * QUADRO_MS;
    const legs = this.legendas.map((l, i) => ({ ...l, fim: i + 1 < this.legendas.length ? this.legendas[i + 1].ini : total })).filter((l) => l.html && l.fim > l.ini);
    const ass = this.arquivo.replace(/\.mp4$/, '.ass');
    fs.writeFileSync(ass, textoAss(legs));
    fs.writeFileSync(this.arquivo.replace(/\.mp4$/, '.vtt'), textoVtt(legs));
    // 2ª passada: faixa de legenda embaixo da tela (não cobre nada do portal)
    const filtro = `pad=${LARGURA}:1080:0:0:color=0x0d2830,drawbox=x=0:y=${ALTURA_TELA}:w=${LARGURA}:h=4:color=0x199cb1:t=fill,` +
      `ass=${path.basename(ass)}:fontsdir=${FONTES}`;
    await new Promise((ok, falha) => {
      const f = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.basename(this.bruto), '-vf', filtro, '-c:v', 'libx264', '-preset', 'medium', '-crf', '24',
        '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.basename(this.arquivo)], { cwd: path.dirname(this.arquivo), stdio: 'inherit' });
      f.on('close', (c) => (c ? falha(new Error('ffmpeg ' + c)) : ok()));
    });
    fs.rmSync(this.bruto); fs.rmSync(ass);
    if (this.erros.length) console.log('  erros na página:', this.erros.join(' | '));
  }

  /* ---------- ações visíveis ---------- */
  async tut(fn, ...args) {
    // a página pode estar navegando: tenta de novo até as sobreposições existirem
    for (let i = 0; i < 20; i++) {
      try { return await this.p.evaluate(([fn, args]) => { window.__tut.montar(); return window.__tut[fn](...args); }, [fn, args]); } catch { await espera(150); }
    }
  }

  async mover(x, y) {
    const [x0, y0] = this.pos;
    const dist = Math.hypot(x - x0, y - y0);
    const d = Math.round(Math.min(950, Math.max(280, dist * 0.9)));
    await this.tut('cursor', x, y, d);
    await this.p.mouse.move(x, y, { steps: 12 });
    this.pos = [x, y];
    await espera(d + 60);
  }

  async apontar(alvo, { dx = 0.5, dy = 0.5 } = {}) {
    const l = typeof alvo === 'string' ? this.p.locator(alvo).first() : alvo;
    await l.waitFor({ state: 'visible', timeout: 15000 });
    await l.scrollIntoViewIfNeeded().catch(() => {});
    const b = await l.boundingBox();
    const x = Math.round(b.x + b.width * dx), y = Math.round(b.y + b.height * dy);
    await this.mover(x, y);
    return { l, x, y };
  }

  async clicar(alvo, opcoes = {}) {
    const { x, y } = await this.apontar(alvo, opcoes);
    await espera(140);
    await this.tut('clique', x, y);
    await this.p.mouse.click(x, y);
    await espera(opcoes.depois ?? 650);
  }

  async digitar(alvo, texto, { atraso = 38, limpar = true, depois = 350 } = {}) {
    const l = typeof alvo === 'string' ? this.p.locator(alvo).first() : alvo;
    await this.clicar(l, { depois: 150 });
    if (limpar) await l.fill('');
    await l.pressSequentially(texto, { delay: atraso });
    await espera(depois);
  }

  /* campos de data e hora: aponta, clica e preenche de uma vez */
  async preencherCampo(alvo, valor, { depois = 500 } = {}) {
    const l = typeof alvo === 'string' ? this.p.locator(alvo).first() : alvo;
    await this.clicar(l, { depois: 200 });
    await l.fill(valor);
    await espera(depois);
  }

  /* envio de arquivo: aponta a área de envio e escolhe o arquivo */
  async enviarArquivo(zona, input, caminho, { depois = 1500 } = {}) {
    const { x, y } = await this.apontar(zona);
    await espera(140); await this.tut('clique', x, y);
    const i = typeof input === 'string' ? this.p.locator(input).first() : input;
    await i.setInputFiles(caminho);
    await espera(depois);
  }

  /* aponta um elemento e espera (para a legenda explicar o que é) */
  async mostrar(alvo, ms = 2500, opcoes) { await this.apontar(alvo, opcoes); await espera(ms); }

  async escolher(alvo, rotulo, { depois = 600 } = {}) {
    const { l, x, y } = await this.apontar(alvo);
    await espera(140); await this.tut('clique', x, y);
    await l.selectOption(typeof rotulo === 'string' ? { label: rotulo } : rotulo);
    await espera(depois);
  }

  async rolar(dy, alvo) {
    if (alvo) await this.apontar(alvo);
    const passos = Math.max(6, Math.round(Math.abs(dy) / 40));
    for (let i = 0; i < passos; i++) { await this.p.mouse.wheel(0, dy / passos); await espera(28); }
    await espera(500);
  }

  /* legenda: fica na faixa de baixo até a próxima; "ms" é quanto tempo esperar lendo */
  async legenda(html, { etapa, ms } = {}) {
    this.legendas.push({ ini: this.agora(), html, etapa: etapa || '' });
    const texto = String(html).replace(/<[^>]+>/g, '');
    await espera(ms ?? Math.min(6500, Math.max(2300, texto.length * 52)));
  }

  async semLegenda() { this.legendas.push({ ini: this.agora(), html: '' }); }

  async cartao(chapeu, titulo, texto, itens, ms = 4200) {
    await this.tut('cartao', chapeu, titulo, texto || '', itens || null);
    await espera(ms);
    await this.tut('cartao', '', '');
    await espera(500);
  }

  async ir(hash, ms = 1300) { await this.p.goto(this.base + '/' + hash); await espera(ms); }
  pausa(ms) { return espera(ms); }
}

async function navegador() {
  return chromium.launch({ channel: 'chromium', args: ['--lang=pt-BR', '--font-render-hinting=none'] });
}

module.exports = { subirPortal, cliente, navegador, Tutorial, espera };
