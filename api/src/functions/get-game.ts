import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getReadClient } from '../shared/blob.js'
import { CSV_HEADER, fieldAt } from '../shared/csv.js'

// GET /game/{gameId}[?segment=<segmentId>]
// Returns CSV rows for the requested game_id. Used by the SPA on resume (e.g.
// browser refresh mid-game) to rebuild rawLog from the server-side truth.
//
// A game can hold many segments (one per scorer); each segment is its own
// append-only log with event ids restarting at 1. Pass `?segment=` to fetch a
// single segment's rows — required when rebuilding one scorer's rawLog, since
// mixing segments would interleave colliding event ids. Without it, every
// segment's rows are returned (e.g. for backend coverage assembly).
//
// Implementation: streams the entire append blob, line-by-line, and emits only
// matching rows. Fine for our scale (small log, infrequent resume). For a
// larger app we'd index by game_id or partition per-game.

const GAME_ID_COL    = CSV_HEADER.split(',').indexOf('game_id')
const SEGMENT_ID_COL = CSV_HEADER.split(',').indexOf('segment_id')
const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8'

export async function getGame(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  const gameIdStr = req.params.gameId
  const gameId = Number(gameIdStr)
  if (!Number.isInteger(gameId)) {
    return { status: 400, jsonBody: { error: 'gameId must be an integer' } }
  }

  const blobClient = getReadClient()

  let buf: Buffer
  try {
    buf = await blobClient.downloadToBuffer()
  } catch (err: any) {
    if (err?.statusCode === 404) {
      return {
        status: 200,
        headers: { 'content-type': CSV_CONTENT_TYPE },
        body: CSV_HEADER + '\n',
      }
    }
    ctx.error('blob read failed', err)
    return { status: 502, jsonBody: { error: 'blob read failed' } }
  }

  const segmentId = req.query.get('segment') ?? undefined

  const lines = buf.toString('utf-8').split('\n')
  const header = lines[0]
  const matching = lines.slice(1).filter(line => {
    if (!line) return false
    if (Number(fieldAt(line, GAME_ID_COL)) !== gameId) return false
    if (segmentId !== undefined && fieldAt(line, SEGMENT_ID_COL) !== segmentId) return false
    return true
  })

  return {
    status: 200,
    headers: { 'content-type': CSV_CONTENT_TYPE },
    body: [header, ...matching, ''].join('\n'),
  }
}

app.http('getGame', {
  methods: ['GET'],
  route: 'game/{gameId}',
  authLevel: 'anonymous',   // TODO: tighten once a game-share-token scheme exists
  handler: getGame,
})
