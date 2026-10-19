/* ═══════════════════════════════════════════════════════════════════════
   HÜPFABENTEUER — Anreise automatisch berechnen
   ───────────────────────────────────────────────────────────────────────
   Aufruf:  GET /.netlify/functions/anreise?q=Bahnhofstraße 5, 9020 Klagenfurt
   Antwort: { ok:true, km:49, ort:"…", anreise:108, mitEmpfehlung:78 }

   1. Adresse → Koordinaten (OpenRouteService Geocoding, nur Österreich)
   2. Straßen-Route ab Schulstraße 3, 9346 Glödnitz → Kilometer
   3. Anreise = 4 Fahrten × km × 0,55 €

   Braucht in Netlify die Umgebungsvariable ORS_KEY.
   Ergebnisse werden in Netlify Blobs zwischengespeichert, damit dieselbe
   Adresse das Tageslimit nicht zweimal belastet.
   Wenn irgendetwas schiefgeht, kommt { ok:false } zurück – das Formular
   funktioniert dann ganz normal weiter, nur ohne Betrag.
   ═══════════════════════════════════════════════════════════════════════ */

const START = [14.1196, 46.8743];        // Glödnitz, Schulstraße 3 (lng, lat)
const PREIS_KM = 0.55, FAHRTEN = 4, EMPFEHLUNG = 30;
const BASE = 'https://api.heigit.org';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

async function cache() {
  try { const { getStore } = await import('@netlify/blobs'); return getStore('anreise'); }
  catch (e) { return null; }
}

function rechne(km) {
  const anreise = Math.round(FAHRTEN * km * PREIS_KM);
  return { anreise, mitEmpfehlung: Math.max(anreise - EMPFEHLUNG, 0) };
}

export default async (req) => {
  const key = process.env.ORS_KEY;
  if (!key) return json({ ok: false, grund: 'kein-key' });

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (q.length < 3) return json({ ok: false, grund: 'zu-kurz' });

  const id = q.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-');
  const store = await cache();
  if (store) {
    try { const hit = await store.get(id, { type: 'json' }); if (hit) return json({ ok: true, ...hit, ...rechne(hit.km) }); }
    catch (e) {}
  }

  const H = { Authorization: key, Accept: 'application/json' };
  try {
    const g = new URL(BASE + '/pelias/v1/search');
    g.searchParams.set('text', q);
    g.searchParams.set('boundary.country', 'AT');
    g.searchParams.set('focus.point.lon', START[0]);
    g.searchParams.set('focus.point.lat', START[1]);
    g.searchParams.set('size', '1');
    const gr = await fetch(g, { headers: H });
    if (!gr.ok) return json({ ok: false, grund: 'geocode-' + gr.status });
    const gj = await gr.json();
    const f = gj.features && gj.features[0];
    if (!f) return json({ ok: false, grund: 'nicht-gefunden' });
    const [lng, lat] = f.geometry.coordinates;
    const p = f.properties || {};
    const ort = [p.postalcode, p.locality || p.localadmin || p.county || p.name].filter(Boolean).join(' ') || p.label || q;

    const dr = await fetch(BASE + '/openrouteservice/v2/directions/driving-car', {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ coordinates: [START, [lng, lat]], units: 'm' })
    });
    if (!dr.ok) {
      let info = ''; try { info = (await dr.text()).slice(0, 120); } catch (e) {}
      return json({ ok: false, grund: 'route-' + dr.status, info });
    }
    const dj = await dr.json();
    const m = (dj.routes && dj.routes[0] && dj.routes[0].summary && dj.routes[0].summary.distance)
           ?? (dj.features && dj.features[0] && dj.features[0].properties.summary.distance);
    if (!m && m !== 0) return json({ ok: false, grund: 'keine-route' });

    const km = Math.max(1, Math.round(m / 1000));
    const res = { km, ort, genau: !!(p.street || p.housenumber) };
    if (store) { try { await store.setJSON(id, res); } catch (e) {} }
    return json({ ok: true, ...res, ...rechne(km) });
  } catch (e) {
    return json({ ok: false, grund: 'fehler' });
  }
};

export const config = { path: '/.netlify/functions/anreise' };
