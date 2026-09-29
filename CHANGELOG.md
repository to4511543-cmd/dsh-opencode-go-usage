# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-09-30

First release.

### Added

- Session-header badge (`conversation.session.header.utilities`) showing the
  OpenCode Go rolling 5-hour, weekly and monthly usage windows.
- Subscription renewal countdown in the badge, and the full renewal date in the
  panel. Derived from the monthly window's reset, which the console anchors on
  the subscription date — for a monthly plan the quota period and the billing
  period are the same interval. Exposed as a `subscription` field on the host
  snapshot together with the recovered monthly anchor.
- Per-window meter bars: green below 50%, amber 50–80%, red at 80%+ or when the
  upstream reports `rate-limited`.
- Hover panel with the renewal date, each window's reset countdown, the resolved
  credential source, the age of the reading, and a manual refresh button.
  Clicking pins the panel; moving away, clicking outside or pressing Escape
  dismisses it.
- Host half that polls `https://opencode.ai/zen/go/v1/usage` once a minute and
  republishes one cached snapshot at `GET /opencode-go-usage/status.json`, so the
  API key never reaches the browser and every open tab shares a single poll.
- `POST /opencode-go-usage/refresh` to force an immediate poll.
- Credential resolution through `ctx.credentials`, with environment, credentials
  file and local key-file fallbacks, re-resolved on every poll so a rotated key
  takes effect without a restart.
- `scripts/verify-client-boot.mjs` — asserts the bundle exports no static
  `inject` (a static `inject` can hang the whole GUI boot) and includes a guard
  for a stray backtick in the stylesheet template literal.
- `scripts/verify-host.mjs` — drives the host routes against a fake cordis
  context; hermetic by default, `--live` to hit the real endpoint.
- `scripts/preview.mjs` — renders the badge to a static HTML page using the
  stylesheet extracted from the shipped bundle and the harness's own theme
  tokens, for visual inspection without a running harness.

[Unreleased]: https://github.com/to4511543-cmd/dsh-opencode-go-usage/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/to4511543-cmd/dsh-opencode-go-usage/releases/tag/v0.1.0
