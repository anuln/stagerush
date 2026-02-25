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

async function readExistingSha(
  input: GitHubPutFileInput,
  fetchImpl: typeof fetch
): Promise<string | null> {
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/contents/${encodeURIComponent(input.path)}?ref=${encodeURIComponent(input.branch)}`;
  const response = await fetchImpl(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.token}`,
      Accept: "application/vnd.github+json"
    }
  });

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Failed to read existing file (${response.status}): ${details}`);
  }
  const payload = (await response.json()) as { sha?: string };
  if (typeof payload.sha !== "string" || payload.sha.trim().length === 0) {
    return null;
  }
  return payload.sha;
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

  const sha = await readExistingSha(input, fetchImpl);
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/contents/${encodeURIComponent(input.path)}`;
  const body: Record<string, unknown> = {
    message: input.message,
    branch: input.branch,
    content:
      typeof input.contentBase64 === "string" && input.contentBase64.trim().length > 0
        ? input.contentBase64.trim()
        : encodeBase64Utf8(input.content)
  };
  if (sha) {
    body.sha = sha;
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
