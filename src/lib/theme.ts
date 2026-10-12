// Shared by the server layout and the client ThemeToggle. Must NOT live in a "use client" module:
// server components importing constants from a client module receive a client reference, not the value.
export type Theme = "light" | "dark";
export const THEME_COOKIE = "theme";

export function parseTheme(value: string | undefined): Theme {
  return value === "dark" ? "dark" : "light";
}
