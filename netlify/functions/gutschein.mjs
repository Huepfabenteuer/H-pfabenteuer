/* ═══════════════════════════════════════════════════════════════════════
   HÜPFABENTEUER — Gutscheincode-Prüfung
   ───────────────────────────────────────────────────────────────────────
   Läuft auf dem Netlify-Server, nicht im Browser. Die Codeliste steht
   dadurch NICHT im Quelltext der Website und kann nicht ausgelesen werden.

   Aufrufe (POST auf /.netlify/functions/gutschein):
     { "action": "check",  "code": "..." }   → Code gültig? schon benutzt?
     { "action": "redeem", "code": "...", "kunde": "...", "datum": "..." }
                                             → Code endgültig verbrauchen

   Übersicht für Alex (GET):
     /.netlify/functions/gutschein?action=liste&key=DEIN_ADMIN_KEY
     Funktioniert nur, wenn in Netlify die Variable ADMIN_KEY gesetzt ist.

   Einmal-Codes werden in Netlify Blobs gespeichert. Das überlebt jedes
   neue Deployment und gilt geräteübergreifend.
   ═══════════════════════════════════════════════════════════════════════ */

import { CODES } from './codes.mjs';

const STORE_NAME = 'gutscheine';

/* Blobs-Zugriff; wenn der Speicher mal nicht erreichbar ist, blockieren
   wir keine Anfrage, sondern lassen den Code durch und markieren ihn als
   ungeprüft. Eine kaputte Datenbank darf keine Buchung verhindern. */
async function store() {
  try {
    const { getStore } = await import('@netlify/blobs');
    return getStore(STORE_NAME);
  } catch (e) {
    return null;
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function normalise(code) {
  return String(code || '').toUpperCase().trim().replace(/\s+/g, '');
}

export default async (req) => {
  const url = new URL(req.url);

  /* ── Übersicht aller eingelösten Codes (nur mit Admin-Key) ── */
  if (req.method === 'GET' && url.searchParams.get('action') === 'liste') {
    const key = process.env.ADMIN_KEY;
    if (!key || url.searchParams.get('key') !== key) {
      return json({ ok: false, grund: 'kein_zugriff' }, 403);
    }
    const s = await store();
    const eingeloest = {};
    if (s) {
      const { blobs } = await s.list();
      for (const b of blobs) {
        try {
          eingeloest[b.key] = await s.get(b.key, { type: 'json' });
        } catch (e) { /* einzelner Eintrag kaputt – überspringen */ }
      }
    }
    const alle = Object.keys(CODES).map((c) => ({
      code: c,
      kunde: CODES[c].kunde || '',
      prozent: CODES[c].prozent,
      einmalig: CODES[c].einmalig !== false,
      eingeloest: eingeloest[c] || null
    }));
    return json({
      ok: true,
      gesamt: alle.length,
      offen: alle.filter((a) => !a.eingeloest).length,
      verbraucht: alle.filter((a) => a.eingeloest).length,
      codes: alle
    });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, grund: 'falsche_methode' }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json({ ok: false, grund: 'kaputte_anfrage' }, 400);
  }

  const code = normalise(body.code);
  const eintrag = CODES[code];

  if (!code || !eintrag) {
    return json({ ok: false, grund: 'unbekannt' });
  }

  const einmalig = eintrag.einmalig !== false;
  const s = await store();

  /* ── Prüfen ── */
  if (body.action === 'check') {
    if (einmalig && s) {
      let benutzt = null;
      try {
        benutzt = await s.get(code, { type: 'json' });
      } catch (e) { /* nicht erreichbar – wie frei behandeln */ }
      if (benutzt) {
        return json({ ok: false, grund: 'eingeloest', am: benutzt.am || null });
      }
    }
    return json({
      ok: true,
      code,
      prozent: eintrag.prozent,
      label: eintrag.label,
      einmalig,
      geprueft: !!s
    });
  }

  /* ── Verbrauchen ── */
  if (body.action === 'redeem') {
    if (!einmalig) {
      return json({ ok: true, code, mehrfach: true });
    }
    if (!s) {
      return json({ ok: true, code, gespeichert: false });
    }
    try {
      const schon = await s.get(code, { type: 'json' });
      if (schon) {
        return json({ ok: false, grund: 'eingeloest', am: schon.am || null });
      }
      await s.setJSON(code, {
        am: new Date().toISOString(),
        kunde: String(body.kunde || '').slice(0, 120),
        datum: String(body.datum || '').slice(0, 60)
      });
      return json({ ok: true, code, gespeichert: true });
    } catch (e) {
      // Speichern fehlgeschlagen – Buchung trotzdem durchlassen
      return json({ ok: true, code, gespeichert: false });
    }
  }

  return json({ ok: false, grund: 'unbekannte_aktion' }, 400);
};

export const config = { path: '/.netlify/functions/gutschein' };
