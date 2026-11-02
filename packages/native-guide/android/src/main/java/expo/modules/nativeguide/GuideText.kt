package expo.modules.nativeguide

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import android.text.TextDirectionHeuristics
import android.text.TextPaint
import com.facebook.react.uimanager.PixelUtil
import com.facebook.react.views.text.ReactTypefaceUtils
import kotlin.math.ceil

/**
 * Text services for the painter, built so native text matches what a React Native <Text> draws: the same font sizes
 * (including the user's font scale), the same typeface lookup, and ellipsis computed once per string and width, where Android's own
 * layout cuts a React Native line (see [EllipsisRule]). Main thread only.
 */
class GuideText(private val context: Context) {
  private data class FaceKey(val family: String?, val weight: Int, val italic: Boolean)

  private data class EllipsisKey(val text: String, val avail: Int, val size: Float, val spacing: Float, val face: Int)

  private val faces = HashMap<FaceKey, Typeface>()
  private val ellipsized = HashMap<EllipsisKey, CharSequence>()

  // What the cut is worked out from: the characters' advances (a scratch array that only grows) and the paint the ellipsis is measured
  // with. A React Native <Text> is a TextView whose own paint has the text's size and letter spacing but not its typeface (the words'
  // typeface and weight are spans), so the ellipsis is the default typeface's.
  private var advances = FloatArray(64)
  private val viewPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Typeface.DEFAULT }
  private val ellipsisWidths = HashMap<Long, Float>()

  /** A font size in dp as pixels, exactly like a React Native <Text> (TextAttributes.getEffectiveFontSize): scaled by
   *  the system font scale and rounded UP to a whole pixel. */
  fun fontPx(dp: Double): Float = ceil(PixelUtil.toPixelFromSP(dp.toFloat()))

  /**
   * The typeface a React Native <Text> resolves for `family` (null = the system font) at a numeric `weight`, through
   * React Native's own font handling: API 28+ gets the exact weight, older versions the nearest regular or bold.
   * Cached, but painters should still resolve once per style change and keep the result.
   */
  fun typeface(family: String?, weight: Int = 400, italic: Boolean = false): Typeface =
    faces.getOrPut(FaceKey(family, weight, italic)) {
      try {
        ReactTypefaceUtils.applyStyles(null, if (italic) Typeface.ITALIC else Typeface.NORMAL, weight, family, context.assets)
      } catch (_: Throwable) {
        Typeface.DEFAULT
      }
    }

  /**
   * `text` cut to `availPx` with a trailing ellipsis, where a React Native `<Text numberOfLines={1}>` cuts it (see [EllipsisRule]).
   * `paint` is the paint the text is drawn with. Cached per string, width and font.
   */
  fun ellipsize(text: String, paint: TextPaint, availPx: Float): CharSequence {
    val key = EllipsisKey(text, availPx.toRawBits(), paint.textSize, paint.letterSpacing, paint.typeface.hashCode())
    ellipsized[key]?.let { return it }
    if (ellipsized.size > MAX_ELLIPSIS) ellipsized.clear()
    val len = text.length
    if (advances.size < len) advances = FloatArray(maxOf(len, advances.size * 2))
    paint.getTextWidths(text, 0, len, advances)
    val cut = EllipsisRule.cut(text, advances, len, ellipsisWidth(paint), maxOf(0f, availPx))
    val out: CharSequence = if (cut < 0) text else text.substring(0, cut) + EllipsisRule.ELLIPSIS
    ellipsized[key] = out
    return out
  }

  /** How wide the layout measures the ellipsis of a line drawn with `paint`: in the text view's own paint, which has the line's size and
   *  letter spacing and the default typeface. */
  private fun ellipsisWidth(paint: TextPaint): Float {
    val key = (paint.textSize.toRawBits().toLong() shl 32) or (paint.letterSpacing.toRawBits().toLong() and 0xFFFFFFFFL)
    return ellipsisWidths.getOrPut(key) {
      viewPaint.textSize = paint.textSize
      viewPaint.letterSpacing = paint.letterSpacing
      viewPaint.measureText(EllipsisRule.ELLIPSIS)
    }
  }

  /** One line in a box spanning [left, right], like a React Native <Text> stretched across its box with "auto"
   *  alignment: the paragraph direction is its first strong character's, so a right-to-left title sits against the
   *  box's right edge. */
  fun drawLineIn(canvas: Canvas, text: CharSequence, left: Float, right: Float, baseline: Float, paint: TextPaint) {
    val rtl = TextDirectionHeuristics.FIRSTSTRONG_LTR.isRtl(text, 0, text.length)
    val x = if (rtl) right - paint.measureText(text, 0, text.length) else left
    canvas.drawText(text, 0, text.length, x, baseline, paint)
  }

  /** Drops what was computed for text (memory pressure, or the view detached). */
  fun trim() {
    ellipsized.clear()
    ellipsisWidths.clear()
  }

  private companion object {
    const val MAX_ELLIPSIS = 4000
  }
}
