# Roadmap

Status: **CURRENT PLANNING DOCUMENT**. Foundation through V2 gameplay,
projection, reconnect workflows, and the mobile game shell are implemented.
Historical milestone sequencing is preserved in Git history and in the V2 plan;
this document lists remaining work rather than restating completed milestones.

## 1. Real-device live playtesting and balance

- Run moderated 3–6 player LAN sessions across the supported phone/browser
  mix, including reconnects during every blocking workflow.
- Validate actual game duration, late-game equipment accumulation, sale batching,
  negotiated help value, and optional-set interactions.
- Tune catalog data only with deterministic tests and refreshed balance reports;
  do not add card-name rules or untested special-case state machines.

## 2. LAN production packaging

- Serve the built Angular SPA from NestJS on the same origin and port.
- Preserve Socket.IO and client resume behavior under that deployment.
- Provide a host-friendly LAN URL (and optionally QR code) so players need only
  open `http://<server-lan-ip>:3000`.
- Verify this on Windows and Linux with actual phones. This is the remaining
  product-topology gap; `main.ts` already binds NestJS to `0.0.0.0`.

## 3. Hardening and UX verification

- Exercise stale/duplicate commands, browser backgrounding, deadline expiry,
  replacement sockets, host reconnect, room lifecycle, and deck exhaustion in
  live transport—not just engine fixtures.
- Complete accessibility and responsive QA for all gameplay states at 360px+
  and on desktop/tablet, including focus management and reduced motion.
- Turn recurring playtest defects into focused engine/server/web regression
  tests before changing behavior.

## 4. Deliberately deferred product choices

Persistence, accounts/authentication, public/cloud hosting, matchmaking,
rankings, AI opponents, Redis, a database, SSR, GraphQL, NgRx, Nx, and Docker
remain out of scope unless product requirements change.
