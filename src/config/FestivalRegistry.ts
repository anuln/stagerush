export interface FestivalRegistryEntry {
  id: string;
  name: string;
  mapConfigPath: string;
  bundleId?: string;
}

export interface FestivalRegistry {
  defaultFestivalId?: string;
  festivals: FestivalRegistryEntry[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

export function parseFestivalRegistry(data: unknown): FestivalRegistry {
  if (!isObject(data)) {
    throw new Error("Festival registry payload must be an object");
  }
  if (!Array.isArray(data.festivals) || data.festivals.length === 0) {
    throw new Error("Festival registry must include at least one festival");
  }

  const ids = new Set<string>();
  const festivals = data.festivals.map((entry, index) => {
    if (!isObject(entry)) {
      throw new Error(`festivals[${index}] must be an object`);
    }
    const id = requireString(entry.id, `festivals[${index}].id`);
    const name = requireString(entry.name, `festivals[${index}].name`);
    const mapConfigPath = requireString(
      entry.mapConfigPath,
      `festivals[${index}].mapConfigPath`
    );
    if (ids.has(id)) {
      throw new Error(`festivals[${index}].id must be unique`);
    }
    ids.add(id);
    const bundleIdRaw = entry.bundleId;
    return {
      id,
      name,
      mapConfigPath,
      bundleId:
        typeof bundleIdRaw === "string" && bundleIdRaw.trim().length > 0
          ? bundleIdRaw
          : undefined
    };
  });

  const defaultFestivalIdRaw = data.defaultFestivalId;
  const defaultFestivalId =
    typeof defaultFestivalIdRaw === "string" && defaultFestivalIdRaw.trim().length > 0
      ? defaultFestivalIdRaw
      : undefined;

  if (defaultFestivalId && !ids.has(defaultFestivalId)) {
    throw new Error("defaultFestivalId must match one of festivals[].id");
  }

  return {
    defaultFestivalId,
    festivals
  };
}

export async function loadFestivalRegistry(path: string): Promise<FestivalRegistry> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load festival registry: ${response.status}`);
  }
  const raw = (await response.json()) as unknown;
  return parseFestivalRegistry(raw);
}
