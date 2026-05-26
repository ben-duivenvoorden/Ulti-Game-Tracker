# Azure infrastructure (Bicep)

This folder provisions everything the data pipeline needs on Azure:

- Storage account + public `raw` container for the live event log
- Linux Consumption Function App (hosts `api/`)
- Static Web App (hosts the built `client/` SPA)
- Role assignment so the Function App can read/write the blob via its
  managed identity (no keys in code)

## Deploy with azd (recommended)

```pwsh
# one-time
winget install -e --id Microsoft.Azd

# from repo root
az login
azd auth login
azd up
```

`azd up` will:

1. Prompt for an environment name and Azure region
2. Provision everything in `main.bicep`
3. Deploy `api/` to the Function App (`func` runtime + `npm install`)
4. Deploy `client/` to the Static Web App (`vite build` + upload)

When it finishes it prints two URLs — the SWA's `defaultHostname` (your app)
and the public `raw/events.csv` URL (set this as the `RAW_EVENTS_URL` GitHub
secret so the build-data workflow points at real data instead of the sample).

## Deploy without azd

```pwsh
az group create --name rg-ultimate-dev --location australiaeast
az deployment group create `
  --resource-group rg-ultimate-dev `
  --template-file infra/main.bicep `
  --parameters infra/main.parameters.json `
  --parameters location=australiaeast repositoryUrl=https://github.com/<user>/<repo>
```

Then deploy the apps separately with `func azure functionapp publish ...` and
`swa deploy ...`.

## Tear it all down

```pwsh
azd down --purge
```

Or `az group delete --name rg-ultimate-dev --yes`.

## Defaults worth knowing

- **Region:** controlled by `AZURE_LOCATION` env var (azd) or the parameters
  file. Pick close to your users (e.g. `australiaeast` for AU).
- **SKU:** Static Web Apps `Free`, Function App `Y1` (Consumption). Both have
  generous free tiers for hobby projects.
- **Storage redundancy:** `Standard_LRS` (single-region). Fine for non-critical
  hobby data; bump to `Standard_ZRS` if you want intra-region replication.
- **Public access:** the `raw` container is set to `Blob` (anonymous read on
  individual blobs, no container listing). This is what lets dbt fetch
  `events.csv.gz` without auth.
