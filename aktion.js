/* ═══════════════════════════════════════════════════════════════════════
   HÜPFABENTEUER — Aktion „Start in den Winter“
   −15 % auf alle Fotobox-Pakete bis einschließlich 15.11.2026.
   Endet automatisch: Ab 16.11. zeigt die Seite wieder die normalen Preise.
   Für eine neue Aktion nur AKTION unten anpassen.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  var AKTION = {
    name: 'Start-in-den-Winter-Rabatt',
    kurz: 'Start in den Winter',
    prozent: 15,
    bis: '2026-11-15',           // letzter Tag (Wiener Zeit)
    bisText: '15. November'
  };

  function heute() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' }); }
  function aktiv() {
    try { if (new URLSearchParams(location.search).get('aktion') === 'aus') return false; } catch (e) {}
    return heute() <= AKTION.bis;
  }
  /* Abgerundet, damit es immer mindestens 15 % sind: 199 → 169, 299 → 254, 349 → 296 */
  function neu(p) { p = Number(p) || 0; return aktiv() && p > 0 ? Math.floor(p * (100 - AKTION.prozent) / 100) : p; }
  function rabatt(p) { return (Number(p) || 0) - neu(p); }
  function tageNoch() {
    var a = new Date(heute() + 'T12:00:00Z'), b = new Date(AKTION.bis + 'T12:00:00Z');
    return Math.round((b - a) / 864e5);
  }

  window.hbAktion = {
    info: AKTION, aktiv: aktiv, neu: neu, rabatt: rabatt, tageNoch: tageNoch,
    /* Text für die Anfrage: „299 € statt …“ */
    preisText: function (p) { return aktiv() ? neu(p) + ' € statt ' + p + ' €' : p + ' €'; },
    position: function (p) {
      var r = rabatt(p);
      return r > 0 ? { art: 'rabatt', titel: AKTION.name + ' (−' + AKTION.prozent + '\u00A0%)', text: 'Aktion bis ' + AKTION.bisText + ' auf alle Fotobox-Pakete', betrag: -r } : null;
    }
  };
  if (!aktiv()) return;

  var CSS = '' +
    '.ak-band{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;padding:10px 16px;background:#0B6B6F;color:#fff;font-family:"Karla","Helvetica Neue",Arial,sans-serif;font-size:.92rem;line-height:1.35;text-align:center;text-decoration:none;position:relative;z-index:5}' +
    '.ak-band b{font-weight:800}' +
    '.ak-band .ak-pill{background:#fff;color:#0B6B6F;font-weight:800;border-radius:999px;padding:3px 10px;font-size:.82rem;white-space:nowrap}' +
    '.ak-band .ak-zeit{opacity:.9;white-space:nowrap}' +
    '.ak-alt{text-decoration:line-through;text-decoration-thickness:1.5px;opacity:.55;font-weight:400;margin-right:6px;font-size:.82em}' +
    '.ak-neu{color:#C2410C;font-weight:800;white-space:nowrap}' +
    '.pw-p .ak-alt,.foto-price .ak-alt,.ov-p .ak-alt{display:block;margin:0 0 1px;font-size:.62em;line-height:1.2}' +
    '.ak-tag{display:inline-block;margin-left:6px;background:#C2410C;color:#fff;font-size:.62rem;font-weight:800;letter-spacing:.04em;border-radius:999px;padding:2px 7px;vertical-align:middle;white-space:nowrap}' +
    '.ak-box{display:flex;gap:12px;align-items:flex-start;margin:0 0 18px;padding:14px 16px;border-radius:12px;border:1.5px solid #C2410C;background:rgba(194,65,12,.07);font-size:.95rem;line-height:1.45}' +
    '.ak-box .ak-i{font-size:1.35rem;line-height:1}' +
    '.ak-box b{font-weight:800}';

  function zeitText() {
    var t = tageNoch();
    return t <= 0 ? 'nur noch heute' : (t === 1 ? 'nur noch bis morgen' : 'nur noch ' + t + ' Tage');
  }

  /* „199 €“ in einem Element durch durchgestrichenen + neuen Preis ersetzen */
  function deko(el) {
    if (!el || el.getAttribute('data-ak')) return;
    var m = /(\d{3})\s*€/.exec(el.textContent);
    if (!m) return;
    var p = +m[1]; if ([199, 299, 349].indexOf(p) === -1) return;
    el.setAttribute('data-ak', '1');
    el.innerHTML = el.innerHTML.replace(new RegExp(p + '(\\s|&nbsp;)*€'), '<span class="ak-alt">' + p + ' €</span><span class="ak-neu">' + neu(p) + ' €</span>');
  }

  function los() {
    var s = document.createElement('style'); s.id = 'aktion-css'; s.textContent = CSS; document.head.appendChild(s);

    /* Band ganz oben */
    var band = document.createElement('a');
    band.className = 'ak-band'; band.href = (location.pathname.indexOf('fotobox') !== -1 && document.getElementById('pakete')) ? '#pakete' : 'fotobox.html#pakete';
    band.innerHTML = '<span class="ak-pill">−' + AKTION.prozent + '\u00A0%</span><span>❄️ <b>' + AKTION.kurz + ':</b> ' + AKTION.prozent + '\u00A0% auf alle Fotobox-Pakete</span><span class="ak-zeit">· ' + zeitText() + ', bis ' + AKTION.bisText + '</span>';
    var top = document.querySelector('.topbar');
    if (top && top.parentNode) top.parentNode.insertBefore(band, top.nextSibling); else document.body.insertBefore(band, document.body.firstChild);

    /* Preise auf der Seite */
    ['.pw-p', '.opt-p', '.pw-head b', '.ov-p', '.tier-p', '.fbx-prices b', '.foto-price'].forEach(function (sel) {
      [].forEach.call(document.querySelectorAll(sel), deko);
    });
    [].forEach.call(document.querySelectorAll('.pw-tab'), function (t) {
      if (t.querySelector('.ak-tag')) return;
      var n = t.querySelector('.pw-n'); if (n) n.insertAdjacentHTML('beforeend', '<span class="ak-tag">−' + AKTION.prozent + '\u00A0%</span>');
    });
    /* „ab 199 €“ in Eckdaten und Hero */
    [].forEach.call(document.querySelectorAll('.hero-meta span, .fact'), function (el) {
      if (/199/.test(el.textContent) && !el.getAttribute('data-ak')) {
        el.setAttribute('data-ak', '1');
        el.innerHTML = el.innerHTML.replace(/199(<span class="u">)?(\s|&nbsp;)*€(<\/span>)?/, '<span class="ak-alt">199 €</span><span class="ak-neu">' + neu(199) + ' €</span>');
      }
    });

    /* Hinweis über dem Anfrageformular */
    var kopf = document.querySelector('#fotobox-form .form-head');
    if (kopf && !document.querySelector('.ak-box')) {
      kopf.insertAdjacentHTML('beforeend', '<div class="ak-box"><span class="ak-i" aria-hidden="true">❄️</span><span><b>' + AKTION.name + ': −' + AKTION.prozent + '\u00A0% auf alle Pakete.</b> Gilt für alle Anfragen, die bis ' + AKTION.bisText + ' bei uns eingehen. ' + zeitText().replace(/^n/, 'N') + '.</span></div>');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', los); else los();
})();
