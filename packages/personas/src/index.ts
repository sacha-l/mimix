import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import type {
  BetaPersona,
  LivePersona,
  Persona,
  PersonaCard,
} from "@mimix/persona-types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PERSONAS_ROOT = resolve(__dirname, "..");

function loadYaml<T>(path: string): T {
  const raw = readFileSync(path, "utf8");
  return yaml.load(raw) as T;
}

function listIds(subdir: "live" | "beta"): string[] {
  return readdirSync(join(PERSONAS_ROOT, subdir))
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.replace(/\.yaml$/, ""));
}

export function loadPersona(id: string): Persona {
  const live = join(PERSONAS_ROOT, "live", `${id}.yaml`);
  const beta = join(PERSONAS_ROOT, "beta", `${id}.yaml`);

  try {
    const persona = loadYaml<LivePersona>(live);
    return persona;
  } catch {
    return loadYaml<BetaPersona>(beta);
  }
}

export function loadLivePersona(id: string): LivePersona {
  const persona = loadPersona(id);
  if (persona.status !== "live") {
    throw new Error(`Persona "${id}" is not a live persona (status: ${persona.status})`);
  }
  return persona as LivePersona;
}

export function listLivePersonas(): string[] {
  return listIds("live");
}

export function listBetaPersonas(): string[] {
  return listIds("beta");
}

export function listAllCards(): PersonaCard[] {
  const liveCards = listIds("live").map((id) => loadPersona(id) as PersonaCard);
  const betaCards = listIds("beta").map((id) => loadPersona(id) as PersonaCard);
  return [...liveCards, ...betaCards];
}
