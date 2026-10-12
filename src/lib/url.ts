export type SearchParams = Record<string, string | string[] | undefined>;

/** Build `path?query` from current URL params plus overrides (null removes a key). */
export function withParams(path: string, current: SearchParams, overrides: Record<string, string | number | null> = {}): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value !== undefined && value !== "") params.set(k, value);
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null || v === "") params.delete(k);
    else params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
