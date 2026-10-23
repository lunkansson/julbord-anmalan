# Julbord-anmälan – Konsultjulbord 2026 på Liseberg

Anmälningssida för konsultjulbordet torsdag 10 december. Byggd från Claude Design-prototypen
`design/project/Julbord Anmälan.dc.html` (Nocturne-designsystemet) som ren HTML/CSS/JS. Körs på Vercel
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
2. Låt alla inställningar stå kvar som de är (Framework Preset: Other, Root Directory: `./`).
3. Lägg till miljövariabler (Environment Variables):

   | Namn | Värde |
   | --- | --- |
   | `SUPABASE_URL` | Project URL från Supabase |
   | `SUPABASE_SECRET_KEY` | secret key (eller service_role-nyckeln) |

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
- Alla som besöker sidan ser de första anmälda under datum och tider. Länken **Se alla som har anmält sig →** leder till
  **`/anmalda`** med hela listan, sökning på namn och **Ladda ner listan (CSV)** för Excel. Ingen inloggning krävs.
- Efter sista anmälningsdag visar sidan "Anmälan är stängd" och servern tar inte emot fler.
- Det finns inget lösenord och ingen admin-sida. Behöver en anmälan tas bort (test, dubblett, någon som
  inte kan komma) gör man det i Supabase: **Table Editor → signups**, markera raden och ta bort den.
- Snöfallet stängs av för den som valt reducerad rörelse, eller med `?snow=0` i adressen.

## Köra lokalt

```sh
npm start      # http://localhost:3000
npm test
```

Utan Supabase-variabler sparas anmälningar i `data/signups.json`. Med `SUPABASE_URL` och
`SUPABASE_SECRET_KEY` satta används Supabase även lokalt.

## Filer

- `public/` – anmälningssidan (`index.html`, `app.js`), listsidan (`anmalda.html`, `anmalda.js`), gemensamma `app.css` och `snow.js`, designsystemets `nocturne.css` och bilderna
- `api/` – Vercel-funktioner (`/api/status`, `/api/signups`, `/api/attendees`, `/api/attendees-csv`)
- `lib/` – logiken: inställningar, lagring (Supabase eller JSON-fil) och request-hantering
- `server.js` – lokal server som kör samma kod som Vercel
- `supabase/schema.sql` – tabellen i Supabase
- `design/` – originalexporten från Claude Design (prototyp, chatt, designsystem), bara som referens
