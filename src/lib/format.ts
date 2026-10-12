export function formatMoney(amountCents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountCents / 100);
}

export function formatDateTime(iso: string | null): string {
  return iso ? iso.replace("T", " ").slice(0, 16) + " UTC" : "—";
}
