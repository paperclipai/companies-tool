export function normalizeSourceInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("A source is required.");
  }

  if (/^https?:\/\//i.test(trimmed) || /^git@/i.test(trimmed) || trimmed.startsWith(".") || trimmed.startsWith("/")) {
    return trimmed;
  }

  if (/^[\w.-]+\/[\w.-]+(?:\/tree\/[\w./-]+)?$/i.test(trimmed)) {
    return `https://github.com/${trimmed}`;
  }

  return trimmed;
}
