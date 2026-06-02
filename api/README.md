# Azure Functions API

Append-only event-log API for the Ulti Game Tracker SPA. Two endpoints:

- `POST /api/events` — body is one `RawEvent` JSON object, appends a CSV row
  to the public raw events blob.
- `GET  /api/game/{gameId}` — returns all CSV rows for that game (header
  preserved), used by the SPA on resume.

The blob this writes to (`raw/events.csv` on Azure Blob, append-blob type) is
the same one `dbt/models/raw/raw_events.sql` reads from. Both ends of the
contract live in `src/shared/csv.ts` (`CSV_HEADER` + `eventToCsvRow`) — keep
them in lock-step with the dbt `raw_events` model.

## Local development

You need [Azure Functions Core Tools v4](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local) installed (`npm i -g azure-functions-core-tools@4`).

```bash
cd api
npm install
cp local.settings.json.example local.settings.json
# edit local.settings.json — point RAW_BLOB_ACCOUNT_URL at Azurite or a real
# storage account.
npm start
```

The handlers expect `RAW_BLOB_ACCOUNT_URL` etc. in env. For full local dev
without a real Azure storage account, run [Azurite](https://learn.microsoft.com/en-us/azure/storage/common/storage-use-azurite) and point at
`http://127.0.0.1:10000/devstoreaccount1`.

Test it works:

```bash
curl -X POST http://localhost:7071/api/events \
  -H "content-type: application/json" \
  -d '{"event_id":1,"game_id":1,"timestamp_ms":1717012345000,"point_index":0,"type":"point-start","payload":{"lineA":[1,2,3,4,5,6,7],"lineB":[8,9,10,11,12,13,14]}}'

curl http://localhost:7071/api/game/1
```

## Deployment

**Live** at `func-ugt-prod-aue.azurewebsites.net` (Y1 Consumption, Australia
East) since 2026-06-01. The resource group, storage account, function app,
managed-identity role assignment and CORS allow-list are all provisioned by
`infra/main.bicep` (see `infra/README.md`). App settings
(`RAW_BLOB_ACCOUNT_URL`, `RAW_BLOB_CONTAINER`, `RAW_BLOB_NAME`) are set by the
Bicep template; `DefaultAzureCredential` uses the function's system-assigned
identity (Storage Blob Data Contributor on the account) — no keys in code.

Redeploys are currently manual via `func azure functionapp publish
func-ugt-prod-aue --typescript`. The `.github/workflows/deploy-api.yml`
workflow exists but no-ops until the OIDC federated identity is wired
(`AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_SUBSCRIPTION_ID` secrets +
`AZURE_FUNCTIONAPP_NAME` variable).

Open todos:

- [ ] Wire OIDC so `deploy-api` runs on push to `api/**` instead of manual `func`
- [ ] Decide auth model — currently `authLevel: 'anonymous'`. Likely move to
      per-game share-token signed by a backend secret, validated in each
      handler. See `postEvents` / `getGame` TODOs.

## Notes

- Uses append-blob (not block-blob). Max 50,000 blocks per blob → ~50k events
  per file. Plenty for a hobby league; future-Ben will need to roll to a new
  blob name (`events-2026-05.csv`) once full and have dbt glob across them.
- Auth uses `DefaultAzureCredential` — works locally if you're signed in to
  the Azure CLI / VS Code, and in Azure via managed identity. No connection
  strings or SAS tokens in source.
