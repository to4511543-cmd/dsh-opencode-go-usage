/**
 * preview.mjs — render the badge to a static HTML page for visual inspection.
 *
 * The badge is pure CSS over a fixed DOM shape, so it can be rendered without
 * DSH, React, or a bundler: this extracts the stylesheet out of the shipped
 * `lib/client.js` (so the preview can never drift from the real artifact) and
 * rebuilds the markup the component produces.
 *
 * Theme tokens are resolved from the installed harness stylesheet when one can
 * be found, because the point of the preview is to show the colours the user
 * will actually get. Without it the CSS falls back to its own literals.
 *
 * Usage:
 *   node scripts/preview.mjs                  # writes preview.html
 *   DSH_THEME_CSS=<path to a harness .css> node scripts/preview.mjs
 *
 * Then screenshot it, e.g. with Edge:
 *   msedge --headless --disable-gpu --force-device-scale-factor=2 \
 *          --window-size=760,470 --screenshot=preview.png preview.html
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const BUNDLE = join(ROOT, 'lib', 'client.js')
const OUT = join(ROOT, 'preview.html')

/** Pull the injected stylesheet back out of the bundle. */
function extractCss(source) {
  const start = source.indexOf('style.textContent = `')
  if (start === -1) throw new Error('preview: could not find the style block in lib/client.js')
  const from = start + 'style.textContent = `'.length
  const end = source.indexOf('`;', from)
  if (end === -1) throw new Error('preview: unterminated style template literal')
  return source.slice(from, end)
}

/** Find an installed harness stylesheet to source real token values from. */
function findThemeCss() {
  if (process.env.DSH_THEME_CSS) return process.env.DSH_THEME_CSS
  const roots = [
    join(process.env.USERPROFILE ?? '', '.dsh', 'profiles', 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'assets'),
  ]
  for (const root of roots) {
    if (!existsSync(root)) continue
    const hit = readdirSync(root).find((name) => name.endsWith('.css') && name.startsWith('index-'))
    if (hit !== undefined) return join(root, hit)
  }
  return undefined
}

/**
 * Build a token table from the harness stylesheet.
 *
 * Names that are declared more than once are the light/dark pairs, and the dark
 * declaration comes second in every pair this stylesheet ships — so last wins.
 */
function readTokens(cssPath) {
  if (cssPath === undefined) return null
  let css
  try {
    css = readFileSync(cssPath, 'utf8')
  } catch {
    return null
  }
  const raw = new Map()
  for (const match of css.matchAll(/(--dsw-[a-zA-Z0-9-]+)\s*:\s*([^;}]+)/g)) {
    raw.set(match[1], match[2].trim())
  }
  /** Resolve `var(--x)` chains to concrete values. */
  const resolve = (value, depth = 0) => {
    if (depth > 6) return value
    return value.replace(/var\((--[a-zA-Z0-9-]+)(?:\s*,\s*([^)]+))?\)/g, (_all, name, fallback) => {
      const hit = raw.get(name)
      if (hit === undefined) return fallback === undefined ? 'inherit' : fallback.trim()
      return resolve(hit, depth + 1)
    })
  }
  const out = new Map()
  for (const [name, value] of raw) out.set(name, resolve(value))
  return out
}

const css = extractCss(readFileSync(BUNDLE, 'utf8'))
const themePath = findThemeCss()
const tokens = readTokens(themePath)

const WOULD_USE = [
  '--dsw-font-family',
  '--dsw-alias-bg-layer-3',
  '--dsw-alias-bg-overlay',
  '--dsw-alias-border-l1',
  '--dsw-alias-border-l2',
  '--dsw-alias-border-l3',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-secondary',
  '--dsw-alias-label-tertiary',
  '--dsw-alias-interactive-bg-hover',
  '--dsw-alias-interactive-bg-active',
  '--dsw-alias-state-success-primary',
  '--dsw-alias-state-warn-primary',
  '--dsw-alias-state-error-primary',
  '--dsw-shadow-lv3',
  '--ds-transition-duration',
  '--ds-transition-duration-fast',
  '--ds-ease-in-out',
]

const themeBlock =
  tokens === null
    ? '/* no harness stylesheet found — the CSS literals are in use */'
    : WOULD_USE.filter((name) => tokens.has(name))
        .map((name) => `      ${name}: ${tokens.get(name)};`)
        .join('\n')

/** Colours the component derives from a reading's severity. */
const TONE = {
  ok: 'var(--dsw-alias-state-success-primary, #22c55e)',
  warn: 'var(--dsw-alias-state-warn-primary, #d29922)',
  danger: 'var(--dsw-alias-state-error-primary, #ef4444)',
}

function meter(percent, tone, extra = '') {
  return `<span class="dsh-ocg-track"${extra}><span class="dsh-ocg-fill" style="width:max(3px,${percent}%);background:${tone}"></span></span>`
}

/** The collapsed pill, exactly as the component emits it. */
function pill(rows, renewal) {
  const segs = rows
    .map(
      (r) => `<span class="dsh-ocg-seg">
        <span class="dsh-ocg-top"><span class="dsh-ocg-key">${r.short}</span><span class="dsh-ocg-val">${r.percent}%</span></span>
        ${meter(r.percent, TONE[r.tone])}
      </span>`,
    )
    .join('')
  // The renewal segment carries no meter — that absence is what marks it as a
  // different kind of number from the three percentages beside it.
  const sub =
    renewal === null
      ? ''
      : `<span class="dsh-ocg-seg dsh-ocg-seg-sub">
        <span class="dsh-ocg-top"><span class="dsh-ocg-key">续费</span><span class="dsh-ocg-val">${renewal.days}d</span></span>
      </span>`
  return `<button class="dsh-ocg-pill" data-open="false">${segs}${sub}</button>`
}

/** The expanded panel, exactly as the component emits it. */
function panel(rows, renewal) {
  const body = rows
    .map(
      (r) => `<div class="dsh-ocg-row">
        <span class="dsh-ocg-row-label"><span class="dsh-ocg-dot" style="background:${TONE[r.tone]}"></span>${r.label}</span>
        ${meter(r.percent, TONE[r.tone])}
        <span class="dsh-ocg-row-pct">${r.percent}%</span>
        <span class="dsh-ocg-row-reset">${r.reset}</span>
      </div>`,
    )
    .join('')
  const subRow =
    renewal === null
      ? ''
      : `<div class="dsh-ocg-sub" title="每月 ${renewal.anchorDay} 日 ${renewal.anchorTime} UTC 续费">
      <span class="dsh-ocg-sub-label">订阅续费</span>
      <span class="dsh-ocg-sub-date">${renewal.date}</span>
      <span class="dsh-ocg-sub-left">还有 ${renewal.days} 天</span>
    </div>`
  return `<div class="dsh-ocg-panel">
    <div class="dsh-ocg-title"><span>OpenCode Go 用量</span><small>12 秒前更新</small></div>
    ${subRow}
    ${body}
    <div class="dsh-ocg-foot"><span>来源 credentials (file)</span><button class="dsh-ocg-btn">刷新</button></div>
  </div>`
}

const NORMAL = [
  { short: '5h', label: '5 小时', percent: 13, tone: 'ok', reset: '3h12m 后重置' },
  { short: '7d', label: '每周', percent: 8, tone: 'ok', reset: '5d6h 后重置' },
  { short: '30d', label: '每月', percent: 5, tone: 'ok', reset: '21d14h 后重置' },
]
const HOT = [
  { short: '5h', label: '5 小时', percent: 91, tone: 'danger', reset: '38m 后重置' },
  { short: '7d', label: '每周', percent: 63, tone: 'warn', reset: '2d3h 后重置' },
  { short: '30d', label: '每月', percent: 27, tone: 'ok', reset: '11d 后重置' },
]

/** Sample renewal, shaped like the host's `subscription` field. */
const RENEWAL = { date: '2026 年 10 月 21 日', days: 21, anchorDay: 21, anchorTime: '07:57:29' }

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>dsh-opencode-go-usage — preview</title>
<style>
  :root {
${themeBlock}
  }
  html, body {
    margin: 0;
    padding: 22px 24px;
    background: var(--dsw-static-neutral-bluish-900, #1b1b1c);
    color: var(--dsw-alias-label-primary, #e6e8eb);
    font-family: var(--dsw-font-family, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif);
  }
  h2 { font-size: 12px; font-weight: 600; margin: 0 0 10px; opacity: .5; letter-spacing: .04em; text-transform: uppercase; }
  .row { display: flex; align-items: flex-start; gap: 18px; margin-bottom: 26px; }
  .col { display: flex; flex-direction: column; gap: 10px; }
  .tag { font-size: 11px; opacity: .45; }
  /* Mirror the real header so the panel has room to open the way it actually
     does. Verified against the shipped conversation stylesheet:
       .header           { position:relative; padding:12px 28px 0 20px; flex:none }
       .titleRow         { display:flex; align-items:center; min-height:32px }
       .titleCluster     { flex:1; min-width:0 }
       .headerUtilities  { flex:none; margin-left:20px; display:flex; align-items:center }
     No overflow:hidden anywhere in that chain, which is why the absolutely
     positioned panel is not clipped. */
  .hdr {
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: 0 28px 0 20px;
    border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.12));
    margin-bottom: 16px;
  }
  .hdr.open { margin-bottom: 268px; }
  .hdr .crumb {
    flex: 1;
    min-width: 0;
    font-size: 14px;
    font-weight: 500;
    color: var(--dsw-alias-label-primary, #f9fafb);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .stage { position: relative; display: inline-flex; }
</style>
<style>
${css}
</style>
</head>
<body>
  <h2>会话标题栏 · 折叠态</h2>
  <div class="hdr"><span class="crumb">重构一下认证模块</span><div class="stage"><div class="dsh-ocg">${pill(NORMAL, RENEWAL)}</div></div></div>
  <div class="hdr"><span class="crumb">用量接近上限时</span><div class="stage"><div class="dsh-ocg">${pill(HOT, RENEWAL)}</div></div></div>

  <h2>悬停展开（贴右边缘，面板向左展开）</h2>
  <div class="hdr open"><span class="crumb">重构一下认证模块</span><div class="stage"><div class="dsh-ocg">${pill(NORMAL, RENEWAL)}${panel(NORMAL, RENEWAL)}</div></div></div>
  <div class="hdr open"><span class="crumb">用量接近上限时</span><div class="stage"><div class="dsh-ocg">${pill(HOT, RENEWAL)}${panel(HOT, RENEWAL)}</div></div></div>
</body>
</html>
`

writeFileSync(OUT, html, 'utf8')
console.log(`preview written: ${OUT}`)
console.log(`stylesheet    : ${BUNDLE}`)
console.log(`theme tokens  : ${themePath ?? '(not found — CSS literals in use)'}`)
console.log(`tokens applied: ${themeBlock.startsWith('/*') ? 0 : themeBlock.split('\n').length}`)
