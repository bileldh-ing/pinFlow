# PinFlow design system — "Warm Liquid Glass"

Visual language: visionOS-style frosted panels in warm smoked grey-brown glass, floating over a dark charcoal
ambient field lit by soft orange glows. Orange is the single primary accent; mint is the secondary (success,
positive chips). All tokens live in `apps/web/src/app/globals.css`; components only use the tokens.

## Tokens (dark default / light)
| Token | Dark | Light | Use |
|---|---|---|---|
| `--surface` | gradient rgba(132,120,108,.34)→rgba(96,88,80,.26) + `blur(30px) saturate(1.35)` | warm white glass | `.glass` panels |
| `--surface-strong` | rgb(44 39 35 / .94) | rgb(255 251 247 / .97) | menus, dialogs, anything next to the Blockly SVG (`.glass-solid`, `.glass-noblur`) |
| `--canvas` | #161311 | #fbf8f5 | opaque Blockly / Monaco canvases |
| `--text` / `--text-muted` / `--text-faint` | #f8f4f0 / #cdc1b6 / #b6a99c | #21180f / #574a40 / #6b5d52 | body ≥ 7:1, muted ≥ 4.5:1, faint ≥ 4:1 on the darkest/lightest glass |
| `--accent` (text) | #ff8d3f | #b9440a | links, active text (≥ 4.4:1) |
| `--accent-grad` (fill) | #FF8A2B → #FF7A1A → #F2600C | same | primary buttons, active rail circle, selection; ink #1a0c03 (7.3:1) |
| `--accent-2` | #5ef0c8 | #0f7a5f | success / positive chips |
| radii | 24 px panels, 18 px inner cards, pills (999 px) for buttons, inputs, nav | | |

Motion: `motion/react` (`src/components/motion.tsx`) — fade/slide-up reveals, 40 ms stagger, spring rail indicator
(`layoutId`), button press `scale(.97)`, hover lift `translateY(-3px)`. Durations 120–260 ms, transform/opacity only,
everything collapses under `prefers-reduced-motion`.

Typography: Plus Jakarta Sans (UI) and JetBrains Mono (code), self-hosted through `next/font/local`
(`src/app/fonts`, SIL OFL 1.1). Blockly and Monaco re-measure once the fonts load.

## Rules that keep the editors crisp
- No `backdrop-filter`, CSS filter or translucent overlay sits on top of the Blockly SVG. The editor frame uses
  `.glass-noblur`; zoom controls are opaque HTML (`BlocklyZoomControls`) — Blockly's own sprite-based zoom/trash
  controls are disabled (they rendered as blurry patches in Chromium screenshots).
- Blockly media (dropdown arrows, quote glyphs, cursors) is served from `/blockly-media/` (copied by
  `scripts/prepare-assets.mjs`), never from a CDN.
- Category colours are warm-harmonized (`packages/block-definitions/src/catalog.ts`); every one keeps white block
  labels at ≥ 3.7:1 (labels are 11 px bold).
- The first layout scales the workspace (0.58–0.8) so the widest stack fits the pane and pins it top-left.
- CSS minifier note: write `backdrop-filter` unprefixed only — Lightning CSS collapses prefixed/unprefixed pairs and
  kept only `-webkit-backdrop-filter`, which Chromium ignores.
