declare const domainIdBrand: unique symbol;

type DomainId<Kind extends string> = string & {
  readonly [domainIdBrand]: Kind;
};

export type GameId = DomainId<"GameId">;
export type PlayerId = DomainId<"PlayerId">;
export type CardDefinitionId = DomainId<"CardDefinitionId">;
export type CardInstanceId = DomainId<"CardInstanceId">;
export type EncounterId = DomainId<"EncounterId">;

function parseDomainId<Kind extends string>(
  value: string,
  kind: Kind,
): DomainId<Kind> {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new TypeError(`${kind} must not be empty.`);
  }

  return normalized as DomainId<Kind>;
}

export function parseGameId(value: string): GameId {
  return parseDomainId(value, "GameId");
}

export function parsePlayerId(value: string): PlayerId {
  return parseDomainId(value, "PlayerId");
}

export function parseCardDefinitionId(value: string): CardDefinitionId {
  return parseDomainId(value, "CardDefinitionId");
}

export function parseCardInstanceId(value: string): CardInstanceId {
  return parseDomainId(value, "CardInstanceId");
}

export function parseEncounterId(value: string): EncounterId {
  return parseDomainId(value, "EncounterId");
}
