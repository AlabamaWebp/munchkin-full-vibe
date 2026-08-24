# V2 balance report

> **SUPPORTING, DATED EVIDENCE.** These deterministic simulation results are a
> balance sanity check, not a current live-playtest result or a gameplay contract.

## Run

- Harness: `npm run balance:simulate`
- Seeds: `1337`, `4242`, `9001`
- Samples: 20,000 scenarios per seed and metric band
- Catalog: Core plus Companions, Arsenal, and Dual Identity
- Randomness: deterministic seeded xorshift32; production `RandomSource` is not changed
- Method: weighted draw sampling plus representative power/resource scenarios. This is a sanity check, not a model of rational negotiation or human card valuation.

The previous 42-definition development catalog did not contain tiers/copies sufficient for comparable simulation, so a numeric before/after comparison would be misleading. Its structural baseline was 42 unique / 122 physical Core cards; the final Core is 80 / 192.

## Results

Ranges below cover all three seeds.

| Metric                                                   |                                           Result |
| -------------------------------------------------------- | -----------------------------------------------: |
| Balanced Door tiers, levels 1–3                          |              T1 84.7–85.3%, T2 14.7–15.3%, T3 0% |
| Balanced Door tiers, levels 4–6                          |      T1 24.9–25.3%, T2 59.7–60.5%, T3 14.7–15.0% |
| Balanced Door tiers, levels 7–9                          |        T1 4.8–5.0%, T2 34.8–34.9%, T3 60.0–60.5% |
| Treasure tiers for T1/T2/T3 encounters                   | 80/20/0; 20/65/15; 5/30/65 within sampling noise |
| Starting hand has usable Equipment                       |                     100% with Balanced guarantee |
| Starting cards unusable from Class/Race restrictions     |                                         3.2–3.3% |
| Weak level-1 + Makeshift Tools vs T1                     |                                       68.6–69.0% |
| Door-Monster scenario beatability, bands 1–3 / 4–6 / 7–9 |                            73–74% / 83–84% / 97% |
| Early Door permanent Equipment/Class/Race loss           |                                         2.2–2.5% |
| Two or more permanent losses in three early Doors        |                                       0.13–0.14% |
| Average Monster Treasure reward, T1 / T2 / T3            |                               1.18 / 2.35 / 3.67 |
| No plausible solo recovery in sampled scenario           |                                         6.2–6.5% |
| Average gold per Treasure / won combat                   |                                    359 / 806–816 |
| One reward worth at least two sale levels                |                                         8.0–8.2% |

The final weighted profiles remain the design-contract values: Door `85/15/0`, `25/60/15`, `5/35/60`; Treasure `80/20/0`, `20/65/15`, `5/30/65`. Sampling did not justify changing them. Late-band raw solo beatability is deliberately high in this simplified model because it omits Monster modifiers and social interference; live playtest must determine whether late equipment accumulation is too generous.

Equipment averages follow authored slot costs: Tier-1 groups average +1 to +2; Tier-2 one-handed groups about +3 and two-handed weapons +4.57; Tier-3 groups +4 to +6, with the restricted +7 body item as the high end.

## Live playtest priorities

- Verify whether late players win too reliably once combat interference and help negotiation are real.
- Track actual combats/turn, leader wins, and total duration at 3, 4, and 6 players.
- Watch sale batching: an 8% two-level reward-value rate may still feel too swingy when players hoard cards.
- Exercise three-Curse streaks and confirm protection is useful without making Curses irrelevant.
- Compare restricted Tier-2/Tier-3 gear against neutral slot competitors and test companion replacement decisions.

## Missing artwork

The UI uses the existing deterministic placeholder for these stable `artKey` values; no artwork was generated in this milestone.

## 2026-08-24 catalog-expansion appendix

The preceding report remains the dated V2 baseline. After adding the original
Classic Fantasy, Clerical Errors, and Steed & Hirelings optional packs, the same
20,000-scenario / three-seed harness was run with every selectable set enabled:
165 definitions and 362 physical cards.

The configured weighted tier profiles and the Balanced starter guarantee remained
intact: usable starting Equipment was 100% for all seeds. The most material
movement is intentional new-content pressure, not a validation change: weak
level-1 solo beatability was **57.7–58.0%** (previously 68.6–69.0%), early
permanent-loss rate was **3.8%** (previously 2.2–2.5%), and no-plausible-recovery
rate was **7.8–8.0%** (previously 6.2–6.5%). Average gold per won combat remained
**798–813**, and the two-sale-level rate was **6.9–7.3%**.

These are material balance regressions for an all-packs game and are recorded
for live playtesting rather than hidden by changing the harness thresholds.
Validate first-level all-pack combat pressure and early Curse/Equipment loss in
3–6-player sessions before tuning card copy counts or strengths.

- Core: `dust-parliament`, `paper-mimic`, `lost-sock-swarm`, `cupboard-specter`, `hallway-minotaur`, `mirror-duelist-male`, `mirror-duelist-female`, `map-eater`, `rust-choir`, `grave-lantern`, `midnight-auditor`, `library-colossus`, `curse-hollow-pockets`, `curse-wrong-turn`, `curse-echoing-doubt`, `curse-total-recall`, `curse-collapsing-wardrobe`, `scrap-knights`, `lantern-wardens`, `brassborn`, `nightglimmers`, `tin-kettle-helm`, `mapmakers-sandals`, `pocket-cudgel`, `folding-buckler`, `echo-mail`, `mossy-maul`, `cometglass-sabre`, `leviathan-hide-coat`, `oracular-stilts`, `crown-of-last-words`, `emergency-drawbridge`, `door-cache`, `treasure-rumor`, `quiet-respite`, `spare-change-map`, `two-pocket-plan`, `grand-expedition-map`.
- Companions: `eager-intern`, `lantern-scout`, `scrap-squire`, `stubborn-pony`, `archive-apprentice`, `graveyard-guide`, `clockwork-goat`, `mossback-elk`, `deadline-ostrich`, `veteran-retainer`, `comet-stag`, `leviathan-skipper`.
- Arsenal: `sharpening-chorus`, `balanced-pommel`, `hexproof-cap`, `beast-hunters-vest`, `construct-cracker`, `smoke-pellet`, `moonsteel-edge`, `thunder-weight`, `undead-surveyors-goggles`, `arcane-grounding-boots`, `defensive-umbrella`, `escape-route-boots`, `comet-core`, `wardens-aegis`, `last-second-ramp`, `monster-compass`.
- Dual Identity: `double-major`, `mixed-heritage`, `mirror-sages`, `iron-chorus`, `night-school`, `adopted-tradition`, `beast-barristers`, `graveborn`, `bladesingers`, `polymath-license`, `many-roots`, `two-world-walkers`.
