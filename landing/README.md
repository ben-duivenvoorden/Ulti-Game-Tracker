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

## Deploy (routine — this is all you do for content/code changes)

DNS is **not** touched on a normal deploy. Just build and push content to the
landing Static Web App:

```sh
npm run build
TOKEN=$(az staticwebapp secrets list -n stapp-ugt-landing-prod-aue \
  -g rg-ugt-prod-aue --query properties.apiKey -o tsv)
npx -y @azure/static-web-apps-cli deploy ./dist --deployment-token "$TOKEN" --env production
```

(PowerShell: `$TOKEN = az staticwebapp secrets list ...` then pass `--deployment-token $TOKEN`.)

> Smoother option for frequent changes: a GitHub Actions workflow that runs the
> build + `swa deploy` on every push to `main` (store the deployment token as a
> repo secret). Then a deploy is just `git push`. Ask to have this wired up.

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
