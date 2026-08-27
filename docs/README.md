# Documentation guide

Use this index before relying on a document. “Current” describes the checked-in
implementation; “authoritative” states an intentional product/design contract.

## Conflict order

1. Production code, shared contracts, configuration, and executable tests prove
   what currently exists.
2. An explicitly **AUTHORITATIVE** design contract defines intended behavior
   when implementation is incomplete or a product decision is being made.
3. **CURRENT** architecture/product/status/UI documents explain the present
   system and its constraints.
4. **SUPPORTING** records provide rationale, measurements, or evidence.
5. **HISTORICAL** plans and audits preserve context only; never treat their
   snapshots or verdicts as current without re-verification.

## Documents

| Document                                               | Status                  | Use it to answer                                                                                          |
| ------------------------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------- |
| [PRODUCT.md](PRODUCT.md)                               | CURRENT                 | What is the product for, who uses it, platform/privacy/scope constraints.                                 |
| [ARCHITECTURE.md](ARCHITECTURE.md)                     | CURRENT                 | How packages, server authority, projections, transport, sessions, and UI state fit together.              |
| [GAME_RULES.md](GAME_RULES.md)                         | CURRENT                 | Compact implemented-rules overview and rule-system boundaries.                                            |
| [v2-game-design.md](v2-game-design.md)                 | AUTHORITATIVE           | Intended V2 gameplay and presentation decisions, including detail not repeated elsewhere.                 |
| [DECISIONS.md](DECISIONS.md)                           | CURRENT / SUPPORTING    | Durable architectural and product decisions with rationale. Older ADR detail remains historical evidence. |
| [ROADMAP.md](ROADMAP.md)                               | CURRENT                 | Remaining work and intentionally deferred scope.                                                          |
| [STATUS.md](STATUS.md)                                 | CURRENT                 | Working systems, known limits, and immediately next evidence to collect.                                  |
| [ui/DESIGN.md](ui/DESIGN.md)                           | AUTHORITATIVE           | UI visual and responsive design contract.                                                                 |
| [ui/combat-mobile.md](ui/combat-mobile.md)             | SUPPORTING              | Combat-screen model mapping and mobile layout guidance.                                                   |
| [UI_TESTING.md](UI_TESTING.md)                         | CURRENT                 | Playwright geometry, semantic-map, and visual-regression workflow.                                        |
| [AI_CONTEXT.md](AI_CONTEXT.md)                         | CURRENT                 | Compact repository context for external planning AIs.                                                     |
| [v2-implementation-plan.md](v2-implementation-plan.md) | HISTORICAL              | How V2 was sequenced from its pre-schema-5 baseline.                                                      |
| [v2-final-audit.md](v2-final-audit.md)                 | HISTORICAL              | The 2026-08-22 pre-release blocker snapshot.                                                              |
| [v2-release-audit.md](v2-release-audit.md)             | HISTORICAL / SUPPORTING | Evidence that the four final-audit blockers were subsequently closed.                                     |
| [v2-balance-report.md](v2-balance-report.md)           | SUPPORTING              | Dated deterministic balance-harness results and playtest uncertainties.                                   |

When a source is unclear, inspect the relevant engine/server/web code and tests
before changing behavior or writing an implementation prompt.
