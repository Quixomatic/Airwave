package expo.modules.nativeguide

import android.graphics.BlendMode
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.os.Build
import kotlin.math.roundToInt

/**
 * How a two-ink theme's second ink is laid over what is already there ("multiply"), without making the GPU read the screen back.
 *
 * Skia draws PorterDuff MULTIPLY as an advanced blend, which needs the destination: a GPU with neither framebuffer fetch nor
 * advanced blend equations has Skia copy the render target for EVERY draw that uses it, and on a tile based GPU each copy ends the
 * render pass. A guide screen has ~180 inked words and strokes. (Measured on a 32-bit Android TV with a Mali-G52: the Risograph guide spent ~140 ms a
 * frame issuing its draw commands, against ~5 ms for a theme without ink. This blend was one of two things it did that the other
 * themes don't; the other was an offscreen layer, see `NowMarker`. What each cost on its own was not measured.)
 *
 * [BlendMode.MODULATE] (API 29) is `source * destination`, a fixed function blend with no read back, and over the opaque window the
 * rows are drawn on it is the same arithmetic as MULTIPLY (`Sc*Dc + Sc*(1-Da) + Dc*(1-Sa)` with `Da` = 1 is `Dc * (1 - Sa * (1 - c))`;
 * [ink] turns an ink and its alpha into the opaque color whose MODULATE gives exactly that). Android 8 to 9 have no `BlendMode`, and
 * keep the PorterDuff blend (their hardware canvas draws it).
 *
 * The rows must be drawn on an opaque destination for this: MODULATE over a transparent one draws nothing, where MULTIPLY draws the
 * source. The guide's rows are (its screen has a ground), and so they must stay: nothing above the rows may put them in an offscreen
 * layer (see `NowMarker`).
 */
internal class InkBlend {
  private val legacy by lazy(LazyThreadSafetyMode.NONE) { PorterDuffXfermode(PorterDuff.Mode.MULTIPLY) }

  /** Makes `paint` multiply with what is beneath it. */
  fun on(paint: Paint) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) paint.blendMode = BlendMode.MODULATE else paint.xfermode = legacy
  }

  /** Back to plain source-over. */
  fun off(paint: Paint) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) paint.blendMode = null else paint.xfermode = null
  }

  /** The color to set on a paint that [on] was applied to: `color` as the multiply it stands for. */
  fun color(color: Int): Int = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ink(color) else color

  companion object {
    /** `BlendMode` exists from Android 10 (API 29, `Build.VERSION_CODES.Q`, which [on], [off] and [color] test). */
    const val MODULATE_SINCE = 29

    fun modulates(sdk: Int): Boolean = sdk >= MODULATE_SINCE

    /**
     * The opaque color `m` such that MODULATE with it (`dst * m`) equals MULTIPLY with `color` over an opaque destination:
     * `m = 1 - a * (1 - c)` per channel, which is `color` laid over white. An opaque ink is its own `m`.
     */
    fun ink(color: Int): Int {
      val a = color ushr 24
      if (a == 255) return color
      fun channel(shift: Int): Int {
        val c = (color shr shift) and 0xff
        return (255 + (c - 255) * a / 255.0).roundToInt().coerceIn(0, 255)
      }
      return (0xff shl 24) or (channel(16) shl 16) or (channel(8) shl 8) or channel(0)
    }
  }
}
