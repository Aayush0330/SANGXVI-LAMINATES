const INTERNAL_ORIGIN = "https://sanghvi-erp.invalid";

export function normalizeInternalHref(href?: string | null) {
  const value = href?.trim();
  if (
    !value ||
    value.length > 1_000 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return null;
  }

  try {
    const parsed = new URL(value, INTERNAL_ORIGIN);
    return parsed.origin === INTERNAL_ORIGIN ? value : null;
  } catch {
    return null;
  }
}
