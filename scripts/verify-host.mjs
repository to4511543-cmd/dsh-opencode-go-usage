/**
 * verify-host.mjs — exercise the host half without a running harness.
 *
 * Mounts `lib/index.js` against a fake cordis context, captures the route it
 * registers, and drives that handler with fake req/res objects. Hermetic by
 * default (fetch is stubbed); pass --live to hit the real endpoint, which
 * requires a resolvable OpenCode Go API key.
 *
 * Usage:
 *   node scripts/verify-host.mjs
 *   node scripts/verify-host.mjs --live
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ENTRY = join(HERE, '..', 'lib', 'index.js')
const ROOT = '/opencode-go-usage'
const LIVE = process.argv.includes('--live')

const failures = []
const check = (ok, label) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) failures.push(label)
}

/**
 * Whether the fake ctx exposes the harness credentials service. Flipped mid-run
 * to prove the fallback chain, because `resolve` is consulted per poll.
 */
let credentialMode = 'ok'
const CREDENTIAL_VALUE = 'oc_sk_from_the_credentials_service'

/**
 * Decode the real ref straight out of the harness credentials file.
 *
 * LIVE mode needs this: the fake credential service below must hand back a key
 * that actually works, otherwise the run would "prove" the credentials path by
 * failing on a bogus token. Reading it here (rather than reusing the plugin's
 * own reader) keeps the test honest — it is not exercising the code under test
 * to build its own input.
 */
function readRealCredential() {
  const candidates = [join(homedir(), '.dsh', '.credentials.yaml'), join(process.env.DSH_HOME ?? '', '.credentials.yaml')]
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
      const match = /^\s+OPENCODE_GO_API_KEY:\s*(.+?)\s*$/.exec(line)
      if (match !== null) return match[1].replace(/^['"]|['"]$/g, '')
    }
  }
  return undefined
}

/** Capture the registered route and the effect disposers. */
function makeCtx() {
  const ctx = {
    routes: [],
    disposers: [],
    webServer: {
      register(route) {
        ctx.routes.push(route)
        return () => {}
      },
    },
    effect(callback, label) {
      const dispose = callback()
      if (typeof dispose === 'function') ctx.disposers.push({ label, dispose })
      return () => {}
    },
    get(serviceName) {
      if (serviceName !== 'credentials' || credentialMode === 'absent') return undefined
      return {
        async resolve(ref) {
          if (ref !== 'OPENCODE_GO_API_KEY') return undefined
          if (!LIVE) return { value: CREDENTIAL_VALUE, source: 'file' }
          const real = readRealCredential()
          return real === undefined ? undefined : { value: real, source: 'file' }
        },
      }
    },
  }
  return ctx
}

function makeRes() {
  const res = {
    status: null,
    headers: null,
    body: '',
    writeHead(status, headers) {
      res.status = status
      res.headers = headers
      return res
    },
    end(chunk) {
      res.body = chunk ?? ''
      return res
    },
  }
  return res
}

async function call(handler, method, path) {
  const res = makeRes()
  await handler({ method, url: path }, res)
  let json = null
  try {
    json = JSON.parse(res.body)
  } catch {
    /* non-JSON bodies are a failure we report through the assertions */
  }
  return { res, json }
}

const realFetch = globalThis.fetch
let fetchCalls = 0
let upstreamStatus = 200
let upstreamBody = JSON.stringify({
  usage: {
    rolling: { status: 'ok', percent: 42, resetsAt: new Date(Date.now() + 3 * 3600e3).toISOString() },
    weekly: { status: 'ok', percent: 17, resetsAt: new Date(Date.now() + 5 * 86400e3).toISOString() },
    monthly: { status: 'rate-limited', percent: 100, resetsAt: new Date(Date.now() + 21 * 86400e3).toISOString() },
  },
})

if (!LIVE) {
  // Pin the credential so a hermetic run does not depend on this machine.
  process.env.OPENCODE_GO_API_KEY = 'oc_sk_hermetic_test_key_0000000000000000000000000000'
  globalThis.fetch = async () => {
    fetchCalls += 1
    return {
      ok: upstreamStatus >= 200 && upstreamStatus < 300,
      status: upstreamStatus,
      text: async () => upstreamBody,
    }
  }
}

console.log(`entry: ${ENTRY}`)
console.log(`mode:  ${LIVE ? 'LIVE (hits opencode.ai)' : 'hermetic (fetch stubbed)'}\n`)

console.log('mount:')
const mod = await import(pathToFileURL(ENTRY).href)
check(typeof mod.apply === 'function', 'exports apply()')
check(Array.isArray(mod.inject) && mod.inject.includes('webServer'), "exports inject ['webServer']")
check(typeof mod.name === 'string' && mod.name.length > 0, 'exports a name')

const ctx = makeCtx()
mod.apply(ctx)
check(ctx.routes.length === 1, `registers exactly one route (got ${ctx.routes.length})`)
const route = ctx.routes[0]
check(route?.kind === 'prefix', "route kind is 'prefix'")
check(route?.path === ROOT, `route path is ${ROOT}`)
check(typeof route?.handler === 'function', 'route carries a handler')
check(ctx.disposers.length >= 2, `registers effect disposers (got ${ctx.disposers.length})`)

// The prime poll is fired-and-forgotten inside apply; give it a turn to settle.
await new Promise((resolve) => setTimeout(resolve, LIVE ? 4000 : 50))
const handler = route.handler

console.log('\nroutes:')
{
  const { res, json } = await call(handler, 'GET', `${ROOT}/status.json`)
  check(res.status === 200, `GET /status.json -> 200 (got ${res.status})`)
  check(res.headers?.['cache-control'] === 'no-store', 'status.json is cache-control: no-store')
  check(json !== null, 'status.json parses as JSON')
  check(json?.status === 'ok', `status is ok (got ${JSON.stringify(json?.status)})`)
  check(json?.usage !== null && typeof json?.usage === 'object', 'carries a usage object')
  for (const window of ['rolling', 'weekly', 'monthly']) {
    const reading = json?.usage?.[window]
    check(
      reading !== null && reading !== undefined && typeof reading.percent === 'number',
      `${window}.percent is a number (got ${JSON.stringify(reading?.percent)})`,
    )
    check(typeof reading?.resetsAt === 'string', `${window}.resetsAt is an ISO string`)
  }
  // Hermetic-only: this asserts the *fixture* carries a rate-limited window
  // through untouched. A live account is normally `ok`, so it proves nothing there.
  if (!LIVE) check(json?.usage?.monthly?.status === 'rate-limited', 'preserves the rate-limited status verbatim')

  check(typeof json?.subscription?.renewsAt === 'string', 'derives a subscription renewal moment')
  check(
    json?.subscription?.renewsAt === json?.usage?.monthly?.resetsAt,
    'the renewal IS the monthly reset — the console anchors that window on the subscription date',
  )
  check(
    Number.isInteger(json?.subscription?.anchorDayOfMonth) &&
      typeof json?.subscription?.anchorTimeUtc === 'string' &&
      /^\d{2}:\d{2}:\d{2}$/.test(json.subscription.anchorTimeUtc),
    `recovers the monthly anchor (day ${json?.subscription?.anchorDayOfMonth} at ${json?.subscription?.anchorTimeUtc} UTC)`,
  )
  // The anchor must survive as the same instant it was derived from, or the
  // displayed recurrence would name a different moment than the renewal date.
  if (typeof json?.subscription?.renewsAt === 'string') {
    const at = new Date(json.subscription.renewsAt)
    check(
      at.getUTCDate() === json.subscription.anchorDayOfMonth,
      `anchor day matches the renewal timestamp (${at.getUTCDate()} vs ${json.subscription.anchorDayOfMonth})`,
    )
  }

  check(
    typeof json?.source === 'string' && json.source.startsWith('credentials'),
    `prefers ctx.credentials over every fallback (source: ${json?.source})`,
  )
}
{
  const { res, json } = await call(handler, 'GET', `${ROOT}/refresh`)
  check(res.status === 405, `GET /refresh -> 405 (got ${res.status})`)
  check(typeof json?.error === 'string', '405 carries an error message')
}
{
  const { res } = await call(handler, 'GET', `${ROOT}/nope.json`)
  check(res.status === 404, `GET /nope.json -> 404 (got ${res.status})`)
}
{
  const before = fetchCalls
  const { res, json } = await call(handler, 'POST', `${ROOT}/refresh`)
  check(res.status === 200, `POST /refresh -> 200 (got ${res.status})`)
  check(json?.status === 'ok', 'refresh returns a settled snapshot')
  if (!LIVE) check(fetchCalls === before + 1, `refresh forces exactly one upstream poll (got ${fetchCalls - before})`)
}

if (!LIVE) {
  console.log('\nupstream failure handling:')
  upstreamStatus = 401
  upstreamBody = '{"type":"error","error":{"type":"AuthError","message":"Unauthorized"}}'
  const { res, json } = await call(handler, 'POST', `${ROOT}/refresh`)
  check(res.status === 200, 'a failed upstream still answers the local route with 200')
  check(json?.status === 'error', `upstream 401 surfaces as status error (got ${JSON.stringify(json?.status)})`)
  check(typeof json?.error === 'string' && json.error.includes('401'), `error text names the status (${JSON.stringify(json?.error)})`)

  console.log('\ncredential precedence:')
  {
    credentialMode = 'absent'
    const { json: fallback } = await call(handler, 'POST', `${ROOT}/refresh`)
    check(
      fallback?.source === 'env OPENCODE_GO_API_KEY',
      `falls back to env when the credentials service is absent (source: ${fallback?.source})`,
    )
  }

  console.log('\nmissing credential:')
  const saved = {
    OPENCODE_GO_API_KEY: process.env.OPENCODE_GO_API_KEY,
    DSH_HOME: process.env.DSH_HOME,
    USERPROFILE: process.env.USERPROFILE,
  }
  process.env.OPENCODE_GO_API_KEY = ''
  process.env.DSH_HOME = join(HERE, '..', '.no-such-home')
  // os.homedir() reads USERPROFILE on Windows and the resolver's second
  // candidate is <home>/.dsh/.credentials.yaml — both must miss for this to
  // actually exercise the no-key path.
  process.env.USERPROFILE = join(HERE, '..', '.no-such-user')
  const { json: bare } = await call(handler, 'POST', `${ROOT}/refresh`)
  check(bare?.status === 'error', 'a missing key is an error, not a throw')
  check(typeof bare?.error === 'string' && bare.error.includes('API key'), `error explains the key (${JSON.stringify(bare?.error)})`)
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }

  globalThis.fetch = realFetch
}

// Release the poller so the process can exit.
for (const { dispose } of ctx.disposers) dispose()

console.log('')
if (failures.length === 0) {
  console.log('all host checks passed')
  process.exit(0)
}
console.log(`${failures.length} check(s) failed:`)
for (const failure of failures) console.log('  - ' + failure)
process.exit(1)
