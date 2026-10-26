'use strict';
/*
 * Backup do banco do portal e restauração.
 *
 * O arquivo é um JSON por linha (.jsonl.gz):
 *   1ª linha  {"sistema":"portal-myblue","versao_backup":5,"gerado_em":…,"tabelas":[…]}
 *   depois    {"t":"<tabela>","r":{…linha…}}   (arquivos BYTEA em base64)
 *   última    {"fim":true,"linhas":{"<tabela>":n,…}}   (sem ela o arquivo está cortado)
 *
 * - Pega TODAS as tabelas do banco (a lista vem do próprio Postgres), menos sessões abertas e a cópia das CDNs.
 * - Sai aos pedaços (cada arquivo grande é lido em partes), então não ocupa a memória do servidor.
 * - Lê tudo numa transação só leitura: o arquivo é uma fotografia do banco num instante.
 * - Hashes de senha ficam fora: depois de restaurar, cada pessoa recebe senha nova (veja scripts/restaurar-backup.js).
 */
const zlib = require('zlib');
const readline = require('readline');

const FORA_DO_BACKUP = new Set(['sessoes', 'cdn_cache']);
const PEDACO = 3 * 1024 * 1024; // múltiplo de 3: os pedaços em base64 emendam sem quebrar
const LOTE = 200;

/* tabelas, colunas e chaves do schema atual */
async function estrutura(q) {
  const tabelas = (await q(`SELECT table_name AS t FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name`)).rows.map((r) => r.t);
  const colunas = {};
  for (const r of (await q(`SELECT table_name AS t, column_name AS c, data_type AS tipo FROM information_schema.columns
    WHERE table_schema = current_schema() ORDER BY table_name, ordinal_position`)).rows) (colunas[r.t] ||= []).push({ nome: r.c, tipo: r.tipo });
  const pk = {};
  const fks = {}; // tabela → [{ coluna, para }]
  for (const r of (await q(`SELECT c.conrelid::regclass::text AS t, c.contype AS tipo, c.confrelid::regclass::text AS para,
      (SELECT array_agg(a.attname::text ORDER BY k.n) FROM unnest(c.conkey) WITH ORDINALITY k(num, n)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.num) AS cols
    FROM pg_constraint c JOIN pg_namespace ns ON ns.oid = c.connamespace
    WHERE ns.nspname = current_schema() AND c.contype IN ('p', 'f')`)).rows) {
    const t = r.t.replace(/^.*\./, '').replace(/"/g, '');
    const cols = typeof r.cols === 'string' ? r.cols.replace(/[{}"]/g, '').split(',') : r.cols;
    if (r.tipo === 'p') pk[t] = cols;
    else (fks[t] ||= []).push({ colunas: cols, para: String(r.para).replace(/^.*\./, '').replace(/"/g, '') });
  }
  return { tabelas, colunas, pk, fks };
}

/* ordem que respeita as chaves estrangeiras (pai antes do filho); auto-referência é tratada na restauração */
function ordenar(tabelas, fks) {
  const feitas = new Set();
  const saida = [];
  const visitar = (t, pilha = new Set()) => {
    if (feitas.has(t) || pilha.has(t) || !tabelas.includes(t)) return;
    pilha.add(t);
    for (const f of fks[t] || []) if (f.para !== t) visitar(f.para, pilha);
    feitas.add(t);
    saida.push(t);
  };
  for (const t of tabelas) visitar(t);
  return saida;
}

const id = (nome) => '"' + String(nome).replace(/"/g, '""') + '"';

/* Escreve o backup em `saida` (stream). `deveParar()` interrompe se quem baixa desistiu. */
async function gerarBackup(db, saida, { deveParar = () => false } = {}) {
  const escreverTexto = (txt) => new Promise((ok, falha) => {
    if (deveParar()) return falha(new Error('backup interrompido'));
    if (saida.write(txt)) return ok();
    saida.once('drain', ok);
  });
  const escrever = (obj) => escreverTexto(JSON.stringify(obj) + '\n');
  return db.tx(async (t) => {
    if (db.tipo === 'postgres') await t.q('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const e = await estrutura(t.q);
    const tabelas = ordenar(e.tabelas.filter((x) => !FORA_DO_BACKUP.has(x)), e.fks);
    await escrever({ sistema: 'portal-myblue', versao_backup: 5, gerado_em: new Date().toISOString(), tabelas });
    const linhas = {};
    for (const tab of tabelas) {
      const cols = e.colunas[tab] || [];
      const binarias = cols.filter((c) => c.tipo === 'bytea').map((c) => c.nome);
      const chave = e.pk[tab] || cols.map((c) => c.nome);
      const lista = cols.map((c) => (binarias.includes(c.nome) ? `octet_length(${id(c.nome)}) AS ${id(c.nome)}` : id(c.nome))).join(', ');
      const ordem = chave.map(id).join(', ');
      linhas[tab] = 0;
      for (let pagina = 0; ; pagina++) {
        const { rows } = await t.q(`SELECT ${lista} FROM ${id(tab)} ORDER BY ${ordem} LIMIT ${LOTE} OFFSET ${pagina * LOTE}`);
        for (const r of rows) {
          if (tab === 'usuarios') delete r.senha_hash;
          // arquivos (BYTEA) saem em base64, lidos e escritos aos pedaços direto no arquivo
          const comArquivo = binarias.filter((b) => r[b] != null);
          const tamanhos = Object.fromEntries(comArquivo.map((b) => [b, Number(r[b])]));
          for (const b of comArquivo) delete r[b];
          if (!comArquivo.length) await escrever({ t: tab, r });
          else {
            const semArquivo = JSON.stringify(r);
            await escreverTexto(`{"t":${JSON.stringify(tab)},"r":${semArquivo.slice(0, -1)}`);
            const onde = chave.map((c, i) => `${id(c)} = $${i + 3}`).join(' AND ');
            for (const [i, b] of comArquivo.entries()) {
              await escreverTexto(`${semArquivo === '{}' && i === 0 ? '' : ','}${JSON.stringify(b)}:"`);
              for (let ini = 0; ini < tamanhos[b]; ini += PEDACO) {
                const p = await t.um(`SELECT substring(${id(b)} FROM $1 FOR $2) AS p FROM ${id(tab)} WHERE ${onde}`, [ini + 1, PEDACO, ...chave.map((c) => r[c])]);
                await escreverTexto(Buffer.from(p.p).toString('base64'));
              }
              await escreverTexto('"');
            }
            await escreverTexto('}}\n');
          }
          linhas[tab]++;
        }
        if (rows.length < LOTE) break;
      }
    }
    await escrever({ fim: true, linhas });
    return linhas;
  });
}

/* Lê um backup (.jsonl.gz, .jsonl ou o JSON antigo, versão 4) e entrega cada linha de tabela, na ordem. */
async function* lerBackup(fluxo) {
  // .gz ou texto: descobre pelos dois primeiros bytes
  const it = fluxo[Symbol.asyncIterator]();
  const primeiro = await it.next();
  if (primeiro.done) throw new Error('Arquivo vazio.');
  const inicio = Buffer.from(primeiro.value);
  async function* tudo() { yield inicio; for (let x = await it.next(); !x.done; x = await it.next()) yield x.value; }
  let texto = require('stream').Readable.from(tudo());
  if (inicio[0] === 0x1f && inicio[1] === 0x8b) texto = texto.pipe(zlib.createGunzip());

  const linhas = readline.createInterface({ input: texto, crlfDelay: Infinity });
  let cabecalho = null, fim = null, antigo = '';
  for await (const linha of linhas) {
    if (!linha.trim()) continue;
    if (!cabecalho) {
      if (!linha.startsWith('{"sistema"') || linha.includes('"tabelas":{')) { antigo += linha + '\n'; cabecalho = { antigo: true }; continue; }
      cabecalho = JSON.parse(linha);
      if (cabecalho.sistema !== 'portal-myblue') throw new Error('Este arquivo não é um backup do Portal MyBlue.');
      yield { cabecalho };
      continue;
    }
    if (cabecalho.antigo) { antigo += linha + '\n'; continue; }
    const o = JSON.parse(linha);
    if (o.fim) { fim = o; continue; }
    yield { tabela: o.t, linha: o.r };
  }
  if (cabecalho && cabecalho.antigo) {
    // versão 4: um JSON só, com { tabelas: { nome: [linhas] } }
    const j = JSON.parse(antigo);
    if (j.sistema !== 'portal-myblue') throw new Error('Este arquivo não é um backup do Portal MyBlue.');
    yield { cabecalho: { sistema: j.sistema, versao_backup: j.versao_backup, gerado_em: j.gerado_em, tabelas: Object.keys(j.tabelas) } };
    for (const [tab, lista] of Object.entries(j.tabelas)) for (const r of lista) yield { tabela: tab, linha: r };
    return;
  }
  if (!cabecalho) throw new Error('Arquivo vazio.');
  if (!fim) throw new Error('O arquivo de backup está incompleto (o download foi interrompido). Baixe de novo.');
  yield { fim };
}

/* Restaura um backup num banco cujo esquema já foi criado (db.abrir). Apaga o que houver nas tabelas do backup.
   Devolve { linhas: { tabela: n }, ignoradas: [colunas que não existem mais] }. */
async function restaurar(db, fluxo, { senhaBloqueada }) {
  return db.tx(async (t) => {
    const e = await estrutura(t.q);
    const ordem = ordenar(e.tabelas.filter((x) => !FORA_DO_BACKUP.has(x)), e.fks);
    const tipos = Object.fromEntries(e.tabelas.map((x) => [x, Object.fromEntries((e.colunas[x] || []).map((c) => [c.nome, c.tipo]))]));
    const linhas = {};
    const ignoradas = new Set();
    const depois = []; // auto-referências (ex.: usuarios.criado_por) gravadas no fim
    let cabecalho = null;
    // as linhas chegam na ordem do backup (pais antes dos filhos); o backup antigo não tinha ordem, então guarda e ordena
    const guardadas = {};
    const inserir = async (tab, r) => {
      const cols = tipos[tab];
      if (!cols) { ignoradas.add(tab); return; }
      if (tab === 'usuarios') { r.senha_hash = senhaBloqueada(); r.trocar_senha = true; }
      const auto = (e.fks[tab] || []).filter((f) => f.para === tab && f.colunas.length === 1).map((f) => f.colunas[0]);
      const nomes = [], valores = [];
      for (const [k, v] of Object.entries(r)) {
        if (!cols[k]) { ignoradas.add(`${tab}.${k}`); continue; }
        let x = v;
        if (x != null && cols[k] === 'bytea') x = Buffer.from(x, 'base64');
        else if (x != null && (cols[k] === 'json' || cols[k] === 'jsonb')) x = JSON.stringify(x);
        if (auto.includes(k) && x != null) { depois.push({ tab, col: k, valor: x, chave: (e.pk[tab] || []).map((c) => [c, r[c]]) }); x = null; }
        nomes.push(id(k)); valores.push(x);
      }
      await t.q(`INSERT INTO ${id(tab)} (${nomes.join(', ')}) VALUES (${valores.map((_, i) => '$' + (i + 1)).join(', ')})`, valores);
      linhas[tab] = (linhas[tab] || 0) + 1;
    };

    for await (const item of lerBackup(fluxo)) {
      if (item.cabecalho) {
        cabecalho = item.cabecalho;
        // esvazia as tabelas do portal (o esquema recém-criado já vem com setores e módulos do catálogo)
        await t.q(`TRUNCATE ${ordem.map(id).join(', ')} RESTART IDENTITY CASCADE`);
        // gatilhos (ex.: avisos da Análise de Espólio) não disparam ao regravar o que já existia
        for (const tab of ordem) await t.q(`ALTER TABLE ${id(tab)} DISABLE TRIGGER USER`);
        continue;
      }
      if (item.fim) continue;
      if (cabecalho.versao_backup >= 5) await inserir(item.tabela, item.linha);
      else (guardadas[item.tabela] ||= []).push(item.linha);
    }
    for (const tab of ordem) for (const r of guardadas[tab] || []) await inserir(tab, r);
    for (const tab of Object.keys(guardadas)) if (!ordem.includes(tab)) ignoradas.add(tab);
    for (const d of depois) {
      await t.q(`UPDATE ${id(d.tab)} SET ${id(d.col)} = $1 WHERE ${d.chave.map(([c], i) => `${id(c)} = $${i + 2}`).join(' AND ')}`, [d.valor, ...d.chave.map(([, v]) => v)]);
    }
    for (const tab of ordem) await t.q(`ALTER TABLE ${id(tab)} ENABLE TRIGGER USER`);
    // contadores (SERIAL) continuam de onde o backup parou
    for (const tab of ordem) {
      for (const c of e.colunas[tab] || []) {
        const seq = await t.um('SELECT pg_get_serial_sequence($1, $2) AS s', [tab, c.nome]);
        if (seq && seq.s) await t.q(`SELECT setval($1, GREATEST((SELECT COALESCE(MAX(${id(c.nome)}), 0) FROM ${id(tab)}), 1), (SELECT COUNT(*) > 0 FROM ${id(tab)}))`, [seq.s]);
      }
    }
    if (tipos.documentos) await t.q("SELECT setval('documentos_seq', GREATEST((SELECT COALESCE(MAX(seq), 0) FROM documentos), 1))");
    return { cabecalho, linhas, ignoradas: [...ignoradas] };
  });
}

module.exports = { gerarBackup, lerBackup, restaurar, FORA_DO_BACKUP };
