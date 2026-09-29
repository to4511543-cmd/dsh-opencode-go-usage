# dsh-opencode-go-usage

Keeps your **OpenCode Go** subscription usage — the **rolling 5-hour**, **weekly**, and **monthly** windows — pinned in the DSH **session header**, alongside the **days until your subscription renews**, with a reset countdown and the renewal date one hover away.

> 中文说明见 [README.md](README.md)

## What it solves

While you work, those percentages and the renewal date only exist on a web dashboard: switch away, reload, switch back.
This plugin pins them to the right end of your session title bar and keeps them current:

```
● 5h 11%   ● 7d 7%   ● 30d 4%   续费 21d
```

- **Colour** — green under 50%, amber 50–80%, red at 80%+ or `rate-limited`, with a meter bar beneath each window
- **Renewal countdown** — the trailing segment is the days left on the subscription. It carries **no meter on purpose**: the missing bar is the signal that this number is not the same kind of quantity as the three percentages beside it
- **Hover to expand the detail panel** (no click required): a subscription row first (full renewal date plus days remaining), then one row per window with its meter, percentage and "resets in …" countdown, and the data source with a refresh button at the foot
  - clicking **pins** the panel open so the refresh button stays reachable; moving away, clicking outside, or pressing Escape dismisses it
- **Live** — the host polls upstream once a minute, the badge re-reads once a minute, and the countdowns tick locally every second without extra requests

### Where the renewal date comes from

It is derived from the upstream monthly window, not guessed.

The OpenCode console computes its monthly bounds with `getMonthlyBounds(now, subscribed)`, which anchors the window on the **subscription date** — UTC day-of-month plus time-of-day — and returns the next such anniversary as its `end`. That value is what the endpoint reports as `monthly.resetsAt`. For a monthly plan the quota period and the billing period are the same interval, which is why the dashboard's "Renews in …" and "Monthly usage resets in …" show the same countdown.

The host exposes it as a separate `subscription` field and hands back the recovered anchor:

```json
"subscription": {
  "renewsAt": "2026-10-21T07:57:29.000Z",
  "anchorDayOfMonth": 21,
  "anchorTimeUtc": "07:57:29"
}
```

**What this can and cannot tell you:** the **next** renewal moment is exact, and the recurrence ("the 21st of every month") can be recovered from it. Which month the subscription originally began in is not exposed by this endpoint — that lives behind the console's session login — so an original signup date cannot be derived.

## Install

```sh
dsh plugin --profile <your profile> add github:to4511543-cmd/dsh-opencode-go-usage
```

Then **hard-refresh** the page (**Ctrl+Shift+R** — a plain F5 is not enough, the client bundle is served `immutable`).

![The usage badge in the session header](docs/preview.png)

> The image above is produced by `npm run preview`: it lifts this plugin's own stylesheet out of
> `lib/client.js`, layers the harness's real theme tokens under it, and screenshots the result. It is
> the actual rendering, not an illustration.

### No git? Install from the zip

Download the repository zip, extract it to `~/.dsh/plugins/dsh-opencode-go-usage`, then:

```sh
dsh plugin --profile <your profile> add link:C:/Users/<you>/.dsh/plugins/dsh-opencode-go-usage
```

> Use **forward slashes** in the Windows path. `link:` installs a symlink, so editing files in that
> directory afterwards takes effect without reinstalling.

> The built `lib/` is committed and there are **no `prepare` / `postinstall` lifecycle scripts**, so this
> command compiles nothing and never trips pnpm's `allowBuilds` build-authorization prompt.

## Where the API key comes from

The host resolves the key in this order, first hit wins:

| # | Source |
|---|---|
| 1 | `ctx.credentials.resolve('OPENCODE_GO_API_KEY')` — **the harness's own credential store** (the usual hit) |
| 2 | the `OPENCODE_GO_API_KEY` environment variable — only if you exported it **before** launching DSH |
| 3 | `refs.OPENCODE_GO_API_KEY` read directly out of `~/.dsh/.credentials.yaml` — a fallback |
| 4 | `~/.dsh/opencode-go-usage/key.txt` (plain text, the key alone on one line) |

> Source 1 is re-resolved **on every poll** and never cached — that is what makes a rotated key take effect
> without a restart. Source 3 reads the file directly and is only used when the credential service is
> unavailable: it skips the file lock, the format migration, and the precedence rules.

> **The key never reaches the browser.** The client only reads this plugin's own local route; it never calls
> opencode.ai itself. That also means N open tabs share a single upstream poll.

## Options

| Variable | Default | Meaning |
|---|---|---|
| `DSH_OPENCODE_GO_USAGE_INTERVAL_MS` | `60000` | Poll interval; values below 30000 are ignored |
| `DSH_HOME` | `~/.dsh` | Harness state directory, which relocates sources 3 and 4 |

## Data source and risk (please read)

The percentages come from:

```
GET https://opencode.ai/zen/go/v1/usage
Authorization: Bearer <key>

{"usage":{"rolling":{"status":"ok","percent":11,"resetsAt":"..."},
          "weekly": {"status":"ok","percent":7, "resetsAt":"..."},
          "monthly":{"status":"ok","percent":4, "resetsAt":"..."}}}
```

**This endpoint is not in OpenCode's documentation.** The path was recovered from OpenCode's own console
source (`packages/console/app/src/routes/zen/go/v1/usage.ts`) and confirmed live against a real key.
Consequences:

- upstream may change its shape or withdraw it at any time, with **no stability promise**
- so this plugin parses **every field defensively**: a missing field renders as `—`, an HTTP error renders
  its text, and **nothing ever throws** — a usage badge must not be able to break your session header
- polling has a 30-second floor and a 60-second default, out of respect for the upstream: a 5-hour window
  needs no sub-minute resolution

### The numbers disagree with the dashboard?

Two known differences, neither a bug:

1. **The API returns integers; the dashboard keeps one decimal.** Upstream computes `Math.floor` on the
   percentage while the console front end uses `Math.round(x*10)/10`, so it may show `34.7%` where the API
   reports `34`.
2. **The percentages are relative to their own window, not to the month.** By the Go plan's design the
   5-hour window is 20% of the monthly allowance, the weekly one 50%, the monthly one 100%. So
   `rolling.percent: 100` means "this 5 hours consumed 20% of the monthly allowance", not "all used up".

## Troubleshooting

| Symptom | What to do |
|---|---|
| No badge in the header | **Ctrl+Shift+R**; then confirm the plugin is in that profile's `dsh.profile.bundles` |
| Badge shows `–` | Open the panel and read the error; usually a missing key or an upstream change |
| `HTTP 401` | The key is invalid or revoked — run `opencode auth login opencode` again |
| `HTTP 403` | That key's account has no OpenCode Go subscription |
| Numbers look frozen | The host only polls once a minute; the panel's **refresh** button forces an immediate poll |

Inspect the host side directly:

```sh
curl http://127.0.0.1:<dsh port>/opencode-go-usage/status.json
curl -X POST http://127.0.0.1:<dsh port>/opencode-go-usage/refresh   # force a poll
```

## Development

**There is no build step.** `lib/index.js` and `lib/client.js` are the runnable artifacts:

- `lib/index.js` is plain ESM importing only Node built-ins
- `lib/client.js` is a hand-written `window.__ModuleLoader__.load({ id, factory })` shell using
  `react.createElement` — no JSX, no TypeScript

Edits take effect directly, with no `npm run build` — which is also why the package installs from source
without triggering a build authorization.

Self-checks (no dependencies to install):

```sh
node scripts/verify-client-boot.mjs        # asserts the client half cannot hang the GUI
node scripts/verify-host.mjs               # host routes and error handling, offline (fetch stubbed)
node scripts/verify-host.mjs --live        # hits opencode.ai for real; needs a resolvable key
```

What `verify-client-boot.mjs` asserts is worth spelling out: the client loader treats **any entry that is
not `active`** as fatal (`web boot: N entry did not activate`), and the whole GUI then fails to load. A
static `inject` naming a service the host cannot supply holds this plugin's fiber `pending` forever. So the
script asserts the artifact exports **no static `inject`**, and that `apply()` stays **silently idle**
rather than throwing when `slots` is missing.

## License

MIT, see [LICENSE](LICENSE).
