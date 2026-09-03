import { readFile } from "fs/promises";
import path from "path";
import { downloadJson, uploadJson } from "./gcs";
import { sanitizeSlug } from "./slug";
import type { Site, SitesConfig } from "./types";

export type { SitesConfig };

export const CONFIG_OBJECT = "config/sites.json";

const INLINE_SEED: SitesConfig = {
  sites: [
    {
      id: "detoxicare",
      label: "Detoxicare",
      folders: ["articles", "products", "images", "logo", "heroes", "misc"],
    },
    {
      id: "natrapharm",
      label: "Natrapharm",
      folders: ["articles", "products", "images", "logo", "heroes", "misc"],
    },
    {
      id: "prime-dialysis",
      label: "Prime Dialysis",
      folders: ["articles", "products", "images", "logo", "heroes", "misc"],
    },
    {
      id: "mediko-kapitolyo",
      label: "Mediko Kapitolyo",
      folders: ["articles", "images", "logo", "heroes", "misc"],
    },
    {
      id: "metrodocs",
      label: "Metrodocs Hospital",
      folders: ["articles", "products", "images", "logo", "heroes", "misc"],
    },
    {
      id: "molecularlabph",
      label: "Molecular Lab PH",
      folders: ["articles", "products", "images", "logo", "heroes", "misc"],
    },
    {
      id: "gc-hemodynamix",
      label: "GC Hemodynamix",
      folders: ["articles", "products", "images", "logo", "heroes", "misc"],
    },
    {
      id: "health-prescription",
      label: "Health Prescription",
      folders: ["articles", "products", "images", "logo", "heroes", "misc"],
    },
    {
      id: "prime-health",
      label: "Prime Health",
      folders: ["articles", "products", "images", "logo", "heroes", "misc"],
    },
    {
      id: "rx-solutions",
      label: "RX Solutions",
      folders: ["articles", "products", "images", "logo", "heroes", "misc"],
    },
  ],
};

function assertSafeSegment(value: string, label: string): string {
  if (
    !value ||
    value.includes("..") ||
    value.includes("/") ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    throw new Error(`Invalid ${label}: path traversal not allowed`);
  }
  return value;
}

function isSitesConfig(value: unknown): value is SitesConfig {
  if (!value || typeof value !== "object") return false;
  const sites = (value as SitesConfig).sites;
  if (!Array.isArray(sites)) return false;
  return sites.every(
    (s) =>
      s &&
      typeof s.id === "string" &&
      typeof s.label === "string" &&
      Array.isArray(s.folders)
  );
}

async function readLocalSeed(): Promise<SitesConfig> {
  try {
    const seedPath = path.join(process.cwd(), "data", "sites.seed.json");
    const raw = await readFile(seedPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (isSitesConfig(parsed)) return parsed;
  } catch {
    // fall through to inline seed
  }
  return INLINE_SEED;
}

/**
 * Load sites config: prefer GCS `config/sites.json`, else local/inline seed.
 * Optionally seeds GCS when missing so subsequent reads hit the bucket.
 */
export async function loadSitesConfig(): Promise<SitesConfig> {
  try {
    const fromGcs = await downloadJson<SitesConfig>(CONFIG_OBJECT);
    if (fromGcs && isSitesConfig(fromGcs)) {
      return fromGcs;
    }
  } catch {
    // GCS unavailable or object missing — use seed
  }

  const seed = await readLocalSeed();

  try {
    await uploadJson(CONFIG_OBJECT, seed);
  } catch {
    // Seed upload is best-effort (e.g. missing credentials in local UI work)
  }

  return seed;
}

/** Upload seed config to GCS when `config/sites.json` is missing. */
export async function seedSitesConfigIfMissing(): Promise<{ seeded: boolean }> {
  const existing = await downloadJson<SitesConfig>(CONFIG_OBJECT);
  if (existing && isSitesConfig(existing)) {
    return { seeded: false };
  }

  const seed = await readLocalSeed();
  await uploadJson(CONFIG_OBJECT, seed);
  return { seeded: true };
}

export async function saveSitesConfig(config: SitesConfig): Promise<void> {
  if (!isSitesConfig(config)) {
    throw new Error("Invalid sites config");
  }
  await uploadJson(CONFIG_OBJECT, config);
}

export async function addSite(id: string, label: string): Promise<SitesConfig> {
  const siteId = assertSafeSegment(sanitizeSlug(id), "site id");
  const siteLabel = label.trim() || siteId;

  const config = await loadSitesConfig();
  if (config.sites.some((s) => s.id === siteId)) {
    throw new Error(`Site already exists: ${siteId}`);
  }

  config.sites.push({
    id: siteId,
    label: siteLabel,
    folders: ["images", "misc"],
  });

  await saveSitesConfig(config);
  return config;
}

export async function addFolder(
  siteId: string,
  folder: string
): Promise<SitesConfig> {
  const id = assertSafeSegment(sanitizeSlug(siteId), "site id");
  const folderName = assertSafeSegment(sanitizeSlug(folder), "folder");

  const config = await loadSitesConfig();
  const site = config.sites.find((s) => s.id === id);
  if (!site) {
    throw new Error(`Site not found: ${id}`);
  }

  if (!site.folders.includes(folderName)) {
    site.folders.push(folderName);
    await saveSitesConfig(config);
  }

  return config;
}

export function findSite(config: SitesConfig, siteId: string): Site | undefined {
  return config.sites.find((s) => s.id === siteId);
}
