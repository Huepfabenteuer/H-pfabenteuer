# Anfragen-Verwaltung – Anleitung

## Einmal einrichten

1. In Netlify bei huepfabenteuer.at → **Site configuration → Environment variables**
   eine Variable **`ADMIN_KEY`** anlegen. Der Wert ist dein Passwort für die
   Verwaltung (lang und nur dir bekannt). Häkchen bei „Contains secret values“.
2. Neu deployen (passiert automatisch beim nächsten Upload auf GitHub).

## Benutzen

- Am Handy **https://huepfabenteuer.at/verwaltung.html** öffnen und mit dem
  Passwort anmelden. Tipp: „Zum Home-Bildschirm hinzufügen“, dann ist es wie eine App.
- **Offen:** neue Anfragen von der Website. Antippen → alles ansehen, Beträge
  anpassen, Anrede wählen, Notiz schreiben (wird automatisch gespeichert).
- **Annehmen:** vergibt die nächste Angebots-Nr. (ab 117), erstellt das PDF-Angebot
  und öffnet WhatsApp mit der fertigen Nachricht an den Kunden – du tippst nur auf Senden.
- **Absagen:** optional mit fertiger Absage-Nachricht per WhatsApp.
- **Fix:** alle fixen Termine, kommende zuerst. Ist eine Burg an einem Tag schon fix,
  warnt die Verwaltung bei weiteren Anfragen für denselben Tag.

## Wo liegt was

- `verwaltung.html` – die Seite für dich
- `netlify/functions/anfrage.mjs` – speichert Anfragen, Annehmen/Absagen, PDF
- `netlify/lib/` – PDF-Layout, Firmendaten (Bank, GISA), Logo
- PDF-Link für Kunden: `https://huepfabenteuer.at/angebot/<id>/<geheimer-code>`

Bankdaten ändern: in `netlify/lib/firma.mjs` oder in Netlify über die Variablen
`FIRMA_IBAN`, `FIRMA_BIC`, `FIRMA_BANK`, `FIRMA_EMPFAENGER`.
