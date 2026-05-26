import { AppendBlobClient } from '@azure/storage-blob'
import { DefaultAzureCredential } from '@azure/identity'

// Append-only blob holding the raw event log. The append-blob type is the
// right Azure primitive for "events streaming in from a low-throughput API"
// — single-writer, append-from-end, max 50k blocks per blob (~50k events).
//
// If we ever blow the 50k-block ceiling we'll need to roll to a new blob
// (events-2026-05.csv.gz, etc.) and have the dbt pipeline glob across them.
// Not worrying about that yet.
//
// Each appended block is ONE CSV row terminated by \n.

const ACCOUNT_URL = process.env.RAW_BLOB_ACCOUNT_URL
const CONTAINER   = process.env.RAW_BLOB_CONTAINER ?? 'raw'
const BLOB_NAME   = process.env.RAW_BLOB_NAME ?? 'events.csv'

if (!ACCOUNT_URL) {
  // Fail at import so misconfigured deploys crash on cold-start, not on first
  // request. Local dev sets this from local.settings.json.
  throw new Error('RAW_BLOB_ACCOUNT_URL is not configured')
}

const credential = new DefaultAzureCredential()

let cachedClient: AppendBlobClient | null = null

export function getAppendClient(): AppendBlobClient {
  if (!cachedClient) {
    const url = `${ACCOUNT_URL}/${CONTAINER}/${BLOB_NAME}`
    cachedClient = new AppendBlobClient(url, credential)
  }
  return cachedClient
}

/** Idempotent — safe to call on every request. */
export async function ensureBlobExists(client: AppendBlobClient): Promise<void> {
  try {
    await client.createIfNotExists({
      blobHTTPHeaders: { blobContentType: 'text/csv; charset=utf-8' },
    })
  } catch (err) {
    // If two cold-starts race the create, both will return success-or-conflict;
    // surface anything else.
    throw err
  }
}

/** Appends one CSV row. Row must NOT include a trailing newline — added here. */
export async function appendRow(row: string): Promise<void> {
  const client = getAppendClient()
  await ensureBlobExists(client)
  const payload = Buffer.from(row + '\n', 'utf-8')
  await client.appendBlock(payload, payload.length)
}
