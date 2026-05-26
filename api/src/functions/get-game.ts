import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { BlobClient } from '@azure/storage-blob'
import { DefaultAzureCredential } from '@azure/identity'

// GET /game/{gameId}
// Returns every CSV row for the requested game_id. Used by the SPA on resume
// (e.g. browser refresh mid-game) to rebuild rawLog from the server-side
// truth.
//
// Implementation: streams the entire append blob, line-by-line, and emits
// only rows whose `game_id` matches. Fine for our scale (small log, infrequent
// resume). For a larger app we'd index by game_id or partition per-game.

const ACCOUNT_URL = process.env.RAW_BLOB_ACCOUNT_URL
const CONTAINER   = process.env.RAW_BLOB_CONTAINER ?? 'raw'
const BLOB_NAME   = process.env.RAW_BLOB_NAME ?? 'events.csv'

if (!ACCOUNT_URL) throw new Error('RAW_BLOB_ACCOUNT_URL is not configured')

const credential = new DefaultAzureCredential()
const blobClient = new BlobClient(`${ACCOUNT_URL}/${CONTAINER}/${BLOB_NAME}`, credential)

export async function getGame(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  const gameIdStr = req.params.gameId
  const gameId = Number(gameIdStr)
  if (!Number.isInteger(gameId)) {
    return { status: 400, jsonBody: { error: 'gameId must be an integer' } }
  }

  let buf: Buffer
  try {
    const dl = await blobClient.downloadToBuffer()
    buf = dl
  } catch (err: any) {
    if (err?.statusCode === 404) return { status: 200, body: 'event_id,game_id,timestamp_ms,point_index,type,payload\n' }
    ctx.error('blob read failed', err)
    return { status: 502, jsonBody: { error: 'blob read failed' } }
  }

  const lines = buf.toString('utf-8').split('\n')
  const header = lines[0]
  const matching = lines.slice(1).filter(line => {
    if (!line) return false
    // game_id is the second column; cheaper than a full CSV parse for filter
    const secondComma = line.indexOf(',', line.indexOf(',') + 1)
    const gid = line.slice(line.indexOf(',') + 1, secondComma)
    return Number(gid) === gameId
  })

  return {
    status: 200,
    headers: { 'content-type': 'text/csv; charset=utf-8' },
    body: [header, ...matching, ''].join('\n'),
  }
}

app.http('getGame', {
  methods: ['GET'],
  route: 'game/{gameId}',
  authLevel: 'anonymous',   // TODO: tighten once a game-share-token scheme exists
  handler: getGame,
})
