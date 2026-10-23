# Julbord-anmälan – Konsultjulbord 2026 på Liseberg

Anmälningssida för konsultjulbordet torsdag 10 december. Byggd från Claude Design-prototypen
`project/Julbord Anmälan.dc.html` (Nocturne-designsystemet) som ren HTML/CSS/JS. Körs på Vercel
och sparar anmälningarna i Supabase. Inga npm-paket behövs.

## Publicera (Supabase + Vercel)

### 1. Supabase – skapa tabellen

1. Öppna projektet på [supabase.com/dashboard](https://supabase.com/dashboard).
2. **SQL Editor → New query**, klistra in innehållet i [`supabase/schema.sql`](supabase/schema.sql) och klicka **Run**.
3. Hämta två värden under **Project Settings → API Keys** / **Data API**:
   - **Project URL**, t.ex. `https://abcdefgh.supabase.co`
   - en **secret key** (`sb_secret_…`), eller den äldre **service_role**-nyckeln.
     Den här nyckeln ska bara in i Vercel, aldrig i koden eller i webbläsaren.

### 2. Vercel – importera repot

1. [vercel.com/new](https://vercel.com/new) → importera `lunkansson/julbord-anmalan`.
2. **Root Directory: `app`** (viktigt).
3. Lägg till miljövariabler (Environment Variables):

   | Namn | Värde |
   | --- | --- |
   | `SUPABASE_URL` | Project URL från Supabase |
   | `SUPABASE_SECRET_KEY` | secret key (eller service_role-nyckeln) |
   | `ADMIN_PASSWORD` | ett lösenord du väljer för `/admin` |

4. **Deploy**. Varje push till `main` publicerar sedan automatiskt.

Om du kopplar Supabase via Vercels Marketplace-integration sätts `SUPABASE_URL` och nyckeln åt dig;
koden läser även `SUPABASE_SERVICE_ROLE_KEY`.

## Övriga inställningar (valfria)

| Variabel | Standard | Vad den gör |
| --- | --- | --- |
| `SIGNUP_DEADLINE` | `2026-10-28T23:59:59+01:00` | Efter detta stängs anmälan automatiskt |
| `SIGNUPS_CLOSED` | – | Sätt till `1` för att stänga anmälan direkt |

## Så fungerar det

- Formuläret frågar bara efter namn.
- Webbläsaren kommer ihåg anmälan, så "Ändra anmälan" uppdaterar samma rad. Samma namn två gånger
  (oavsett stora/små bokstäver) räknas som en anmälan.
- Alla som besöker sidan ser listan **Anmälda** (bara namn) under datum och tider. Den uppdateras direkt när någon anmäler sig.
- Efter sista anmälningsdag visar sidan "Anmälan är stängd" och servern tar inte emot fler.
- `/admin` (valfritt användarnamn + `ADMIN_PASSWORD`) visar alla anmälda, kan ta bort rader och
  laddar ner en CSV som öppnas direkt i Excel. Anmälningarna syns också i Supabase under **Table Editor → signups**.
- Snöfallet stängs av för den som valt reducerad rörelse, eller med `?snow=0` i adressen.

## Köra lokalt

```sh
cd app
ADMIN_PASSWORD=test npm start      # http://localhost:3000
npm test
```

Utan Supabase-variabler sparas anmälningar i `app/data/signups.json`. Med `SUPABASE_URL` och
`SUPABASE_SECRET_KEY` satta används Supabase även lokalt.

## Filer

- `public/` – sidan (`index.html`, `app.css`, `app.js`), designsystemets `nocturne.css` och bilderna
- `api/` – Vercel-funktioner; `vercel.json` kopplar `/admin…` till dem
- `lib/` – logiken: inställningar, lagring (Supabase eller JSON-fil) och request-hantering
- `server.js` – lokal server som kör samma kod som Vercel
- `supabase/schema.sql` – tabellen i Supabase
