package expo.modules.nativeguide

import android.content.Context
import android.graphics.Canvas
import android.view.View
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import kotlin.math.min

/**
 * One lucide icon, drawn natively: the featured panel's channel tile and its rating star. The React Native icon is a `react-native-svg` view with a
 * group and a path or two inside it for every shape of the icon, built again whenever the focus moves to a channel with another icon (a handful of
 * views, in a frame that is already the busiest of the key press); this is one view whose `icon` prop changes. It draws the icon the way the native rows' rail
 * does ([GlyphDrawer]: lucide's 24 unit box scaled to the view, round caps and joins), from the same icon data (`setGlyphs`), which the rows
 * need anyway. Display only, no focus, no input.
 */
class NativeGuideGlyphView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private var icon = ""
  private var color = 0
  private var fill = 0
  private var strokeWidth = STROKE_WIDTH
  private val glyphs = GlyphDrawer()

  init {
    setWillNotDraw(false)
    isFocusable = false
    isFocusableInTouchMode = false
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
  }

  /** The icon-set id (`lucide:Radio`); one that was never registered draws the fallback icon, as the rows do. */
  fun setIcon(id: String) {
    if (id != icon) {
      icon = id
      invalidate()
    }
  }

  fun setColor(css: String) {
    color = GuideColor.parse(css)
    invalidate()
  }

  /** A CSS color to fill each shape with before it is stroked (a filled star), or "" for none. */
  fun setFill(css: String) {
    fill = if (css.isEmpty() || css == "none") 0 else GuideColor.parse(css)
    invalidate()
  }

  /** The stroke width in lucide's 24 unit box (2 is lucide's own). */
  fun setStrokeWidth(w: Double) {
    strokeWidth = if (w.isFinite() && w > 0.0) w.toFloat() else STROKE_WIDTH
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val size = min(width, height).toFloat()
    if (size <= 0f || color ushr 24 == 0) return
    val glyph = LucideGlyphs.get(icon) ?: return
    glyphs.draw(canvas, glyph, 0f, 0f, size, color, fill, strokeWidth)
  }

  private companion object {
    const val STROKE_WIDTH = 2f
  }
}
