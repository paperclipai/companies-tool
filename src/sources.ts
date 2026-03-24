function isGithubShorthandSegment(input: string): boolean {
  return /^[\w.-]+$/i.test(input);
}

export function isGithubShorthand(input: string): boolean {
  const trimmed = input.trim();
  if (
    !trimmed
    || /^https?:\/\//i.test(trimmed)
    || /^git@/i.test(trimmed)
    || trimmed.startsWith(".")
    || trimmed.startsWith("/")
    || trimmed.startsWith("~")
    || trimmed.includes("\\")
    || /^[A-Za-z]:/.test(trimmed)
  ) {
    return false;
  }

  const segments = trimmed.split("/").filter(Boolean);
  return segments.length >= 2 && segments.every(isGithubShorthandSegment);
}

export function normalizeSourceInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("A source is required.");
  }

  return trimmed;
}
