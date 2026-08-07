/**
 * The name of the host a search goes to, for the question card to say out loud.
 *
 * DESIGN.md §9.2 requires the card to read `searched · google` rather than just
 * "searched": auto-search is the one outbound action in the product, and naming
 * the destination is the difference between a privacy claim and a privacy
 * promise. Derived from the configured URL and never hard-coded, so pointing Oats
 * at another engine tells the truth about it.
 *
 * Lives in its own file rather than beside the component so it can be tested
 * without a DOM — and so the component file exports only components.
 */
export function searchHostLabel(baseUrl: string | null | undefined): string {
  if (!baseUrl) return "";
  try {
    const { hostname } = new URL(baseUrl);
    const parts = hostname.replace(/^www\./, "").split(".");
    return parts[0] || hostname;
  } catch {
    // A malformed or relative URL names nothing; the card falls back to the
    // bare "searched" rather than inventing a host.
    return "";
  }
}
