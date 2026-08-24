import {
  CardSetId,
  simulateBalance,
} from "../packages/game-engine/dist/index.js";

const seeds = (process.env.BALANCE_SEEDS ?? "1337,4242,9001")
  .split(",")
  .map((value) => Number.parseInt(value, 10));
const iterations = Number.parseInt(
  process.env.BALANCE_ITERATIONS ?? "20000",
  10,
);

const reports = seeds.map((seed) =>
  simulateBalance({
    seed,
    iterations,
    enabledSetIds: Object.values(CardSetId),
  }),
);

console.log(
  JSON.stringify(
    {
      methodology: "scenario sampling; not a model of rational human play",
      reports,
    },
    null,
    2,
  ),
);
