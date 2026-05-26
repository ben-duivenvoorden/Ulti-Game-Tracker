import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { eventToCsvRow, validateIncoming } from '../shared/csv.js'
import { appendRow } from '../shared/blob.js'

// POST /events
// Body: a single RawEvent JSON object (see client/src/core/types.ts).
// Appends a CSV row to the public raw events blob.

export async function postEvents(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
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
