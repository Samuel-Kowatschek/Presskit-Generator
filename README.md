# UNGESTUEM – Pressekit Generator

Lokale Web-App, mit der du für deine Artists A4-Pressekits als PDF erstellst.

## Starten
Doppelklick auf **`start.command`**. Chrome öffnet sich mit `http://localhost:8765`.
Das Terminal-Fenster muss offen bleiben, solange du die App benutzt.

> Beim ersten Mal blockiert macOS das Skript eventuell: Rechtsklick → *Öffnen* → *Öffnen*.

## Ablauf
1. **Artist anlegen**: Name, Instagram, TikTok und Spotify eintragen (`@handle` reicht), dazu Farben, Titelschrift und Bilder.
2. **Pressekit**: Layout wählen (Vollbild / Panel / Split / Galerie), Release-Infos, Pressetext (50–100 Wörter), Links zu Pressefotos und Pre-Listening.
   - **Galerie** zeigt Hauptbild + bis zu 3 weitere Pressebilder als Raster.
   - **Cover**: optional ein Bild als Cover wählen, das mit versetzten Rahmen eingebunden wird (alle Layouts).
3. **PDF exportieren**: Die PDF wird direkt als exaktes A4 erzeugt und landet in *Downloads*, ohne Druckdialog.
   Die Links bleiben klickbar. Läuft die App nicht über `start.command`, öffnet sich als Ausweichweg der Druckdialog
   (dort Ränder: *Keine* und *Hintergrundgrafiken* aktivieren).

## Per Mail verschicken
Der Button **Per Mail** (neben „PDF exportieren“) erstellt das PDF, legt es unter `Downloads/Pressekits` ab
und öffnet in **Apple Mail** einen Entwurf mit:
- allen Ansprechpartner:innen im **BCC**
- Betreff `[VÖ-Datum] [Artist] - [Titel]` (ohne VÖ-Datum: heutiges Datum)
- Mail-Text aus der Vorlage (Pitch aus dem Feld „Mail-Text“, sonst Pressetext, plus Pre-Listening-Link und Signatur)
- dem PDF als Anhang

Verschickt wird nichts automatisch. Beim ersten Mal fragt macOS, ob das Terminal Mail steuern darf, das bitte erlauben.
Kontakte, Betreff, Vorlage und Signatur änderst du links unten unter **Einstellungen → Kontakte & Mail**.

## Eigene Schriften
Links unten unter **Einstellungen → Schriften verwalten** und `.otf`, `.ttf`, `.woff` oder `.woff2` hochladen.
Danach stehen sie bei Titel- und Textschrift zur Auswahl. Für Titel am besten den Bold-Schnitt nehmen.

## Daten
Alles wird lokal im Browser gespeichert (unter `localhost:8765`). Über **Einstellungen → Backup speichern** (links unten)
bekommst du eine JSON-Datei mit allen Artists, Bildern, Schriften und Einstellungen, die du mit **Backup laden** wieder einspielen kannst,
zum Beispiel auf einem anderen Mac.
