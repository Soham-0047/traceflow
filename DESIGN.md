# Design: TraceFlow

The locked system. Every Hallmark run reads this first and pages share it. Change it on purpose; the file is the rule.

## System
- Genre: modern-minimal
- Shape of the first page: app screen (rail, main column, evidence card), not a marketing page
- Theme: Coral, dealt 1/3, lent at app scope: its palette, face, radius and surfaces, never its desk layout
- Axes: light/grotesk-sans/warm · posture: restrained

## Tokens
`demo/src/styles/tokens.css` is the source of truth (scaffolded by Hallmark, do not hand-edit values in components). The roles:
```css
:root {
  --color-paper: oklch(97% 0.006 55);  --color-paper-2: oklch(94.5% 0.007 55);  --color-paper-3: oklch(91.5% 0.009 55);
  --color-ink: oklch(21% 0.012 38);  --color-ink-2: oklch(29% 0.013 40);  --color-muted: oklch(47% 0.013 45);  --color-rule: oklch(87% 0.009 55);
  --color-accent: oklch(74% 0.125 30);  --color-accent-2: oklch(54% 0.165 29);  --color-focus: oklch(54% 0.17 30);
  --font-display: "General Sans", ui-sans-serif, system-ui, sans-serif;  --font-body: var(--font-display);  --font-outlier: "Geist Mono", ui-monospace, monospace;
  --radius-card: 8px;  --radius-pill: 999px;  --rule-hair: 1px;  --shadow-card: 0 1px 2px oklch(20% 0.01 35 / 0.05);
}
```
Spacing, type scale (ratio 1.2), easings and durations live in `tokens.css`. Mono is for figures only, never labels.

## Controls
- Primary: ink fill · 6px radius · 40px high, 44px hit target
- Secondary: none yet; when needed, outline with the same radius and height

## Motion
- Character: calm. Motion is state only (colour, opacity, border); no reveal, no orchestration. Under reduced motion everything ends at once.

## Exports
`tokens.css` in this project. Tailwind, DTCG or shadcn blocks on request, per `.claude/skills/hallmark/references/export-formats.md`.

## Product rules (TraceFlow)
These sit on top of Hallmark's floor and are the reasons the UI looks the way it does.
1. **Evidence before score.** No number appears without the records and the arithmetic behind it. The handover ledger shows records × weight = points, and every finding opens the Evidence card (what was found, why flagged, supporting records, confidence, what to do).
2. **Selection lives in the URL.** Hash routes (`#/people/alex/finding/open-work-1`) make any view shareable and restorable.
3. **Four states everywhere.** Every region that loads data draws loading, empty, error and full. `?demo=loading|empty|error` forces them on the demo site.
4. **Colour is restrained.** The accent marks the current selection and nothing else. Risk level is words ("High risk"), never a traffic light.
5. **No invented figures.** All numbers come from the labelled sample fixture. The top bar says "Sample data, not connected to Jira".
6. **Honest wording.** "Audit-ready evidence", "decision traceability", "sole contributor". Never "SOC 2 proof" or "sole knowledge holder" (see `docs/PLAN.md` §1).
7. **Lane diagram, not a hairball.** Lineage reads left to right (intent, plan, work, code). A node-and-edge graph only appears inside an investigation, and only when it earns its place.
8. **Tables before cards.** Lists of records are tables. The Evidence card is the single card-like surface.
9. **Light only for now.** Coral is a light theme. Dark mode is a deliberate later task (`references/dark-mode.md`).
10. **Fonts degrade gracefully.** General Sans and Geist Mono load from CDNs on the demo. Inside Forge, external fonts may be blocked, so the system fallback in the token stack must look right; verify during the Forge UI work.

## How agents work with this file
- Before touching UI: read this file, then `.claude/skills/hallmark/SKILL.md` (app-screen branch: `references/flow.md` § App screens).
- After touching UI: `npm run lint:design` must report **0 FAIL and 0 WARN** (or answered/waived on the record in the CSS stamp block). The render tier (`--render`) needs a headless browser; run it locally when one is available.
- Keep the Hallmark stamp and critique line at the top of `demo/src/styles/app.css` honest: re-score it when the design changes.
- Never add a literal colour or font-family outside `tokens.css`; never `transition: all`; never an eyebrow or tracked-capitals label.
