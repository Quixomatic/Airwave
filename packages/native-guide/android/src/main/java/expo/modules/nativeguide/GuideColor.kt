package expo.modules.nativeguide

import kotlin.math.roundToInt

/**
 * Colors as ARGB ints. Parsing is written without android.graphics so it runs in the JVM unit tests: tokens and the
 * lineup carry CSS-style color strings (the React Native rows' own values), and both renderers must read them alike.
 */
object GuideColor {
  const val TRANSPARENT = 0
  const val WHITE = -1 // 0xFFFFFFFF

  /** "#rgb", "#rrggbb", "#rrggbbaa" (CSS order: alpha last), "rgb(r, g, b)", "rgba(r, g, b, a)" or "transparent".
   *  Anything unparseable is white, so a bad token stays visible instead of vanishing. */
  fun parse(raw: String): Int {
    val s = raw.trim()
    if (s == "transparent") return TRANSPARENT
    return try {
      when {
        s.startsWith("rgb") -> {
          val v = s.substringAfter('(').substringBefore(')').split(',').map { it.trim() }
          val a = if (v.size > 3) (v[3].toFloat() * 255).roundToInt() else 255
          argb(a, v[0].toFloat().roundToInt(), v[1].toFloat().roundToInt(), v[2].toFloat().roundToInt())
        }
        s.startsWith("#") && s.length == 4 -> hex(s[1].toString() + s[1] + s[2] + s[2] + s[3] + s[3], 255)
        s.startsWith("#") && s.length == 7 -> hex(s.substring(1), 255)
        s.startsWith("#") && s.length == 9 -> hex(s.substring(1, 7), hexInt(s.substring(7, 9)))
        else -> WHITE
      }
    } catch (_: NumberFormatException) {
      WHITE
    } catch (_: IndexOutOfBoundsException) {
      WHITE
    }
  }

  /** The color with its alpha channel set to `a` (0..1). */
  fun alpha(color: Int, a: Double): Int = argb((a * 255).roundToInt(), (color shr 16) and 0xff, (color shr 8) and 0xff, color and 0xff)

  fun argb(a: Int, r: Int, g: Int, b: Int): Int =
    (a.coerceIn(0, 255) shl 24) or (r.coerceIn(0, 255) shl 16) or (g.coerceIn(0, 255) shl 8) or b.coerceIn(0, 255)

  private fun hex(rrggbb: String, a: Int): Int {
    val rgb = hexInt(rrggbb)
    return argb(a, (rgb shr 16) and 0xff, (rgb shr 8) and 0xff, rgb and 0xff)
  }

  /** `toInt(16)` that rejects signs and any other non-hex character. */
  private fun hexInt(s: String): Int {
    if (!s.all { Character.digit(it, 16) >= 0 }) throw NumberFormatException(s)
    return s.toInt(16)
  }
}
