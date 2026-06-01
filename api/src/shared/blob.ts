import { AppendBlobClient, BlobClient } from '@azure/storage-blob'
import { DefaultAzureCredential } from '@azure/identity'
import { CSV_HEADER } from './csv.js'

// Append-only blob holding the raw event log. The append-blob type is the
// right Azure primitive for "events streaming in from a low-throughput API"
// — single-writer, append-from-end, max 50k blocks per blob (~50k events).
//
// If we ever blow the 50k-block ceiling we'll need to roll to a new blob
// (events-2026-05.csv.gz, etc.) and have the dbt pipeline glob across them.
// Not worrying about that yet.
//
// Each appended block is ONE CSV row terminated by \n.

// Trailing slash stripped — Azure's primaryEndpoints.blob (what the Bicep wires
// into this setting) ends in `/`, which would otherwise produce a double slash
// in BLOB_URL below and a malformed container/blob path. Mirrors the same
// normalisation in client/src/core/sync.ts.
const ACCOUNT_URL = process.env.RAW_BLOB_ACCOUNT_URL?.replace(/\/+$/, '')
const CONTAINER   = process.env.RAW_BLOB_CONTAINER ?? 'raw'
const BLOB_NAME   = process.env.RAW_BLOB_NAME ?? 'events.csv'

if (!ACCOUNT_URL) {
  // Fail at import so misconfigured deploys crash on cold-start, not on first
  // request. Local dev sets this from local.settings.json.
  throw new Error('RAW_BLOB_ACCOUNT_URL is not configured')
}

const BLOB_URL = `${ACCOUNT_URL}/${CONTAINER}/${BLOB_NAME}`
const credential = new DefaultAzureCredential()

let cachedAppendClient: AppendBlobClient | null = null
let cachedReadClient: BlobClient | null = null

export function getAppendClient(): AppendBlobClient {
  if (!cachedAppendClient) {
    cachedAppendClient = new AppendBlobClient(BLOB_URL, credential)
  }
  return cachedAppendClient
}

export function getReadClient(): BlobClient {
  if (!cachedReadClient) {
    cachedReadClient = new BlobClient(BLOB_URL, credential)
  }
  return cachedReadClient
}

// Once the blob has been created in this process we don't need to re-check on
// every request. Surviving a cold-start race is fine — `createIfNotExists`
// returns success for both racers.
let ensured = false

/** Idempotent — safe to call on every request, but typically called once.
 *  When it actually creates the blob (vs finding it already there), it writes
 *  the CSV header as the first row so the file is self-describing and matches
 *  what dbt's raw_events model expects (`header = true`). Without this, the
 *  first data row would be silently consumed as the header on load. */
export async function ensureBlobExists(client: AppendBlobClient): Promise<void> {
  const res = await client.createIfNotExists({
    blobHTTPHeaders: { blobContentType: 'text/csv; charset=utf-8' },
  })
  if (res.succeeded) {
    const header = Buffer.from(CSV_HEADER + '\n', 'utf-8')
    await client.appendBlock(header, header.length)
  }
}

/** Appends one CSV row. Row must NOT include a trailing newline — added here. */
export async function appendRow(row: string): Promise<void> {
  const client = getAppendClient()
  if (!ensured) {
    await ensureBlobExists(client)
    ensured = true
  }
  const payload = Buffer.from(row + '\n', 'utf-8')
  await client.appendBlock(payload, payload.length)
}
