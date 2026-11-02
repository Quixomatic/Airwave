package expo.modules.nativeguide

import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * Where React Native's layout engine (Yoga) puts boxes on the pixel grid, so a box the painter draws lands on the same
 * pixels as the view the React Native rows draw for it. Yoga lays boxes out in fractional density-independent pixels and
 * then rounds: a box's start is rounded relative to its parent, its size from the rounded absolute start and end.
 * No Android imports: unit-tested on the JVM.
 */
object PixelGrid {
  /** Yoga's rounding: halves go up, and values within 0.0001 of a pixel edge count as on it. */
  fun snap(v: Double): Int = floor(v + 0.5 + EPSILON).toInt()

  /**
   * Yoga's rounding of an edge of a text node, which has a measure function: "we never want to round down its size as this
   * could lead to unwanted text truncation" (yoga/algorithm/PixelGrid.cpp). Its start edge always goes down and its end edge
   * goes up when the width is not a whole number of pixels (`isFractional`), down otherwise.
   */
  fun floorEdge(v: Double): Int {
    val whole = floor(v)
    return (if (v - whole > 1 - EPSILON) whole + 1 else whole).toInt()
  }

  fun ceilEdge(v: Double): Int {
    val whole = floor(v)
    return (if (v - whole < EPSILON) whole else whole + 1).toInt()
  }

  /** Whether a width is not a whole number of pixels (within Yoga's epsilon). */
  fun isFractional(width: Double): Boolean = abs(floor(width + 0.5) - width) >= EPSILON

  /** The end edge of a text node that starts at `absStart` and is `width` px wide, all in absolute px. */
  fun textEnd(absStart: Double, width: Double): Int =
    if (isFractional(width)) ceilEdge(absStart + width) else floorEdge(absStart + width)

  private const val EPSILON = 0.0001
}

/**
 * One axis of a laid-out box, in px relative to the row's origin: `start` and `end` on the pixel grid, and `abs`, where
 * the box starts before any rounding.
 */
class Span(val start: Int, val end: Int, val abs: Double) {
  /** The box that starts `rel` px inside this one and is `size` px long, rounded like Yoga does. */
  fun child(rel: Double, size: Double): Span {
    val absStart = abs + rel
    val s = start + PixelGrid.snap(rel)
    return Span(s, s + PixelGrid.snap(absStart + size) - PixelGrid.snap(absStart), absStart)
  }

  /**
   * The same for a text node (a React Native <Text>): Yoga rounds its start down and its end up, so the box the text
   * truncates and wraps in is never narrower than the width layout gave it. That makes it up to two pixels wider than
   * `floor(size)`, which is what an ellipsis one glyph early looks like.
   */
  fun textChild(rel: Double, size: Double): Span {
    val absStart = abs + rel
    val s = start + PixelGrid.floorEdge(rel)
    return Span(s, s + PixelGrid.textEnd(absStart, size) - PixelGrid.floorEdge(absStart), absStart)
  }
}

/** One program cell's boxes, in px (see [AuroraLayout.placeCell]). Reused from cell to cell: it is filled in place. */
class CellRect {
  /** The cell's border box. */
  var left = 0
  var top = 0
  var right = 0
  var bottom = 0

  /** Inside the border: what the live fill covers and the children are clipped to. */
  var padLeft = 0f
  var padTop = 0f
  var padRight = 0f
  var padBottom = 0f

  /** The border's width (px, not rounded). */
  var border = 0f

  /** The on-now accent bar. */
  var barLeft = 0
  var barTop = 0
  var barRight = 0
  var barBottom = 0

  /** The title and sub-line: their left edge, the width they lay out in (the ellipsis point), and their tops. */
  var textLeft = 0
  var textWidth = 0
  var titleTop = 0
  var subTop = 0
}

/**
 * Aurora's row, in px, laid out the way the React Native rows lay it out (tv-native `features/guide/aurora-grid.tsx`
 * `Row`): a 1 dp top border; a rail that holds the circle and channel number on top and the channel name along the bottom;
 * and the lane, where each program is an absolutely placed cell. Every dimension comes from `geo` in dp (computed in JS
 * from the same `vw`, `cs` and `line` scalers the rows use) and is multiplied by `density` here; all coordinates are
 * relative to the row's top-left corner.
 *
 * `titleLineH` is the title's line height in px (the sub-line is stacked under it).
 */
class AuroraLayout(private val geo: GuideGeo, density: Double, val widthPx: Double, titleLineH: Int) {
  private val d = density
  private fun px(key: String) = geo.dp(key) * d

  val rowH = geo.rowH * d
  val railW = geo.railW * d
  private val borderTop = px("borderTop")
  val padV = px("padV")
  val padH = px("padH")

  private val titlePadTop = px("padTop")
  private val titlePadX = px("padX")
  private val subGap = px("subGap")
  private val titleH = titleLineH

  // The row: its rail and lane side by side under the top border.
  private val rowX = Span(0, PixelGrid.snap(widthPx), 0.0)
  private val rowY = Span(0, PixelGrid.snap(rowH), 0.0)

  /** The top border's height (px). */
  val borderTopPx = borderTop.toFloat()
  val rail = rowX.child(0.0, railW)
  val lane = rowX.child(railW, widthPx - railW)

  /** Rail and lane vertically: from under the border to the row's bottom. */
  val body = rowY.child(borderTop, rowH - borderTop)

  /** The accent bar's width on a focused rail. */
  val railBarEnd = rail.child(0.0, px("barW")).end

  // The rail's circle, the icon inside it and the favorite badge on its corner.
  val circleD = px("circle")
  val circleBorder = px("circleBorder")
  val circleRing = px("circleRing")
  val circleX = rail.child(padH, circleD)
  val circleY = body.child(padV, circleD)
  private val glyphD = px("glyph")
  val glyphX = circleX.child((circleD - glyphD) / 2, glyphD)
  val glyphY = circleY.child((circleD - glyphD) / 2, glyphD)
  private val badgeD = px("badge")

  /** The badge sits `badgeOff` outside the circle's inner (padding) edge at its bottom right, over the circle's border. */
  private val badgeRel = circleD - circleBorder + px("badgeOff") - badgeD
  val badgeX = circleX.child(badgeRel, badgeD)
  val badgeY = circleY.child(badgeRel, badgeD)

  // The channel number (right-aligned beside the circle) and the name (bottom-aligned, up to two lines).
  private val topRow = rail.child(padH, railW - 2 * padH)

  /** The name's text box: a text node straight in the rail, so Yoga rounds it outward (see [Span.textChild]). */
  private val nameBox = rail.textChild(padH, railW - 2 * padH)

  /** The width the name's text lays out and truncates in. */
  val nameWidth = max(0, nameBox.end - nameBox.start)
  val nameLeft = nameBox.start

  /** The number's left edge, given its text's width in px: against the rail's right padding, or packed after the circle
   *  when the two don't fit. */
  fun numberLeft(textW: Int): Int {
    val containerW = railW - 2 * padH
    val rel = if (circleD + textW > containerW) circleD else containerW - textW
    return topRow.start + PixelGrid.snap(rel)
  }

  /** The number's top, which is also the top of the circle. */
  val numberTop: Int get() = circleY.start

  /** The top of a name `heightPx` tall: it ends at the rail's bottom padding. */
  fun nameTop(heightPx: Int): Int = body.start + PixelGrid.snap(rowH - borderTop - padV - heightPx)

  // Cells.
  private val cellTop = px("cellTop")
  private val cellH = rowH - px("cellInset")
  val cellRadius = px("cellRadius")
  val cellBorder = px("cellBorder")
  val cellRing = px("cellRing")
  private val barX = px("liveBarX")
  private val barInset = px("liveBarInset")
  private val barW = px("liveBarW")
  val barRadius = px("liveBarR")

  /**
   * Places the cell `box` (dp, from the lane's left edge) into `out`. `selected` cells have the ring's width as their
   * border and so a different padding box and text origin than the others, exactly as in the React Native rows.
   */
  fun placeCell(box: GuideGeometry.CellBox, selected: Boolean, out: CellRect) {
    val bw = if (selected) cellRing else cellBorder
    val leftPx = box.left * d
    val cellW = box.width * d
    val absX = railW + leftPx
    val absY = borderTop + cellTop

    out.border = bw.toFloat()
    out.left = lane.start + PixelGrid.snap(leftPx)
    out.right = out.left + PixelGrid.snap(absX + cellW) - PixelGrid.snap(absX)
    out.top = body.start + PixelGrid.snap(cellTop)
    out.bottom = out.top + PixelGrid.snap(absY + cellH) - PixelGrid.snap(absY)

    // The padding box: the border box inside its border.
    val innerLeft = out.left + PixelGrid.snap(bw)
    val innerTop = out.top + PixelGrid.snap(bw)
    out.padLeft = innerLeft.toFloat()
    out.padTop = innerTop.toFloat()
    out.padRight = innerLeft + (PixelGrid.snap(absX + bw + cellW - 2 * bw) - PixelGrid.snap(absX + bw)).toFloat()
    out.padBottom = innerTop + (PixelGrid.snap(absY + bw + cellH - 2 * bw) - PixelGrid.snap(absY + bw)).toFloat()

    // The accent bar: absolutely placed from the padding edge.
    out.barLeft = out.left + PixelGrid.snap(bw + barX)
    out.barRight = out.barLeft + PixelGrid.snap(absX + bw + barX + barW) - PixelGrid.snap(absX + bw + barX)
    out.barTop = out.top + PixelGrid.snap(bw + barInset)
    out.barBottom = out.barTop + PixelGrid.snap(absY + bw + barInset + (cellH - 2 * bw - 2 * barInset)) - PixelGrid.snap(absY + bw + barInset)

    // The texts: a padded block inside the border, the title first and the sub-line under it.
    // Both are text nodes (see [Span.textChild]): the width the ellipsis is computed at is Yoga's rounded one, not the floor of the
    // exact width. It matters most with a thick border, whose width is taken off both sides.
    val textAbsLeft = absX + bw + titlePadX
    out.textLeft = innerLeft + PixelGrid.floorEdge(titlePadX)
    out.textWidth = max(0, PixelGrid.textEnd(textAbsLeft, cellW - 2 * bw - 2 * titlePadX) - PixelGrid.floorEdge(textAbsLeft))
    out.titleTop = innerTop + PixelGrid.snap(titlePadTop)
    out.subTop = innerTop + PixelGrid.snap(titlePadTop + titleH + subGap)
  }

  companion object {
    /** The `geo` fields this layout reads besides [GuideGeo]'s own (`rowH`, `railW`, ...): JS has to send every one. */
    val KEYS = listOf(
      "borderTop", "padV", "padH", "barW",
      "circle", "circleBorder", "circleRing", "glyph", "badge", "badgeOff",
      "numberSize", "nameSize", "nameLine",
      "cellTop", "cellInset", "cellRadius", "cellBorder", "cellRing",
      "liveBarX", "liveBarInset", "liveBarW", "liveBarR",
      "padTop", "padX", "titleSize", "subSize", "subGap",
    )

    /** The rounded-corner radius for a box `w` x `h` px: the radius asked for, but never more than half the short side. */
    fun radius(requested: Double, w: Float, h: Float): Float = min(requested.toFloat(), min(w, h) / 2f).coerceAtLeast(0f)

    /**
     * What a row draws from the clock: `nowMs` (whole ms) while one of its programs is on air at it and the row draws that program's cell
     * (the cell's tone and progress fill follow the clock), else 0. A row with no live cell is drawn the same whatever the time is, so a
     * tick of the clock leaves its recording alone ([GuidePainter.clock]).
     */
    fun clockOf(geo: GuideGeo, programs: Array<GuideProgram>, nowMs: Double): Long =
      if (programs.any { GuideGeometry.isLive(it.startMs, it.durationSeconds, nowMs) && geo.cellBox(it) != null }) nowMs.toLong() else 0L
  }
}
