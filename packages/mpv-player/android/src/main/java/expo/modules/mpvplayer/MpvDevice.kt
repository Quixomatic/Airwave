package expo.modules.mpvplayer

/**
 * The SoCs on which SDR is rendered through `mediacodec_embed` instead of gpu-next (see `MpvCore.sdrIsEmbed`),
 * as the start of their `Build.HARDWARE` / `Build.BOARD` (lowercase). Only a SoC where the gpu-next stall has been
 * reproduced belongs here, so every other device keeps gpu-next. To widen it, add an entry and a test.
 *
 * - `mt5889`: the MediaTek SoC in the TCL QM8. Docking the full-screen player into the guide's mini preview
 *   freezes the picture.
 *
 * Deliberately NOT a pattern such as `mt5xxx`: that would probably also catch Sony Bravia TVs, which `MpvCore`
 * lists as tested-good on gpu-next. The Google TV Streamer (also MediaTek) is not listed either: a similar
 * stall was seen there (see `MpvCore.detachSurface`), but this change has not been checked on it.
 */
private val EMBED_FOR_SDR_SOCS = setOf("mt5889")

/**
 * True when this device's SDR playback must use `mediacodec_embed` (see [EMBED_FOR_SDR_SOCS]). Compares
 * `Build.HARDWARE` and `Build.BOARD` against the list, ignoring case and surrounding whitespace; `null` or blank
 * never matches. Takes the strings, not `Build`, so it can be unit-tested on the JVM (where `android.os.Build`
 * is a stub).
 *
 * A prefix match, not equality, because the exact property string on the QM8 has not been re-checked: `mt5889`,
 * `MT5889` and `mt5889_tcl` all match. A digit straight after the part number means a different part
 * (`mt58890`), so that does not match, and neither does the part number buried inside a longer string.
 */
internal fun needsEmbedForSdr(hardware: String?, board: String?): Boolean =
  isListedSoc(hardware) || isListedSoc(board)

private fun isListedSoc(value: String?): Boolean {
  val soc = value.orEmpty().trim()
  return EMBED_FOR_SDR_SOCS.any { id ->
    soc.startsWith(id, ignoreCase = true) && soc.getOrNull(id.length)?.isDigit() != true
  }
}
