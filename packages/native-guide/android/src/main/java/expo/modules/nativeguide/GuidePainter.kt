package expo.modules.nativeguide

import android.graphics.Canvas

/** What the view lends its painter: the unit conversion, text services and the image loader. */
class PainterKit(
  /** Physical pixels per dp. */
  val density: Double,
  val text: GuideText,
  val images: GuideImages,
) {
  /** dp -> px. */
  fun px(dp: Double): Float = (dp * density).toFloat()
}

/** One frame's inputs, handed to the painter by [NativeGuideView]. */
class GuideFrame(
  val geo: GuideGeo,
  val widthPx: Float,
  /** The view's height. */
  val heightPx: Float,
  val rowHeightPx: Float,
  /** `SystemClock.uptimeMillis()` at the start of the frame: the clock fades and animations run on. */
  val uptimeMs: Long,
  /** The current time (epoch ms), which a live cell's progress is drawn from. It is not part of [geo]: it moves every minute, the geometry does not. */
  val nowMs: Double,
) {
  /** A painter sets this when something it drew keeps changing (an image fading in): the view redraws on the next
   *  vsync. It stays false for a still frame, so the view stops redrawing. */
  var animating = false
}

/**
 * One row's focus, derived from the view's props with the same rules as the React Native rows (AuroraGrid): no row
 * is focused while the sidebar has focus or the mini player has it, the rail focus applies to the focused row only,
 * and only the focused row in the grid zone has a focused program.
 */
class RowState(
  val index: Int,
  /** The row is focused: its rail is tinted and carries the accent bar. */
  val focused: Boolean,
  /** The rail itself has focus (its circle becomes the favorite heart). */
  val railFocused: Boolean,
  /** The program whose cell is selected in this row, or null. */
  val focusedProgramId: String?,
) {
  /**
   * What TalkBack reads for the rows, which are one opaque view to it: the focused row's channel number and name, and the
   * selected program's title while one is selected. Null when no row has focus (the sidebar or the mini player does).
   */
  fun description(row: GuideRow): String? {
    if (!focused) return null
    val program = focusedProgramId?.let { id -> row.channel.programs.firstOrNull { it.id == id } }
    return listOfNotNull(row.channel.number, row.channel.name.ifEmpty { null }, program?.title).joinToString(", ")
  }

  companion object {
    const val ZONE_GRID = "grid"
    const val ZONE_RAIL = "rail"
    const val ZONE_SIDEBAR = "sidebar"

    fun of(index: Int, focusRow: Int, focusProgramId: String?, zone: String, miniFocused: Boolean): RowState {
      val here = index == focusRow && !miniFocused
      return RowState(
        index,
        focused = here && zone != ZONE_SIDEBAR,
        railFocused = here && zone == ZONE_RAIL,
        focusedProgramId = if (here && zone == ZONE_GRID) focusProgramId else null,
      )
    }
  }
}

/**
 * Draws the lineup's rows. The view ([NativeGuideView]) owns everything around the drawing: props, scrolling, which
 * rows are visible, the lineup, error handling, memory callbacks and accessibility. A painter owns how one row
 * looks: the look is described by its tokens (JSON the view passes through untouched), the geometry by [GuideFrame.geo].
 *
 * Main thread only. A painter that throws stops the view's drawing and reports `onRenderError` to JS, which switches
 * back to the React Native rows.
 */
interface GuidePainter {
  /**
   * Moves whenever what the painter draws every row from changes (the tokens, the geometry or the width the layout was made for), so a row
   * drawn before it is drawn again. It never moves for anything that only drops a cache that can be rebuilt. A painter with nothing of the
   * kind can leave it at 0.
   */
  val epoch: Long get() = 0L

  /**
   * Whether what a row draws depends on what is already on the canvas beneath it (a blend such as multiply): such a row cannot be drawn into
   * a layer of its own, where nothing is beneath it, and has to be drawn straight onto the window. False for a painter whose rows only paint
   * over what is there (source-over), which is what lets the view keep each row in a texture.
   */
  val readsBackdrop: Boolean get() = false

  /** The `tokens` prop changed. Parse it and drop whatever was derived from the old one. */
  fun setTokens(json: String)

  /**
   * What `row` draws from the clock ([GuideFrame.nowMs]): a number that differs whenever the clock would make the row draw differently (the
   * time a live cell's progress fill is drawn at), and is 0 for a row that draws nothing from it, which then keeps its recording as the clock
   * moves. (An image's fade runs on the frame's uptime and is the recordings' own business.)
   *
   * It must be a function of `row`, `frame.geo` and `frame.nowMs` alone: [RowNodes] remembers it for a row until the geometry or the clock changes,
   * and does not ask again when the painter's tokens do.
   */
  fun clock(row: GuideRow, frame: GuideFrame): Long = 0L

  /** A frame is about to draw. */
  fun beginFrame(frame: GuideFrame) = Unit

  /** Draws one row. The canvas is translated so the row's top-left corner is (0, 0); the row is [GuideFrame.widthPx]
   *  wide and [GuideFrame.rowHeightPx] tall. */
  fun drawRow(canvas: Canvas, row: GuideRow, state: RowState, frame: GuideFrame)

  /** The frame finished drawing. */
  fun endFrame() = Unit

  /** Memory pressure: drop what can be recomputed. */
  fun trim() = Unit

  /** The view detached: drop everything held. The painter stays usable if the view attaches again. */
  fun release() = Unit
}

/** The painter the view uses: the Aurora rows. */
object GuidePainters {
  fun create(kit: PainterKit): GuidePainter = AuroraPainter(kit)
}
