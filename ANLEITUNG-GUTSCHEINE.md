# Gutscheincodes – Anleitung

## Was neu ist

Die Gutscheincodes werden jetzt auf dem Server geprüft statt im Browser.
Das heißt:

- Die Codeliste steht **nicht mehr im Quelltext** der Website, man kann sie
  also nicht auslesen.
- Ein Einmal-Code ist nach der Einlösung **wirklich verbraucht**, egal von
  welchem Gerät jemand es nochmal versucht.
- Deine Firmencodes `INFINEON15` und `DUSSMANN15` bleiben mehrfach
  verwendbar, die werden nicht verbraucht.

Neue Dateien:

```
netlify.toml                     sagt Netlify, wo die Funktionen liegen
package.json                     eine Abhängigkeit für den Speicher
netlify/functions/gutschein.mjs  die Prüfung selbst
netlify/functions/codes.mjs      die Codeliste (nur am Server)
tools/codes_generieren.py        erzeugt Codes, Liste und WhatsApp-Texte
tools/kunden.txt                 da trägst du deine Kunden ein
```

## Einmal einrichten

Beim nächsten Deployment zieht Netlify die Funktion automatisch mit, du
musst nichts umstellen. Netlify Blobs, wo die eingelösten Codes gespeichert
werden, ist bei deinem Tarif dabei und kostet nichts.

Optional, aber praktisch: Setz in Netlify unter
**Site configuration → Environment variables** eine Variable `ADMIN_KEY`
mit einem Passwort, das du dir ausdenkst. Danach kannst du jederzeit
nachschauen, welche Codes schon weg sind:

```
https://huepfabenteuer.at/.netlify/functions/gutschein?action=liste&key=DEIN_PASSWORT
```

Ohne die Variable ist diese Übersicht einfach gesperrt, alles andere
funktioniert trotzdem.

## Die 80 Stammkunden-Codes erzeugen

1. Kunden eintragen in `tools/kunden.txt`, einen pro Zeile:

   ```
   Familie Maier; +43 664 1234567
   Gemeinde Glödnitz; Zeltfest Juli
   Sabine Huber; Friesach
   ```

   Alles nach dem Strichpunkt ist optional und nur für dich.

2. Im Projektordner ausführen:

   ```
   python tools/codes_generieren.py
   ```

3. Danach hast du:

   - `netlify/functions/codes.mjs` mit allen Codes drin
   - `tools/gutschein-uebersicht.csv` deine Liste zum Abhaken, öffnet in Excel
   - `tools/whatsapp-texte.txt` fertige Nachrichten zum Kopieren

4. Website neu deployen. Ab dann sind die Codes gültig.

Die Codes schauen so aus: `HUEPF-MAIER-X6R`. Der Name steht drin, damit du
beim Anschauen sofort weißt wer bucht. Die drei Zeichen hinten sind
Zufall, damit niemand einen fremden Code erraten kann.

## Wenn mal was nicht geht

Antwortet der Server nicht, wird die Buchung trotzdem durchgelassen. Der
Code kommt dann mit der Anfrage mit und in der Mail steht
`NICHT GEPRÜFT – bitte selbst kontrollieren`. Dann schaust du kurz in deine
Liste.

## Einzelne Codes von Hand ändern

In `netlify/functions/codes.mjs` kannst du jederzeit welche dazuschreiben:

```js
'MEINCODE': { prozent: 10, label: 'Anzeigename', einmalig: true, kunde: 'Info für dich' },
```

`einmalig: false` heißt, der Code darf beliebig oft verwendet werden.
