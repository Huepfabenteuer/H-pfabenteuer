/* ═══════════════════════════════════════════════════════════════════════
   HÜPFABENTEUER — Anfragen-Verwaltung
   ───────────────────────────────────────────────────────────────────────
   Öffentlich:
     POST /.netlify/functions/anfrage  { action:"neu", daten:{…} }
          → speichert eine neue Anfrage (Status „ausstehend“)
     GET  /angebot/<id>/<token>
          → PDF-Angebot für den Kunden (nur mit geheimem Token)
     GET  /.netlify/functions/anfrage?verfuegbar=1
          → belegte Tage je Gerät { "2026-12-05": ["fotobox"] }
            (nur fixe Buchungen, ohne Namen oder Adressen)

   Nur für Alex (Header  x-admin-key: <ADMIN_KEY>):
     POST { action:"liste" }
     POST { action:"speichern",  id, patch:{…} }
     POST { action:"annehmen",   id }      → vergibt Angebots-Nr., Status „fix“
     POST { action:"ablehnen",   id }
     POST { action:"zuruecksetzen", id }   → wieder „ausstehend“
     POST { action:"archivieren", id }
     POST { action:"papierkorb", id }      → in den Papierkorb
     POST { action:"wiederherstellen", id }
     POST { action:"loeschen", id }        → endgültig (nur aus dem Papierkorb)
     POST { action:"bewertung", id, schritt:"angefragt"|"erinnert"|"erhalten"|"zuruecksetzen" }

   Braucht in Netlify die Umgebungsvariable ADMIN_KEY (dein Passwort für
   die Verwaltung). Gespeichert wird in Netlify Blobs („anfragen“).
   ═══════════════════════════════════════════════════════════════════════ */

import { FIRMA } from '../lib/firma.mjs';
import { saeubere, summen, waZusage, waAbsage, waNummer, datumKurz, waBewertung, waBewertungErinnerung, geraeteSchluessel, tageDerBuchung, istFix, empfehlungscode } from '../lib/anfrage-daten.mjs';
import { erstelleAngebotPdf } from '../lib/angebot-pdf.mjs';

const STORE = 'anfragen';
const PREFIX = 'a/';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
async function store() {
  const { getStore } = await import('@netlify/blobs');
  return getStore(STORE);
}
function zufall(n) {
  const z = 'abcdefghijkmnpqrstuvwxyz23456789';
  const b = new Uint8Array(n); crypto.getRandomValues(b);
  return Array.from(b, x => z[x % z.length]).join('');
}
function siteUrl(req) {
  return (process.env.URL || new URL(req.url).origin).replace(/\/$/, '');
}
function pdfLink(req, a) { return siteUrl(req) + '/angebot/' + a.id + '/' + (a.pdfToken || a.token); }

/* ── Gesendete Angebote einfrieren ──
   Jedes verschickte Angebot wird als eigene Fassung gespeichert (v/<id>/<token>).
   Der Link im WhatsApp-Chat zeigt immer genau diese Fassung, auch wenn die
   Anfrage danach geändert oder gelöscht wird. */
const VERS = 'v/';
const PDF_FELDER = ['positionen', 'anrede', 'anzahlung', 'empfehlung', 'kunde', 'adresse', 'datum', 'datumEnde', 'anlass'];
function pdfStand(a) { return JSON.stringify(PDF_FELDER.map(f => a[f] ?? null)); }
async function fassungSpeichern(st, a, token) {
  const t = token || zufall(20);
  const { versionen, ...rest } = a;
  await st.setJSON(VERS + a.id + '/' + t, { ...rest, gesendetAm: new Date().toISOString() });
  a.pdfToken = t;
  a.versionen = [...(a.versionen || []), { token: t, am: new Date().toISOString() }];
  a.geaendertNachVersand = false;
}

/* Für die Verwaltung: Eintrag + fertige Zusatzinfos */
function anreichern(req, a) {
  const s = summen(a);
  const out = { ...a, summen: s, waNummer: waNummer(a.kunde.telefon) };
  if (a.nr) { out.pdf = pdfLink(req, a); out.waText = waZusage(a, out.pdf); }
  out.waAbsage = waAbsage(a);
  out.waBewertung = waBewertung(a);
  out.waErinnerung = waBewertungErinnerung(a);
  out.erinnerungNachTagen = FIRMA.erinnerungNachTagen;
  return out;
}

/* Push aufs Handy über ntfy (App „ntfy“, Thema = NTFY_TOPIC) */
async function pushNeu(req, a) {
  const thema = process.env.NTFY_TOPIC;
  if (!thema) return;
  const s = summen(a);
  const prod = (a.positionen || []).filter(p => p.art === 'miete').map(p => p.titel).join(' + ') || (a.typ === 'foto' ? 'Fotobox' : 'Hüpfburg');
  const wer = ((a.kunde.vorname || '') + ' ' + (a.kunde.nachname || '')).trim();
  const zeilen = [
    prod + (a.datum ? ' · ' + datumKurz(a.datum) : ''),
    wer + (a.adresse.ort ? ', ' + a.adresse.ort : ''),
    s.gesamt ? 'Gesamt ca. ' + s.gesamt.toLocaleString('de-AT') + ' €' + (s.offen ? ' (Betrag fehlt noch)' : '') : ''
  ].filter(Boolean);
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 3500);
  try {
    await fetch((process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '') + '/', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: thema, title: 'Neue Anfrage', message: zeilen.join('\n'),
        tags: ['tada'], priority: 4, click: siteUrl(req) + '/verwaltung.html'
      })
    });
  } catch (e) { /* Push ist nur Zusatz – Anfrage ist schon gespeichert */ }
  finally { clearTimeout(t); }
}

function istAdmin(req) {
  const k = process.env.ADMIN_KEY;
  if (!k) return false;
  const h = req.headers.get('x-admin-key') || '';
  if (h.length !== k.length) return false;
  let diff = 0; for (let i = 0; i < k.length; i++) diff |= h.charCodeAt(i) ^ k.charCodeAt(i);
  return diff === 0;
}

/* ── Belegte Tage (öffentlich, nur Datum + Gerät, keine Kundendaten) ── */
const BELEGT = 'meta/belegt';
async function alleAnfragen(st) {
  const { blobs } = await st.list({ prefix: PREFIX });
  return (await Promise.all(blobs.map(b => st.get(b.key, { type: 'json' }).catch(() => null)))).filter(Boolean);
}
function heuteWien() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });
}
async function belegtNeuBerechnen(st, liste) {
  const heute = heuteWien();
  const tage = {};
  for (const a of (liste || await alleAnfragen(st))) {
    if (!istFix(a)) continue;
    const g = geraeteSchluessel(a);
    if (!g.length) continue;
    for (const t of tageDerBuchung(a)) {
      if (t < heute) continue;
      tage[t] = [...new Set([...(tage[t] || []), ...g])].sort();
    }
  }
  const daten = { stand: new Date().toISOString(), tage };
  try { await st.setJSON(BELEGT, daten); } catch (e) {}
  return daten;
}

async function naechsteNr(st) {
  let akt = null;
  try { akt = await st.get('meta/nr', { type: 'json' }); } catch (e) {}
  const nr = Math.max(Number(akt && akt.letzte) || 0, FIRMA.startNr - 1) + 1;
  await st.setJSON('meta/nr', { letzte: nr });
  return nr;
}

export default async (req, context) => {
  const url = new URL(req.url);

  /* ── PDF für den Kunden ── */
  const params = (context && context.params) || {};
  const pdfId = params.id || url.searchParams.get('pdf');
  const pdfToken = params.token || url.searchParams.get('t');
  if (req.method === 'GET' && pdfId) {
    try {
      const st = await store();
      const admin = istAdmin(req);
      const sicher = /^[a-z0-9]{4,40}$/;
      let a = null;
      if (pdfToken && sicher.test(pdfId) && sicher.test(pdfToken)) {
        try { a = await st.get(VERS + pdfId + '/' + pdfToken, { type: 'json' }); } catch (e) {}
      }
      if (!a) {
        const live = await st.get(PREFIX + pdfId, { type: 'json' });
        if (live && pdfToken && pdfToken === live.token && live.nr) {
          /* Ältere Angebote ohne Fassung: jetzt einfrieren */
          await st.setJSON(VERS + live.id + '/' + live.token, { ...live, gesendetAm: live.angenommenAm || new Date().toISOString() });
          a = live;
        } else if (live && admin && !pdfToken) a = live;   /* Entwurf für Alex */
      }
      if (!a || (!a.nr && !admin)) {
        return new Response('Angebot nicht gefunden.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
      const bytes = await erstelleAngebotPdf(a);
      const name = (datumKurz(a.angenommenAm || a.erstellt).split('.').reverse().join('-')) + '_Angebot_Nr' + (a.nr || 'Entwurf') + '_' + (a.kunde.nachname || a.kunde.vorname || 'Kunde').replace(/[^A-Za-z0-9ÄÖÜäöüß-]/g, '') + '.pdf';
      return new Response(bytes, {
        status: 200,
        headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="' + name.replace(/[^\x20-\x7E]/g, '') + '"', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
      });
    } catch (e) {
      return new Response('Das Angebot konnte gerade nicht erstellt werden.', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  }

  /* ── Belegte Tage für die Formulare (öffentlich) ── */
  if (req.method === 'GET' && url.searchParams.has('verfuegbar')) {
    try {
      const st = await store();
      let b = null;
      try { b = await st.get(BELEGT, { type: 'json' }); } catch (e) {}
      if (!b || Date.now() - new Date(b.stand).getTime() > 6 * 3600 * 1000) b = await belegtNeuBerechnen(st);
      const heute = heuteWien();
      const tage = Object.fromEntries(Object.entries(b.tage || {}).filter(([t]) => t >= heute));
      return new Response(JSON.stringify({ ok: true, tage }), {
        status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' }
      });
    } catch (e) { return json({ ok: false, tage: {} }, 200); }
  }

  if (req.method !== 'POST') return json({ ok: false, grund: 'methode' }, 405);

  let body;
  try {
    const roh = await req.text();
    if (roh.length > 30000) return json({ ok: false, grund: 'zu-gross' }, 413);
    body = JSON.parse(roh || '{}');
  } catch (e) { return json({ ok: false, grund: 'json' }, 400); }

  let st;
  try { st = await store(); } catch (e) { return json({ ok: false, grund: 'speicher' }, 503); }

  /* ── Neue Anfrage (öffentlich) ── */
  if (body.action === 'neu') {
    const daten = saeubere(body.daten);
    if (!daten.kunde.vorname && !daten.kunde.nachname) return json({ ok: false, grund: 'name' }, 400);
    if (!daten.kunde.telefon) return json({ ok: false, grund: 'telefon' }, 400);
    const id = Date.now().toString(36) + zufall(4);
    const eintrag = {
      id, token: zufall(20), erstellt: new Date().toISOString(),
      status: 'ausstehend', nr: null, anrede: '', notiz: '', anzahlung: null,
      ...daten
    };
    await st.setJSON(PREFIX + id, eintrag);
    await pushNeu(req, eintrag);
    return json({ ok: true, id });
  }

  /* ── Ab hier nur mit Passwort ── */
  if (!istAdmin(req)) return json({ ok: false, grund: process.env.ADMIN_KEY ? 'passwort' : 'kein-admin-key' }, 401);

  if (body.action === 'liste') {
    const alle = await alleAnfragen(st);
    await belegtNeuBerechnen(st, alle);
    return json({ ok: true, anfragen: alle.map(a => anreichern(req, a)) });
  }

  const id = String(body.id || '');
  const a = id ? await st.get(PREFIX + id, { type: 'json' }) : null;
  if (!a) return json({ ok: false, grund: 'nicht-gefunden' }, 404);

  if (body.action === 'speichern') {
    const p = body.patch || {};
    const sauber = saeubere({ ...a, ...p, kunde: { ...a.kunde, ...(p.kunde || {}) }, adresse: { ...a.adresse, ...(p.adresse || {}) } });
    const neu = { ...a, ...sauber };
    if ('anrede' in p) neu.anrede = ['herr', 'frau', ''].includes(p.anrede) ? p.anrede : '';
    if ('notiz' in p) neu.notiz = String(p.notiz || '').slice(0, 2000);
    if ('empfehlung' in p) {
      const aktiv = !!(p.empfehlung && p.empfehlung.aktiv);
      neu.empfehlung = { aktiv, code: (a.empfehlung && a.empfehlung.code) || (aktiv ? empfehlungscode(neu.kunde.nachname, neu.kunde.vorname) : '') };
    }
    if ('anzahlung' in p) neu.anzahlung = (p.anzahlung === '' || p.anzahlung == null || isNaN(Number(p.anzahlung))) ? null : Math.round(Number(p.anzahlung) * 100) / 100;
    neu.geaendert = new Date().toISOString();
    if (neu.status === 'fix' && neu.pdfToken && pdfStand(neu) !== pdfStand(a)) neu.geaendertNachVersand = true;
    await st.setJSON(PREFIX + id, neu);
    await belegtNeuBerechnen(st);
    return json({ ok: true, anfrage: anreichern(req, neu) });
  }

  if (body.action === 'annehmen') {
    if (!a.nr) a.nr = await naechsteNr(st);
    a.status = 'fix';
    a.angenommenAm = a.angenommenAm || new Date().toISOString();
    if (!a.pdfToken) await fassungSpeichern(st, a);
    await st.setJSON(PREFIX + id, a);
    await belegtNeuBerechnen(st);
    return json({ ok: true, anfrage: anreichern(req, a) });
  }
  if (['ablehnen', 'zuruecksetzen', 'archivieren', 'papierkorb', 'wiederherstellen'].includes(body.action)) {
    if (body.action === 'archivieren' || body.action === 'papierkorb') {
      if (a.status !== 'archiv' && a.status !== 'papierkorb') a.vorherStatus = a.status;
    }
    a.status = {
      ablehnen: 'abgelehnt', zuruecksetzen: 'ausstehend', archivieren: 'archiv', papierkorb: 'papierkorb',
      wiederherstellen: (a.vorherStatus && a.vorherStatus !== 'papierkorb' && a.vorherStatus !== 'archiv') ? a.vorherStatus : 'ausstehend'
    }[body.action];
    if (body.action === 'papierkorb') a.geloeschtAm = new Date().toISOString();
    if (body.action === 'wiederherstellen') delete a.geloeschtAm;
    a.geaendert = new Date().toISOString();
    await st.setJSON(PREFIX + id, a);
    await belegtNeuBerechnen(st);
    return json({ ok: true, anfrage: anreichern(req, a) });
  }

  /* Google-Bewertung nach dem Fest */
  if (body.action === 'bewertung') {
    const b = a.bewertung || {};
    const jetzt = new Date().toISOString();
    if (body.schritt === 'angefragt') b.angefragtAm = b.angefragtAm || jetzt;
    else if (body.schritt === 'erinnert') b.erinnertAm = jetzt;
    else if (body.schritt === 'erhalten') b.erhalten = true;
    else if (body.schritt === 'zuruecksetzen') { delete b.erhalten; delete b.angefragtAm; delete b.erinnertAm; }
    else return json({ ok: false, grund: 'schritt' }, 400);
    a.bewertung = b;
    await st.setJSON(PREFIX + id, a);
    return json({ ok: true, anfrage: anreichern(req, a) });
  }

  /* Geändertes Angebot neu senden: neue Fassung, neuer Link (alter bleibt gültig) */
  if (body.action === 'neueFassung') {
    if (a.status !== 'fix') return json({ ok: false, grund: 'nicht-fix' }, 400);
    await fassungSpeichern(st, a);
    await st.setJSON(PREFIX + id, a);
    return json({ ok: true, anfrage: anreichern(req, a) });
  }

  /* Endgültig löschen – nur was schon im Papierkorb liegt */
  if (body.action === 'loeschen') {
    if (a.status !== 'papierkorb') return json({ ok: false, grund: 'erst-papierkorb' }, 400);
    await st.delete(PREFIX + id);
    await belegtNeuBerechnen(st);
    return json({ ok: true, geloescht: id });
  }

  return json({ ok: false, grund: 'aktion' }, 400);
};

export const config = { path: ['/.netlify/functions/anfrage', '/angebot/:id/:token'] };
