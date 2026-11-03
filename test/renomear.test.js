'use strict';
/* Testes dos nomes trocados nas ferramentas (node --test): as sugestões de abas tiradas do HTML. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { textosDoHtml } = require('../server/modulos');

test('sugere o texto de botões, role="tab" e classes de aba, uma a uma', () => {
  const html = '<nav class="tabs"><button class="tab on"><svg><path d="M1"/></svg>+ Novo recibo</button><button>Recibos</button>' +
    '<a role="tab" href="#r">Resultados</a></nav><span class="aba-x">Pedidos &amp; compras</span>';
  assert.deepEqual(textosDoHtml(html), ['Novo recibo', 'Pedidos & compras', 'Recibos', 'Resultados']);
});

test('deixa de fora tabelas, textos longos, código e expressões de template', () => {
  const html = '<div class="table">Linha</div><button>${nome}</button><button>' + 'x'.repeat(50) + '</button>' +
    '<button onclick="a()">x = 1;</button><button>OK</button>';
  assert.deepEqual(textosDoHtml(html), ['OK']);
});

test('sem HTML não sugere nada', () => {
  assert.deepEqual(textosDoHtml(null), []);
});
