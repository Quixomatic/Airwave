/**
 * Minimal Plex.tv API client for the "Sign in with Plex" + server-discovery
 * flow (the same handshake Overseerr uses). All calls send the invented
 * `X-Plex-*` headers; the token, when present, authenticates as the user.
 */
import { XMLParser } from "fast-xml-parser";
import { BROWSER_CLIENT_PROFILE, clientProfileExtra, progressiveContainer, qualityParams, } from "./quality";
const PLEX_TV = "https://plex.tv/api/v2";
const PRODUCT = "ChannelGuide";
const VERSION = "0.0.10";
export function plexHeaders(clientId, token) {
    const headers = {
        Accept: "application/json",
        "X-Plex-Product": PRODUCT,
        "X-Plex-Version": VERSION,
        "X-Plex-Client-Identifier": clientId,
        "X-Plex-Device": "ChannelGuide Server",
        "X-Plex-Platform": "Web",
    };
    if (token)
        headers["X-Plex-Token"] = token;
    return headers;
}
/** Create an OAuth "pin" (id + code) to begin the sign-in handshake. */
export async function createPin(clientId) {
    const res = await fetch(`${PLEX_TV}/pins?strong=true`, {
        method: "POST",
        headers: plexHeaders(clientId),
    });
    if (!res.ok)
        throw new Error(`Plex createPin failed (${res.status})`);
    const data = (await res.json());
    return { id: data.id, code: data.code };
}
/** The hosted auth page the user is sent to (in a popup) to approve. */
export function buildAuthUrl(clientId, code, forwardUrl) {
    const params = new URLSearchParams({
        clientID: clientId,
        code,
        "context[device][product]": PRODUCT,
    });
    if (forwardUrl)
        params.set("forwardUrl", forwardUrl);
    return `https://app.plex.tv/auth#?${params.toString()}`;
}
/** Poll the pin; returns the auth token once the user has approved, else null. */
export async function getPinToken(clientId, id) {
    const res = await fetch(`${PLEX_TV}/pins/${id}`, { headers: plexHeaders(clientId) });
    if (!res.ok)
        throw new Error(`Plex getPin failed (${res.status})`);
    const data = (await res.json());
    return data.authToken ?? null;
}
/** The Plex account behind a token (email is what we match ChannelGuide accounts by). */
export async function getPlexUser(clientId, token) {
    const res = await fetch(`${PLEX_TV}/user`, { headers: plexHeaders(clientId, token) });
    if (!res.ok)
        throw new Error(`Plex getUser failed (${res.status})`);
    return (await res.json());
}
/** The Plex Media Servers this token can reach (owned + shared). */
export async function getServers(clientId, token) {
    const res = await fetch(`${PLEX_TV}/resources?includeHttps=1&includeRelay=1`, {
        headers: plexHeaders(clientId, token),
    });
    if (!res.ok)
        throw new Error(`Plex getResources failed (${res.status})`);
    const data = (await res.json());
    return data
        .filter((r) => r.provides?.split(",").includes("server"))
        .map((r) => ({
        name: r.name,
        clientIdentifier: r.clientIdentifier,
        owned: r.owned,
        connections: r.connections ?? [],
    }));
}
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
/**
 * The users the owner has shared this specific server with. Uses the classic
 * `plex.tv/api/users` XML endpoint (same as Overseerr/Tautulli): each <User> has
 * nested <Server> elements listing the servers they can reach — filter by ours.
 */
export async function getSharedUsers(clientId, token, machineIdentifier) {
    const res = await fetch("https://plex.tv/api/users", {
        headers: plexHeaders(clientId, token),
    });
    if (!res.ok)
        throw new Error(`Plex getUsers failed (${res.status})`);
    const parsed = xml.parse(await res.text());
    const raw = parsed.MediaContainer?.User;
    const users = (Array.isArray(raw) ? raw : raw ? [raw] : []);
    const hasAccess = (u) => {
        const servers = (Array.isArray(u.Server) ? u.Server : u.Server ? [u.Server] : []);
        return servers.some((s) => s.machineIdentifier === machineIdentifier);
    };
    return users.filter(hasAccess).map((u) => ({
        plexId: String(u.id ?? ""),
        email: u.email ?? null,
        username: u.username || u.title || u.email || "Plex user",
        thumb: u.thumb,
    }));
}
// ── Plex Media Server (the connected server itself, not plex.tv) ──────────
function pmsHeaders(token) {
    return { Accept: "application/json", "X-Plex-Token": token };
}
/** The libraries (sections) on the connected server. */
export async function getLibraries(baseUrl, token) {
    const res = await fetch(`${baseUrl}/library/sections`, { headers: pmsHeaders(token) });
    if (!res.ok)
        throw new Error(`Plex libraries failed (${res.status})`);
    const data = (await res.json());
    return (data.MediaContainer?.Directory ?? []).map((d) => ({
        key: d.key,
        title: d.title,
        type: d.type,
    }));
}
/** The genres available in a section (for building genre filters). */
export async function getSectionGenres(baseUrl, token, sectionKey) {
    const res = await fetch(`${baseUrl}/library/sections/${sectionKey}/genre`, {
        headers: pmsHeaders(token),
    });
    if (!res.ok)
        throw new Error(`Plex genres failed (${res.status})`);
    const data = (await res.json());
    return (data.MediaContainer?.Directory ?? []).map((d) => ({ id: d.key, title: d.title }));
}
const tags = (arr, max) => {
    if (!arr?.length)
        return undefined;
    const out = arr.map((t) => t.tag).filter((t) => !!t).slice(0, max);
    return out.length ? out : undefined;
};
function toGuideMeta(m) {
    const media = m.Media?.[0];
    return {
        title: m.title,
        type: m.type,
        year: m.year,
        contentRating: m.contentRating,
        summary: m.summary,
        tagline: m.tagline,
        studio: m.studio,
        directors: tags(m.Director, 3),
        genres: tags(m.Genre, 5),
        cast: tags(m.Role, 5),
        audienceRating: m.audienceRating,
        criticRating: m.rating,
        durationMs: m.duration ?? 0,
        thumb: m.thumb,
        art: m.art,
        resolution: media?.videoResolution,
        audioChannels: media?.audioChannels,
        showTitle: m.grandparentTitle,
        showRatingKey: m.grandparentRatingKey != null ? String(m.grandparentRatingKey) : undefined,
        season: m.parentIndex,
        episode: m.index,
    };
}
function toPlexItem(m) {
    return {
        ratingKey: String(m.ratingKey),
        title: m.title,
        durationMs: m.duration ?? 0,
        year: m.year,
        originallyAvailableAt: m.originallyAvailableAt,
        guide: toGuideMeta(m),
    };
}
/** Resolve a section's items against a filter — the channel candidate pool. */
export async function getSectionItems(baseUrl, token, sectionKey, q) {
    const params = new URLSearchParams({
        type: String(q.type),
        sort: q.sort ?? "titleSort",
        "X-Plex-Container-Size": String(q.limit ?? 500),
    });
    if (q.genreId)
        params.set("genre", q.genreId);
    if (q.unwatched)
        params.set("unwatched", "1");
    const res = await fetch(`${baseUrl}/library/sections/${sectionKey}/all?${params.toString()}`, {
        headers: pmsHeaders(token),
    });
    if (!res.ok)
        throw new Error(`Plex items failed (${res.status})`);
    const data = (await res.json());
    return (data.MediaContainer?.Metadata ?? []).map(toPlexItem);
}
/**
 * Filtered query with raw Plex filter params (`field=value`, `year>=1990`, …).
 * Operators are sent literally; only values should be pre-encoded by the caller.
 */
export async function getSectionItemsRaw(baseUrl, token, sectionKey, type, filterParams, sort = "titleSort", limit = 800) {
    const qs = [
        `type=${type}`,
        `sort=${encodeURIComponent(sort)}`,
        `X-Plex-Container-Size=${limit}`,
        ...filterParams,
    ].join("&");
    const res = await fetch(`${baseUrl}/library/sections/${sectionKey}/all?${qs}`, {
        headers: pmsHeaders(token),
    });
    if (!res.ok)
        throw new Error(`Plex filtered query failed (${res.status})`);
    const data = (await res.json());
    return (data.MediaContainer?.Metadata ?? []).map(toPlexItem);
}
/** Every item of a given type in a section, paged through in full — for metadata sync. */
export async function getAllSectionItems(baseUrl, token, sectionKey, type) {
    const pageSize = 500;
    const out = [];
    for (let start = 0;; start += pageSize) {
        const qs = [
            `type=${type}`,
            "sort=titleSort",
            `X-Plex-Container-Start=${start}`,
            `X-Plex-Container-Size=${pageSize}`,
        ].join("&");
        const res = await fetch(`${baseUrl}/library/sections/${sectionKey}/all?${qs}`, {
            headers: pmsHeaders(token),
        });
        if (!res.ok)
            throw new Error(`Plex listing failed (${res.status})`);
        const data = (await res.json());
        const batch = data.MediaContainer?.Metadata ?? [];
        for (const m of batch)
            out.push(toPlexItem(m));
        const total = data.MediaContainer?.totalSize ?? out.length;
        if (batch.length < pageSize || out.length >= total)
            break;
    }
    return out;
}
/** The most-recently-added items of a type in a section (for the incremental scan). */
export async function getRecentlyAdded(baseUrl, token, sectionKey, type, limit = 50) {
    const qs = [
        `type=${type}`,
        "sort=addedAt:desc",
        `X-Plex-Container-Start=0`,
        `X-Plex-Container-Size=${limit}`,
    ].join("&");
    const res = await fetch(`${baseUrl}/library/sections/${sectionKey}/all?${qs}`, {
        headers: pmsHeaders(token),
    });
    if (!res.ok)
        throw new Error(`Plex recently-added query failed (${res.status})`);
    const data = (await res.json());
    return (data.MediaContainer?.Metadata ?? []).map(toPlexItem);
}
/** Full metadata for a single item by ratingKey (e.g. to backfill a missing parent show). */
export async function getMetadata(baseUrl, token, ratingKey) {
    const res = await fetch(`${baseUrl}/library/metadata/${ratingKey}`, {
        headers: pmsHeaders(token),
    });
    if (!res.ok)
        return null;
    const data = (await res.json());
    const m = data.MediaContainer?.Metadata?.[0];
    return m ? toPlexItem(m) : null;
}
// Formats a browser can play from the original file (so we can direct-play + client-seek).
const DIRECT_CONTAINERS = new Set(["mp4", "mov", "m4v"]);
const DIRECT_VIDEO = new Set(["h264", "avc", "avc1"]);
const DIRECT_AUDIO = new Set(["aac", "mp3", "mp2", "mp4a"]);
// Plex/ffmpeg report a codec/container under several names; fold them to the token our
// capability set uses, so a direct-playable stream isn't sent to transcode over a naming
// gap. DTS especially: Plex reports `dca` / `dca-ma` (DTS-HD MA) / `dca-hra`, and MA/HRA
// embed a DTS core any DTS-core decoder falls back to — so the measured `dts` covers them.
function normAudioCodec(c) {
    const x = c.toLowerCase();
    if (x.startsWith("dca") || x.startsWith("dts"))
        return "dts";
    if (x === "ec-3" || x === "ec3" || x === "eac-3")
        return "eac3";
    if (x === "ac-3")
        return "ac3";
    if (x === "mlp")
        return "truehd";
    return x;
}
function normVideoCodec(c) {
    const x = c.toLowerCase();
    if (x === "h265" || x === "hvc1" || x === "hev1")
        return "hevc";
    if (x === "avc" || x === "avc1")
        return "h264";
    return x;
}
function normContainer(c) {
    const x = c.toLowerCase();
    if (x.startsWith("matroska"))
        return "mkv";
    if (x === "quicktime")
        return "mov";
    return x;
}
const streamLang = (s) => (s.languageCode || s.languageTag || "und").toLowerCase();
const streamLabel = (s) => s.language || s.extendedDisplayTitle || s.displayTitle || streamLang(s).toUpperCase();
/** Distinct languages present (first stream per language wins the label). */
function dedupeTracks(streams) {
    const out = [];
    const seen = new Set();
    for (const s of streams) {
        const lang = streamLang(s);
        if (seen.has(lang))
            continue;
        seen.add(lang);
        out.push({ lang, label: streamLabel(s) });
    }
    return out;
}
/**
 * Resolve a playable URL for `ratingKey` at `offsetSeconds`, using the owner token.
 * Browser-friendly files direct-play (the client seeks to the offset); everything else
 * goes through Plex's HLS transcoder with the offset baked in. Returns null if the item
 * has no playable part.
 */
export async function getPlaybackInfo(baseUrl, token, clientId, ratingKey, offsetSeconds, opts = {}) {
    const res = await fetch(`${baseUrl}/library/metadata/${ratingKey}`, {
        headers: pmsHeaders(token),
    });
    if (!res.ok)
        return null;
    const data = (await res.json());
    const media = data.MediaContainer?.Metadata?.[0]?.Media?.[0];
    const part = media?.Part?.[0];
    if (!part?.key)
        return null;
    const streams = part.Stream ?? [];
    const audioStreams = streams.filter((s) => s.streamType === 2);
    // Prefer non-forced subtitles (forced only shows foreign-dialogue snippets), so a
    // language maps to the full subtitle track and the picker labels it plainly.
    const subStreams = streams
        .filter((s) => s.streamType === 3)
        .sort((a, b) => (a.forced ? 1 : 0) - (b.forced ? 1 : 0));
    const audioTracks = dedupeTracks(audioStreams);
    const subtitleTracks = dedupeTracks(subStreams);
    const container = (media?.container ?? part.container ?? "").toLowerCase();
    const videoCodec = (media?.videoCodec ?? "").toLowerCase();
    const audioCodec = (media?.audioCodec ?? "").toLowerCase();
    // Map the requested audio/subtitle language to a concrete stream id on this item.
    const quality = qualityParams(opts.quality);
    const audioStreamId = opts.audioLang
        ? audioStreams.find((s) => streamLang(s) === opts.audioLang)?.id
        : undefined;
    const wantsSubs = !!opts.subtitleLang && opts.subtitleLang !== "off";
    const subStreamId = wantsSubs
        ? subStreams.find((s) => streamLang(s) === opts.subtitleLang)?.id
        : undefined;
    // Device-aware capability check: use the real client's codec support when it reports
    // it (a TV), else the built-in browser assumption (h264/aac/mp4 — the admin preview).
    const caps = opts.caps;
    const vOk = (c) => {
        const n = normVideoCodec(c);
        return caps ? caps.videoCodecs.includes(n) : DIRECT_VIDEO.has(n);
    };
    const aOk = (c) => {
        const n = normAudioCodec(c);
        return caps ? caps.audioCodecs.includes(n) : DIRECT_AUDIO.has(n);
    };
    const cOk = (c) => {
        const n = normContainer(c);
        return caps ? caps.directContainers.includes(n) : DIRECT_CONTAINERS.has(n);
    };
    // Quality cap, an audio-track switch, burned subtitles, or a runtime native-failure
    // retry (forceHls) all force a transcode; otherwise a file the client can play
    // natively direct-plays the raw part (client seeks to the offset).
    const canDirect = !opts.forceHls &&
        !quality &&
        audioStreamId == null &&
        subStreamId == null &&
        cOk(container) &&
        vOk(videoCodec) &&
        aOk(audioCodec);
    if (canDirect) {
        const url = `${baseUrl}${part.key}?X-Plex-Token=${encodeURIComponent(token)}`;
        return {
            mode: "direct",
            url,
            session: null,
            container,
            videoCodec,
            audioCodec,
            audioTracks,
            subtitleTracks,
        };
    }
    // HLS transcode — Plex applies `offset` server-side, so playback starts there. A
    // *unique* session id (per resolve) lets us stop this exact transcode on teardown
    // without ever colliding with a freshly-started one for the same item/offset.
    const session = `channelguide-${ratingKey}-${crypto.randomUUID().slice(0, 8)}`;
    // Native-first delivery: a TV (caps present) gets a PROGRESSIVE HTTP transcode it plays
    // with the native <video> element (full audio set, no MSE); the admin browser (no caps)
    // and the runtime native-failure retry (forceHls) fall back to HLS + hls.js/MSE — the
    // true last resort. See [[project-tv-playback-protocol]].
    let protocol = !opts.forceHls && caps ? "http" : "hls";
    // The progressive-http rung needs a container the native <video> can play while it's
    // still transcoding AND that this panel decodes (mkv/mpegts). If the panel has none,
    // a progressive mp4 would return an unplayable stub → go straight to hls instead.
    let httpContainer = "mkv";
    if (protocol === "http" && caps) {
        const pc = progressiveContainer(caps);
        if (pc)
            httpContainer = pc;
        else
            protocol = "hls";
    }
    const params = new URLSearchParams({
        path: `/library/metadata/${ratingKey}`,
        mediaIndex: "0",
        partIndex: "0",
        protocol,
        fastSeek: "1",
        offset: String(Math.max(0, Math.floor(offsetSeconds))),
        directPlay: "0",
        directStream: "1",
        subtitles: "none",
        hasMDE: "1",
        // `session` is what the (undocumented) universal/stop endpoint keys on;
        // `X-Plex-Session-Identifier` is the spec's canonical field. Real clients send both.
        session,
        "X-Plex-Session-Identifier": session,
        "X-Plex-Client-Identifier": clientId,
        "X-Plex-Token": token,
        "X-Plex-Product": PRODUCT,
        "X-Plex-Platform": "Web",
    });
    // Quality cap (the Plex "Quality" ladder). Only applied when a preset is chosen, so
    // the uncapped transcode path is unchanged.
    if (quality) {
        params.set("maxVideoBitrate", quality.maxVideoBitrate);
        params.set("videoResolution", quality.videoResolution);
        params.set("videoQuality", quality.videoQuality);
        params.set("autoAdjustQuality", "0");
    }
    // Advertise the client's real capabilities. With a TV's caps, Plex copies (direct-streams)
    // the codecs it can and packages HLS as **fMP4** (HEVC-in-mpegts is undecodable by MSE →
    // the C2 "could not be decoded"). Platform MUST be Generic — real names 400 on /decision
    // with custom transcode targets (plezy). Without caps, the browser profile (quality path).
    if (caps) {
        params.set("X-Plex-Client-Profile-Extra", clientProfileExtra(caps, protocol, httpContainer));
        params.set("X-Plex-Platform", "Generic");
    }
    else if (quality) {
        params.set("X-Plex-Client-Profile-Extra", BROWSER_CLIENT_PROFILE);
    }
    // Audio track switch (e.g. Japanese → English dub).
    if (audioStreamId != null)
        params.set("audioStreamID", String(audioStreamId));
    // Burned-in subtitles — the universal recipe, works for TEXT (srt) AND IMAGE (pgs/vobsub).
    // Plex's URL `subtitleStreamID` is honored inconsistently per codec (srt burns via burn,
    // pgs only via auto, etc.), so we select the sub the reliable way: a **server-side PUT**
    // on the part. Then `subtitles=burn` + `directStream=0` re-encodes the video with the sub
    // painted in — renders in any player. Verified live: srt + pgs both → subtitleDecision=burn.
    // NB: the PUT-select is per-part *global* Plex state (all viewers of that item share it) —
    // fine for the single-admin preview; revisit for true multi-user. See .docs/plex-subtitles-findings.md.
    const partId = String(part.id ?? (part.key ?? "").split("/")[3] ?? "");
    if (subStreamId != null && partId) {
        await fetch(`${baseUrl}/library/parts/${partId}?subtitleStreamID=${subStreamId}&allParts=1`, {
            method: "PUT",
            headers: pmsHeaders(token),
        }).catch(() => { });
        params.set("subtitles", "burn");
        params.set("directStream", "0");
    }
    else if (opts.subtitleLang === "off" && partId) {
        // Explicitly off — clear any prior server-side selection so nothing burns.
        await fetch(`${baseUrl}/library/parts/${partId}?subtitleStreamID=0&allParts=1`, {
            method: "PUT",
            headers: pmsHeaders(token),
        }).catch(() => { });
    }
    const qs = params.toString();
    // **Register the transcode with Plex's decision endpoint first.** This is the
    // documented two-step flow (decision → start): without it, `start.m3u8` 400s for any
    // media that needs a real transcode decision (e.g. an mkv/DTS movie at a non-trivial
    // offset). Same session/params so `start` picks up the negotiated session.
    let decision;
    try {
        const res2 = await fetch(`${baseUrl}/video/:/transcode/universal/decision?${qs}`, {
            headers: { ...pmsHeaders(token), Accept: "application/json" },
        });
        if (!res2.ok) {
            console.warn(`[plex] transcode decision ${res2.status} for ratingKey ${ratingKey}`);
        }
        else {
            const dj = (await res2.json().catch(() => null));
            const m = dj?.MediaContainer?.Metadata?.[0]?.Media?.[0];
            if (m) {
                decision = {
                    videoDecision: m.videoDecision,
                    audioDecision: m.audioDecision,
                    videoCodec: m.videoCodec,
                    audioCodec: m.audioCodec,
                    container: m.container,
                };
            }
        }
    }
    catch (err) {
        console.warn(`[plex] transcode decision failed for ratingKey ${ratingKey}:`, err);
    }
    // HLS = segmented playlist (start.m3u8 → hls.js); HTTP = one progressive stream
    // (start → native <video src>). Plex bakes `offset` into both, so the client plays
    // from 0 (no seek) for either transcode mode.
    const startPath = protocol === "hls" ? "start.m3u8" : "start";
    const url = `${baseUrl}/video/:/transcode/universal/${startPath}?${qs}`;
    return {
        mode: protocol === "hls" ? "hls" : "http",
        url,
        session,
        container,
        videoCodec,
        audioCodec,
        audioTracks,
        subtitleTracks,
        decision,
    };
}
/** Stop a Plex transcode session (so behind-the-scenes transcodes don't pile up). */
export async function stopTranscode(baseUrl, token, clientId, session) {
    const params = new URLSearchParams({
        session,
        "X-Plex-Client-Identifier": clientId,
        "X-Plex-Token": token,
    });
    try {
        await fetch(`${baseUrl}/video/:/transcode/universal/stop?${params.toString()}`, {
            headers: pmsHeaders(token),
        });
    }
    catch {
        // Best-effort — a failed stop just lets Plex time the session out on its own.
    }
}
/** Available values for a tag filter field (genre/studio/director/actor/…). */
export async function getFilterValues(baseUrl, token, sectionKey, field) {
    const res = await fetch(`${baseUrl}/library/sections/${sectionKey}/${field}`, {
        headers: pmsHeaders(token),
    });
    if (!res.ok)
        return [];
    const data = (await res.json());
    return (data.MediaContainer?.Directory ?? []).map((d) => ({ id: d.key, title: d.title }));
}
