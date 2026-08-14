/** The Plex tile logo — a dark rounded tile (#282a2d) with the Plex-gold chevron (#e5a00d). The official tile
 * mark (vectorlogo.zone plextv-tile), so it reads correctly on a light button. */
export function PlexIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="15%" fill="#282a2d" />
      <path d="M256 70H148l108 186-108 186h108l108-186z" fill="#e5a00d" />
    </svg>
  );
}
