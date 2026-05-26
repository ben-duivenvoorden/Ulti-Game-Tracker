import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { eventToCsvRow, validateIncoming } from '../shared/csv.js'
import { appendRow } from '../shared/blob.js'

// POST /events
// Body: a single RawEvent JSON object (see client/src/core/types.ts).
// Appends a CSV row to the public raw events blob.

// Anonymous endpoint — defence-in-depth bound on a request body that should
// only ever be one small event (~1 KB worst case). Missing/invalid header
// falls through to the JSON parser as before.
const MAX_EVENT_BYTES = 16 * 1024

export async function postEvents(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  const declaredLen = Number(req.headers.get('content-length'))
  if (declaredLen > MAX_EVENT_BYTES) {
    return { status: 413, jsonBody: { error: 'event too large' } }
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return { status: 400, jsonBody: { error: 'invalid JSON' } }
  }

  try {
    validateIncoming(body)
  } catch (err) {
    return { status: 400, jsonBody: { error: (err as Error).message } }
  }

  const row = eventToCsvRow(body)

  try {
    await appendRow(row)
  } catch (err) {
    ctx.error('append failed', err)
    return { status: 502, jsonBody: { error: 'append failed' } }
  }

  return { status: 204 }
}

app.http('postEvents', {
  methods: ['POST'],
  route: 'events',
  authLevel: 'anonymous',   // TODO: tighten once a game-share-token scheme exists
  handler: postEvents,
})
