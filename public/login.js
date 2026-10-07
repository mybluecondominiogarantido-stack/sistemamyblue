(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var senhaDigitada = '';

  /* botão de olho: mostra/oculta a senha digitada */
  var OLHO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var OLHO_FECHADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 5c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>';
  Array.prototype.forEach.call(document.querySelectorAll('.ver-senha'), function (bt) {
    var campo = document.getElementById(bt.getAttribute('data-alvo'));
    function desenhar() {
      var visivel = campo.type === 'text';
      bt.innerHTML = visivel ? OLHO_FECHADO : OLHO;
      bt.setAttribute('aria-label', visivel ? 'Ocultar senha' : 'Mostrar senha');
      bt.title = visivel ? 'Ocultar senha' : 'Mostrar senha';
      bt.setAttribute('aria-pressed', String(visivel));
    }
    bt.addEventListener('click', function () { campo.type = campo.type === 'password' ? 'text' : 'password'; desenhar(); campo.focus(); });
    desenhar();
  });

  function mostrar(el, texto) { el.textContent = texto; el.hidden = !texto; }

  function destino() {
    var v = new URLSearchParams(location.search).get('volta') || '/';
    return v.charAt(0) === '/' && v.charAt(1) !== '/' ? v : '/';
  }

  async function enviar(url, corpo) {
    var r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), credentials: 'same-origin' });
    var j = {};
    try { j = await r.json(); } catch (e) { /* sem corpo */ }
    if (!r.ok) throw new Error(j.erro || 'Não foi possível concluir. Tente de novo.');
    return j;
  }

  $('#fLogin').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    mostrar($('#msg'), '');
    var bt = $('#btEntrar');
    bt.disabled = true; bt.textContent = 'Entrando…';
    try {
      senhaDigitada = $('#senha').value;
      var j = await enviar('/api/auth/login', { email: $('#email').value, senha: senhaDigitada });
      if (j.usuario.trocar_senha) {
        $('#fLogin').hidden = true; $('#fTroca').hidden = false; $('#nova').focus();
      } else {
        location.href = destino();
      }
    } catch (e) {
      mostrar($('#msg'), e.message);
    } finally {
      bt.disabled = false; bt.textContent = 'Entrar';
    }
  });

  $('#fTroca').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    mostrar($('#msg2'), '');
    if ($('#nova').value !== $('#nova2').value) return mostrar($('#msg2'), 'As senhas não conferem.');
    try {
      await enviar('/api/auth/senha', { atual: senhaDigitada, nova: $('#nova').value });
      location.href = destino();
    } catch (e) {
      mostrar($('#msg2'), e.message);
    }
  });

  // já está logado? vai direto
  fetch('/api/auth/eu', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (j && j.usuario && !j.usuario.trocar_senha) location.href = destino();
  }).catch(function () {});
})();
