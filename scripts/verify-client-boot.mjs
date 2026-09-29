/**
 * verify-client-boot.mjs — this plugin must not be able to hang the web boot.
 *
 * The client loader treats ANY entry that is not `active` as fatal
 * ("web boot: N entry did not activate") and the whole GUI then fails to load.
 * A static `inject` is what holds a fiber in `pending` when the host cannot
 * supply a service — so the invariant asserted here is that the bundle exports
 * NO static `inject` at all, and that `apply()` stays idle (rather than
 * throwing, and rather than mounting) whenever `slots` is missing.
 *
 * Usage: node scripts/verify-client-boot.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUNDLE = join(HERE, '..', 'lib', 'client.js')

const reactStub = {
  createElement: () => null,
  useCallback: (fn) => fn,
  useEffect: () => {},
  useRef: () => ({ current: null }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
}

let loaded = null
globalThis.window = {
  __ModuleLoader__: {
    load: ({ factory }) => {
      loaded = factory((name) => {
        if (name === 'react' || name === 'react/jsx-runtime') return reactStub
        throw new Error(`unexpected require(${name})`)
      })
    },
  },
}

const styles = []
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ style: {}, textContent: '', id: '' }),
  head: { appendChild: (el) => styles.push(el) },
  addEventListener: () => {},
  removeEventListener: () => {},
}
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ status: 'ok' }) })

const SOURCE = readFileSync(BUNDLE, 'utf8')

/**
 * Guard the stylesheet template literal before evaluating anything.
 *
 * The CSS is a JS template literal, so ONE stray backtick inside a CSS comment
 * ends it early and the rest of the stylesheet is then parsed as JavaScript.
 * The parser reports something wildly misleading for that ("Unexpected
 * identifier 'display'"), so this check names the real cause instead.
 */
{
  const marker = 'style.textContent = `'
  const at = SOURCE.indexOf(marker)
  if (at === -1) {
    console.error('verify-client-boot: no stylesheet block found in the bundle')
    process.exit(2)
  }
  const close = SOURCE.indexOf('`', at + marker.length)
  const after = SOURCE.slice(close + 1, close + 2)
  if (after !== ';') {
    const line = SOURCE.slice(0, close).split('\n').length
    console.error(
      `verify-client-boot: the stylesheet template literal ends early at line ${line} ` +
        `(found ${JSON.stringify(after)} after the closing backtick, expected ";").\n` +
        'A backtick inside a CSS comment does this. The stylesheet is a JS template literal — remove it.',
    )
    process.exit(2)
  }
}

try {
  // eslint-disable-next-line no-eval
  eval(SOURCE)
} catch (error) {
  console.error(`verify-client-boot: evaluating the bundle threw — ${String(error?.message ?? error)}`)
  process.exit(2)
}
const failures = []
const check = (ok, label) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) failures.push(label)
}

console.log(`bundle: ${BUNDLE}\n`)
console.log('static surface:')
check(loaded !== null && typeof loaded.apply === 'function', 'exports apply()')
check(
  loaded.inject === undefined,
  'exports no static `inject` (the field the boot check walks — absent means it cannot be pending)',
)

/** A ctx whose slots service records registrations. */
function makeCtx({ withDynamicInject = true, provideSlots = true } = {}) {
  const registrations = []
  const slots = {
    inject: (_name, callback) => {
      if (typeof callback === 'function') callback()
      return () => {}
    },
    register: (options) => {
      registrations.push(options.name)
      return () => {}
    },
  }
  const ctx = { slots: provideSlots ? slots : undefined, effect: (callback) => callback() }
  if (withDynamicInject) {
    ctx.inject = (_deps, callback) => {
      if (provideSlots) callback(ctx)
      return { dispose: () => {} }
    }
  }
  return { ctx, registrations }
}

const SLOT = 'conversation.session.header.utilities'

console.log('\nbehaviour:')
{
  const { ctx, registrations } = makeCtx({ provideSlots: false })
  let threw = null
  try {
    loaded.apply(ctx)
  } catch (error) {
    threw = String(error?.message ?? error)
  }
  check(threw === null, `apply() with slots absent does not throw${threw === null ? '' : ` (threw: ${threw})`}`)
  check(registrations.length === 0, 'apply() with slots absent mounts nothing')
}
{
  const { ctx, registrations } = makeCtx({ provideSlots: true })
  let threw = null
  try {
    loaded.apply(ctx)
  } catch (error) {
    threw = String(error?.message ?? error)
  }
  check(threw === null, `apply() with slots present does not throw${threw === null ? '' : ` (threw: ${threw})`}`)
  check(registrations.length === 1, `mounts exactly one seat (got ${registrations.length}: ${registrations.join(', ') || 'none'})`)
  check(registrations.includes(SLOT), `registers ${SLOT}`)
}
{
  const { ctx, registrations } = makeCtx({ withDynamicInject: false, provideSlots: false })
  let threw = null
  try {
    loaded.apply(ctx)
  } catch (error) {
    threw = String(error?.message ?? error)
  }
  check(threw === null, 'apply() without dynamic injection and without slots stays idle without throwing')
  check(registrations.length === 0, 'idle path mounts nothing')
}
{
  const { ctx, registrations } = makeCtx({ withDynamicInject: false, provideSlots: true })
  let threw = null
  try {
    loaded.apply(ctx)
  } catch (error) {
    threw = String(error?.message ?? error)
  }
  check(threw === null, 'apply() without dynamic injection but with slots does not throw')
  check(registrations.length === 1, `falls back to a direct mount (got ${registrations.length})`)
}

console.log('')
if (failures.length === 0) {
  console.log('all client-boot checks passed')
  process.exit(0)
}
console.log(`${failures.length} check(s) failed:`)
for (const failure of failures) console.log('  - ' + failure)
process.exit(1)
