// Pure parsers for "does PID own the listening socket on PORT?", split out of the supervisor so they're
// unit-testable without booting the app (index.ts self-executes) and without the target OS. The live probe
// (pidOwnsPort in index.ts) runs the platform command and hands its stdout to one of these.

/** Windows `netstat -ano -p tcp` rows: "  TCP  127.0.0.1:36020  0.0.0.0:0  LISTENING  12345". */
export function netstatOwnsPort(out: string, pid: number, port: number): boolean {
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes("LISTENING")) continue;
    const cols = line.trim().split(/\s+/); // [TCP, <local>, <foreign>, LISTENING, <pid>]
    const local = cols[1] ?? "";
    if (local.endsWith(`:${port}`) && Number.parseInt(cols[cols.length - 1] ?? "", 10) === pid) return true;
  }
  return false;
}

/** macOS/Linux `lsof … -t` prints one listening pid per line (already filtered to the port by the -iTCP arg). */
export function lsofOwnsPort(out: string, pid: number): boolean {
  return out.split(/\s+/).some((s) => s !== "" && Number.parseInt(s, 10) === pid);
}

/** Linux `ss -Htlnp` rows: `LISTEN 0 511 127.0.0.1:36020 0.0.0.0:* users:(("bun",pid=1234,fd=20))`. Fallback
 * for the (common on minimal distros) case where lsof isn't installed but iproute2's ss is. IPv6 locals look
 * like `[::1]:36020` / `*:36020` — all end in `:<port>`, which is what we match on. */
export function ssOwnsPort(out: string, pid: number, port: number): boolean {
  for (const line of out.split(/\r?\n/)) {
    const local = line.trim().split(/\s+/)[3] ?? ""; // LISTEN recv-q send-q <local> <peer> users:(…)
    if (!local.endsWith(`:${port}`)) continue;
    for (const m of line.matchAll(/pid=(\d+)/g)) if (Number.parseInt(m[1] ?? "", 10) === pid) return true;
  }
  return false;
}
