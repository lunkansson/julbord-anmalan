# Julbord-anmälan – Konsultjulbord 2026 på Liseberg

Anmälningssida för konsultjulbordet torsdag 10 december. Byggd från Claude Design-prototypen
`project/Julbord Anmälan.dc.html` (Nocturne-designsystemet) som ren HTML/CSS/JS plus en liten
Node-server utan beroenden.

## Kom igång

Kräver Node 18 eller senare. Inga paket behöver installeras.

```sh
cd app
ADMIN_PASSWORD=välj-ett-lösenord npm start
# → http://localhost:3000        anmälningssidan
# → http://localhost:3000/admin  lista över anmälda + CSV-export (logga in med valfritt användarnamn + lösenordet)
```

## Inställningar (miljövariabler)

| Variabel | Standard | Vad den gör |
| --- | --- | --- |
| `PORT` | `3000` | Port att lyssna på |
| `HOST` | `0.0.0.0` | Adress att lyssna på |
| `DATA_FILE` | `app/data/signups.json` | Var anmälningarna sparas. Lägg den på en disk som överlever omstarter. |
| `SIGNUP_DEADLINE` | `2026-10-28T23:59:59+01:00` | Efter detta stängs anmälan automatiskt |
| `SIGNUPS_CLOSED` | – | Sätt till `1` för att stänga anmälan direkt |
| `ADMIN_PASSWORD` | – | Krävs för `/admin`. Utan den är admin avstängt. |

## Så fungerar det

- Formuläret frågar bara efter namn. Anmälan sparas i `DATA_FILE`.
- Webbläsaren kommer ihåg anmälan, så "Ändra anmälan" uppdaterar samma rad i stället för att skapa en ny.
  Samma namn två gånger (oavsett stora/små bokstäver) räknas också som en anmälan.
- Efter sista anmälningsdag visar sidan "Anmälan är stängd" och servern tar inte emot fler.
- `/admin` visar alla anmälda, kan ta bort rader och laddar ner en CSV-fil som öppnas direkt i Excel.
- Snöfallet stängs av för den som har valt reducerad rörelse i sitt system, eller med `?snow=0` i adressen.

Kör HTTPS framför servern (t.ex. via er hosting eller en reverse proxy), annars skickas
admin-lösenordet okrypterat.

## Tester

```sh
npm test
```

## Filer

- `server.js` – server, API (`GET /api/status`, `POST /api/signups`) och admin
- `public/index.html`, `public/app.css`, `public/app.js` – sidan
- `public/nocturne.css` – designsystemets stilmall, kopierad oförändrad från designexporten
- `public/assets/` – logga och bild på Restaurang 1923, nedskalade för webben
