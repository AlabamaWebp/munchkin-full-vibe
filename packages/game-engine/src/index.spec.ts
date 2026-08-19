import { describe, expect, it } from "vitest";
import { getGameEngineStatus } from "./index.js";

describe("game engine package", () => {
  it("is importable without framework dependencies", () => {
    expect(getGameEngineStatus()).toBe("domain-ready");
  });
});
