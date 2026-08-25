/**
 * Workaround for https://github.com/blackboardsh/electrobun/issues/485.
 *
 * The darwin-x64 electrobun core binaries (extractor/launcher: headerpad 0, libasar.dylib: 8) ship WITHOUT an
 * LC_CODE_SIGNATURE and without room to add one. Apple's `codesign` needs 16 bytes of load-command space to append
 * its LC_CODE_SIGNATURE — when there is none it SILENTLY overwrites the start of `__text`, producing a signed,
 * notarized app that segfaults on launch (the crash at `fs.path.resolve` → `main.main`). arm64 is immune: ad-hoc
 * signatures are mandatory there, so the linker always reserves the load command.
 *
 * Fix, applied to each x86_64 Mach-O BEFORE we sign it: if it's unsigned and has headerpad < 16, drop the
 * expendable LC_SOURCE_VERSION (exactly 16 bytes; LC_UUID at 24 bytes as fallback). The binary is otherwise
 * byte-identical. Becomes a no-op once upstream ships padded binaries — delete this when #485 lands in a version
 * we can build Intel with (as of writing the fix only exists in Hutch-based betas, which can't build x86_64).
 *
 * Adapted from deer-flow/llm-space#29 into a per-file helper — we run our OWN signer (build-mac-signed.ts), not
 * electrobun's codesign hooks, so we call ensureHeaderpad() on each binary in that signer's leaf-first walk.
 */
import { readFileSync, writeFileSync } from "node:fs";

const MH_MAGIC_64_LE = 0xfeedfacf;
const CPU_TYPE_X86_64 = 0x01000007;
const LC_SEGMENT_64 = 0x19;
const LC_UUID = 0x1b;
const LC_CODE_SIGNATURE = 0x1d;
const LC_SOURCE_VERSION = 0x2a;
const MACHO_HEADER_SIZE = 32;
/** codesign appends one linkedit_data_command: 16 bytes. */
const REQUIRED_PAD = 16;

interface MachOInfo {
  isThinX64: boolean;
  hasCodeSignature: boolean;
  headerpad: number;
  commandOffsets: Map<number, { offset: number; size: number }>;
}

function analyze(buf: Buffer): MachOInfo {
  const none: MachOInfo = { isThinX64: false, hasCodeSignature: false, headerpad: 0, commandOffsets: new Map() };
  if (buf.length < MACHO_HEADER_SIZE) return none;
  if (buf.readUInt32LE(0) !== MH_MAGIC_64_LE) return none; // not a thin little-endian 64-bit Mach-O (fat/arm64/other)
  if (buf.readUInt32LE(4) !== CPU_TYPE_X86_64) return none;

  const ncmds = buf.readUInt32LE(16);
  const sizeofcmds = buf.readUInt32LE(20);
  const commandOffsets = new Map<number, { offset: number; size: number }>();
  let hasCodeSignature = false;
  let minContentOffset = Number.MAX_SAFE_INTEGER;

  let offset = MACHO_HEADER_SIZE;
  for (let i = 0; i < ncmds; i++) {
    const cmd = buf.readUInt32LE(offset);
    const cmdsize = buf.readUInt32LE(offset + 4);
    if (!commandOffsets.has(cmd)) commandOffsets.set(cmd, { offset, size: cmdsize });
    if (cmd === LC_CODE_SIGNATURE) hasCodeSignature = true;
    if (cmd === LC_SEGMENT_64) {
      const nsects = buf.readUInt32LE(offset + 64);
      let sectionOffset = offset + 72;
      for (let s = 0; s < nsects; s++) {
        const secSize = Number(buf.readBigUInt64LE(sectionOffset + 40));
        const secFileOffset = buf.readUInt32LE(sectionOffset + 48);
        if (secFileOffset > 0 && secSize > 0) minContentOffset = Math.min(minContentOffset, secFileOffset);
        sectionOffset += 80;
      }
    }
    offset += cmdsize;
  }

  const endOfCommands = MACHO_HEADER_SIZE + sizeofcmds;
  const headerpad = minContentOffset === Number.MAX_SAFE_INTEGER ? 0 : minContentOffset - endOfCommands;
  return { isThinX64: true, hasCodeSignature, headerpad, commandOffsets };
}

/** Remove one load command in place: shift the rest up, zero the freed tail, decrement ncmds/sizeofcmds. */
function removeLoadCommand(buf: Buffer, target: { offset: number; size: number }): void {
  const ncmds = buf.readUInt32LE(16);
  const sizeofcmds = buf.readUInt32LE(20);
  const endOfCommands = MACHO_HEADER_SIZE + sizeofcmds;
  buf.copyWithin(target.offset, target.offset + target.size, endOfCommands);
  buf.fill(0, endOfCommands - target.size, endOfCommands);
  buf.writeUInt32LE(ncmds - 1, 16);
  buf.writeUInt32LE(sizeofcmds - target.size, 20);
}

/**
 * Ensure a single Mach-O has room for codesign's LC_CODE_SIGNATURE.
 *  - "skipped": not a thin x86_64 Mach-O (arm64/fat/non-Mach-O) — nothing to do.
 *  - "ok":      already signed, or already has ≥16 bytes headerpad.
 *  - "fixed":   removed an expendable load command to free 16 bytes (writes the file).
 *  - "failed":  needs padding but has no removable load command — signing WOULD corrupt it; caller must abort.
 */
export function ensureHeaderpad(filePath: string): "fixed" | "ok" | "skipped" | "failed" {
  const buf = Buffer.from(readFileSync(filePath));
  const info = analyze(buf);
  if (!info.isThinX64) return "skipped";
  if (info.hasCodeSignature) return "ok"; // pre-signed (e.g. bun runtime) — re-signs in place, no new load command
  if (info.headerpad >= REQUIRED_PAD) return "ok";

  const removable = info.commandOffsets.get(LC_SOURCE_VERSION) ?? info.commandOffsets.get(LC_UUID);
  if (!removable) return "failed";
  removeLoadCommand(buf, removable);

  const after = analyze(buf);
  if (after.headerpad < REQUIRED_PAD) return "failed";
  writeFileSync(filePath, buf);
  return "fixed";
}
