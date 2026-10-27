package expo.modules.nativeguide

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.view.View
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import org.json.JSONObject
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * What a dimension line is made of, laid out in the view's own pixels (so it is unit-tested without Android): the featured panel's progress bar
 * when a theme draws it as a ruler (Blueprint). It is the line the React Native `DimensionLine` draws (tv-native `guide-parts.tsx`), stroke for
 * stroke: a heavier rule up to "now" and a lighter one after it, a tick every `every` minutes of the programme (taller every `majorEvery`
 * ticks), a cap at each end, and a mark in the "now" color where now falls. Every stroke is straight and butt-capped, so each is the rectangle it covers
 * ([StrokeRect]) and is drawn as one (see [NativeGuideDimensionView]).
 */
internal class DimensionLayout(
  /** The view's width in px, and the height the line is laid out in (px): the exact height JS gave the line, which the view's own is the pixel-rounded
   *  value of (the rule's place is measured from this one, as `DimensionLine` measures it from the `height` it is given). */
  val width: Float,
  val height: Float,
  /** Pixels per design px. */
  val unit: Float,
  /** How far along the programme "now" is, 0..1. */
  val pct: Double,
  /** The programme's length in `every`-minute steps (the ticks span the line's width over it, and one step is never shorter than the whole line). */
  val stepsAcross: Double,
  val majorEvery: Int,
  val minorH: Float,
  val majorH: Float,
  val w: Float,
  val capH: Float,
) {
  /** The rule's baseline: this far above the line's bottom edge. */
  val y: Float = height - BASE * unit

  /** Where "now" falls along the line. */
  val nowX: Float = (width * pct.coerceIn(0.0, 1.0)).toFloat()

  /** Pixels between ticks. */
  val stepPx: Double = width / max(1.0, stepsAcross)

  /** The rule: [left, top, right, bottom] of the heavier part (to now) and the lighter one (after it). */
  fun rule(heavy: Boolean, out: FloatArray) {
    if (heavy) StrokeRect.horizontal(0f, nowX, y, w * 2 * unit, out) else StrokeRect.horizontal(nowX, width, y, w * unit, out)
  }

  /** Ticks from the line's start along it, in order: their x and whether each is a taller one. Calls `emit(x, major)`. */
  inline fun ticks(emit: (x: Float, major: Boolean) -> Unit) {
    if (!(stepPx > 0.0)) return
    var k = 0
    while (true) {
      val x = k * stepPx
      if (x > width + 0.5) break
      emit(x.toFloat(), k % majorEvery == 0)
      k += 1
    }
  }

  /** A tick's stroke: [left, top, right, bottom]. */
  fun tick(x: Float, major: Boolean, out: FloatArray) {
    val rise = (if (major) majorH else minorH) * unit
    StrokeRect.vertical(x, y, y - rise, w * unit, out)
  }

  /** The end caps' x (left, then right) and their top and bottom. */
  fun capX(right: Boolean): Float = if (right) width - CAP_INSET * unit else CAP_INSET * unit

  fun cap(x: Float, out: FloatArray) {
    val half = (capH / 2 - CAP_TRIM) * unit
    StrokeRect.vertical(x, y - half, y + half, w * 1.5f * unit, out)
  }

  /** The mark at "now": taller than the caps, standing a little below the rule. */
  fun nowMark(out: FloatArray) {
    StrokeRect.vertical(nowX, y - (capH - NOW_TOP) * unit, y + NOW_BOTTOM * unit, w * 2 * unit, out)
  }

  companion object {
    /** Design px, as `DimensionLine` has them: the rule sits this far above the bottom, a cap's ends are trimmed this much and the "now" mark begins and
     *  ends this far from the rule. The caps stand a little in from the line's ends. */
    const val BASE = 8f
    const val CAP_TRIM = 4f
    const val NOW_TOP = 6f
    const val NOW_BOTTOM = 5f
    const val CAP_INSET = 0.8f

    /** The ticks that fit across the programme: one per `every` minutes, at least one for the whole line (`DimensionLine`'s `step`). */
    fun stepsAcross(durationMin: Double, every: Double): Double = max(1.0, durationMin / every)

    /** `majorEvery` minutes as a number of ticks. */
    fun majorTicks(every: Double, majorEvery: Double): Int = max(1, (majorEvery / every).roundToInt())
  }
}

/**
 * Where a rectangle's edge falls when react-native-svg draws it: react-native-svg rasterizes into a bitmap on the CPU, and Skia's CPU anti-aliasing
 * samples four times across a pixel each way, so an edge is on a quarter of a pixel (a 2.4 px rule covers 2.5 of them, a 1.2 px rule one pixel). The GPU
 * draws the exact coverage instead, so the strokes are put on the quarters the SVG's are, and the pixels are the same ones.
 */
internal fun quarterPixel(v: Float): Float = Math.round(v * 4f) / 4f

/**
 * The featured panel's dimension line, drawn natively: the same strokes as the React Native `DimensionLine` (a `react-native-svg` view the
 * panel builds again on every move of the focus: a dozen views and a bitmap each time, and a layout pass to learn how wide it is), here one
 * view whose props change. It measures itself, so there is no layout round trip either. Display only, no focus, no input.
 *
 * The `spec` prop is JSON: `{ pct, durationMin, every, majorEvery, height, minorH, majorH, w, capH, color, nowColor, unit }` where `height` is dp, the other heights and `w` are
 * design px, `unit` is dp per design px, `every` and `majorEvery` are minutes and `pct` is 0..1.
 */
class NativeGuideDimensionView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private class Spec(
    val pct: Double,
    val durationMin: Double,
    val every: Double,
    val majorEvery: Double,
    val heightDp: Double,
    val minorH: Float,
    val majorH: Float,
    val w: Float,
    val capH: Float,
    val color: Int,
    val nowColor: Int,
    val unitDp: Double,
  )

  private var spec: Spec? = null
  private val density = resources.displayMetrics.density
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private val box = FloatArray(4)

  init {
    setWillNotDraw(false)
    isFocusable = false
    isFocusableInTouchMode = false
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
  }

  fun setSpec(json: String) {
    spec = try {
      val o = JSONObject(json)
      Spec(
        pct = o.optDouble("pct", 0.0),
        durationMin = o.optDouble("durationMin", 0.0),
        every = o.optDouble("every", 5.0).takeIf { it > 0 } ?: 5.0,
        majorEvery = o.optDouble("majorEvery", 30.0),
        heightDp = o.optDouble("height", 0.0),
        minorH = o.optDouble("minorH", 0.0).toFloat(),
        majorH = o.optDouble("majorH", 0.0).toFloat(),
        w = o.optDouble("w", 1.0).toFloat(),
        capH = o.optDouble("capH", 0.0).toFloat(),
        color = GuideColor.parse(o.optString("color")),
        nowColor = GuideColor.parse(o.optString("nowColor")),
        unitDp = o.optDouble("unit", 0.0),
      )
    } catch (_: Exception) {
      null
    }
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val s = spec ?: return
    if (width <= 0 || height <= 0 || s.unitDp <= 0.0) return
    val layout = DimensionLayout(
      width.toFloat(), (if (s.heightDp > 0.0) s.heightDp * density else height.toDouble()).toFloat(), (s.unitDp * density).toFloat(), s.pct, DimensionLayout.stepsAcross(s.durationMin, s.every),
      DimensionLayout.majorTicks(s.every, s.majorEvery), s.minorH, s.majorH, s.w, s.capH,
    )
    paint.color = s.color
    layout.rule(true, box)
    fill(canvas)
    // The part after "now" is drawn at 85% of the line's opacity.
    paint.color = GuideColor.alpha(s.color, (s.color ushr 24) / 255.0 * AFTER_NOW_ALPHA)
    layout.rule(false, box)
    fill(canvas)
    paint.color = s.color
    layout.ticks { x, major ->
      layout.tick(x, major, box)
      fill(canvas)
    }
    for (right in booleanArrayOf(false, true)) {
      layout.cap(layout.capX(right), box)
      fill(canvas)
    }
    paint.color = s.nowColor
    layout.nowMark(box)
    fill(canvas)
  }

  /** The stroke in `box` as a rectangle on the quarter pixels react-native-svg's edges fall on. */
  private fun fill(canvas: Canvas) {
    canvas.drawRect(quarterPixel(box[0]), quarterPixel(box[1]), quarterPixel(box[2]), quarterPixel(box[3]), paint)
  }

  private companion object {
    const val AFTER_NOW_ALPHA = 0.85
  }
}
