package expo.modules.nativeguide

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.RectF

/**
 * A least-recently-used cache bounded by a byte budget. The entry just put is never evicted by its own insertion (a value larger than the
 * whole budget is kept until the next one arrives). No Android imports, so it is unit-tested on the JVM; [DashedBorders] caches bitmaps in it.
 */
internal class ByteLru<K : Any, V : Any>(private val maxBytes: Long, private val sizeOf: (V) -> Long) {
  private val map = LinkedHashMap<K, V>(64, 0.75f, true)

  /** The bytes the entries hold, by `sizeOf`. */
  var bytes = 0L
    private set

  val size: Int get() = map.size

  /** The entry for `key`, marking it the most recently used. */
  operator fun get(key: K): V? = map[key]

  fun put(key: K, value: V) {
    map.put(key, value)?.let { bytes -= sizeOf(it) }
    bytes += sizeOf(value)
    val oldest = map.entries.iterator()
    while (bytes > maxBytes && map.size > 1 && oldest.hasNext()) {
      val entry = oldest.next()
      if (entry.key == key) continue
      bytes -= sizeOf(entry.value)
      oldest.remove()
    }
  }

  fun clear() {
    map.clear()
    bytes = 0L
  }
}

/**
 * Dashed outlines, drawn from a cached mask instead of a `DashPathEffect` on every frame.
 *
 * A dashed stroke is a path effect, and Skia's GPU backend has no fast path for one on a rectangle: it cuts the outline into dashes on the
 * CPU and rasterizes the result into a coverage mask ("SW Path Mask" in `dumpsys gfxinfo`). Blueprint draws one such outline per program
 * cell, ~70 on screen. Measured on a 32-bit Android TV with a Mali-G52, Blueprint ran 94 to 100% janky frames at ~40 fps with 148 of those
 * masks in the GPU cache, against 3% for a theme without dashes. That the effect is re-applied on every replay of the frame, rather than
 * only when the mask is made, is the likely reason it costs a frame time and is not confirmed on that device. Here the outline is
 * rasterized ONCE, by the same Skia code on a software canvas (same path, same effect, same anti-aliasing: the pixels are those the GPU's
 * own mask holds), into an ALPHA_8 bitmap the size of its box, and each frame is one `drawBitmap` in the border's color.
 *
 * A mask belongs to the outline's size, border width and corner radius, not to a theme or a color, so a cell that comes back (a scroll, a
 * repeat of a size) is a hit. The cache holds [MAX_BYTES] and drops the least recently drawn first; the bitmaps are not recycled, because
 * a frame already recorded may still draw from one. Main thread only.
 */
internal class DashedBorders {
  private data class Key(val w: Int, val h: Int, val border: Int, val radius: Int)

  private val masks = ByteLru<Key, Bitmap>(MAX_BYTES) { it.allocationByteCount.toLong() }
  private val effects = HashMap<Int, DashPathEffect>()
  private val maskPaint = Paint()
  private val brush = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    color = Color.BLACK
  }
  private val box = RectF()

  /**
   * Draws the dashed outline of a `border` px stroke centered `border / 2` inside the whole-pixel box (`left`, `top`) to (`right`, `bottom`),
   * its corners rounded to `radius` (the radius of the stroke's own centerline, as `drawRoundRect` takes it), in `color`. Returns false,
   * drawing nothing, when the box is too big to cache (the caller strokes it itself).
   */
  fun draw(canvas: Canvas, left: Int, top: Int, right: Int, bottom: Int, border: Float, radius: Float, color: Int): Boolean {
    val w = right - left
    val h = bottom - top
    if (w <= 0 || h <= 0 || border <= 0f) return true
    if (!DashMask.fits(w, h)) return false
    val key = Key(w, h, border.toRawBits(), radius.toRawBits())
    val mask = masks[key] ?: build(key, border, radius).also { masks.put(key, it) }
    maskPaint.color = color
    canvas.drawBitmap(mask, left.toFloat(), top.toFloat(), maskPaint)
    return true
  }

  private fun build(key: Key, border: Float, radius: Float): Bitmap {
    val bitmap = Bitmap.createBitmap(key.w, key.h, Bitmap.Config.ALPHA_8)
    brush.strokeWidth = border
    brush.pathEffect = effects.getOrPut(key.border) { DashPathEffect(BorderDash.intervals(border), 0f) }
    box.set(border / 2, border / 2, key.w - border / 2, key.h - border / 2)
    Canvas(bitmap).drawRoundRect(box, radius, radius, brush)
    return bitmap
  }

  /** Forgets every mask (a theme change, memory pressure, or the view detached). */
  fun clear() {
    masks.clear()
    effects.clear()
  }

  companion object {
    /** Enough for a screenful of cells at 1080p and the same again on the way (a mask is the border's box in one byte a pixel). */
    const val MAX_BYTES = 16L * 1024 * 1024
  }
}

/** What a dash mask is allowed to be. Pure, so the limit is tested. */
internal object DashMask {
  /** A box above this many pixels (a cell is at most the lane, ~2 million) is not cached. */
  const val MAX_PIXELS = 4_000_000L

  fun fits(w: Int, h: Int): Boolean = w > 0 && h > 0 && w.toLong() * h <= MAX_PIXELS
}
