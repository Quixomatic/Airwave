// Resolve the latest GitHub Release's download URLs at request time (cached hourly), so the Download
// buttons always point at the current version without per-release edits — asset filenames are versioned
// (e.g. Airwave-Client_0.11.61_x86_64.dmg), so we match by pattern rather than hardcoding a name.

const REPO = "Quixomatic/Airwave";
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

type Asset = { name: string; browser_download_url: string };

export type LatestRelease = {
  /** Tag of the latest release (e.g. `v0.11.61`), or null if the API was unreachable. */
  version: string | null;
  /** URL of the first asset whose name matches `re`, or the releases page as a safe fallback. */
  find: (re: RegExp) => string;
};

export async function getLatestRelease(): Promise<LatestRelease> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const data = (await res.json()) as { tag_name?: string; assets?: Asset[] };
    const assets = data.assets ?? [];
    return {
      version: data.tag_name ?? null,
      find: (re) => assets.find((a) => re.test(a.name))?.browser_download_url ?? RELEASES_PAGE,
    };
  } catch {
    return { version: null, find: () => RELEASES_PAGE };
  }
}
