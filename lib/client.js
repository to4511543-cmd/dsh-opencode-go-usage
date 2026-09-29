/**
 * dsh-opencode-go-usage — browser half.
 *
 * Hand-written in the `window.__ModuleLoader__.load` handoff format, so the
 * repository ships a working bundle with NO build step: installing this package
 * from source never runs a lifecycle script and therefore never trips pnpm's
 * `allowBuilds` build-authorization prompt.
 *
 * Two invariants this file must keep, both learned the hard way by sibling
 * plugins in this ecosystem:
 *
 *  1. NO static inject export. The web boot check treats any entry that is not
 *     active as fatal ("web boot: N entry did not activate") — a static inject
 *     naming a service the host cannot supply leaves this fiber pending forever
 *     and takes the WHOLE GUI down with it. The service is therefore resolved
 *     through cordis dynamic injection, so a host that cannot supply it leaves
 *     this plugin idle instead of fatal.
 *  2. The badge reads its data from the plugin's own host route, not from
 *     opencode.ai. The API key never reaches the browser, and every open tab
 *     shares the host's single cached poll.
 *
 * Styling uses the harness design system's own custom properties (--dsw-*) with
 * literal fallbacks, so the badge follows the active theme.
 *
 * WARNING for editors: the stylesheet below is a JavaScript template literal.
 * A single backtick inside a CSS comment ends it early and the rest of the
 * stylesheet is then parsed as JavaScript — the parser reports something
 * completely misleading for that. scripts/verify-client-boot.mjs guards it.
 *
 * scripts/verify-client-boot.mjs also asserts invariant 1 against this file.
 */
window.__ModuleLoader__.load({
	id: "dsh-opencode-go-usage",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");

		/** Must match ROUTE in lib/index.js. */
		const ROUTE = "/opencode-go-usage";
		const WINDOWS = [
			{ key: "rolling", label: "5 小时", short: "5h" },
			{ key: "weekly", label: "每周", short: "7d" },
			{ key: "monthly", label: "每月", short: "30d" }
		];

		/** Semantic tone per reading; literals are fallbacks for themes lacking a token. */
		const TONE = {
			ok: "var(--dsw-alias-state-success-primary, var(--dsw-static-green-500, #22c55e))",
			warn: "var(--dsw-alias-state-warn-primary, var(--dsw-static-amber-500, #d29922))",
			danger: "var(--dsw-alias-state-error-primary, var(--dsw-static-red-500, #ef4444))",
			neutral: "var(--dsw-alias-label-tertiary, #8a8f98)"
		};

		/** Injected once — materialization happens exactly once per page. */
		const STYLE_ID = "dsh-opencode-go-usage-style";
		if (document.getElementById(STYLE_ID) === null) {
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = `
.dsh-ocg {
  position: relative;
  display: inline-flex;
  align-items: center;
  font-family: var(--dsw-font-family, inherit);
  text-align: left;
}
.dsh-ocg-pill {
  display: inline-flex;
  align-items: stretch;
  gap: 10px;
  padding: 4px 11px 5px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.26));
  border-radius: 9px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition: background var(--ds-transition-duration-fast, .1s) var(--ds-ease-in-out, ease);
}
.dsh-ocg-pill:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.dsh-ocg-pill[data-open="true"] {
  background: var(--dsw-alias-interactive-bg-active, rgba(127,127,127,.16));
  border-color: var(--dsw-alias-border-l3, rgba(127,127,127,.4));
}
.dsh-ocg-seg { display: flex; flex-direction: column; gap: 4px; min-width: 38px; }
.dsh-ocg-seg + .dsh-ocg-seg {
  padding-left: 10px;
  border-left: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18));
}
/* The renewal segment is not a percentage, so it carries no meter and sits
   behind a stronger divider: the absent bar is the signal that this number
   means something other than the three beside it. */
.dsh-ocg-seg-sub {
  padding-left: 10px;
  border-left: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
}
.dsh-ocg-sub {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 0 0 9px;
  margin-bottom: 9px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.2));
}
.dsh-ocg-sub-label { flex: 1; color: var(--dsw-alias-label-tertiary, #8a8f98); }
.dsh-ocg-sub-date { font-weight: 600; color: var(--dsw-alias-label-primary, #e6e8eb); }
.dsh-ocg-sub-left {
  color: var(--dsw-alias-label-tertiary, #8a8f98);
  font-variant-numeric: tabular-nums;
}
.dsh-ocg-top { display: flex; align-items: baseline; justify-content: space-between; gap: 5px; }
.dsh-ocg-key {
  font-size: var(--dsw-font-xxxs-11-font-size, 11px);
  font-weight: var(--dsw-font-xxxs-11-font-weight, 400);
  line-height: 1;
  color: var(--dsw-alias-label-tertiary, #8a8f98);
}
.dsh-ocg-val {
  font-size: var(--dsw-font-xxs-strong-12-font-size, 12px);
  font-weight: var(--dsw-font-xxs-strong-12-font-weight, 600);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary, #e6e8eb);
}
/* display:block here is load-bearing, not cosmetic. These are span elements and
   an inline box ignores width and height entirely, so without it the meter
   renders as an empty track with no visible fill at all. */
.dsh-ocg-track {
  display: block;
  height: 4px;
  border-radius: 3px;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-3, rgba(127,127,127,.22));
}
.dsh-ocg-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  transition: width var(--ds-transition-duration, .2s) var(--ds-ease-in-out, ease);
}
.dsh-ocg-idle {
  font-size: var(--dsw-font-xxxs-11-font-size, 11px);
  color: var(--dsw-alias-label-tertiary, #8a8f98);
  padding: 3px 2px;
}
@keyframes dsh-ocg-in {
  from { opacity: 0; transform: translateY(-3px); }
  to   { opacity: 1; transform: none; }
}
.dsh-ocg-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 60;
  min-width: 316px;
  padding: 12px 14px 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  border-radius: 12px;
  background: var(--dsw-alias-bg-overlay, var(--dsw-specific-menu, #1b1d21));
  box-shadow: var(--dsw-shadow-lv3, 0 10px 32px rgba(0,0,0,.34));
  color: var(--dsw-alias-label-primary, #e6e8eb);
  font-size: var(--dsw-font-xxs-12-font-size, 12px);
  line-height: 1.5;
  animation: dsh-ocg-in var(--ds-transition-duration-fast, .1s) var(--ds-ease-in-out, ease);
}
.dsh-ocg-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  font-size: var(--dsw-font-xs-strong-13-font-size, 13px);
  font-weight: var(--dsw-font-xs-strong-13-font-weight, 600);
}
.dsh-ocg-title small {
  font-size: var(--dsw-font-xxxs-11-font-size, 11px);
  font-weight: 400;
  color: var(--dsw-alias-label-tertiary, #8a8f98);
}
.dsh-ocg-row {
  display: grid;
  grid-template-columns: 52px 1fr 46px 112px;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
}
.dsh-ocg-row-label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-secondary, #b6bac1);
}
.dsh-ocg-dot { display: block; width: 7px; height: 7px; border-radius: 50%; flex: none; }
.dsh-ocg-row .dsh-ocg-track { height: 6px; border-radius: 4px; }
.dsh-ocg-row-pct {
  text-align: right;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary, #e6e8eb);
}
/* The long wording ("3 小时 12 分后重置") is wider than this column and would wrap
   onto a second line, shoving the percentage off-centre. The row shows a
   compact countdown instead and carries the long form as its title. */
.dsh-ocg-row-reset {
  text-align: right;
  font-size: var(--dsw-font-xxxs-11-font-size, 11px);
  color: var(--dsw-alias-label-tertiary, #8a8f98);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dsh-ocg-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.2));
  font-size: var(--dsw-font-xxxs-11-font-size, 11px);
  color: var(--dsw-alias-label-tertiary, #8a8f98);
}
.dsh-ocg-foot > span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-ocg-btn {
  flex: none;
  padding: 3px 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #b6bac1);
  font: inherit;
  font-size: var(--dsw-font-xxxs-11-font-size, 11px);
  cursor: pointer;
  transition: background var(--ds-transition-duration-fast, .1s) var(--ds-ease-in-out, ease);
}
.dsh-ocg-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14)); }
.dsh-ocg-err {
  margin-top: 8px;
  color: var(--dsw-alias-state-error-primary, #ef4444);
  word-break: break-word;
  font-size: var(--dsw-font-xxxs-11-font-size, 11px);
}
`;
			document.head.appendChild(style);
		}

		const DASH = "\u2014";

		/** Severity tone for one window reading. */
		function toneFor(reading) {
			if (reading === null || reading === undefined) return "neutral";
			if (typeof reading.percent !== "number") return "neutral";
			if (reading.status === "rate-limited") return "danger";
			if (reading.percent >= 80) return "danger";
			if (reading.percent >= 50) return "warn";
			return "ok";
		}

		/** Decompose a reset timestamp into compact parts; null when unparseable. */
		function remainingParts(resetsAt, now) {
			if (typeof resetsAt !== "string") return null;
			const target = Date.parse(resetsAt);
			if (!Number.isFinite(target)) return null;
			const minutes = Math.floor((target - now) / 60000);
			const days = Math.floor(minutes / 1440);
			const hours = Math.floor((minutes % 1440) / 60);
			const mins = minutes % 60;
			return { expired: target - now <= 0, days: days, hours: hours, mins: mins };
		}

		/** Short form: the collapsed pill and the row column both use this. */
		function formatRemaining(parts) {
			if (parts === null) return DASH;
			if (parts.expired) return "已重置";
			if (parts.days > 0) return `${parts.days}d${parts.hours}h`;
			if (parts.hours > 0) return `${parts.hours}h${parts.mins}m`;
			return `${parts.mins}m`;
		}

		/** Long form: tooltips only. */
		function formatLong(parts) {
			if (parts === null) return "";
			if (parts.expired) return "已经重置了";
			if (parts.days > 0) return `${parts.days} 天 ${parts.hours} 小时后重置`;
			if (parts.hours > 0) return `${parts.hours} 小时 ${parts.mins} 分后重置`;
			return `${parts.mins} 分钟后重置`;
		}

		/** The row-sized reset label plus the long wording for its tooltip. */
		function resetLabel(parts) {
			if (parts === null) return { text: DASH, title: "" };
			if (parts.expired) return { text: "已重置", title: "已经重置了" };
			return { text: `${formatRemaining(parts)} 后重置`, title: formatLong(parts) };
		}

		function formatAge(ms) {
			if (typeof ms !== "number" || !Number.isFinite(ms)) return DASH;
			const seconds = Math.max(0, Math.round(ms / 1000));
			if (seconds < 60) return `${seconds} 秒前更新`;
			return `${Math.round(seconds / 60)} 分钟前更新`;
		}

		/** Local calendar date, e.g. `2026 年 10 月 21 日`. */
		function formatDate(iso) {
			const at = new Date(Date.parse(iso));
			if (!Number.isFinite(at.getTime())) return DASH;
			return `${at.getFullYear()} 年 ${at.getMonth() + 1} 月 ${at.getDate()} 日`;
		}

		/**
		 * Whole days until a moment, rounded up: the renewal counts as happening
		 * "today" for the whole of its final day rather than flipping to 0
		 * halfway through it.
		 */
		function daysUntil(iso, now) {
			const at = Date.parse(iso);
			if (!Number.isFinite(at)) return null;
			return Math.max(0, Math.ceil((at - now) / 86400000));
		}

		/**
		 * The subscription renewal, read off the host snapshot.
		 *
		 * The host derives it from the monthly window's reset, because the
		 * console anchors that window on the subscription date — so for a
		 * monthly plan the quota period and the billing period are the same
		 * interval, and the dashboard's two countdowns agree.
		 */
		function renewalOf(data) {
			const subscription = data !== null && typeof data === "object" ? data.subscription : null;
			if (subscription === null || subscription === undefined) return null;
			if (typeof subscription.renewsAt !== "string") return null;
			return subscription;
		}

		/**
		 * Meter fill width. The floor keeps a small-but-nonzero reading visible:
		 * a bare 1% renders a sub-pixel smudge that reads as a rendering bug,
		 * which is worse than the tiny inaccuracy of a 3px nub.
		 */
		function meterWidth(percent) {
			if (typeof percent !== "number" || !Number.isFinite(percent)) return "0";
			const clamped = Math.max(0, Math.min(100, percent));
			return clamped <= 0 ? "0" : `max(3px, ${clamped}%)`;
		}

		/**
		 * Poll the host route. Never throws outward — a usage badge must not be
		 * able to break the session header.
		 */
		async function fetchStatus(force) {
			const res = await fetch(ROUTE + (force === true ? "/refresh" : "/status.json"), {
				method: force === true ? "POST" : "GET",
				headers: { accept: "application/json" },
				cache: "no-store"
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return await res.json();
		}

		function readingOf(usage, key) {
			if (usage === null || usage === undefined) return null;
			const reading = usage[key];
			return reading === undefined ? null : reading;
		}

		function percentOf(reading) {
			return reading !== null && reading !== undefined && typeof reading.percent === "number"
				? reading.percent
				: null;
		}

		function UsageBadge() {
			const [data, setData] = react.useState(null);
			const [failure, setFailure] = react.useState(null);
			// Hover previews the panel; a click pins it open so the refresh button
			// stays reachable while the pointer travels down into the panel.
			const [hovered, setHovered] = react.useState(false);
			const [pinned, setPinned] = react.useState(false);
			const [now, setNow] = react.useState(() => Date.now());
			const rootRef = react.useRef(null);
			const open = hovered || pinned;

			react.useEffect(() => {
				let alive = true;
				const load = async (force) => {
					try {
						const next = await fetchStatus(force === true);
						if (!alive) return;
						setData(next);
						setFailure(null);
					} catch (error) {
						if (!alive) return;
						setFailure(String((error && error.message) || error));
					}
				};
				void load(false);
				// Matches the host's own cadence; the countdown ticks locally instead.
				const poll = setInterval(() => void load(false), 60000);
				const tick = setInterval(() => setNow(Date.now()), 1000);
				return () => {
					alive = false;
					clearInterval(poll);
					clearInterval(tick);
				};
			}, []);

			// Dismiss on an outside click or Escape.
			react.useEffect(() => {
				if (!open) return undefined;
				const onPointerDown = (event) => {
					const root = rootRef.current;
					if (root !== null && !root.contains(event.target)) setPinned(false);
				};
				const onKeyDown = (event) => {
					if (event.key === "Escape") setPinned(false);
				};
				document.addEventListener("pointerdown", onPointerDown);
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("pointerdown", onPointerDown);
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [open]);

			const usage = data !== null && typeof data === "object" ? data.usage : null;
			const error = failure !== null ? failure : ((data !== null && data.error) || null);
			const ready = data !== null || failure !== null;
			const renewal = renewalOf(data);
			const renewalDays = renewal === null ? null : daysUntil(renewal.renewsAt, now);

			const refresh = react.useCallback(() => {
				setFailure(null);
				void fetchStatus(true).then(setData).catch((inner) => setFailure(String(inner)));
			}, []);

			const onToggle = react.useCallback(() => {
				setPinned((was) => {
					if (!was) refresh();
					return !was;
				});
			}, [refresh]);

			/** One compact segment: label and percent, with a meter beneath. */
			const segment = (window) => {
				const reading = readingOf(usage, window.key);
				const percent = percentOf(reading);
				const tone = TONE[error !== null ? "neutral" : toneFor(reading)];
				return react.createElement(
					"span",
					{ key: window.key, className: "dsh-ocg-seg" },
					react.createElement(
						"span",
						{ className: "dsh-ocg-top" },
						react.createElement("span", { className: "dsh-ocg-key" }, window.short),
						react.createElement(
							"span",
							{ className: "dsh-ocg-val" },
							error !== null ? DASH : percent === null ? "?" : `${percent}%`
						)
					),
					react.createElement(
						"span",
						{ className: "dsh-ocg-track" },
						react.createElement("span", {
							className: "dsh-ocg-fill",
							style: { width: error !== null ? "0" : meterWidth(percent), background: tone }
						})
					)
				);
			};

			/** The renewal segment: a day count, and deliberately no meter. */
			const renewalSegment = () =>
				react.createElement(
					"span",
					{ key: "renewal", className: "dsh-ocg-seg dsh-ocg-seg-sub" },
					react.createElement(
						"span",
						{ className: "dsh-ocg-top" },
						react.createElement("span", { className: "dsh-ocg-key" }, "续费"),
						react.createElement(
							"span",
							{ className: "dsh-ocg-val" },
							renewalDays === null ? DASH : `${renewalDays}d`
						)
					)
				);

			const segments = WINDOWS.map(segment);
			// Only present when the host could derive it: a plan with no monthly
			// window, or a failed poll, simply has no renewal to show.
			if (renewal !== null) segments.push(renewalSegment());

			const children = [
				react.createElement(
					"button",
					{
						key: "pill",
						type: "button",
						className: "dsh-ocg-pill",
						"data-open": open ? "true" : "false",
						onClick: onToggle,
						"aria-label": "OpenCode Go 用量",
						title: error !== null ? `OpenCode Go 用量不可用：${error}` : "OpenCode Go 用量"
					},
					ready ? segments : react.createElement("span", { className: "dsh-ocg-idle" }, "用量…")
				)
			];

			if (open) {
				const rows = WINDOWS.map((window) => {
					const reading = readingOf(usage, window.key);
					const percent = percentOf(reading);
					const tone = TONE[toneFor(reading)];
					const parts = remainingParts(
						reading !== null && reading !== undefined ? reading.resetsAt : null,
						now
					);
					const reset = resetLabel(parts);
					return react.createElement(
						"div",
						{ key: window.key, className: "dsh-ocg-row" },
						react.createElement(
							"span",
							{ className: "dsh-ocg-row-label" },
							react.createElement("span", { className: "dsh-ocg-dot", style: { background: tone } }),
							window.label
						),
						react.createElement(
							"span",
							{ className: "dsh-ocg-track" },
							react.createElement("span", {
								className: "dsh-ocg-fill",
								style: { width: meterWidth(percent), background: tone }
							})
						),
						react.createElement(
							"span",
							{ className: "dsh-ocg-row-pct" },
							percent === null ? DASH : `${percent}%`
						),
						react.createElement("span", { className: "dsh-ocg-row-reset", title: reset.title }, reset.text)
					);
				});

				children.push(
					react.createElement(
						"div",
						{ key: "panel", className: "dsh-ocg-panel" },
						react.createElement(
							"div",
							{ className: "dsh-ocg-title" },
							react.createElement("span", null, "OpenCode Go 用量"),
							react.createElement(
								"small",
								null,
								error !== null ? "读取失败" : formatAge(data !== null ? data.ageMs : null)
							)
						),
						renewal === null
							? null
							: react.createElement(
									"div",
									{
										className: "dsh-ocg-sub",
										// The recurrence is what the API actually pins down; the date
										// below is only its next occurrence.
										title: `每月 ${renewal.anchorDayOfMonth} 日 ${renewal.anchorTimeUtc} UTC 续费`
									},
									react.createElement("span", { className: "dsh-ocg-sub-label" }, "订阅续费"),
									react.createElement("span", { className: "dsh-ocg-sub-date" }, formatDate(renewal.renewsAt)),
									react.createElement(
										"span",
										{ className: "dsh-ocg-sub-left" },
										renewalDays === null ? "" : renewalDays === 0 ? "就是今天" : `还有 ${renewalDays} 天`
									)
								),
						rows,
						error !== null ? react.createElement("div", { className: "dsh-ocg-err" }, error) : null,
						react.createElement(
							"div",
							{ className: "dsh-ocg-foot" },
							react.createElement(
								"span",
								{ title: data !== null && data.source ? String(data.source) : "" },
								data !== null && data.source ? `来源 ${data.source}` : "未配置凭据"
							),
							react.createElement("button", { type: "button", className: "dsh-ocg-btn", onClick: refresh }, "刷新")
						)
					)
				);
			}

			return react.createElement(
				"div",
				{
					className: "dsh-ocg",
					ref: rootRef,
					// Hover is the primary affordance; a click merely pins the panel so
					// the refresh button survives the pointer moving into it.
					onMouseEnter: () => setHovered(true),
					onMouseLeave: () => {
						setHovered(false);
						setPinned(false);
					}
				},
				children
			);
		}

		/**
		 * @param ctx - client cordis context.
		 */
		function apply(ctx) {
			const mount = (ready) => {
				const register = () => {
					ready.slots.inject("conversation.session.header.utilities", () =>
						ready.slots.register(
							{
								name: "conversation.session.header.utilities",
								id: "dsh-opencode-go-usage",
								order: 10
							},
							UsageBadge
						)
					);
				};
				if (typeof ready.effect === "function") ready.effect(register, "dsh-opencode-go-usage: mounts");
				else register();
			};

			// Dynamic injection is load-bearing: see invariant 1 at the top.
			if (typeof ctx.inject === "function") {
				ctx.inject(["slots"], mount);
				return;
			}
			if (ctx.slots !== undefined) mount(ctx);
		}

		exports.apply = apply;
		return module.exports;
	}
});
