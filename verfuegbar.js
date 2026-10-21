/* ═══════════════════════════════════════════════════════════════════════
   HÜPFABENTEUER — Termin frei? (Anzeige im Anfrageformular)
   Holt die fix gebuchten Tage aus der Verwaltung (nur Datum + Gerät)
   und zeigt unter dem Datumsfeld, ob der Termin noch frei ist.

   hbFrei.watch({
     datum:   Element oder ID des Datumsfelds,
     ende:    (optional) Enddatum-Feld,
     geraet:  function () { return 'fotobox' | 'alienburg' | ['…'] | null },
     name:    function () { return 'die Fotobox' | 'die Alienburg' }
   })
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  var URL_ = '/.netlify/functions/anfrage?verfuegbar=1';
  var TAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var daten = null, laden = null;

  function holen() {
    if (daten) return Promise.resolve(daten);
    if (laden) return laden;
    laden = fetch(URL_, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { tage: {} }; })
      .then(function (j) { daten = (j && j.tage) || {}; return daten; })
      .catch(function () { daten = null; laden = null; return null; });
    return laden;
  }

  function d(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) : null; }
  function iso(x) { return x.toISOString().slice(0, 10); }
  function plus(x, n) { var y = new Date(x); y.setUTCDate(y.getUTCDate() + n); return y; }
  function kurz(x) { return TAGE[x.getUTCDay()] + ', ' + ('0' + x.getUTCDate()).slice(-2) + '.' + ('0' + (x.getUTCMonth() + 1)).slice(-2) + '.'; }
  function heute() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' }); }
  function istWE(x) { var w = x.getUTCDay(); return w === 5 || w === 6 || w === 0; }
  function liste(g) { return g == null ? [] : (Array.isArray(g) ? g : [g]).filter(Boolean); }
  function belegt(tag, geraete) {
    var b = (daten && daten[tag]) || [];
    return geraete.some(function (g) { return b.indexOf(g) !== -1; });
  }
  /* Freitag–Sonntag zum gewählten Tag */
  function wochenende(x) {
    var w = x.getUTCDay(), fr = plus(x, w === 0 ? -2 : 5 - w);
    return [fr, plus(fr, 1), plus(fr, 2)];
  }

  var CSS = '.hb-frei{margin-top:8px;padding:10px 12px;border-radius:10px;font-size:.88rem;line-height:1.45;display:none}' +
    '.hb-frei.on{display:block}' +
    '.hb-frei.ok{background:rgba(31,122,77,.10);border:1px solid rgba(31,122,77,.35);color:#1A4D33}' +
    '.hb-frei.weg{background:rgba(180,60,40,.08);border:1px solid rgba(180,60,40,.35);color:#6B2418}' +
    '.hb-frei b{font-weight:800}' +
    '.hb-frei button{margin:6px 6px 0 0;font:inherit;font-weight:700;font-size:.84rem;padding:6px 11px;border-radius:999px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer}';
  function stil() {
    if (document.getElementById('hb-frei-css')) return;
    var s = document.createElement('style'); s.id = 'hb-frei-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  function watch(o) {
    var feld = typeof o.datum === 'string' ? document.getElementById(o.datum) : o.datum;
    if (!feld) return;
    var ende = o.ende ? (typeof o.ende === 'string' ? document.getElementById(o.ende) : o.ende) : null;
    stil();
    var box = document.createElement('div');
    box.className = 'hb-frei'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
    (feld.closest('.f') || feld.parentNode).appendChild(box);

    function zeigen(cls, html) { box.className = 'hb-frei on ' + cls; box.innerHTML = html; }
    function aus() { box.className = 'hb-frei'; box.innerHTML = ''; }

    function pruefen() {
      var start = d(feld.value);
      var geraete = liste(o.geraet && o.geraet());
      if (!start || feld.value < heute() || !geraete.length) { aus(); return; }
      holen().then(function (b) {
        if (!b) { aus(); return; }
        var bis = ende && d(ende.value) && ende.value >= feld.value ? d(ende.value) : start;
        var tage = []; for (var x = new Date(start); x <= bis && tage.length < 14; x = plus(x, 1)) tage.push(new Date(x));
        var weg = tage.filter(function (t) { return belegt(iso(t), geraete); });
        var name = (o.name && o.name()) || 'unser Angebot';

        if (!weg.length) {
          zeigen('ok', istWE(start)
            ? '✓ <b>Dein Termin ist noch frei.</b> Freitage und Samstage sind am gefragtesten, sichere ihn dir jetzt.'
            : '✓ <b>Dein Termin ist noch frei.</b> Schick die Anfrage ab, dann bekommst du gleich dein Angebot.');
          return;
        }

        /* Belegt: freie Tage am selben Wochenende vorschlagen, sonst das nächste freie Wochenende */
        var vorschlag = [];
        if (tage.length === 1) {
          wochenende(start).forEach(function (t) {
            var k = iso(t);
            if (k !== feld.value && k >= heute() && !belegt(k, geraete)) vorschlag.push(t);
          });
          if (!vorschlag.length) {
            for (var w = 1; w <= 12 && !vorschlag.length; w++) {
              wochenende(plus(start, 7 * w)).forEach(function (t) {
                if (!vorschlag.length && t.getUTCDay() === start.getUTCDay() && !belegt(iso(t), geraete)) vorschlag.push(t);
              });
            }
          }
        }
        var txt = '✕ <b>' + (tage.length === 1 ? 'Am ' + kurz(start) : 'In diesem Zeitraum') + ' ist ' + name + ' leider schon vergeben.</b>';
        if (vorschlag.length) {
          txt += ' ' + (istWE(vorschlag[0]) && Math.abs(vorschlag[0] - start) < 3 * 864e5 ? 'Am selben Wochenende noch frei:' : 'Noch frei:');
          txt += '<br>' + vorschlag.map(function (t) { return '<button type="button" data-tag="' + iso(t) + '">' + kurz(t) + ' wählen</button>'; }).join('');
        } else {
          txt += ' Schick die Anfrage trotzdem ab, ich schau, was sich machen lässt.';
        }
        zeigen('weg', txt);
        [].forEach.call(box.querySelectorAll('button[data-tag]'), function (bt) {
          bt.onclick = function () {
            feld.value = bt.getAttribute('data-tag');
            feld.dispatchEvent(new Event('input', { bubbles: true }));
            feld.dispatchEvent(new Event('change', { bubbles: true }));
          };
        });
      });
    }
    feld.addEventListener('change', pruefen);
    feld.addEventListener('input', pruefen);
    if (ende) { ende.addEventListener('change', pruefen); ende.addEventListener('input', pruefen); }
    if (o.ausloeser) [].forEach.call(document.querySelectorAll(o.ausloeser), function (el) { el.addEventListener('click', function () { setTimeout(pruefen, 30); }); });
    if (feld.value) pruefen();
    holen();
    return { pruefen: pruefen };
  }

  window.hbFrei = { watch: watch };
})();
