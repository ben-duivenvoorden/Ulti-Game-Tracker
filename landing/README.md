# Ulti Game Tracker — landing page

The marketing front door at **https://ultigametracker.com** (and `www`). The web
app it links to lives at **https://app.ultigametracker.com**.

Standalone Vite + React + Tailwind v4 app. Independent of `client/` (the app).

## Local dev

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc -b && vite build  -> dist/
```

`VITE_APP_URL` controls where the "Open the web app" links point.
Default `https://ultigametracker.com`; production build uses `.env.production`
(`https://app.ultigametracker.com`). Override locally in `.env.local`.

## Deploy (automatic on push to `main`)

Pushing changes under `landing/**` to `main` triggers the
`.github/workflows/deploy-landing.yml` workflow, which builds and deploys to the
landing Static Web App. **A deploy is just `git push`.** DNS is never touched.

The workflow authenticates with the repo secret
`AZURE_STATIC_WEB_APPS_API_TOKEN_LANDING` (the SWA deployment token). To rotate
it:

```sh
az staticwebapp secrets list -n stapp-ugt-landing-prod-aue \
  -g rg-ugt-prod-aue --query properties.apiKey -o tsv | gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN_LANDING
```

### Manual deploy (fallback)

```sh
npm run build
TOKEN=$(az staticwebapp secrets list -n stapp-ugt-landing-prod-aue \
  -g rg-ugt-prod-aue --query properties.apiKey -o tsv)
npx -y @azure/static-web-apps-cli deploy ./dist --deployment-token "$TOKEN" --env production
```

(PowerShell: `$TOKEN = az staticwebapp secrets list ...` then pass `--deployment-token $TOKEN`.)

## One-time topology (already set up — for reference only)

Two **Free** Static Web Apps in resource group `rg-ugt-prod-aue`, plus the Azure
DNS zone `ultigametracker.com` (same RG):

| Host | Serves | SWA | SWA default hostname |
|---|---|---|---|
| `ultigametracker.com` + `www` | this landing page | `stapp-ugt-landing-prod-aue` | `ashy-island-0b8c0291e.7.azurestaticapps.net` |
| `app.ultigametracker.com` | the web app (`client/`) | `stapp-ugt-prod-aue` | `yellow-tree-03154b01e.7.azurestaticapps.net` |

DNS records in the zone:

| Record | Type | Target |
|---|---|---|
| `@` | A (alias) | landing SWA resource |
| `@` | TXT | landing SWA apex validation token |
| `www` | CNAME | landing SWA hostname |
| `app` | CNAME | app SWA hostname |

Function App (`func-ugt-prod-aue`) CORS `allowedOrigins` includes
`https://app.ultigametracker.com` (the app's origin).

A Free SWA allows **max 2 custom domains** — that's why apex + www sit on the
landing SWA and the app uses a single `app.` subdomain.
