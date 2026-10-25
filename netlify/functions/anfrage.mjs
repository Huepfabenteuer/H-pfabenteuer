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
     POST { action:"fahrten", id, fahrten:{ liefer, abhol, km } }   → Fahrtenbuch
     POST { action:"fahrtenListe" | "fahrtSpeichern" | "fahrtLoeschen" }   → einzelne Fahrten
     POST { action:"neueFassung", id }   → geändertes Angebot neu senden

   Braucht in Netlify die Umgebungsvariable ADMIN_KEY (dein Passwort für
   die Verwaltung). Gespeichert wird in Netlify Blobs („anfragen“).
   ═══════════════════════════════════════════════════════════════════════ */

import { FIRMA } from '../lib/firma.mjs';
import { saeubere, summen, waZusage, waAbsage, waNummer, datumKurz, waBewertung, waBewertungErinnerung, geraeteSchluessel, tageDerBuchung, istFix, empfehlungscode, waAnzahlung, KATALOG_STANDARD, saeubereKatalog, fristDatum } from '../lib/anfrage-daten.mjs';
import { erstelleAngebotPdf } from '../lib/angebot-pdf.mjs';
import { FAHRTEN_ALT, FAHRTEN_ALT_VERSION } from '../lib/fahrten-alt.mjs';

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
  const am = (a.rueckdatiert && !(a.versionen || []).length && a.angenommenAm) ? a.angenommenAm : new Date().toISOString();
  await st.setJSON(VERS + a.id + '/' + t, { ...rest, gesendetAm: am });
  a.pdfToken = t;
  a.versionen = [...(a.versionen || []), { token: t, am }];
  a.geaendertNachVersand = false;
}

/* Für die Verwaltung: Eintrag + fertige Zusatzinfos */
function anreichern(req, a) {
  const s = summen(a);
  const out = { ...a, summen: s, waNummer: waNummer(a.kunde.telefon) };
  if (a.nr) { out.pdf = pdfLink(req, a); out.waText = waZusage(a, out.pdf); }
  out.waAbsage = waAbsage(a);
  out.waAnzahlung = waAnzahlung(a);
  out.anzahlungFrist = fristDatum(a.datum);
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

  /* ── Angebote & Preise (öffentlich lesbar) ── */
  if (req.method === 'GET' && url.searchParams.has('katalog')) {
    try {
      const st = await store();
      let k = null; try { k = await st.get('meta/katalog', { type: 'json' }); } catch (e) {}
      return new Response(JSON.stringify({ ok: true, katalog: (k && k.liste) || KATALOG_STANDARD, stand: (k && k.stand) || null }), {
        status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' }
      });
    } catch (e) { return json({ ok: true, katalog: KATALOG_STANDARD }, 200); }
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
    if (roh.length > (istAdmin(req) ? 800000 : 30000)) return json({ ok: false, grund: 'zu-gross' }, 413);
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

  /* ── Fahrtenbuch: einzelne Fahrten (unabhängig von Anfragen) ── */
  if (body.action === 'fahrtenListe') {
    let imp = null; try { imp = await st.get('meta/fahrtenImport', { type: 'json' }); } catch (e) {}
    if (!imp || imp.version !== FAHRTEN_ALT_VERSION) {
      /* Ältere Import-Stände ersetzen (nur unveränderte Import-Einträge) */
      if (imp) {
        const { blobs: alt } = await st.list({ prefix: 'f/imp' });
        for (const b of alt) {
          const x = await st.get(b.key, { type: 'json' }).catch(() => null);
          if (x && !x.geaendert) await st.delete(b.key);
        }
      }
      for (const f of FAHRTEN_ALT) {
        const da = await st.get('f/' + f.id, { type: 'json' }).catch(() => null);
        if (!da) await st.setJSON('f/' + f.id, { ...f, angelegt: new Date().toISOString() });
      }
      await st.setJSON('meta/fahrtenImport', { am: new Date().toISOString(), anzahl: FAHRTEN_ALT.length, version: FAHRTEN_ALT_VERSION });
    }
    const { blobs } = await st.list({ prefix: 'f/' });
    const fahrten = (await Promise.all(blobs.map(b => st.get(b.key, { type: 'json' }).catch(() => null)))).filter(Boolean);
    return json({ ok: true, fahrten });
  }
  if (body.action === 'fahrtSpeichern' || body.action === 'fahrtenBatch') {
    const zeit = v => /^\d{2}:\d{2}$/.test(v || '') ? v : '';
    const zahl = v => (v === '' || v == null || !isFinite(Number(v))) ? null : Math.round(Number(v) * 10) / 10;
    const t = s => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim();
    const liste = body.action === 'fahrtenBatch' ? (Array.isArray(body.fahrten) ? body.fahrten.slice(0, 400) : []) : [body.fahrt || {}];
    if (!liste.length) return json({ ok: false, grund: 'leer' }, 400);
    if (liste.some(f => !/^\d{4}-\d{2}-\d{2}$/.test((f && f.datum) || ''))) return json({ ok: false, grund: 'datum' }, 400);
    const eine = async f => {
      const fid = /^[a-z0-9]{4,40}$/.test(f.id || '') ? f.id : 'm' + Date.now().toString(36) + zufall(4);
      const alt = await st.get('f/' + fid, { type: 'json' }).catch(() => null);
      const neu = {
        id: fid, datum: f.datum, ab: zeit(f.ab), an: zeit(f.an),
        von: t(f.von).slice(0, 80), nach: t(f.nach).slice(0, 80), zweck: t(f.zweck).slice(0, 120),
        kmA: zahl(f.kmA), kmE: zahl(f.kmE), km: zahl(f.km) || 0, privat: zahl(f.privat) || 0,
        fz: t(f.fz).slice(0, 40), rechnung: t(f.rechnung).slice(0, 30), kmAngebot: zahl(f.kmAngebot), anfrage: /^[A-Za-z0-9_-]{1,40}$/.test(f.anfrage || '') ? f.anfrage : '', quelle: (alt && alt.quelle) || 'Verwaltung',
        angelegt: (alt && alt.angelegt) || new Date().toISOString()
      };
      if (alt) {
        const { verlauf, ...vorher } = alt;
        neu.verlauf = [...(verlauf || []), { am: new Date().toISOString(), vorher }].slice(-20);
        neu.geaendert = new Date().toISOString();
      }
      await st.setJSON('f/' + fid, neu);
      return neu;
    };
    const gespeichert = [];
    for (let i = 0; i < liste.length; i += 20) gespeichert.push(...await Promise.all(liste.slice(i, i + 20).map(eine)));
    return json({ ok: true, fahrt: gespeichert[0], fahrten: gespeichert });
  }
  if (body.action === 'fahrtLoeschen') {
    const fid = String(body.id || '');
    if (!/^[a-z0-9]{4,40}$/.test(fid)) return json({ ok: false, grund: 'id' }, 400);
    await st.delete('f/' + fid);
    return json({ ok: true });
  }

  if (body.action === 'katalog') {
    let k = null; try { k = await st.get('meta/katalog', { type: 'json' }); } catch (e) {}
    return json({ ok: true, katalog: (k && k.liste) || KATALOG_STANDARD, standard: !k });
  }
  if (body.action === 'katalogSpeichern') {
    const liste = saeubereKatalog(body.katalog);
    if (!liste || !liste.length) return json({ ok: false, grund: 'katalog' }, 400);
    await st.setJSON('meta/katalog', { stand: new Date().toISOString(), liste });
    return json({ ok: true, katalog: liste });
  }
  /* ── Alle verschickten Angebote (eingefrorene Fassungen) ── */
  if (body.action === 'angebote') {
    /* Ältere Angebote ohne Fassung einmal einfrieren */
    for (const a of await alleAnfragen(st)) {
      if (!a.nr || a.pdfToken) continue;
      const k = VERS + a.id + '/' + a.token;
      const da = await st.get(k, { type: 'json' }).catch(() => null);
      if (!da) await st.setJSON(k, { ...a, gesendetAm: a.angenommenAm || a.erstellt });
    }
    const { blobs } = await st.list({ prefix: VERS });
    const liste = (await Promise.all(blobs.map(async b => {
      const v = await st.get(b.key, { type: 'json' }).catch(() => null);
      if (!v) return null;
      const t = b.key.split('/')[2];
      return { id: v.id, token: t, nr: v.nr, kunde: v.kunde, adresse: v.adresse, datum: v.datum, datumEnde: v.datumEnde,
        positionen: v.positionen, anzahlung: v.anzahlung, anrede: v.anrede || '', summen: summen(v),
        gesendetAm: v.gesendetAm, bearbeitetAm: v.bearbeitetAm || null, waNummer: waNummer(v.kunde && v.kunde.telefon),
        pdf: siteUrl(req) + '/angebot/' + v.id + '/' + t };
    }))).filter(Boolean);
    return json({ ok: true, angebote: liste });
  }
  /* Verschicktes Angebot bewusst ändern: der Link beim Kunden zeigt danach die neue Fassung */
  if (body.action === 'angebotSpeichern') {
    const vid = String(body.id || ''), vt = String(body.token || '');
    if (!/^[a-z0-9]{4,40}$/.test(vid) || !/^[a-z0-9]{4,40}$/.test(vt)) return json({ ok: false, grund: 'id' }, 400);
    const key = VERS + vid + '/' + vt;
    const v = await st.get(key, { type: 'json' });
    if (!v) return json({ ok: false, grund: 'nicht-gefunden' }, 404);
    const p = body.patch || {};
    const sauber = saeubere({ ...v, positionen: Array.isArray(p.positionen) ? p.positionen : v.positionen });
    v.positionen = sauber.positionen;
    if ('anzahlung' in p) v.anzahlung = (p.anzahlung === '' || p.anzahlung == null || isNaN(Number(p.anzahlung))) ? null : Math.round(Number(p.anzahlung) * 100) / 100;
    if ('anrede' in p) v.anrede = ['herr', 'frau', ''].includes(p.anrede) ? p.anrede : '';
    v.bearbeitetAm = new Date().toISOString();
    await st.setJSON(key, v);
    /* Ist das die aktuelle Fassung der Anfrage, dort auch übernehmen */
    const live = await st.get(PREFIX + vid, { type: 'json' }).catch(() => null);
    if (live && (live.pdfToken || live.token) === vt) {
      live.positionen = v.positionen; live.anzahlung = v.anzahlung; live.anrede = v.anrede;
      live.geaendertNachVersand = false; live.geaendert = v.bearbeitetAm;
      await st.setJSON(PREFIX + vid, live);
    }
    return json({ ok: true, angebot: { id: vid, token: vt, summen: summen(v), bearbeitetAm: v.bearbeitetAm } });
  }

  /* Anfrage selbst anlegen (Telefon, WhatsApp) */
  if (body.action === 'anlegen') {
    const daten = saeubere({ ...body.daten, quelle: (body.daten && body.daten.quelle) || 'Telefon/WhatsApp' });
    if (!daten.kunde.vorname && !daten.kunde.nachname) return json({ ok: false, grund: 'name' }, 400);
    const id = Date.now().toString(36) + zufall(4);
    const jetzt = new Date().toISOString();
    const am = body.daten && /^\d{4}-\d{2}-\d{2}$/.test(body.daten.erstelltAm || '') && body.daten.erstelltAm < jetzt.slice(0, 10) ? body.daten.erstelltAm + 'T10:00:00.000Z' : null;
    const eintrag = {
      id, token: zufall(20), erstellt: am || jetzt, ...(am ? { rueckdatiert: true, angelegtAm: jetzt } : {}),
      status: 'ausstehend', nr: null, anrede: '', notiz: String((body.daten && body.daten.notiz) || '').slice(0, 2000), anzahlung: null,
      ...daten, manuell: true
    };
    if (eintrag.empfehlung.aktiv && !eintrag.empfehlung.code) eintrag.empfehlung.code = empfehlungscode(eintrag.kunde.nachname, eintrag.kunde.vorname);
    await st.setJSON(PREFIX + id, eintrag);
    return json({ ok: true, anfrage: anreichern(req, eintrag) });
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
    if ('erstelltAm' in p && a.manuell && /^\d{4}-\d{2}-\d{2}$/.test(p.erstelltAm || '') && p.erstelltAm <= new Date().toISOString().slice(0, 10) && p.erstelltAm !== String(a.erstellt || '').slice(0, 10)) {
      neu.erstellt = p.erstelltAm + 'T10:00:00.000Z';
      neu.rueckdatiert = true; neu.angelegtAm = a.angelegtAm || a.erstellt;
      if (neu.angenommenAm) {
        neu.angenommenAm = neu.erstellt;
        /* nachgetragene Buchung: auch das PDF-Datum mitziehen */
        if (neu.pdfToken && (neu.versionen || []).length <= 1) {
          const k = VERS + id + '/' + neu.pdfToken;
          const v = await st.get(k, { type: 'json' }).catch(() => null);
          if (v) await st.setJSON(k, { ...v, erstellt: neu.erstellt, angenommenAm: neu.erstellt, gesendetAm: neu.erstellt });
          neu.versionen = (neu.versionen || []).map(x => ({ ...x, am: neu.erstellt }));
        }
      }
    }
    if ('anzahlung' in p) neu.anzahlung = (p.anzahlung === '' || p.anzahlung == null || isNaN(Number(p.anzahlung))) ? null : Math.round(Number(p.anzahlung) * 100) / 100;
    neu.geaendert = new Date().toISOString();
    if ((neu.status === 'fix' || neu.status === 'erledigt') && neu.pdfToken && pdfStand(neu) !== pdfStand(a)) neu.geaendertNachVersand = true;
    await st.setJSON(PREFIX + id, neu);
    await belegtNeuBerechnen(st);
    return json({ ok: true, anfrage: anreichern(req, neu) });
  }

  if (body.action === 'annehmen') {
    if (!a.nr) a.nr = await naechsteNr(st);
    a.status = 'fix';
    a.angenommenAm = a.angenommenAm || (a.rueckdatiert ? a.erstellt : new Date().toISOString());
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

  if (body.action === 'anzahlung') {
    if (body.erhalten) a.anzahlungErhaltenAm = a.anzahlungErhaltenAm || new Date().toISOString();
    else delete a.anzahlungErhaltenAm;
    if (body.erinnert) a.anzahlungErinnertAm = new Date().toISOString();
    await st.setJSON(PREFIX + id, a);
    return json({ ok: true, anfrage: anreichern(req, a) });
  }
  if (body.action === 'abschliessen' || body.action === 'wiederoeffnen') {
    if (body.action === 'abschliessen') { if (a.status !== 'fix') return json({ ok: false, grund: 'nicht-fix' }, 400); a.status = 'erledigt'; a.abgeschlossenAm = new Date().toISOString(); }
    else { if (a.status !== 'erledigt') return json({ ok: false, grund: 'nicht-erledigt' }, 400); a.status = 'fix'; delete a.abgeschlossenAm; }
    a.geaendert = new Date().toISOString();
    await st.setJSON(PREFIX + id, a);
    await belegtNeuBerechnen(st);
    return json({ ok: true, anfrage: anreichern(req, a) });
  }

  /* Fahrtenbuch zu einer Buchung speichern (ändert das Angebot nicht) */
  if (body.action === 'fahrten') {
    const f = body.fahrten || {};
    const zeit = v => /^\d{2}:\d{2}$/.test(v || '') ? v : '';
    const tag = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '';
    const fahrt = x => ({ ab: zeit(x && x.ab), an: zeit(x && x.an) });
    const stand = v => { const n = Number(v); return v !== '' && v != null && isFinite(n) && n >= 0 && n < 10000000 ? Math.round(n) : null; };
    const einsatz = x => ({ datum: tag(x && x.datum), hin: fahrt(x && x.hin), rueck: fahrt(x && x.rueck),
      stand: { start: stand(x && x.stand && x.stand.start), kunde: stand(x && x.stand && x.stand.kunde), ende: stand(x && x.stand && x.stand.ende) } });
    const km = Number(f.km);
    a.fahrten = {
      liefer: einsatz(f.liefer), abhol: einsatz(f.abhol),
      km: isFinite(km) && km >= 0 && km < 2000 ? Math.round(km * 10) / 10 : null,
      notiz: String(f.notiz || '').slice(0, 300),
      fahrzeug: String(f.fahrzeug || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 40)
    };
    await st.setJSON(PREFIX + id, a);
    return json({ ok: true, anfrage: anreichern(req, a) });
  }

  /* Geändertes Angebot neu senden: neue Fassung, neuer Link (alter bleibt gültig) */
  if (body.action === 'neueFassung') {
    if (a.status !== 'fix' && a.status !== 'erledigt') return json({ ok: false, grund: 'nicht-fix' }, 400);
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
