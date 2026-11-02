package expo.modules.nativeguide

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * The small pure rules the painter draws a theme's decorations by: which of a cell's labels fit, where a dimension line's ticks fall,
 * the star burst's outline, how far a hard shadow shrinks its cell, the rings stacked round the selected cell, a CSS gradient's line.
 * No Android imports, so each is unit-tested on the JVM; [AuroraPainter] only draws what these decide.
 */
object StatusRules {
  /** The gap (design px) under the kicker line, and the cell's top padding when it has one (a plain cell's is `geo.padTop`). */
  const val KICKER_GAP = 4.0
  const val KICKER_PAD_TOP = 12.0

  /** A kicker line is 1.1 of its font size tall. */
  const val KICKER_LINE = 1.1

  /** A tag in the sub-line: its letters sit on a padded plate (design px). */
  const val PLATE_PAD_X = 9.0
  const val PLATE_PAD_Y = 1.0
  const val PLATE_GAP = 10.0

  /** The burst sits this far (design px) from its cell's top and right edges, and the text keeps clear of it by `BURST_CLEAR` more. */
  const val BURST_TOP = 8.0
  const val BURST_RIGHT = 14.0
  const val BURST_CLEAR = 6.0

  /**
   * Whether a cell `cellPx` wide has room for a label that needs `minCellPx`: the plate and the burst are dropped on a narrower cell, and
   * the cell is then drawn as if the theme had no status label.
   */
  fun fits(cellPx: Double, minCellPx: Double): Boolean = cellPx >= minCellPx

  /**
   * The width the sub-line has after a tag `tagPx` wide and the gap `gapPx` that follows it, in a text column `textPx` wide: what is left, none if the
   * column cannot hold the tag. The tag itself is drawn whenever [fits] says the cell has room for it, however narrow its column is, as the classic
   * rows draw it (a narrow column only leaves the sub-line less).
   */
  fun subRoomAfterPlate(tagPx: Float, gapPx: Float, textPx: Float): Float = max(0f, textPx - (tagPx + gapPx))

  /**
   * Whether the kicker line has room: its label, written out in full, fits the width the cell leaves its text (the cell's text width
   * less an art strip beside it). A cell that cannot hold it whole drops the line (rather than cut it to "9:0...") and is laid out as one
   * without, so its title sits where a plain cell's does. Needs no minimum cell width of its own: a 12 minute cell holds "9:01 PM".
   */
  fun kickerFits(labelPx: Float, roomPx: Float): Boolean = roomPx > 0f && labelPx <= roomPx

  /**
   * How much to shrink a line of text `widthPx` wide to fit `roomPx`, on one line, rather than cut it: 1 when it fits, down to `min`
   * (a React Native `<Text adjustsFontSizeToFit minimumFontScale>`, which the classic rows use for an oversized channel number). A line
   * that still does not fit at `min` is cut with an ellipsis by the caller.
   */
  fun fitScale(widthPx: Float, roomPx: Float, min: Float = MIN_FIT_SCALE): Float = if (widthPx <= roomPx || widthPx <= 0f) 1f else max(min, max(0f, roomPx) / widthPx)

  /** The smallest an oversized number shrinks to (the classic rows' `minimumFontScale`). */
  const val MIN_FIT_SCALE = 0.5f

  /** A tag's plate is its text's line box (1.25 of the size, the leading split evenly) and its padding: how far it reaches above and below
   *  the baseline it shares with the sub-line. `ascent` is negative, as Android reports it. Returns [above, below]. */
  fun plateReach(ascent: Float, descent: Float, sizePx: Float, padYPx: Float): FloatArray {
    val leading = (PLATE_LINE * sizePx - (descent - ascent)) / 2f
    return floatArrayOf(-ascent + leading + padYPx, descent + leading + padYPx)
  }

  const val PLATE_LINE = 1.25f

  /** The kicker line says "ON NOW" on the live cell and when the programme starts on every other. */
  fun kickerText(live: Boolean, liveWord: String, startMs: Long, zone: TimeZone = TimeZone.getDefault()): String = if (live) liveWord else TimeLabel.format(startMs, zone)
}

/** Where a line of text sits in the box it is given. */
object LineMetrics {
  /**
   * How far below the top of its box a line's baseline is when the line has no line height of its own: the font's line box starts at its
   * `top` when the text has the font's extra padding (a React Native <Text>'s default, which the system font keeps) and at its `ascent`
   * when it has not (`includeFontPadding: false`, which the classic rows give a bundled face). `ascent` and `top` are negative, as Android
   * reports them. A line given a line height is placed by its leading instead ([LineBox]).
   */
  fun baseline(ascent: Int, top: Int, includeFontPadding: Boolean): Int = if (includeFontPadding) -top else -ascent

  /** How tall such a line is: its line box, from the font's `top` to its `bottom` with the font's padding, from its `ascent` to its `descent` without. */
  fun height(ascent: Int, descent: Int, top: Int, bottom: Int, includeFontPadding: Boolean): Int = if (includeFontPadding) bottom - top else descent - ascent
}

/** How a line of text is rasterized. */
object TextFlags {
  /**
   * Whether a line is drawn with its glyphs at subpixel positions. React Native sets that flag on the paint with the line's typeface span, and
   * it adds that span only to a <Text> whose style names a weight other than the regular one, a family or a slant (`CustomStyleSpan`); the
   * rest are drawn in the text view's own paint, whose glyphs sit on whole pixels. A line has to be drawn the same way to put its glyphs
   * where the classic rows' are. (It changes where glyphs are drawn, not how wide they are, so it has no part in where a line is cut.)
   */
  fun subpixel(weight: Int, family: String?, italic: Boolean): Boolean = family != null || weight != 400 || italic
}

/** The borders React Native draws on a view with no corner radius (`BorderDrawable.drawRectangularBorders`): the row's rule, the rail's divider. */
object RectBorder {
  /** The width a border is drawn at: its width in pixels rounded to whole ones (none under half a pixel). */
  fun widthPx(width: Float): Int = Math.round(width)

  /**
   * Where a border `w` px wide covers, measured in from the edge of the view it is on, as [from, to] (a negative `from` is outside it). It
   * is a line `w` thick stroked along a centre `w / 2` px in (a whole-number division), so an even width covers exactly its `w` pixels
   * inside the edge and an odd one straddles a pixel boundary: 3 px cover half a pixel outside the edge, two whole ones and half of the next
   * one inside it.
   */
  fun band(w: Int): FloatArray {
    val centre = (w / 2).toFloat()
    return floatArrayOf(centre - w / 2f, centre + w / 2f)
  }
}

/** Letter spacing. */
object LetterSpacing {
  /**
   * The spacing, in em, of text tracked `track` em at a font `exactPx` pixels tall before its size is rounded up to a whole pixel. React
   * Native converts the spacing to pixels from the exact size (`track` times it) and divides by the size it draws with, rounded up, so the
   * spacing between glyphs is `track` of the exact size, not of the rounded one. An em in the rounded size that is a hair too wide adds up
   * along a title: a pixel by its end, in a theme that tracks its titles.
   */
  fun em(track: Double, exactPx: Float): Float = if (track == 0.0 || exactPx <= 0f) 0f else (track * exactPx / ceil(exactPx.toDouble())).toFloat()
}

/** The dashes of a dashed border. */
object BorderDash {
  /**
   * The pattern React Native strokes a `borderStyle: 'dashed'` border with, whatever the theme's own lengths say: three border widths on,
   * three off (`BorderDrawable`'s `DashPathEffect`, phase 0). The classic rows draw this, so this is what the native rows have to.
   */
  fun intervals(widthPx: Float): FloatArray = floatArrayOf(widthPx * 3, widthPx * 3, widthPx * 3, widthPx * 3)
}

/** A programme's start time as the guide's header writes one ("8:01 PM": en-US, 12 hour). */
object TimeLabel {
  fun format(ms: Long, zone: TimeZone = TimeZone.getDefault()): String {
    val f = SimpleDateFormat("h:mm a", Locale.US)
    f.timeZone = zone
    return f.format(Date(ms))
  }
}

/** Shadow and ring stacking. */
object Stacks {
  /** How far (design px) a theme's hard shadow pulls its cell's right and bottom edges in: the largest offset of its steps. */
  class Inset(val dx: Double, val dy: Double)

  val NO_INSET = Inset(0.0, 0.0)

  /** `inside`: the visible body shrinks by the offset so the cell's box (and so what the cull and the layout see) never changes. */
  fun inset(s: GuideLook.Shadow?): Inset {
    if (s == null || !s.inside) return NO_INSET
    return Inset(s.steps.maxOf { max(0.0, it.dx) }, s.steps.maxOf { max(0.0, it.dy) })
  }

  /** One ring of the stack round the selected cell: it sits `grow` px out from the cell's box and is `w` thick. `halo` is its index in
   *  the theme's halo, or -1 for the outer ring. */
  class Ring(val grow: Double, val w: Double, val halo: Int)

  /**
   * The rings round the selected cell, innermost first: the outer ring (a gap off the cell, then its own width), then each halo ring
   * against the one before. Widths are screen px.
   */
  fun rings(outerGap: Double, outerW: Double, halo: List<Double>): List<Ring> {
    val out = ArrayList<Ring>()
    var off = 0.0
    if (outerW > 0) {
      off += outerGap
      out.add(Ring(off + outerW, outerW, -1))
      off += outerW
    }
    for ((i, w) in halo.withIndex()) {
      if (w <= 0) continue
      out.add(Ring(off + w, w, i))
      off += w
    }
    return out
  }
}

/** A CSS `linear-gradient(angle, ...)` line across a box. */
object GradientLine {
  /** The start and end of the gradient line for a `w` x `h` box at `angleDeg` (CSS: 0 runs up, 90 right, 135 to the bottom right), in box coordinates. */
  fun of(angleDeg: Double, w: Double, h: Double): DoubleArray {
    val a = Math.toRadians(angleDeg)
    val dx = sin(a)
    val dy = -cos(a)
    val len = abs(w * dx) + abs(h * dy)
    val cx = w / 2
    val cy = h / 2
    return doubleArrayOf(cx - dx * len / 2, cy - dy * len / 2, cx + dx * len / 2, cy + dy * len / 2)
  }
}

/** The ticks of a dimension line (a progress bar drawn as a ruler). */
object TickRule {
  class Tick(val x: Double, val major: Boolean)

  /** The index of the first tick that is not before the line's start: ticks are counted from the programme's start, which sits
   *  `phasePx` before the line's own when the cell began before the timeline did. */
  fun firstIndex(stepPx: Double, phasePx: Double): Int = if (phasePx <= 0.0 || stepPx <= 0.0) 0 else ceil(phasePx / stepPx - 1e-9).toInt()

  /** Where tick `k` falls along the line (px). */
  fun xAt(k: Int, stepPx: Double, phasePx: Double): Double = k * stepPx - phasePx

  /** Whether tick `k` is a taller one: every `majorEvery / every` of them, the first (the programme's start) included. */
  fun isMajor(k: Int, every: Double, majorEvery: Double): Boolean = k % max(1, (majorEvery / every).roundToInt()) == 0

  /**
   * The ticks along a line `widthPx` long: one every `stepPx` (`every` minutes of the programme), a taller one every `majorEvery / every`
   * of them. The first sits at the programme's start, `phasePx` before the line's start when the cell begins before the timeline does,
   * so those that fall before the line are skipped and the rest keep their place in the count. (The painter walks [firstIndex] and
   * [xAt] itself, to draw them without a list.)
   */
  fun ticks(widthPx: Double, stepPx: Double, phasePx: Double, every: Double, majorEvery: Double): List<Tick> {
    if (stepPx <= 0.0 || widthPx <= 0.0) return emptyList()
    val out = ArrayList<Tick>()
    var k = firstIndex(stepPx, phasePx)
    while (true) {
      val x = xAt(k, stepPx, phasePx)
      if (x > widthPx + 0.5) break
      out.add(Tick(x, isMajor(k, every, majorEvery)))
      k++
    }
    return out
  }

  /** How far the cell was clipped by the timeline's start: `left - rawLeft`, never negative. */
  fun phase(startMs: Long, originMs: Double, ppm: Double, left: Double): Double = max(0.0, left - (startMs - originMs) / GuideGeometry.MIN_MS * ppm)
}

/**
 * A straight, butt-capped stroke as the rectangle it covers. The dimension line's rule, ticks and caps are all such strokes, and drawn as
 * rectangles (`drawRect`, one cheap quad each, which the GPU batches) they cost the renderer far less than the same number of `drawLine`s, each
 * of which it turns into a path and then back into a rectangle. The coverage is the same: a butt-capped line is exactly this rectangle.
 * `out` receives [left, top, right, bottom].
 */
object StrokeRect {
  /** A line along y from `x0` to `x1`, `w` thick (either end may come first). */
  fun horizontal(x0: Float, x1: Float, y: Float, w: Float, out: FloatArray) {
    out[0] = min(x0, x1)
    out[1] = y - w / 2
    out[2] = max(x0, x1)
    out[3] = y + w / 2
  }

  /** A line along x from `y0` to `y1`, `w` thick (either end may come first). */
  fun vertical(x: Float, y0: Float, y1: Float, w: Float, out: FloatArray) {
    out[0] = x - w / 2
    out[1] = min(y0, y1)
    out[2] = x + w / 2
    out[3] = max(y0, y1)
  }
}

/** The star burst behind a "NOW!" word: 24 vertices alternating between a long and a short radius, round a unit box. */
object Burst {
  const val POINTS = 24
  private const val OUTER = 0.50
  private const val INNER = 0.38

  /** The outline's vertices as x, y pairs in 0..1 of the burst's box. */
  fun vertices(): FloatArray {
    val out = FloatArray(POINTS * 2)
    for (k in 0 until POINTS) {
      val a = Math.toRadians((k * 15 - 90).toDouble())
      val r = if (k % 2 == 0) OUTER else INNER
      out[k * 2] = (0.5 + r * cos(a)).toFloat()
      out[k * 2 + 1] = (0.5 + r * sin(a)).toFloat()
    }
    return out
  }

  /** The burst's coloured face is the outline shrunk to this share of the box about its centre. */
  const val FACE = 0.86
}
