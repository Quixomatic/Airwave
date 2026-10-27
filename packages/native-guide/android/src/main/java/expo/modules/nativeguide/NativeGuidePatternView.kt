package expo.modules.nativeguide

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.view.View
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import org.json.JSONObject
import kotlin.math.ceil

/**
 * Where the lines of graph paper start: one every `step` px from the edge, each at its whole multiple of `step` (not the sum of the steps before
 * it, which drifts) and none from `extent` on. Pure, so the layout is unit-tested.
 */
internal object GridLines {
  fun starts(step: Double, extent: Double): FloatArray {
    if (!(step > 0.0) || !(extent > 0.0)) return FloatArray(0)
    return FloatArray(ceil(extent / step).toInt()) { (it * step).toFloat() }
  }
}

/**
 * A theme's graph paper behind the guide, drawn as the lines it is: a hundred or so thin rectangles, a screenful, in the display list the view
 * is recorded as once. The React Native version is a full-screen SVG pattern, which Android draws as one 8 MB bitmap over the whole screen on every frame
 * (a screenful of mostly transparent pixels blended onto the ground), where this is a few percent of those pixels. The lines are the pattern's own: a
 * minor line every `minor` and a major one every `major` design px (`unit` px each), `w` thick, the major ones over the minor ones.
 *
 * Display only, no focus, no input.
 */
class NativeGuidePatternView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private var grid: GuideLook.Grid? = null

  /** Pixels per design px. */
  private var unitPx = 0.0
  private val density = resources.displayMetrics.density.toDouble()
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }

  init {
    setWillNotDraw(false)
    isFocusable = false
    isFocusableInTouchMode = false
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
  }

  /** The `pattern` prop: the guide's textures as the tokens carry them (`{ "bg": { "kind": "grid", ... }, "overlay": ... }`). Only graph paper is drawn. */
  fun setPattern(json: String) {
    grid = try {
      GuideLook.parsePatterns(JSONObject(json)).grid
    } catch (_: Exception) {
      null
    }
    invalidate()
  }

  /** The `unit` prop: dp per design px (what `vw(1)` is in JS). */
  fun setUnit(dp: Double) {
    unitPx = dp * density
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val g = grid ?: return
    if (unitPx <= 0.0) return
    val w = (g.w * unitPx).toFloat()
    if (w <= 0f) return
    val width = this.width.toFloat()
    val height = this.height.toFloat()
    // Minor lines, then the major ones over them, as the pattern's two layers were painted.
    lines(canvas, g.minor * unitPx, g.minorColor, w, width, height)
    lines(canvas, g.major * unitPx, g.majorColor, w, width, height)
  }

  private fun lines(canvas: Canvas, step: Double, color: Int, w: Float, width: Float, height: Float) {
    if (color ushr 24 == 0) return
    paint.color = color
    for (x in GridLines.starts(step, width.toDouble())) canvas.drawRect(x, 0f, x + w, height, paint)
    for (y in GridLines.starts(step, height.toDouble())) canvas.drawRect(0f, y, width, y + w, paint)
  }
}
