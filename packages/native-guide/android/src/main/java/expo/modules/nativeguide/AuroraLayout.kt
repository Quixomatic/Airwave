package expo.modules.nativeguide

import kotlin.math.abs
import kotlin.math.ceil
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

  /** Where the border box starts before it is rounded to the pixel grid, and how big it is then (px): what a box placed inside it is rounded from. */
  var absLeft = 0.0
  var absTop = 0.0
  var exactW = 0.0
  var exactH = 0.0
  var exactBorder = 0.0

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

  /** The top of the status line above the title (only a cell laid out with one has it; see [AuroraLayout.placeCell]). */
  var kickerTop = 0
}

/** One channel logo's boxes, in px (see [AuroraLayout.placeLogo]). Reused from row to row: it is filled in place. */
class LogoRect {
  /** The logo's box (the plate, when a theme has one). */
  var left = 0
  var top = 0
  var right = 0
  var bottom = 0

  /** The area the logo itself is fitted into: the box less the plate's padding. */
  var imgLeft = 0f
  var imgTop = 0f
  var imgRight = 0f
  var imgBottom = 0f

  /** A favorite's badge, hung off the box's bottom right corner. */
  var badgeLeft = 0
  var badgeTop = 0
  var badgeRight = 0
  var badgeBottom = 0
}

/** One on-now cell's progress bar's boxes, in px (see [AuroraLayout.placeBar]). Reused from cell to cell: it is filled in place. */
class BarRect {
  /** The track's border box. */
  var left = 0
  var top = 0
  var right = 0
  var bottom = 0

  /** The widths of the track's border (px). They are not whole pixels: the inside of the track starts that far in, and the edge is drawn partly covering a pixel. */
  var borderLeft = 0f
  var borderTop = 0f
  var borderRight = 0f
  var borderBottom = 0f

  /** What the fill covers: the track's padding box, as far as "now". */
  var fillLeft = 0
  var fillTop = 0
  var fillRight = 0
  var fillBottom = 0

  /** What the part still to come covers: the rest of the padding box. */
  var remainLeft = 0
  var remainTop = 0
  var remainRight = 0
  var remainBottom = 0
}

/**
 * Aurora's row, in px, laid out the way the React Native rows lay it out (tv-native `features/guide/aurora-grid.tsx`
 * `Row`): a 1 dp top border; a rail that holds the circle and channel number on top and the channel name along the bottom;
 * and the lane, where each program is an absolutely placed cell. Every dimension comes from `geo` in dp (computed in JS
 * from the same `vw`, `cs` and `line` scalers the rows use) and is multiplied by `density` here; all coordinates are
 * relative to the row's top-left corner.
 *
 * The selected cell may carry rings just outside its own ([placeOuterRing], [placeRing]).
 *
 * `titleLineH` is the title's line height in px (the sub-line is stacked under it). `look` is what a theme changes about where
 * things go inside the row, never where the row, rail and lane are: the row rule's thickness, the circle's scale and its place
 * (the `numeral` rail layout puts it at the rail's top right), and the rearranging of the rail's number around it.
 */
class AuroraLayout(private val geo: GuideGeo, density: Double, val widthPx: Double, titleLineH: Int, private val look: GuideLook = GuideLook.AURORA) {
  private val d = density
  private fun px(key: String) = geo.dp(key) * d

  private val unitPx = px("unit")

  /** `designPx` (a size on the 2560-wide reference screen, what the TypeScript calls `vw()`) in pixels: how the sizes a theme added
   *  to the tokens, which are kept in design px, are laid out ([GuideLook]). */
  fun vw(designPx: Double): Double = designPx * unitPx

  /** A stroke of `designPx` in whole screen pixels (at least one, none for zero): how the widths a theme added are drawn. */
  fun stroke(designPx: Double): Float = TileMath.strokePx(designPx, unitPx)

  val rowH = geo.rowH * d
  val railW = geo.railW * d
  private val borderTop = look.rowBorderW?.let { stroke(it).toDouble() } ?: px("borderTop")
  val padV = px("padV")
  val padH = px("padH")

  /**
   * The rail's right border, a theme's divider. Yoga takes its width (exact, not the whole pixels it is drawn in) off the rail's content
   * box, so what the rail lays out against its right side (the number, the circle in the `numeral` layout, a logo) and the width the
   * channel name wraps in are that much narrower.
   */
  private val dividerPx = look.railDivider?.let { max(0.0, vw(it.w)) } ?: 0.0

  /** The width the rail's content lays out in: the rail less its padding on both sides and its divider. */
  private val innerW = railW - 2 * padH - dividerPx

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

  // The rail's circle, the icon inside it and the favorite badge on its corner. A theme scales the circle without moving the rail's
  // box; the `numeral` layout puts it at the rail's top right, beside an oversized number at the top left.
  /** The rail's number sits at the top left and the circle at the top right, instead of the circle first. */
  val numeral = look.railLayout == GuideLook.RailLayout.NUMERAL

  /** The circle's diameter, scale applied. */
  val circleD = px("circle") * look.circle.scale

  /** The circle's border: the theme's own width, else the stock hairline. */
  val circleBorder = look.circle.borderW?.let { stroke(it).toDouble() } ?: px("circleBorder")
  val circleRing = px("circleRing")
  val circleX = if (numeral) rail.child(padH + innerW - circleD, circleD) else rail.child(padH, circleD)
  val circleY = body.child(padV, circleD)
  private val glyphD = px("glyph") * look.circle.scale
  val glyphX = circleX.child((circleD - glyphD) / 2, glyphD)
  val glyphY = circleY.child((circleD - glyphD) / 2, glyphD)
  private val badgeD = px("badge")

  // A channel's logo, in place of the circle: a box as tall as the circle is before a theme scales it (the React Native rows' logo box
  // is the rail's `box`, whatever the circle's `scale`) and as wide as the rail leaves beside the number.
  private val logoGap = px("logoGap")
  private val logoPad = px("logoPad")

  /** The logo box's height: the circle's diameter before the theme's scale. */
  private val logoH = px("circle")
  private val logoY = body.child(padV, logoH)

  /**
   * What the logo leaves between itself and the number: its own gap (the React Native logo's margin), and in the `numeral` layout the rail row's
   * gap as well, which the number and the logo share there (`gap: vw(8)` and `marginLeft: vw(8)`: 16 design px, not 8).
   */
  private val logoNumberGap = if (numeral) logoGap + vw(NUMERAL_GAP) else logoGap

  /** The corner radius of a logo's plate. */
  val logoRadius = px("logoRadius")

  /** A logo is decoded down to a box this many px (rounded up to 32, so one decode serves every channel number width): the
   *  logo's largest possible area, the rail's inner width by the logo box's height. */
  val logoDecodeW = step32(max(1.0, railW - 2 * padH - 2 * logoPad))
  val logoDecodeH = step32(max(1.0, logoH - 2 * logoPad))

  /** The badge sits `badgeOff` outside the circle's inner (padding) edge at its bottom right, over the circle's border. */
  private val badgeRel = circleD - circleBorder + px("badgeOff") - badgeD
  val badgeX = circleX.child(badgeRel, badgeD)
  val badgeY = circleY.child(badgeRel, badgeD)

  // The channel number (right-aligned beside the circle) and the name (bottom-aligned, up to two lines).
  private val topRow = rail.child(padH, innerW)

  /** The name's text box: a text node straight in the rail, so Yoga rounds it outward (see [Span.textChild]). */
  private val nameBox = rail.textChild(padH, innerW)

  /** The width the name's text lays out and truncates in. */
  val nameWidth = max(0, nameBox.end - nameBox.start)
  val nameLeft = nameBox.start

  /** The number's left edge, given its text's width in px: against the rail's right padding, or packed after the circle
   *  when the two don't fit. In the `numeral` layout it is the rail's left padding, whatever the width. */
  fun numberLeft(textW: Int): Int {
    if (numeral) return topRow.start
    val rel = if (circleD + textW > innerW) circleD else innerW - textW
    return topRow.start + PixelGrid.floorEdge(rel) // a text node's start rounds down (see [Span.textChild])
  }

  /** The number's left edge when a logo sits beside it: against the rail's right padding (the left padding in the `numeral` layout). */
  fun numberLeftBesideLogo(textW: Int): Int = if (numeral) topRow.start else topRow.start + PixelGrid.floorEdge(innerW - textW)

  /**
   * The most width a `numeral` number has before it is cut with an ellipsis: what the rail's padding leaves beside the circle, less
   * a gap. The other layout lets the number run on (it packs after the circle instead), so it has no limit (`Int.MAX_VALUE`).
   */
  fun numberRoom(): Int = if (numeral) max(0, PixelGrid.snap(innerW - circleD - vw(NUMERAL_GAP))) else Int.MAX_VALUE

  /**
   * Whether an oversized channel number is shrunk to fit its room, as the React Native rows' number is (`big` in `Row`): always in the `numeral`
   * layout, and in the other layouts when the theme scales its numbers up (`numberScale`, the number role's `scale`, above 1). Aurora's own number
   * is left as it is.
   */
  fun fitsNumber(numberScale: Double): Boolean = numeral || numberScale > 1.0

  /**
   * The most width a number that is shrunk to fit ([fitsNumber]) has before it is cut: beside a logo, what the logo's gap leaves ([logoNumberGap]),
   * since the logo gives way to the number; else in the `numeral` layout [numberRoom]'s, and in the other layout what the circle leaves it (the
   * circle comes first and the number takes the rest of the row).
   */
  fun fittedNumberRoom(besideLogo: Boolean): Int = when {
    besideLogo -> max(0, PixelGrid.snap(innerW - logoNumberGap))
    numeral -> numberRoom()
    else -> max(0, PixelGrid.snap(innerW - circleD))
  }

  /**
   * Places a channel's logo into `out`, given the width of the channel number's text in px. The logo's box starts where the
   * circle does (at the rail's right in the `numeral` layout), is as tall as the circle is before a theme scales it, and ends a gap
   * ([logoNumberGap]) before the number; the logo is fitted inside it less the plate's padding; a favorite's badge hangs off its bottom
   * right corner like the circle's.
   */
  fun placeLogo(numberW: Int, out: LogoRect) {
    val boxW = max(0.0, innerW - numberW - logoNumberGap)
    val x = if (numeral) rail.child(padH + innerW - boxW, boxW) else rail.child(padH, boxW)
    val y = logoY
    out.left = x.start
    out.right = x.end
    out.top = y.start
    out.bottom = y.end
    val ix = x.child(logoPad, max(0.0, boxW - 2 * logoPad))
    val iy = y.child(logoPad, max(0.0, logoH - 2 * logoPad))
    out.imgLeft = ix.start.toFloat()
    out.imgRight = ix.end.toFloat()
    out.imgTop = iy.start.toFloat()
    out.imgBottom = iy.end.toFloat()
    val off = px("badgeOff")
    val bx = x.child(boxW + off - badgeD, badgeD)
    val by = y.child(logoH + off - badgeD, badgeD)
    out.badgeLeft = bx.start
    out.badgeRight = bx.end
    out.badgeTop = by.start
    out.badgeBottom = by.end
  }

  /** The number's top, which is also the top of the circle. */
  val numberTop: Int get() = circleY.start

  /**
   * The top of a name `heightPx` tall: it ends at the rail's bottom padding. The name is a text node, whose top Yoga rounds down.
   * The rail lays its top row (the circle and the number, `numberH` px tall) and the name out with `justify-content: space-between`, which
   * packs them together at the top when they leave no room between them: a big number over a name of two lines puts the name right under
   * the number, not at the bottom.
   */
  fun nameTop(heightPx: Int, numberH: Int = 0): Int {
    val atBottom = rowH - borderTop - padV - heightPx
    val packed = padV + max(circleD, numberH.toDouble())
    return body.start + PixelGrid.floorEdge(max(atBottom, packed))
  }

  // Cells.
  private val cellTop = px("cellTop")
  private val cellH = rowH - px("cellInset")
  val cellRadius = px("cellRadius")
  val cellBorder = px("cellBorder")
  val cellRing = px("cellRing")

  /** The pixel height artwork is requested at for every cell: the cell's height (dp) rounded up to the 64 px step, the same
   *  box the React Native rows ask for. */
  val artH = GuideGeometry.artSide(geo.rowH - geo.dp("cellInset"), d, GuideGeometry.ART_MAX)

  /** The pixel width artwork is requested at for the cell `box` (see [artH]). */
  fun artW(box: GuideGeometry.CellBox): Int = GuideGeometry.artSide(box.width, d, GuideGeometry.ART_MAX)

  /** The width of a theme's second, outer ring on the selected cell (0 for none). */
  val ringOuterW = px("ringOuterW")
  private val barX = px("liveBarX")
  private val barInset = px("liveBarInset")
  private val barW = px("liveBarW")
  val barRadius = px("liveBarR")

  /**
   * Places the cell `box` (dp, from the lane's left edge) into `out`. `selected` cells have the ring's width as their
   * border and so a different padding box and text origin than the others, exactly as in the React Native rows.
   *
   * `shrink` pulls the cell's right and bottom edges in by a hard shadow's offset (design px): the shadow sits inside the box the cell
   * is given, so the visible body is smaller and everything in it (padding box, text, bar) lays out in that smaller box.
   * `kickerLine` is the line height (px) of a status line above the title, 0 for a cell without one: the title then starts under
   * it, and the cell's top padding is the kicker cell's own.
   */
  fun placeCell(box: GuideGeometry.CellBox, selected: Boolean, out: CellRect, shrink: Stacks.Inset = Stacks.NO_INSET, kickerLine: Int = 0) {
    val bw = if (selected) cellRing else cellBorder
    val leftPx = box.left * d
    val shrinkX = vw(shrink.dx)
    val shrinkY = vw(shrink.dy)
    val cellW = box.width * d - shrinkX
    val cellHt = cellH - shrinkY
    val absX = railW + leftPx
    val absY = borderTop + cellTop

    out.border = bw.toFloat()
    out.absLeft = absX
    out.absTop = absY
    out.exactW = cellW
    out.exactH = cellHt
    out.exactBorder = bw
    out.left = lane.start + PixelGrid.snap(leftPx)
    out.right = out.left + PixelGrid.snap(absX + cellW) - PixelGrid.snap(absX)
    out.top = body.start + PixelGrid.snap(cellTop)
    out.bottom = out.top + PixelGrid.snap(absY + cellHt) - PixelGrid.snap(absY)

    // The padding box: the border box inside its border.
    val innerLeft = out.left + PixelGrid.snap(bw)
    val innerTop = out.top + PixelGrid.snap(bw)
    out.padLeft = innerLeft.toFloat()
    out.padTop = innerTop.toFloat()
    out.padRight = innerLeft + (PixelGrid.snap(absX + bw + cellW - 2 * bw) - PixelGrid.snap(absX + bw)).toFloat()
    out.padBottom = innerTop + (PixelGrid.snap(absY + bw + cellHt - 2 * bw) - PixelGrid.snap(absY + bw)).toFloat()

    // The accent bar: absolutely placed from the padding edge.
    out.barLeft = out.left + PixelGrid.snap(bw + barX)
    out.barRight = out.barLeft + PixelGrid.snap(absX + bw + barX + barW) - PixelGrid.snap(absX + bw + barX)
    out.barTop = out.top + PixelGrid.snap(bw + barInset)
    out.barBottom = out.barTop + PixelGrid.snap(absY + bw + barInset + (cellHt - 2 * bw - 2 * barInset)) - PixelGrid.snap(absY + bw + barInset)

    // The texts: a padded block inside the border, the status line (if any) first, then the title, and the sub-line under it.
    // All of them are text nodes (see [Span.textChild]): the width the ellipsis is computed at is Yoga's rounded one, not the floor of the
    // exact width (it matters most with a thick border, whose width is taken off both sides), and each one's top rounds down.
    val textAbsLeft = absX + bw + titlePadX
    out.textLeft = innerLeft + PixelGrid.floorEdge(titlePadX)
    out.textWidth = max(0, PixelGrid.textEnd(textAbsLeft, cellW - 2 * bw - 2 * titlePadX) - PixelGrid.floorEdge(textAbsLeft))
    val padTop = if (kickerLine > 0) vw(StatusRules.KICKER_PAD_TOP) else titlePadTop
    val head = if (kickerLine > 0) kickerLine + vw(StatusRules.KICKER_GAP) else 0.0
    out.kickerTop = innerTop + PixelGrid.floorEdge(padTop)
    out.titleTop = innerTop + PixelGrid.floorEdge(padTop + head)
    out.subTop = innerTop + PixelGrid.floorEdge(padTop + head + titleH + subGap)
  }

  /**
   * Places the selected cell's outer ring into `out` (left, top, right, bottom, and `border`, its width): the cell's border
   * box grown by the ring's width on every side, positioned like the absolutely placed box the React Native rows draw for it,
   * so its edges land on the same pixels. `box` is the selected cell's [GuideGeometry.CellBox].
   */
  fun placeOuterRing(box: GuideGeometry.CellBox, out: CellRect) = placeRing(box, ringOuterW, ringOuterW, Stacks.NO_INSET, out)

  /**
   * Places a ring `w` thick whose outside edge is `grow` px out from the cell's border box (a ring a `gap` off the cell has
   * `grow` = gap + w): the box grown by `grow` on every side, so the border is drawn inside it. `shrink` is the cell's own, for a cell
   * a hard shadow has pulled in: the ring goes round the visible body, not round the shadow.
   *
   * The React Native rows draw a ring as a box inside the frame they wrap the cell, its shadows and its rings in (`left: -grow`), so
   * Yoga rounds it twice: the frame's start relative to the row, then the ring's start relative to the frame. Rounding the two offsets at
   * once, as one number, puts a ring a pixel off whenever both are fractional.
   */
  fun placeRing(box: GuideGeometry.CellBox, grow: Double, w: Double, shrink: Stacks.Inset, out: CellRect) {
    val frameX = lane.child(box.left * d, box.width * d)
    val frameY = body.child(cellTop, cellH)
    val x = frameX.child(-grow, box.width * d - vw(shrink.dx) + 2 * grow)
    val y = frameY.child(-grow, cellH - vw(shrink.dy) + 2 * grow)
    out.left = x.start
    out.right = x.end
    out.top = y.start
    out.bottom = y.end
    out.border = w.toFloat()
  }

  /**
   * Places the on-now bar of the cell `c` (see [placeCell]) into `out`: the way the React Native rows lay it out. The track is a box
   * placed from the padding box's edge, `inset` in from both sides, `bottom` up from the bottom and `h` tall (all px); its border is
   * `border` wide on every side, or on the top only (`topOnly`). The fill is a box inside the track's padding box, as far along as `pct`
   * (0..1) of its width, and the part to come is the rest of it. Every box is rounded by Yoga's rules from where the cell's box starts
   * before rounding ([Span.child]), so the fill can be a pixel shorter than the room inside the track's border, which is how it looks in
   * the React Native rows.
   */
  fun placeBar(c: CellRect, inset: Double, bottom: Double, h: Double, border: Double, topOnly: Boolean, pct: Double, out: BarRect) {
    val cellX = Span(c.left, c.right, c.absLeft)
    val cellY = Span(c.top, c.bottom, c.absTop)
    val bw = c.exactBorder
    val barW = max(0.0, c.exactW - 2 * bw - 2 * inset)
    val x = cellX.child(bw + inset, barW)
    val y = cellY.child(c.exactH - bw - bottom - h, h)
    out.left = x.start
    out.right = x.end
    out.top = y.start
    out.bottom = y.end
    val side = if (topOnly) 0.0 else border
    out.borderLeft = side.toFloat()
    out.borderRight = side.toFloat()
    out.borderTop = border.toFloat()
    out.borderBottom = side.toFloat()
    val trackPadW = max(0.0, barW - 2 * side)
    val trackPadH = max(0.0, h - border - side)
    val fx = x.child(side, pct * trackPadW)
    val fy = y.child(border, trackPadH)
    out.fillLeft = fx.start
    out.fillRight = fx.end
    out.fillTop = fy.start
    out.fillBottom = fy.end
    val rx = x.child(side + pct * trackPadW, trackPadW - pct * trackPadW)
    out.remainLeft = rx.start
    out.remainRight = rx.end
    out.remainTop = fy.start
    out.remainBottom = fy.end
  }

  companion object {
    /** The `geo` fields this layout reads besides [GuideGeo]'s own (`rowH`, `railW`, ...): JS has to send every one. */
    /** The gap (design px) between a `numeral` rail's number and its circle. */
    const val NUMERAL_GAP = 8.0

    val KEYS = listOf(
      "unit", "borderTop", "padV", "padH", "barW",
      "circle", "circleBorder", "circleRing", "glyph", "badge", "badgeOff", "logoGap", "logoPad", "logoRadius",
      "numberSize", "nameSize", "nameLine",
      "cellTop", "cellInset", "cellRadius", "cellBorder", "cellRing", "ringOuterW",
      "liveBarX", "liveBarInset", "liveBarW", "liveBarR",
      "padTop", "padX", "titleSize", "subSize", "subGap", "kickerSize", "plateSize",
    )

    private fun step32(px: Double): Int = (ceil(px / 32.0) * 32).toInt()

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
