// Dev-only local stand-in for the two Functions HTTP endpoints, used when Azure
// Functions Core Tools can't run locally (e.g. the installed host rejects the
// machine's Node version). It reuses the REAL shared modules (csv + blob,
// compiled to dist/) so the schema / validation / append / read paths are byte-
// identical to what the deployed Functions do. NOT deployed — local E2E only.
//
//   node scripts/local-server.cjs      (after `npm run build`, with Azurite up)
//
// Mirrors api/src/functions/post-events.ts and get-game.ts.

const { createServer } = require('node:http')

// Point at Azurite by default (same as local.settings.json). Must be set before
// requiring blob.js, which reads these at module load.
process.env.RAW_BLOB_CONNECTION_STRING ||= 'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;'
process.env.RAW_BLOB_CONTAINER ||= 'raw'
process.env.RAW_BLOB_NAME ||= 'events.csv'

const { CSV_HEADER, eventToCsvRow, validateIncoming, fieldAt } = require('../dist/src/shared/csv.js')
const { appendRow, getReadClient } = require('../dist/src/shared/blob.js')

const GAME_ID_COL    = CSV_HEADER.split(',').indexOf('game_id')
const SEGMENT_ID_COL = CSV_HEADER.split(',').indexOf('segment_id')
const PORT = 7071

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
}

const server = createServer(async (req, res) => {
  cors(res)
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  const url = new URL(req.url, 'http://localhost')

  // POST /api/events
  if (req.method === 'POST' && url.pathname === '/api/events') {
    let body = ''
    for await (const chunk of req) body += chunk
    let parsed
    try { parsed = JSON.parse(body) } catch { res.writeHead(400); res.end('invalid JSON'); return }
    try { validateIncoming(parsed) } catch (e) { res.writeHead(400); res.end(String(e.message)); return }
    try { await appendRow(eventToCsvRow(parsed)) }
    catch (e) { console.error('append failed', e); res.writeHead(502); res.end('append failed'); return }
    res.writeHead(204); res.end(); return
  }

  // GET /api/game/{id}[?segment=]
  const m = url.pathname.match(/^\/api\/game\/(\d+)$/)
  if (req.method === 'GET' && m) {
    const gameId = Number(m[1])
    const segment = url.searchParams.get('segment') ?? undefined
    let buf
    try { buf = await getReadClient().downloadToBuffer() }
    catch (e) {
      if (e && e.statusCode === 404) { res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8' }); res.end(CSV_HEADER + '\n'); return }
      console.error('read failed', e); res.writeHead(502); res.end('read failed'); return
    }
    const lines = buf.toString('utf-8').split('\n')
    const header = lines[0]
    const rows = lines.slice(1).filter(line => {
      if (!line) return false
      if (Number(fieldAt(line, GAME_ID_COL)) !== gameId) return false
      if (segment !== undefined && fieldAt(line, SEGMENT_ID_COL) !== segment) return false
      return true
    })
    res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8' })
    res.end([header, ...rows, ''].join('\n'))
    return
  }

  res.writeHead(404); res.end('not found')
})

server.listen(PORT, () => console.log(`[local-api] reusing dist/ shared modules, listening on http://localhost:${PORT}`))
