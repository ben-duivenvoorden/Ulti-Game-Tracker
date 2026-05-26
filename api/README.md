# Azure Functions API

Append-only event-log API for the Ultimate Stat Tracker SPA. Two endpoints:

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

Not wired up yet — needs an Azure Functions resource + GitHub Actions
workflow. See `docs/design/architecture-data-pipeline.md` for the intended
deployment shape. Open todos:

- [ ] Create Azure resource group, storage account, function app
- [ ] Grant the function app's managed identity Storage Blob Data Contributor
      on the `raw` container (so `DefaultAzureCredential` succeeds without
      connection strings)
- [ ] Configure app settings (`RAW_BLOB_ACCOUNT_URL`, etc.) via Azure CLI or
      Bicep template
- [ ] Add `.github/workflows/deploy-api.yml` (`azure/functions-action@v1`) on
      push to `main` paths `api/**`
- [ ] Add CORS for the SPA's Static Web Apps origin
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
