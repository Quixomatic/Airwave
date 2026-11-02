/**
 * Accent for a channel that has no tint of its own: the guide gives the row at position `i` of the lineup shown
 * `ACCENTS[i % ACCENTS.length]`. Pure data, kept apart from layout.ts (which imports react-native) so the theme
 * contrast tests can run every one of these colors against every theme.
 */
export const ACCENTS = ["#2f9e8f", "#4a9fe0", "#3b82f6", "#8b5cf6", "#3fa66a", "#d08b2f", "#d0587e", "#7c8aa3"];

export const accentOf = (i: number) => ACCENTS[i % ACCENTS.length]!;
