/* ═══════════════════════════════════════════════════════════════
   HÜPFABENTEUER — Cookie-Einwilligung + Google Consent Mode v2
   ───────────────────────────────────────────────────────────────
   Wird auf JEDER Seite als erstes Skript im <head> geladen:
     <script src="consent.js"></script>

   Was passiert:
   • Ohne Zustimmung wird NICHTS von Google oder Meta geladen.
   • gtag() und fbq() gibt es trotzdem sofort. Alle Aufrufe der
     Seite (Conversions, Klicks, Leads) werden gesammelt und erst
     nach "Alle akzeptieren" an Google/Meta geschickt — auf derselben
     Seite. Lehnt jemand ab, wird nichts gesendet.
   • Die Wahl wird 6 Monate gespeichert, danach wird neu gefragt.
   • hbCookies() öffnet das Banner wieder (Link in der Fußzeile).

   IDs: hier zentral ändern, nirgends sonst.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var GA_ID    = 'G-6KYW215PYR';
  var ADS_ID   = 'AW-17627141841';
  var PIXEL_ID = '1256236772328604';

  var KEY      = 'hb_consent_v2';
  var MAX_AGE  = 1000 * 60 * 60 * 24 * 182;   // ~6 Monate

  var w = window, d = document;

  /* ── Speicher (kann in privaten Fenstern werfen) ── */
  function lesen(){
    try{
      var raw = w.localStorage.getItem(KEY);
      if(!raw) return null;
      var v = JSON.parse(raw);
      if(!v || !v.t || (Date.now() - v.t) > MAX_AGE) return null;
      return v.c === 'all' || v.c === 'necessary' ? v.c : null;
    }catch(e){ return null; }
  }
  function speichern(c){
    try{ w.localStorage.setItem(KEY, JSON.stringify({c:c, t:Date.now()})); }catch(e){}
    try{ w.localStorage.removeItem('cookie_consent'); }catch(e){}   // alter Schlüssel
  }

  /* ── Warteschlangen bis zur Zustimmung ── */
  var gWarte = [], fWarte = [];
  var geladen = false;

  w.dataLayer = w.dataLayer || [];
  w.gtag = function(){ gWarte.push(arguments); };
  w.fbq  = function(){ fWarte.push(arguments); };

  function skript(src){
    var s = d.createElement('script');
    s.async = true; s.src = src;
    (d.head || d.documentElement).appendChild(s);
  }

  function freigeben(){
    if(geladen) return;
    geladen = true;

    /* Google: echte gtag-Funktion, Consent-Signale, dann gesammelte Aufrufe */
    w.gtag = function(){ w.dataLayer.push(arguments); };
    w.gtag('consent', 'default', {
      ad_storage:'denied', analytics_storage:'denied',
      ad_user_data:'denied', ad_personalization:'denied'
    });
    w.gtag('consent', 'update', {
      ad_storage:'granted', analytics_storage:'granted',
      ad_user_data:'granted', ad_personalization:'granted'
    });
    w.gtag('js', new Date());
    w.gtag('config', GA_ID);
    w.gtag('config', ADS_ID);
    for(var i = 0; i < gWarte.length; i++) w.dataLayer.push(gWarte[i]);
    gWarte = [];
    skript('https://www.googletagmanager.com/gtag/js?id=' + GA_ID);

    /* Meta Pixel: Standard-Stub, init, PageView, dann gesammelte Aufrufe */
    var n = w.fbq = function(){
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    w._fbq = n; n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    w.fbq('init', PIXEL_ID);
    w.fbq('track', 'PageView');
    for(var j = 0; j < fWarte.length; j++) n.apply(null, fWarte[j]);
    fWarte = [];
    skript('https://connect.facebook.net/en_US/fbevents.js');
  }

  /* ── Banner ── */
  var CSS =
    '#hb-cc{position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:560px;margin:0 auto;' +
    'background:#141418;color:#F5F0E6;border:1px solid rgba(245,240,230,.18);border-radius:10px;' +
    'box-shadow:0 18px 50px rgba(0,0,0,.45);padding:18px 18px 16px;font:15px/1.55 Karla,"Helvetica Neue",Arial,sans-serif;' +
    'transform:translateY(130%);transition:transform .35s cubic-bezier(.2,.9,.3,1);}' +
    '#hb-cc.on{transform:translateY(0);}' +
    '#hb-cc h2{all:unset;display:block;font:700 16px/1.3 Karla,"Helvetica Neue",Arial,sans-serif;margin:0 0 6px;color:#F5F0E6;}' +
    '#hb-cc p{margin:0 0 14px;color:#C9C4B8;font-size:14px;}' +
    '#hb-cc a{color:#E6C08A;text-decoration:underline;}' +
    '#hb-cc .hb-b{display:flex;gap:10px;}' +
    '#hb-cc button{flex:1;min-height:46px;border-radius:6px;font:700 14px Karla,"Helvetica Neue",Arial,sans-serif;cursor:pointer;' +
    'border:1px solid #C9954A;padding:10px 12px;}' +
    '#hb-cc .hb-ja{background:#C9954A;color:#16150F;}' +
    '#hb-cc .hb-nein{background:transparent;color:#F5F0E6;}' +
    '#hb-cc button:focus-visible{outline:2px solid #E6C08A;outline-offset:2px;}' +
    '@media(max-width:420px){#hb-cc .hb-b{flex-direction:column-reverse;}}' +
    '@media(prefers-reduced-motion:reduce){#hb-cc{transition:none;}}';

  var banner = null;

  function bauen(){
    if(banner) return banner;
    var st = d.createElement('style'); st.textContent = CSS; d.head.appendChild(st);
    banner = d.createElement('div');
    banner.id = 'hb-cc';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('aria-label', 'Cookie-Einstellungen');
    banner.innerHTML =
      '<h2>Kurz zu Cookies</h2>' +
      '<p>Mit deiner Zustimmung verwende ich Google Analytics, Google Ads und das Meta Pixel, ' +
      'um zu sehen, welche Werbung funktioniert. Ohne Zustimmung wird davon nichts geladen. ' +
      'Du kannst das jederzeit unten auf der Seite unter „Cookies“ ändern. ' +
      '<a href="datenschutz.html">Datenschutz</a></p>' +
      '<div class="hb-b">' +
        '<button type="button" class="hb-nein">Nur notwendige</button>' +
        '<button type="button" class="hb-ja">Alle akzeptieren</button>' +
      '</div>';
    d.body.appendChild(banner);
    banner.querySelector('.hb-ja').addEventListener('click', function(){
      speichern('all'); zu(); freigeben();
    });
    banner.querySelector('.hb-nein').addEventListener('click', function(){
      var warVorher = geladen;
      speichern('necessary'); zu();
      gWarte = []; fWarte = [];
      if(warVorher){ cookiesWeg(); w.location.reload(); }
    });
    return banner;
  }
  function auf(){
    var b = bauen();
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ b.classList.add('on'); }); });
  }
  function zu(){ if(banner) banner.classList.remove('on'); }

  /* Beim Widerruf Google-/Meta-Cookies der eigenen Domain löschen */
  function cookiesWeg(){
    var host = location.hostname.replace(/^www\./, '');
    d.cookie.split(';').forEach(function(c){
      var name = c.split('=')[0].trim();
      if(/^(_ga|_gid|_gcl|_fbp|_fbc)/.test(name)){
        ['', '; domain=' + host, '; domain=.' + host].forEach(function(dom){
          d.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + dom;
        });
      }
    });
  }

  w.hbCookies = function(){ auf(); return false; };

  /* ── Start ── */
  var wahl = lesen();
  if(wahl === 'all'){
    freigeben();
  } else if(wahl === null){
    if(d.readyState === 'loading') d.addEventListener('DOMContentLoaded', auf);
    else auf();
  }
})();
