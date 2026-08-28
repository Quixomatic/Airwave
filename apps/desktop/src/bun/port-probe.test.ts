import { describe, expect, test } from "bun:test";
import { netstatOwnsPort, lsofOwnsPort, ssOwnsPort } from "./port-probe";

// Representative real-world output captured from each tool. The Windows path is also proven live against a real
// listener; these lock the macOS/Linux parsing (which the dev box can't run) against actual command output.

describe("netstatOwnsPort (Windows netstat -ano -p tcp)", () => {
  const OUT = [
    "",
    "Active Connections",
    "",
    "  Proto  Local Address          Foreign Address        State           PID",
    "  TCP    127.0.0.1:36020        0.0.0.0:0              LISTENING       12345",
    "  TCP    127.0.0.1:36021        0.0.0.0:0              LISTENING       12345",
    "  TCP    0.0.0.0:54329          0.0.0.0:0              LISTENING       9988",
    "  TCP    127.0.0.1:5432         127.0.0.1:60112        ESTABLISHED     777",
    "  TCP    [::]:36022             [::]:0                 LISTENING       12345",
  ].join("\r\n");

  test("matches the pid listening on the port", () => {
    expect(netstatOwnsPort(OUT, 12345, 36020)).toBe(true);
    expect(netstatOwnsPort(OUT, 9988, 54329)).toBe(true);
    expect(netstatOwnsPort(OUT, 12345, 36022)).toBe(true); // IPv6 [::]:36022
  });
  test("rejects wrong pid on the right port (PID-reuse guard)", () => {
    expect(netstatOwnsPort(OUT, 99999, 36020)).toBe(false);
  });
  test("rejects right pid on a wrong port", () => {
    expect(netstatOwnsPort(OUT, 12345, 36099)).toBe(false);
  });
  test("does not match ESTABLISHED (non-LISTENING) rows", () => {
    expect(netstatOwnsPort(OUT, 777, 5432)).toBe(false);
  });
  test("does not match the port number appearing as a PID or foreign port", () => {
    // 36020 must not match via the trailing PID column or a foreign address
    expect(netstatOwnsPort("  TCP    10.0.0.5:443    1.2.3.4:36020    ESTABLISHED    36020", 36020, 36020)).toBe(false);
  });
});

describe("lsofOwnsPort (macOS/Linux lsof -t, already port-filtered)", () => {
  test("terse pid-per-line output includes the pid", () => {
    expect(lsofOwnsPort("12345\n", 12345)).toBe(true);
    expect(lsofOwnsPort("12345\n23456\n", 23456)).toBe(true); // pre-fork: multiple listeners
  });
  test("rejects a pid not in the list", () => {
    expect(lsofOwnsPort("12345\n", 999)).toBe(false);
  });
  test("empty output (nothing on the port, or lsof absent) is false", () => {
    expect(lsofOwnsPort("", 12345)).toBe(false);
    expect(lsofOwnsPort("\n", 12345)).toBe(false);
  });
  test("does not treat a substring/partial pid as a match", () => {
    expect(lsofOwnsPort("123456\n", 12345)).toBe(false);
  });
});

describe("ssOwnsPort (Linux ss -Htlnp fallback)", () => {
  const OUT = [
    'LISTEN 0      511          127.0.0.1:36020      0.0.0.0:*    users:(("bun",pid=1234,fd=20))',
    'LISTEN 0      4096         127.0.0.1:54329      0.0.0.0:*    users:(("postgres",pid=5678,fd=7))',
    "LISTEN 0      128              0.0.0.0:22          0.0.0.0:*   ", // sshd, no process info (not root)
    'LISTEN 0      511              [::1]:36022         [::]:*      users:(("bun",pid=1234,fd=22))',
    'LISTEN 0      511                  *:36021            *:*      users:(("bun",pid=1234,fd=21))',
  ].join("\n");

  test("matches the pid listening on the port (IPv4, IPv6, and wildcard locals)", () => {
    expect(ssOwnsPort(OUT, 1234, 36020)).toBe(true);
    expect(ssOwnsPort(OUT, 5678, 54329)).toBe(true);
    expect(ssOwnsPort(OUT, 1234, 36022)).toBe(true); // [::1]:36022
    expect(ssOwnsPort(OUT, 1234, 36021)).toBe(true); // *:36021
  });
  test("rejects wrong pid on the right port (PID-reuse guard)", () => {
    expect(ssOwnsPort(OUT, 9999, 36020)).toBe(false);
  });
  test("rejects right pid on a wrong port", () => {
    expect(ssOwnsPort(OUT, 1234, 40000)).toBe(false);
  });
  test("a row with no process info (users omitted) never matches", () => {
    expect(ssOwnsPort(OUT, 22, 22)).toBe(false);
  });
});
