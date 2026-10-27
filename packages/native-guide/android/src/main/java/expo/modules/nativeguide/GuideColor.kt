package expo.modules.nativeguide

import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * Colors as ARGB ints. Parsing is written without android.graphics so it runs in the JVM unit tests: tokens and the
 * lineup carry CSS-style color strings (the React Native rows' own values), and both renderers must read them alike.
 */
object GuideColor {
  const val TRANSPARENT = 0
  const val WHITE = -1 // 0xFFFFFFFF
  const val BLACK = -16777216 // 0xFF000000

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

  /**
   * The color with its own alpha scaled by `a` (0..1): `#000` at 0.34 is 34%, a 50% color at 20% is 10%. The one rule a shadow step's and a halo
   * ring's alpha follows, whatever form the color is written in, as tv-native's `hexA` applies it to the same colors.
   */
  fun scaleAlpha(color: Int, a: Double): Int = argb(((color ushr 24) * a.coerceIn(0.0, 1.0)).roundToInt(), (color shr 16) and 0xff, (color shr 8) and 0xff, color and 0xff)

  /**
   * `a` moved toward `b` by `t` (0 = a, 1 = b), opaque, as tv-native's `mixColors` computes it: each channel is
   * `p + (q - p) * t` in double precision, rounded to the nearest integer with halves going up (JavaScript's `Math.round`),
   * so JS and native shade an accent to the same color. Alpha is ignored; both colors are meant to be opaque.
   */
  fun mix(a: Int, b: Int, t: Double): Int {
    fun channel(shift: Int): Int {
      val p = (a shr shift) and 0xff
      val q = (b shr shift) and 0xff
      val x = p + (q - p) * t
      val whole = floor(x)
      return (if (x - whole >= 0.5) whole + 1 else whole).toInt()
    }
    return argb(255, channel(16), channel(8), channel(0))
  }

  /** `top` painted over `under` (source-over), as tv-native's `over` computes it. */
  fun over(top: Int, under: Int): Int {
    val fa = (top ushr 24) / 255.0
    val ua = (under ushr 24) / 255.0
    val a = fa + ua * (1 - fa)
    if (a == 0.0) return TRANSPARENT
    fun ch(shift: Int): Int {
      val f = (top shr shift) and 0xff
      val u = (under shr shift) and 0xff
      return ((f * fa + u * ua * (1 - fa)) / a).roundToInt()
    }
    return argb((a * 255).roundToInt(), ch(16), ch(8), ch(0))
  }

  /** WCAG 2.x relative luminance of an opaque color, 0 (black) to 1 (white). */
  fun luminance(color: Int): Double {
    fun lin(shift: Int): Double {
      val c = ((color shr shift) and 0xff) / 255.0
      return if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
    }
    return 0.2126 * lin(16) + 0.7152 * lin(8) + 0.0722 * lin(0)
  }

  /** WCAG contrast ratio of `fg` on an opaque `bg` (a translucent `fg` is composited over it first). */
  fun contrast(fg: Int, bg: Int): Double {
    val l1 = luminance(over(fg, bg))
    val l2 = luminance(bg)
    return (max(l1, l2) + 0.05) / (min(l1, l2) + 0.05)
  }

  /** Black or white, whichever reads better on `bg`: what a circle style's glyph `auto` draws in. `bg` is composited over `base` first. */
  fun autoInk(bg: Int, base: Int = BLACK): Int {
    val flat = over(bg, over(base, BLACK))
    return if (contrast(BLACK, flat) >= contrast(WHITE, flat)) BLACK else WHITE
  }

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
