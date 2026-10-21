import type { Scenario } from "../types";

// Bump when deterministic state, scoring, or run/log semantics change.
export const ENGINE_VERSION = "0.5.0";
export const RUN_SCHEMA_VERSION = 2;
export const DT_MINUTES = 0.25;

export function canonicalJSON(value: unknown): string {
  const sort = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === "object") return Object.fromEntries(Object.keys(item).sort().map(key => [key, sort((item as Record<string, unknown>)[key])]));
    return item;
  };
  return JSON.stringify(sort(JSON.parse(JSON.stringify(value))));
}

// FNV-1a/64 over canonical JSON UTF-16 code units. Integrity check, not a security signature.
export function checksum(value: unknown): string {
  let hash = 0xcbf29ce484222325n;
  const text = canonicalJSON(value);
  for (let index = 0; index < text.length; index++) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function configurationIdentity(scenario: Scenario): string {
  const { seed: _seed, ...config } = scenario;
  return `${ENGINE_VERSION}:${scenario.id}:${scenario.version ?? 1}:${checksum(config)}`;
}

export const baselineIdentity = (scenario: Scenario, seed: number) => `${configurationIdentity(scenario)}:seed=${seed}`;
