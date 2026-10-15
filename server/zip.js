'use strict';
/* Monta um .zip (deflate) sem dependências: criarZip([{ nome, dados: Buffer|string }]) → Buffer. */
const zlib = require('zlib');

function dataDos(d) {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const dia = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { hora, dia };
}

function criarZip(arquivos, quando = new Date()) {
  const locais = [], centrais = [];
  let pos = 0;
  const { hora, dia } = dataDos(quando);
  for (const a of arquivos) {
    const nome = Buffer.from(a.nome, 'utf8');
    const dados = Buffer.isBuffer(a.dados) ? a.dados : Buffer.from(String(a.dados), 'utf8');
    const comp = zlib.deflateRawSync(dados, { level: 9 });
    const crc = zlib.crc32(dados) >>> 0;
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x0800, 6); loc.writeUInt16LE(8, 8);
    loc.writeUInt16LE(hora, 10); loc.writeUInt16LE(dia, 12); loc.writeUInt32LE(crc, 14);
    loc.writeUInt32LE(comp.length, 18); loc.writeUInt32LE(dados.length, 22); loc.writeUInt16LE(nome.length, 26); loc.writeUInt16LE(0, 28);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(hora, 12); cen.writeUInt16LE(dia, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(dados.length, 24);
    cen.writeUInt16LE(nome.length, 28); cen.writeUInt32LE(pos, 42);
    locais.push(loc, nome, comp);
    centrais.push(cen, nome);
    pos += 30 + nome.length + comp.length;
  }
  const dir = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(arquivos.length, 8); fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(dir.length, 12); fim.writeUInt32LE(pos, 16);
  return Buffer.concat([...locais, dir, fim]);
}

module.exports = { criarZip };
