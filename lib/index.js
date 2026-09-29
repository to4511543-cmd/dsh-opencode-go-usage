/**
 * dsh-opencode-go-usage — host half.
 *
 * Polls the (undocumented) OpenCode Go usage endpoint and republishes one cached
 * snapshot over a local route, so the browser half never talks to opencode.ai
 * itself: the API key stays on the host, and N open tabs share one upstream poll.
 *
 *   GET  https://opencode.ai/zen/go/v1/usage
 *        Authorization: Bearer <key>
 *     -> { usage: { rolling: {status, percent, resetsAt},
 *                   weekly:  {status, percent, resetsAt},
 *                   monthly: {status, percent, resetsAt} } }
 *
 * The endpoint is not in OpenCode's docs. Everything below parses defensively
 * and degrades to an error string rather than throwing, because an undocumented
 * shape can change without notice.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'dsh-opencode-go-usage'
export const inject = ['webServer']

/** No trailing slash: the webserver matches a prefix as `p` or `p/<anything>`. */
const ROUTE = '/opencode-go-usage'
const UPSTREAM = 'https://opencode.ai/zen/go/v1/usage'
const CREDENTIAL_NAME = 'OPENCODE_GO_API_KEY'

/** Documented-by-observation courtesy floor; a 5-hour window needs no sub-minute resolution. */
const MIN_INTERVAL_MS = 30_000
const DEFAULT_INTERVAL_MS = 60_000
const REQUEST_TIMEOUT_MS = 15_000

const WINDOWS = ['rolling', 'weekly', 'monthly']

function readVersion() {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

const VERSION = readVersion()

function resolveHome() {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.trim() !== '') return configured.trim()
  return join(homedir(), '.dsh')
}

function parseInterval() {
  const raw = Number(process.env.DSH_OPENCODE_GO_USAGE_INTERVAL_MS)
  if (!Number.isFinite(raw) || raw < MIN_INTERVAL_MS) return DEFAULT_INTERVAL_MS
  return Math.floor(raw)
}

function stripQuotes(value) {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1)
    }
  }
  return trimmed
}

/**
 * Read `refs.<key>` out of the DSH credentials file without a YAML dependency.
 *
 * The file is a flat two-level map, so a line scan is exact enough: a line at
 * column 0 opens a section, indented `key: value` lines belong to it. Anything
 * more structural would need a real parser for no benefit here.
 *
 * @param key - credential name, e.g. `OPENCODE_GO_API_KEY`.
 * @returns the secret, or undefined when absent/unreadable.
 */
function readCredentialRef(key) {
  const candidates = [join(resolveHome(), '.credentials.yaml'), join(homedir(), '.dsh', '.credentials.yaml')]
  for (const file of candidates) {
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    let inRefs = false
    for (const line of text.split(/\r?\n/)) {
      if (/^\S/.test(line)) {
        inRefs = /^refs:\s*$/.test(line)
        continue
      }
      if (!inRefs) continue
      const match = /^\s+([A-Za-z0-9_]+):\s*(.+?)\s*$/.exec(line)
      if (match !== null && match[1] === key) {
        const value = stripQuotes(match[2])
        if (value !== '') return value
      }
    }
  }
  return undefined
}

/** Set once by `apply`; `serve` needs it too, and the module is evaluated once. */
let hostCtx = null

/**
 * Resolve the API key, most authoritative source first.
 *
 * `ctx.credentials` is the harness's own store: it owns precedence, the file
 * lock, and hot reload, so it is tried first. The read is deliberately NOT
 * cached across polls — that per-call resolve is precisely what makes a rotated
 * key take effect without a restart.
 *
 * The remaining readers exist for compositions that do not mount the service,
 * and for shells that export the key. Note that a default DSH profile never
 * materializes credentials into `process.env`, so the env reader only fires for
 * a key the user actually exported before launching DSH.
 *
 * @returns the key and a human-readable provenance label, or nulls.
 */
async function resolveApiKey() {
  if (hostCtx !== null && typeof hostCtx.get === 'function') {
    const credentials = hostCtx.get('credentials')
    if (credentials !== undefined && typeof credentials.resolve === 'function') {
      try {
        const hit = await credentials.resolve(CREDENTIAL_NAME)
        if (hit !== undefined && typeof hit.value === 'string' && hit.value !== '') {
          return { key: hit.value, source: `credentials (${hit.source ?? 'store'})` }
        }
      } catch {
        /* fall through to the readers below */
      }
    }
  }
  const fromEnv = process.env[CREDENTIAL_NAME]
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') {
    return { key: fromEnv.trim(), source: `env ${CREDENTIAL_NAME}` }
  }
  const fromCredentials = readCredentialRef(CREDENTIAL_NAME)
  if (fromCredentials !== undefined) {
    return { key: fromCredentials, source: `credentials file refs.${CREDENTIAL_NAME}` }
  }
  const file = join(resolveHome(), 'opencode-go-usage', 'key.txt')
  try {
    const raw = readFileSync(file, 'utf8').trim()
    if (raw !== '') return { key: raw, source: `file ${file}` }
  } catch {
    /* absent is the normal case */
  }
  return { key: undefined, source: null }
}

/** Coerce one window's payload; returns null when it carries nothing usable. */
function normalizeWindow(raw) {
  if (raw === null || typeof raw !== 'object') return null
  const percent = typeof raw.percent === 'number' && Number.isFinite(raw.percent) ? raw.percent : null
  const status = typeof raw.status === 'string' ? raw.status : 'unknown'
  const resetsAt = typeof raw.resetsAt === 'string' ? raw.resetsAt : null
  if (percent === null && resetsAt === null) return null
  return { percent, status, resetsAt }
}

function normalize(body) {
  const usage = body !== null && typeof body === 'object' ? body.usage : undefined
  const out = {}
  for (const window of WINDOWS) {
    out[window] = normalizeWindow(usage !== null && typeof usage === 'object' ? usage[window] : undefined)
  }
  return out
}

/** The one mutable thing in this plugin: the last poll's outcome. */
const state = {
  status: 'starting',
  usage: null,
  error: null,
  source: null,
  fetchedAt: null,
  polls: 0,
  intervalMs: DEFAULT_INTERVAL_MS,
  version: VERSION,
}

async function poll() {
  const { key, source } = await resolveApiKey()
  state.source = source
  if (key === undefined) {
    state.status = 'error'
    state.error =
      `no OpenCode Go API key: set ${CREDENTIAL_NAME}, or add refs.${CREDENTIAL_NAME} to ` +
      `${join(resolveHome(), '.credentials.yaml')}`
    state.fetchedAt = Date.now()
    return
  }
  try {
    const res = await fetch(UPSTREAM, {
      headers: {
        Authorization: `Bearer ${key}`,
        'User-Agent': `${name}/${VERSION}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const text = await res.text()
    if (!res.ok) {
      state.status = 'error'
      state.error = `HTTP ${res.status}: ${text.slice(0, 300)}`
    } else {
      state.usage = normalize(JSON.parse(text))
      state.status = 'ok'
      state.error = null
    }
  } catch (error) {
    state.status = 'error'
    state.error = String(error?.message ?? error)
  }
  state.fetchedAt = Date.now()
  state.polls += 1
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    // Never cache: the whole point is a live reading, and the client re-polls.
    'cache-control': 'no-store',
  })
  res.end(body)
}

/**
 * Recover the subscription renewal moment from the monthly window.
 *
 * The console computes its monthly bounds with `getMonthlyBounds(now, subscribed)`,
 * which anchors the window on the SUBSCRIPTION date — UTC day-of-month plus
 * time-of-day — and returns the next such anniversary as its `end`. That value
 * is what this endpoint reports as `monthly.resetsAt`. For a monthly plan the
 * quota window and the billing period therefore coincide, which is why the
 * dashboard's "Renews in ..." and "Monthly usage resets in ..." show the same
 * countdown.
 *
 * Only the NEXT anniversary is recoverable. The anchor's day and time-of-day are
 * exact, but the endpoint does not expose which month the subscription actually
 * began in, so an original signup date cannot be derived from it.
 *
 * @param usage - normalized usage windows, or null.
 * @returns the renewal moment and the recovered anchor, or null.
 */
function subscriptionFrom(usage) {
  const monthly = usage === null || usage === undefined ? null : usage.monthly
  const iso = monthly === null || monthly === undefined ? null : monthly.resetsAt
  if (typeof iso !== 'string') return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const pad = (n) => String(n).padStart(2, '0')
  return {
    renewsAt: iso,
    // The recurrence itself, e.g. every 21st at 07:57:29 UTC.
    anchorDayOfMonth: at.getUTCDate(),
    anchorTimeUtc: `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}`,
  }
}

function snapshot() {
  return {
    status: state.status,
    usage: state.usage,
    subscription: subscriptionFrom(state.usage),
    error: state.error,
    source: state.source,
    fetchedAt: state.fetchedAt,
    ageMs: state.fetchedAt === null ? null : Date.now() - state.fetchedAt,
    polls: state.polls,
    intervalMs: state.intervalMs,
    version: state.version,
  }
}

/** Handler signature is `(req, res)` — the webserver does not pass the URL separately. */
async function serve(req, res) {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
  const sub = pathname.slice(ROUTE.length)

  if (sub === '/status.json' || sub === '' || sub === '/') {
    sendJson(res, 200, snapshot())
    return
  }

  if (sub === '/refresh') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method not allowed; POST /refresh' })
      return
    }
    await poll()
    sendJson(res, 200, snapshot())
    return
  }

  sendJson(res, 404, { error: `no route: ${pathname}` })
}

/**
 * @param ctx - cordis context; `webServer` is guaranteed by the static inject above.
 */
export function apply(ctx) {
  hostCtx = ctx
  state.intervalMs = parseInterval()

  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: ROUTE, handler: serve }),
    'dsh-opencode-go-usage: status route',
  )

  ctx.effect(() => {
    // Prime immediately so the first badge render has data instead of a spinner.
    void poll()
    const handle = setInterval(() => void poll(), state.intervalMs)
    return () => clearInterval(handle)
  }, 'dsh-opencode-go-usage: usage poller')
}
