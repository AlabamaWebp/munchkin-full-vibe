# V2 final audit

Date: 2026-08-22

## Verdict

V2 is not yet ready for a real 3–6 player game. The implemented rules are
substantial and the current quality gates are green, but four design-contract
blockers can still deadlock a live match or accept stale interaction state.

## Design-contract audit

| Area                                                              | Result                                   | Notes                                                                                                                                                                                                                         |
| ----------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lobby Sex, mode, optional sets, immutable start config            | Implemented                              | Core is mandatory; invalid/duplicate set selection is rejected.                                                                                                                                                               |
| Balanced setup and physical tier-aware draws                      | Implemented                              | Bounded starter reservation, one physical pile per deck, atomic shortage/recycle, seeded coverage.                                                                                                                            |
| Door, Post Door, Look for Trouble, Loot, Scavenge, End Turn       | Implemented                              | The mutually exclusive actions consume the phase and cannot be repeated.                                                                                                                                                      |
| Makeshift Tools, Scavenge, sale, combat-only victory              | Implemented                              | Recovery/sale exploit boundaries are enforced server-side.                                                                                                                                                                    |
| Help offer/counter/agreement and reward split                     | Implemented                              | Stable within one combat; private reward identities and public counts are projected correctly.                                                                                                                                |
| Helper run away, pending Bad Stuff, death/revival, role retention | Implemented with blocker                 | Serialized cursors/choices resume correctly, but pending choices have no operational deadline/default.                                                                                                                        |
| Conditions, roles, companions, attachments, optional sets         | Implemented                              | Conditional Monster strength now also drives the projected strength and reward tier.                                                                                                                                          |
| Curse protection                                                  | Missing/partial                          | Automatic cancellation exists; the required target-only `CURSE_RESPONSE` decline/cancel/protect-one-item workflow does not.                                                                                                   |
| Reconnect deadlines                                               | Missing                                  | Reaction and pending-decision expiry fields are zero; no injected clock, expiry transition, or NestJS timer scheduling exists. An offline player can deadlock victory or a decision forever.                                  |
| Unified intents and event importance                              | Missing/partial                          | `GameView` still exposes fragmented action arrays and legacy adapters; Angular derives event priority. The server does not project the complete `AvailableIntentView` and authoritative Blocking/Important/Routine contract.  |
| Stale command isolation                                           | Broken across combats                    | Encounter/help/reaction sequences restart in each combat and generic combat-card commands have no combat identity/revision. A delayed command can alias a later combat.                                                       |
| Fixed mobile viewport                                             | Implemented for audited Turn Ready state | Manual 360×640, 390×844, 430×932, and desktop checks had no document scroll and kept the primary action visible. Six long-name players fit at 360×640. Full automated viewport coverage for every core state is still absent. |

No intentional gameplay deviation from `v2-game-design.md` was found. The
missing workflows above are implementation gaps, not accepted rule changes.

## Problems fixed in this pass

- Conditional Monster modifiers now affect both displayed current strength and
  the Balanced Treasure reward profile.
- Random/chosen Equipment destruction now discards attached enhancers with the
  host and cannot leave orphan attachment ids.
- Public projection now includes active attachments and can project their
  `CARD_PLAYED` history without throwing.
- Raw tier metadata was removed from `GameView` card serialization.
- Discard decisions now require an exact stable decision id; malformed stable
  ids are rejected at the transport boundary.
- Compact-card Details controls now provide 44 px touch targets.

Regression coverage was added for conditional reward selection, both attachment
destruction paths, stale decision rejection, attachment projection/privacy, and
malformed transport ids.

## Privacy and atomicity

Viewer projection exposes only the viewer's hand and recipient-scoped reward,
Scavenge, charity, draw, deal, and discard identities. Future deck identities
and raw tiers are absent. Public attachment/role/companion state is visible as
required. Multi-card draw, setup, revival, sale, reward draw/split, and the
audited destruction paths reject without partial state mutation.

## Balance

No tuning change was justified. The documented 20,000-iteration seeds
`1337/4242/9001` were repeated, plus 5,000-iteration seeds
`7/17/20260822`. Results stayed near the authored profiles: early weak-player
beatability 68.6–69.3%, early permanent destruction 2.18–2.52%, no plausible
recovery 5.9–6.8%, and one-reward two-level sale value 7.9–8.5%.

Live playtest uncertainty remains late equipment accumulation, sale batching,
negotiated help value, and real 3/4/6-player duration. These are tuning
uncertainties, not current code blockers.

## Quality gates

- `npm test` — passed: 17 engine files / 138 tests, 4 server suites / 31 tests,
  7 web files / 33 tests, 3 contract tests.
- `npm run test:e2e --workspace @munchkin-lan/server` — passed.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm run build` — passed.
- `npm run format:check` — passed.
- `npm run balance:simulate` — passed for both seed batches above.

The remaining four blockers in the verdict must be completed before claiming
V2 ready for a real game.
