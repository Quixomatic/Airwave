package expo.modules.nativeguide

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RenderNode
import android.os.Build
import android.os.Trace
import androidx.annotation.RequiresApi

/**
 * The rows' recordings as Android display lists: a `RenderNode` for each visible row (and a couple just past the edge), recorded when the row's
 * drawing changed ([RowRecordings] decides) and drawn from the list otherwise, at the row's place. A node has no clip, so what it draws reaches the
 * window exactly as the same calls would have on the view's own canvas (the ink blend, which multiplies with the window beneath, depends on that),
 * and a row sits on a whole pixel because the node's position is an Int.
 *
 * A row is also kept in a texture (a compositing layer) where it can be: the GPU then draws a screenful of rows as a few textured rectangles, not
 * the hundred shapes and text runs they are made of, and only a row that changed is drawn into its texture again. Source-over drawing into a
 * transparent layer and the layer over the window land on the same pixels as the shapes drawn over the window directly. A layer holds only what
 * is inside its bounds, and a row's drawing reaches a little past its box (a border of an odd width straddles the edge it is measured from), so
 * the node is [EDGE] px larger on every side.
 *
 * A row that reads what is beneath it ([GuidePainter.readsBackdrop]: the second ink of a two-ink theme is multiplied with it) has nothing beneath
 * it in a layer of its own. Where the guide says what the rows sit on (`backdrop`, one opaque color), the row's box is first filled with that color
 * in the layer, so the multiply meets what it would have met on the window, and the layer, now opaque, lands on the same color. Where it does not,
 * the row stays a plain display list drawn straight onto the window.
 *
 * A row can also be recorded ahead ([recordAhead]): the view does it in idle time for the row the focus is expected to reach next, so the frame the
 * key press makes has nothing to record.
 *
 * Needs API 29 (`RenderNode` is public from there) and a hardware canvas, which a view in a normal window always draws on: [NativeGuideView]
 * draws the rows straight onto the canvas below API 29 and on any software canvas (a view drawn into a bitmap).
 */
@RequiresApi(Build.VERSION_CODES.Q)
internal class RowNodes {
  /**
   * Nodes the recordings let go of, whose lists are thrown away when the next frame starts, not at once: the frame on screen is still the
   * view's last display list, which names them, and a node emptied under it (as one is when a row recorded ahead in idle time takes the place of the
   * least recently used recording) draws as a gap in the rows until a frame replaces that list.
   */
  private val graveyard = ArrayList<RenderNode>()

  private val recordings = RowRecordings<RenderNode, GuideImages.Entry>(
    create = { RenderNode("AirwaveGuideRow").also { it.setClipToBounds(false) } },
    discard = { graveyard.add(it) },
  )

  private val fill = Paint()

  /** Each row's clock (see [GuidePainter.clock]), worked out once per row until the time or the geometry changes, for the rows drawn lately. */
  private val clocks = ClockCache()

  /** Whether any row recorded this frame is still changing with the clock (an image fading in), so the view must draw again. */
  var animating = false
    private set

  /** How many rows the frame recorded afresh (the others were drawn from their lists). */
  var recorded = 0
    private set

  fun beginFrame() {
    animating = false
    recorded = 0
    clocks.nextFrame()
    flush()
  }

  /** Throws away the lists of the nodes let go of. */
  private fun flush() {
    for (n in graveyard) n.discardDisplayList()
    graveyard.clear()
  }

  /**
   * Draws row `index` (`row`, in `state`) with its top edge `top` px below the view's, `width` x `height` px, onto `canvas` (a hardware canvas).
   * Records it first unless its list still is what drawing it now would make; `epoch` is everything the painter draws every row from.
   */
  fun draw(canvas: Canvas, index: Int, row: GuideRow, state: RowState, top: Int, width: Int, height: Int, epoch: Long, backdrop: Int, painter: GuidePainter, frame: GuideFrame, images: GuideImages) {
    val slot = recordings.slot(index, state)
    if (ensureRecorded(slot, row, state, width, height, epoch, backdrop, painter, frame, images)) recorded += 1
    val edge = RowLayering.of(painter.readsBackdrop, backdrop).edge
    val node = slot.node
    node.setPosition(-edge, top - edge, width + edge, top + height + edge)
    canvas.drawRenderNode(node)
  }

  /**
   * Records row `index` in `state` without drawing it, unless its list already is what drawing it would make. For idle time: the row the focus is
   * about to reach is ready when the frame that focuses it comes. Returns whether it recorded.
   */
  fun recordAhead(index: Int, row: GuideRow, state: RowState, width: Int, height: Int, epoch: Long, backdrop: Int, painter: GuidePainter, frame: GuideFrame, images: GuideImages): Boolean {
    animating = false
    return ensureRecorded(recordings.slot(index, state), row, state, width, height, epoch, backdrop, painter, frame, images)
  }

  /** Records `slot`'s node from `row` in `state` if it is not what drawing the row now would record (or keeps its images in use if it is). */
  private fun ensureRecorded(slot: RowRecordings.Slot<RenderNode, GuideImages.Entry>, row: GuideRow, state: RowState, width: Int, height: Int, epoch: Long, backdrop: Int, painter: GuidePainter, frame: GuideFrame, images: GuideImages): Boolean {
    val layering = RowLayering.of(painter.readsBackdrop, backdrop)
    val layered = layering.layered
    val under = layering.under
    val edge = layering.edge
    // How the list is made: in a layer or not (the row is drawn `edge` in from the node's corner), and over which color.
    val variant = layering.variant
    // The GPU side lets go of the list of a node the display list on screen no longer names (it is not drawn for a frame: a row the focus left, a row
    // scrolled out and back), and an empty node draws nothing: such a row is recorded again.
    if (slot.recorded && !slot.node.hasDisplayList()) slot.forget()
    val clock = clocks.of(row, frame.geo, frame.nowMs) { painter.clock(row, frame) }
    if (slot.isCurrent(row, epoch, variant, images.version, clock)) {
      images.touch(slot.images)
      return false
    }
    val node = slot.node
    Trace.beginSection("NativeGuide.recordRow")
    val drawn = ArrayList<GuideImages.Entry>(0)
    images.collector = drawn
    frame.animating = false
    node.setUseCompositingLayer(layered, null)
    val rec = node.beginRecording(width + 2 * edge, height + 2 * edge)
    try {
      rec.translate(edge.toFloat(), edge.toFloat())
      if (under != 0) {
        fill.color = under
        rec.drawRect(0f, 0f, width.toFloat(), height.toFloat(), fill)
      }
      painter.drawRow(rec, row, state, frame)
    } finally {
      node.endRecording()
      images.collector = null
      Trace.endSection()
    }
    // A row that drew an image still loading, or one that is fading in, is drawn again next frame (the fade also asks for that frame).
    val fading = frame.animating
    slot.record(row, epoch, variant, images.version, drawn, fading || drawn.any { it.loading }, clock)
    if (fading) animating = true
    frame.animating = false
    return true
  }

  /** Lets go of the rows well off screen. */
  fun retain(first: Int, last: Int) = recordings.retain(first, last, KEEP_ROWS)

  /** Lets go of every row's list now (the view detached, or memory is short: the view then draws again, and every row is recorded afresh). */
  fun clear() {
    recordings.clear()
    clocks.clear()
    flush()
  }

  private companion object {
    /** Rows kept beyond the visible ones: the next one in either direction is what a scroll brings in. */
    const val KEEP_ROWS = 2

  }
}
