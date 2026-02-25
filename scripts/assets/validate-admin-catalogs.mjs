import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const catalogs = [
  path.join(projectRoot, "public/assets/admin/sprite_catalog.json"),
  path.join(projectRoot, "public/assets/admin/audio_catalog.json")
];

let hasError = false;

for (const catalogPath of catalogs) {
  const raw = readFileSync(catalogPath, "utf-8");
  const payload = JSON.parse(raw);
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const seen = new Set();

  for (const [index, entry] of entries.entries()) {
    const label = `${path.basename(catalogPath)}:entries[${index}]`;
    for (const field of ["id", "assetPath", "promptText"]) {
      if (typeof entry[field] !== "string" || entry[field].trim().length === 0) {
        console.error(`[ERROR] ${label} missing ${field}`);
        hasError = true;
      }
    }
    if (seen.has(entry.id)) {
      console.error(`[ERROR] ${label} duplicate id: ${entry.id}`);
      hasError = true;
    }
    seen.add(entry.id);

    const relativePath = String(entry.assetPath ?? "").replace(/^\/+/, "");
    const absoluteAssetPath = path.join(projectRoot, "public", relativePath);
    if (!existsSync(absoluteAssetPath)) {
      console.warn(`[WARN] ${label} asset file missing: ${absoluteAssetPath}`);
    }
  }
}

if (hasError) {
  process.exitCode = 1;
} else {
  console.log("Admin catalogs valid.");
}
