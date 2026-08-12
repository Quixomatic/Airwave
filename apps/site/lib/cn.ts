/** Tiny classnames joiner — filters falsy values and joins with spaces. No conflict-resolution needed here
 * because the landing page owns its own class strings (we're not merging arbitrary user classes). */
export function cn(...inputs: (string | false | null | undefined)[]): string {
  return inputs.filter(Boolean).join(" ");
}
