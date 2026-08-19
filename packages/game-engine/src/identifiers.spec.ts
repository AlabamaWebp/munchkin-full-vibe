import { describe, expect, expectTypeOf, it } from "vitest";
import {
  parseCardDefinitionId,
  parseCardInstanceId,
  parseGameId,
  parsePlayerId,
  type GameId,
  type PlayerId,
} from "./identifiers.js";

describe("domain identifiers", () => {
  it("normalizes valid identifiers", () => {
    expect(parseGameId("  game-1  ")).toBe("game-1");
    expect(parsePlayerId("player-1")).toBe("player-1");
    expect(parseCardDefinitionId("wooden-sword")).toBe("wooden-sword");
    expect(parseCardInstanceId("wooden-sword-2")).toBe("wooden-sword-2");
  });

  it.each([
    ["game", parseGameId],
    ["player", parsePlayerId],
    ["card definition", parseCardDefinitionId],
    ["card instance", parseCardInstanceId],
  ])("rejects an empty %s identifier", (_label, parse) => {
    expect(() => parse("   ")).toThrow(TypeError);
  });

  it("uses distinct compile-time types for different identity domains", () => {
    expectTypeOf(parseGameId("game-1")).toEqualTypeOf<GameId>();
    expectTypeOf<GameId>().not.toEqualTypeOf<PlayerId>();
  });
});
