# Ulti Game Tracker — landing page

The marketing front door at **https://ultigametracker.com** (and `www`). The web
app lives at **`/app`** on the same origin (e.g. https://ultigametracker.com/app) —
the landing links to it via the same-origin `/app/` path (`src/constants.ts`).

Standalone Vite + React + Tailwind v4 app. Independent of `client/` (the app);
the two source trees are only stitched together at build time (see Deploy).

## Local dev

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc -b && vite build  -> dist/
```

The "Open the web app" links point at the same-origin `/app/` path, so they only
resolve in the deployed/combined site (or via the combined build below) — not in
standalone `npm run dev`.

## Deploy (automatic on push to `main`)

The landing page and the app ship together to **one** Static Web App
(`stapp-ugt-landing-prod-aue`, serving apex + www). Pushing changes under
`landing/**` **or** `client/**` to `main` triggers
`.github/workflows/deploy-site.yml`, which:

1. builds the combined tree via `scripts/build-site.mjs` (repo root) →
   `dist-site/` (landing at `/`, app at `/app/`), then
2. uploads the pre-built `dist-site/` to the landing SWA (`skip_app_build`).

**A deploy is just `git push`.** DNS is never touched. The workflow authenticates
with the repo secret `AZURE_STATIC_WEB_APPS_API_TOKEN_LANDING`. To rotate it:

```sh
az staticwebapp secrets list -n stapp-ugt-landing-prod-aue \
  -g rg-ugt-prod-aue --query properties.apiKey -o tsv | gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN_LANDING
```

### Combined build / manual deploy (fallback)

```sh
node scripts/build-site.mjs        # from repo root -> dist-site/
TOKEN=$(az staticwebapp secrets list -n stapp-ugt-landing-prod-aue \
  -g rg-ugt-prod-aue --query properties.apiKey -o tsv)
npx -y @azure/static-web-apps-cli deploy ./dist-site --deployment-token "$TOKEN" --env production
```

(PowerShell: `$TOKEN = az staticwebapp secrets list ...` then pass `--deployment-token $TOKEN`.)

## Topology (already set up — for reference only)

One **Free** Static Web App in resource group `rg-ugt-prod-aue`, plus the Azure
DNS zone `ultigametracker.com` (same RG):

| Host | Serves | SWA |
|---|---|---|
| `ultigametracker.com` + `www` | this landing page (`/`) **and** the app (`/app`) | `stapp-ugt-landing-prod-aue` |

`/app` routing (`/app`→`/app/` redirect + SPA fallback excluding `/app/*`) is in
`landing/public/staticwebapp.config.json`, which ships at the deploy root.

DNS records in the zone:

| Record | Type | Target |
|---|---|---|
| `@` | A (alias) | landing SWA resource |
| `@` | TXT | landing SWA apex validation token |
| `www` | CNAME | landing SWA hostname |

Function App (`func-ugt-prod-aue`) CORS `allowedOrigins` includes the apex + www
origins (the app calls the API from the same origin it's served on).
