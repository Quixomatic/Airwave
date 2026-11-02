package expo.modules.nativeguide

import kotlin.math.max
import kotlin.math.roundToInt

/**
 * The arithmetic behind the repeating textures a theme can paint (grain, halftone dots, graph paper): how big each tile is, where
 * its marks sit, and the grain's pixels. Kept free of Android types so it is unit-tested on the JVM; [GuideTiles] turns a spec
 * into a Bitmap and a BitmapShader.
 *
 * A tile is built at the size it is drawn at (or, for grain, one tile pixel per `texel`), so it is cut once and repeated by the shader
 * rather than redrawn per frame. A tile's side is a whole number of pixels, and the shader's matrix scales it by the little that
 * the exact period (`pitch` or `major` in design px times the screen's unit) differs from it, so a pattern that is 12.6 px wide on this
 * screen repeats every 12.6 px, not every 13.
 */
object TileMath {
  /** mulberry32, the generator the theme mocks draw their grain with: the same seed gives the same specks here and there. */
  class Rng(seed: Int) {
    private var a = seed

    /** The next value in [0, 1). */
    fun next(): Double {
      a += 0x6d2b79f5
      var t = (a xor (a ushr 15)) * (1 or a)
      t = (t + (t xor (t ushr 7)) * (61 or t)) xor t
      return ((t xor (t ushr 14)).toLong() and 0xFFFFFFFFL) / 4294967296.0
    }
  }

  /**
   * The grain tile's pixels, `tile` x `tile` ARGB (not premultiplied): each pixel is lit with probability `density`, in one of
   * `colors` (opaque, picked at random) at `alpha` scaled by a random 0.45..1. Same draw order as the mock: the density roll, the
   * color roll (spent even with one color), the alpha roll (only for a lit pixel).
   */
  fun grainPixels(g: GuideLook.Grain): IntArray {
    val rnd = Rng(g.seed)
    val out = IntArray(g.tile * g.tile)
    for (i in out.indices) {
      if (rnd.next() < g.density) {
        val rgb = g.colors[(rnd.next() * g.colors.size).toInt().coerceAtMost(g.colors.size - 1)] and 0xFFFFFF
        val a = (255 * g.alpha * (0.45 + 0.55 * rnd.next())).roundToInt().coerceIn(0, 255)
        out[i] = (a shl 24) or rgb
      }
    }
    return out
  }

  /** How many screen px one grain texel covers: `texel` design px at the screen's unit. */
  fun texelPx(g: GuideLook.Grain, unitPx: Double): Float = (g.texel * unitPx).toFloat()

  /** Two dots per `pitch` x `pitch` square, on a 45 degree lattice: one at a quarter of the way across and down, one at three quarters. */
  class Dots(
    /** The bitmap's side, px. */
    val side: Int,
    /** What the shader scales it by so the tile repeats at exactly the pitch. */
    val scale: Float,
    /** A dot's radius in bitmap px. */
    val radius: Float,
  ) {
    /** Where the two dots are, in bitmap px: (x0, y0, x1, y1). */
    val centres: FloatArray get() = floatArrayOf(side * 0.25f, side * 0.25f, side * 0.75f, side * 0.75f)
  }

  fun dots(h: GuideLook.Halftone, unitPx: Double): Dots {
    val pitchPx = max(1.0, h.pitch * unitPx)
    val side = max(MIN_SIDE, pitchPx.roundToInt())
    return Dots(side, (pitchPx / side).toFloat(), (h.dot * side / h.pitch).toFloat())
  }

  /**
   * Graph paper: one `major` square holding a line every `minor` (`count` of them across, the first on the tile's edge) and the heavier
   * major line on that same edge. Lines are `lineW` bitmap px thick, never under one.
   */
  class Lines(val side: Int, val scale: Float, val lineW: Int, val minorStep: Double, val count: Int) {
    /** Where the `k`th minor line starts, bitmap px. */
    fun minorAt(k: Int): Int = (k * minorStep).roundToInt()
  }

  fun lines(g: GuideLook.Grid, unitPx: Double): Lines {
    val majorPx = max(1.0, g.major * unitPx)
    val side = max(MIN_SIDE, majorPx.roundToInt())
    val scale = majorPx / side
    val count = max(1, (g.major / g.minor).roundToInt())
    return Lines(side, scale.toFloat(), max(1, (g.w * unitPx / scale).roundToInt()), side.toDouble() / count, count)
  }

  /** A stroke `designPx` wide as whole screen px: at least one, so a hairline never vanishes, and none for a zero width. */
  fun strokePx(designPx: Double, unitPx: Double): Float = if (designPx <= 0.0) 0f else max(1.0, (designPx * unitPx).roundToInt().toDouble()).toFloat()

  private const val MIN_SIDE = 2
}
