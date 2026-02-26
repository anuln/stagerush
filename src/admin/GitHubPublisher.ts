export interface GitHubPutFileInput {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;
  message: string;
  content: string;
  contentBase64?: string;
}

export interface GitHubPutFileResult {
  fileUrl: string | null;
  commitUrl: string | null;
}

export interface GitHubReadFileInput {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

export interface GitHubReadFileResult {
  exists: boolean;
  sha: string | null;
  content: string | null;
  fileUrl: string | null;
}

interface GitHubReadResponse {
  sha?: string;
  content?: string;
  encoding?: string;
  html_url?: string;
}

function trimRequired(value: string, label: string): string {
  const next = value.trim();
  if (next.length === 0) {
    throw new Error(`${label} is required`);
  }
  return next;
}

function toByteBinaryString(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return binary;
}

export function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return btoa(toByteBinaryString(bytes));
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

function resolveContentsEndpoint(input: {
  owner: string;
  repo: string;
  path: string;
  branch?: string;
}): string {
  const branchSuffix = input.branch
    ? `?ref=${encodeURIComponent(input.branch)}`
    : "";
  return `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/contents/${encodeURIComponent(input.path)}${branchSuffix}`;
}

async function readFileFromGitHub(
  input: GitHubReadFileInput,
  fetchImpl: typeof fetch
): Promise<GitHubReadFileResult> {
  const endpoint = resolveContentsEndpoint(input);
  const response = await fetchImpl(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.token}`,
      Accept: "application/vnd.github+json"
    }
  });

  if (response.status === 404) {
    return {
      exists: false,
      sha: null,
      content: null,
      fileUrl: null
    };
  }
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Failed to read existing file (${response.status}): ${details}`);
  }
  const payload = (await response.json()) as GitHubReadResponse;
  const sha =
    typeof payload.sha === "string" && payload.sha.trim().length > 0
      ? payload.sha
      : null;
  const fileUrl =
    typeof payload.html_url === "string" && payload.html_url.trim().length > 0
      ? payload.html_url
      : null;

  if (typeof payload.content !== "string" || payload.content.length === 0) {
    return {
      exists: true,
      sha,
      content: null,
      fileUrl
    };
  }

  const encoded = payload.content.replace(/\s+/g, "");
  const decoded =
    payload.encoding === "base64" ? decodeBase64Utf8(encoded) : payload.content;

  return {
    exists: true,
    sha,
    content: decoded,
    fileUrl
  };
}

function normalizeReadInput(rawInput: GitHubReadFileInput): GitHubReadFileInput {
  return {
    token: trimRequired(rawInput.token, "PAT"),
    owner: trimRequired(rawInput.owner, "Owner"),
    repo: trimRequired(rawInput.repo, "Repository"),
    branch: trimRequired(rawInput.branch, "Branch"),
    path: trimRequired(rawInput.path, "Path")
  };
}

export async function readTextFileFromGitHub(
  rawInput: GitHubReadFileInput,
  fetchImpl: typeof fetch = fetch
): Promise<GitHubReadFileResult> {
  return readFileFromGitHub(normalizeReadInput(rawInput), fetchImpl);
}

export async function putFileToGitHub(
  rawInput: GitHubPutFileInput,
  fetchImpl: typeof fetch = fetch
): Promise<GitHubPutFileResult> {
  const input: GitHubPutFileInput = {
    token: trimRequired(rawInput.token, "PAT"),
    owner: trimRequired(rawInput.owner, "Owner"),
    repo: trimRequired(rawInput.repo, "Repository"),
    branch: trimRequired(rawInput.branch, "Branch"),
    path: trimRequired(rawInput.path, "Path"),
    message: trimRequired(rawInput.message, "Commit message"),
    content: rawInput.content,
    contentBase64: rawInput.contentBase64
  };

  const existing = await readFileFromGitHub(input, fetchImpl);
  const endpoint = resolveContentsEndpoint(input);
  const body: Record<string, unknown> = {
    message: input.message,
    branch: input.branch,
    content:
      typeof input.contentBase64 === "string" && input.contentBase64.trim().length > 0
        ? input.contentBase64.trim()
        : encodeBase64Utf8(input.content)
  };
  if (existing.sha) {
    body.sha = existing.sha;
  }

  const response = await fetchImpl(endpoint, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${input.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`GitHub commit failed (${response.status}): ${details}`);
  }

  const payload = (await response.json()) as {
    content?: { html_url?: string };
    commit?: { html_url?: string };
  };
  return {
    fileUrl:
      typeof payload.content?.html_url === "string" ? payload.content.html_url : null,
    commitUrl:
      typeof payload.commit?.html_url === "string" ? payload.commit.html_url : null
  };
}
