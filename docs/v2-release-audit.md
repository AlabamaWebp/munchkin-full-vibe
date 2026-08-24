# Munchkin LAN V2 release audit

> **HISTORICAL / SUPPORTING EVIDENCE.** This 2026-08-22 self-audit records the
> closure of four earlier blockers. It is not a current production-readiness
> claim; current limitations are in `docs/STATUS.md` and `docs/ROADMAP.md`.

Date: 2026-08-22

## Verdict

READY FOR LIVE PLAYTEST

This verdict is limited to the four blockers from the V2 final audit. It is not
a production-readiness claim.

## Blocker self-audit

1. **Stale combat isolation — closed.** Combat ids are allocated by the engine,
   serialized, never reused within a game, and checked with mutable combat
   revisions across cards, modifiers, extra/cloned Monsters, help, reactions,
   victory, run away, and combat-related pending choices. Stale rejection has no
   state mutation or gameplay events.
2. **Reconnect-safe deadlines — closed.** Blocking states persist absolute
   deadlines from an injected clock. Engine expiry defaults are authoritative
   and idempotent; server timers re-read current state, so superseded timers are
   harmless. Reconnect views resolve expiry before projection.
3. **Target-only Curse Response — closed.** Curses without a usable defense
   resolve immediately. Only the target receives decline/cancel/protect-one-Item
   choices; invalid Item selection is atomic, protection identities stay private,
   and timeout defaults to decline.
4. **Unified intents and event importance — closed.** Angular consumes the typed
   per-viewer intent union and authoritative deadlines/addresses. Legacy action
   projections are removed. Every event type has an exhaustive authoritative
   IMPORTANT/ROUTINE assignment, with BLOCKING reserved for a live viewer action.

## Quality gates

- `npm test` — passed (282 tests across 30 files/suites)
- `npm run test:e2e --workspace @munchkin-lan/server` — passed (3 tests)
- `npm run lint` — passed
- `npm run typecheck` — passed
- `npm run build` — passed
- `npm run format:check` — passed
- `npm run balance:simulate` — passed; catalog unchanged and seeded metrics show
  no notable balance shift
