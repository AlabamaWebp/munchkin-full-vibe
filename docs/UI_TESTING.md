# Frontend UI verification

Status: **CURRENT**. The Playwright workflow runs against the real Angular and
NestJS development processes and writes its outputs to `artifacts/ui/`.

## First run

Install the pinned Chromium build once after installing dependencies:

```powershell
npx playwright install chromium
```

Locally, the Playwright configuration reuses healthy development processes on
ports 3000 and 4200 or starts and stops them when absent. CI always starts fresh
isolated processes.

## Commands

```powershell
npm run ui:audit   # geometry JSON for every state and viewport
npm run ui:report  # artifacts/ui/report.json and report.md from the latest audit
npm run ui:map     # ARIA snapshot plus semantic DOM elements and bounding boxes
npm run ui:visual  # compare screenshots with reviewed per-viewport baselines
npm run ui:update  # explicitly replace visual baselines after intentional review
npm run ui:test    # audit, map, contract checks, and visual regression together
```

The matrix covers `360×640`, `390×844`, `430×932`, `768×1024`, and
`1024×768`; `390×844` is the release target. States include home, lobby,
ordinary game, multi-Monster combat, reaction, blocking discard, and the
scrollable Full Hand sheet. Each non-home state is created through the normal
lobby flow and a room-scoped existing development scenario, not Angular mocks.

## Reading results

Geometry files under `artifacts/ui/audit/<viewport>/` contain issues shaped as:

```json
{
  "severity": "error",
  "type": "touch-target",
  "selector": "button...",
  "message": "...",
  "data": {
    "invariant": "touch-target",
    "geometry": {
      "element": { "x": 12, "y": 20, "width": 40, "height": 44 },
      "parent": { "selector": ".toolbar", "rect": {} },
      "viewport": { "width": 390, "height": 844 }
    },
    "deviation": { "widthShortfall": 4, "heightShortfall": 0 },
    "reproduction": {
      "state": "game",
      "project": "release-390x844",
      "viewport": { "width": 390, "height": 844 }
    }
  }
}
```

`npm run ui:audit` fails on errors and keeps warnings as reviewable findings.
Run `npm run ui:report` and read `artifacts/ui/report.md` before changing CSS.
Audit and map commands remove only their generated outputs before running;
visual baselines are never removed. The report also rejects an incomplete
state/viewport matrix, so artifacts from an earlier run cannot produce a false
green result.
Maps under `artifacts/ui/map/<viewport>/` contain Playwright's actual
`locator.ariaSnapshot()` output and a separate list of semantic DOM nodes with
selectors, state, and measured viewport boxes.

Visual checks disable animation and mask only `[data-ui-dynamic]`. Baselines are
stored per viewport under `artifacts/ui/baselines/`. A mismatch must first be
understood; never use `ui:update` only to obtain green output.

## Narrow geometry contracts

Use these only when the element has an intentional invariant that a generic
audit cannot infer reliably:

```html
data-ui-center="text|parent" data-ui-center-tolerance="4" data-ui-inside-parent
data-ui-no-overlap data-ui-dynamic data-ui-allow-clip
```

`data-ui-center="text"` measures rendered text ranges, including their actual
glyph line boxes, rather than treating the container box as text. Elements with
`data-ui-no-overlap` are checked against the other marked elements in the state.
Scrollable sheets, history, hand/player/card rails, and other intentional
scrollers require no blanket annotation; the audit recognizes computed
`overflow: auto|scroll`. Use `data-ui-allow-clip` only for a deliberate clipped
exception.

When fixing a finding, change the responsible grid/flex sizing, overflow, or
spacing rule. Do not hide the symptom with arbitrary negative margins,
translates, or unexplained offsets.
