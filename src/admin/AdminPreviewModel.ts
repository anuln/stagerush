export interface AdminCatalogEntry {
  id: string;
  assetPath: string;
  promptText: string;
}

export interface PreviewInput {
  label: string;
  defaultPath: string;
  selectedPath?: string | null;
  entries: AdminCatalogEntry[];
}

export interface PreviewOutput {
  label: string;
  id: string | null;
  assetPath: string;
  resolvedPath: string;
  promptText: string;
  source: "override" | "default";
  missing: boolean;
}

export function resolveAdminPreview(input: PreviewInput): PreviewOutput {
  const selectedPath = input.selectedPath?.trim();
  const useOverride = Boolean(selectedPath && selectedPath.length > 0);
  const assetPath = useOverride ? selectedPath! : input.defaultPath;
  const entry = findEntryByAssetPath(input.entries, assetPath);

  return {
    label: input.label,
    id: entry?.id ?? null,
    assetPath,
    resolvedPath: toResolvedPath(assetPath),
    promptText: entry?.promptText ?? "",
    source: useOverride ? "override" : "default",
    missing: false
  };
}

export function findEntryByAssetPath(
  entries: AdminCatalogEntry[],
  assetPath: string
): AdminCatalogEntry | null {
  const normalizedTarget = normalizePath(assetPath);
  for (const entry of entries) {
    if (normalizePath(entry.assetPath) === normalizedTarget) {
      return entry;
    }
  }
  return null;
}

export function toResolvedPath(assetPath: string): string {
  if (
    assetPath.startsWith("http://") ||
    assetPath.startsWith("https://") ||
    assetPath.startsWith("data:") ||
    assetPath.startsWith("blob:") ||
    assetPath.startsWith("/")
  ) {
    return assetPath;
  }
  return `/${assetPath}`;
}

function normalizePath(path: string): string {
  return path.replace(/^\/+/, "");
}
