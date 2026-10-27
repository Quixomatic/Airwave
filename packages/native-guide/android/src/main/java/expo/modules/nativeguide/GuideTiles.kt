package expo.modules.nativeguide

import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Shader

/**
 * The repeating textures a theme paints, built once and cached: a tile is cut into a small Bitmap and repeated by a BitmapShader, so a
 * full-screen grain or a grid is one `drawRect` per frame. The sizes and marks are [TileMath]'s. A tile belongs to a spec and a
 * screen unit (design px to px): when either changes (a theme change, a different resolution) the old ones are dropped.
 *
 * Every use takes the pattern's origin in the view's coordinates (`originX`, `originY`), so a view that does not sit at the screen's
 * corner still repeats the pattern from the screen's, where the screen's other layers start theirs. Main thread only.
 */
internal class GuideTiles {
  private data class Key(val spec: Any, val unit: Double)

  private class Built(@Suppress("unused") val bitmap: Bitmap, val shader: BitmapShader, val scale: Float, val filter: Boolean)

  private val built = HashMap<Key, Built>()
  private val matrix = Matrix()
  private val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private val bar = Paint().apply { style = Paint.Style.FILL }

  /** A paint that fills with the grain tile: one texel is `texel` design px wide, nearest sampled so the specks stay crisp. */
  fun grain(g: GuideLook.Grain, unitPx: Double, paint: Paint, originX: Float, originY: Float) {
    val b = built.getOrPut(Key(g, unitPx)) {
      val bmp = Bitmap.createBitmap(TileMath.grainPixels(g), g.tile, g.tile, Bitmap.Config.ARGB_8888)
      Built(bmp, BitmapShader(bmp, Shader.TileMode.REPEAT, Shader.TileMode.REPEAT), TileMath.texelPx(g, unitPx).coerceAtLeast(0.01f), false)
    }
    use(b, paint, originX, originY)
  }

  /** Two dots per pitch, on the 45 degree lattice (`angle` is documented as the lattice's, and every theme sets 45). */
  fun halftone(h: GuideLook.Halftone, unitPx: Double, paint: Paint, originX: Float, originY: Float) {
    val b = built.getOrPut(Key(h, unitPx)) {
      val spec = TileMath.dots(h, unitPx)
      val bmp = Bitmap.createBitmap(spec.side, spec.side, Bitmap.Config.ARGB_8888)
      dot.color = h.color
      val c = Canvas(bmp)
      val at = spec.centres
      c.drawCircle(at[0], at[1], spec.radius, dot)
      c.drawCircle(at[2], at[3], spec.radius, dot)
      Built(bmp, BitmapShader(bmp, Shader.TileMode.REPEAT, Shader.TileMode.REPEAT), spec.scale, true)
    }
    use(b, paint, originX, originY)
  }

  /** Graph paper: a faint line every `minor`, a stronger one every `major`. */
  fun grid(g: GuideLook.Grid, unitPx: Double, paint: Paint, originX: Float, originY: Float) {
    val b = built.getOrPut(Key(g, unitPx)) {
      val spec = TileMath.lines(g, unitPx)
      val bmp = Bitmap.createBitmap(spec.side, spec.side, Bitmap.Config.ARGB_8888)
      val c = Canvas(bmp)
      val side = spec.side.toFloat()
      val lw = spec.lineW.toFloat()
      bar.color = g.minorColor
      for (k in 0 until spec.count) {
        val at = spec.minorAt(k).toFloat()
        c.drawRect(at, 0f, at + lw, side, bar)
        c.drawRect(0f, at, side, at + lw, bar)
      }
      // The major line sits on the tile's own edge, over the minor one that is there too.
      bar.color = g.majorColor
      c.drawRect(0f, 0f, lw, side, bar)
      c.drawRect(0f, 0f, side, lw, bar)
      Built(bmp, BitmapShader(bmp, Shader.TileMode.REPEAT, Shader.TileMode.REPEAT), spec.scale, true)
    }
    use(b, paint, originX, originY)
  }

  private fun use(b: Built, paint: Paint, originX: Float, originY: Float) {
    matrix.setScale(b.scale, b.scale)
    matrix.postTranslate(originX, originY)
    b.shader.setLocalMatrix(matrix)
    paint.shader = b.shader
    paint.isFilterBitmap = b.filter
  }

  /** Forgets every tile. The bitmaps are not recycled: a frame already recorded may still draw from them. */
  fun clear() = built.clear()
}
