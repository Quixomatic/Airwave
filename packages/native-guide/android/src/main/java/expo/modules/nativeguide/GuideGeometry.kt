package expo.modules.nativeguide

import org.json.JSONObject
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * The guide rows' pure geometry: where a program's cell sits in its row, which rows a scroll offset shows, and the
 * pixel box artwork is requested at. These are ports of the TypeScript the React Native rows use
 * (tv-native `features/guide/geometry.ts`), so both renderers place and cull every cell identically. No Android
 * imports: unit-tested on the JVM, including against that TypeScript's own results (GuideGeometryTest).
 *
 * Geometry runs in Double, like JavaScript: the cull threshold must flip on exactly the same inputs in both.
 */
object GuideGeometry {
  const val MIN_MS = 60_000.0

  /**
   * The largest side artwork is requested at (`ART_MAX` in geometry.ts), in px. The image route scales a picture to COVER the box it is
   * asked for, so a cell as wide as the lane gets a picture as wide as the lane and as tall as the artwork's shape makes it (a 16:9 poster
   * 1920 wide is 1080 tall, 8 MB decoded, for a cell 128 px tall). A cap bounds that, for the picture Fresco decodes (and caches) as well as
   * for the band the view keeps: past it a wide cell's art is scaled up a little under its scrim instead.
   */
  const val ART_MAX = 1024

  /** A cell narrower than this (dp) is not drawn. */
  const val MIN_CELL_W = 8.0

  /** A program is laid out at least this share of the lane wide, however short it is. */
  const val MIN_CELL_LANE_SHARE = 0.02

  /**
   * The gap (dp) the React Native rows' per-channel program filter culls with (`SOURCE_CULL_GAP` in geometry.ts): not the
   * chrome-scaled gap the cells are placed with, which is smaller on Android TV. The rows hand the native view every
   * program, so the view applies that filter itself to draw the programs the React Native rows would.
   */
  const val SOURCE_CULL_GAP = 6.0

  /** A cell's horizontal extent in lane coordinates (dp, from the lane's left edge). */
  data class CellBox(val left: Double, val width: Double)

  /**
   * Where a program's cell sits, or null when the row doesn't draw it: it ended before the timeline starts, starts
   * past its window, or only a sliver (under [MIN_CELL_W]) would remain. A program that began before the timeline
   * is clamped to start `gap` in from the lane's edge.
   *
   * @param originMs the timeline's left edge; @param ppm dp per minute; @param gap dp between adjacent cells.
   */
  fun cellBox(startMs: Long, durationSeconds: Int, originMs: Double, windowMin: Double, ppm: Double, laneW: Double, gap: Double): CellBox? {
    val startMin = (startMs - originMs) / MIN_MS
    val endMin = startMin + durationSeconds / 60.0
    if (!(endMin > 0 && startMin < windowMin)) return null
    val rawLeft = startMin * ppm
    val rawRight = rawLeft + max(laneW * MIN_CELL_LANE_SHARE, durationSeconds / 60.0 * ppm) - gap
    val left = if (rawLeft < 0) gap else rawLeft
    val width = rawRight - left
    return if (width < MIN_CELL_W) null else CellBox(left, width)
  }

  /** Whether the React Native rows' per-channel filter keeps a program (`isVisible` in geometry.ts): [cellBox] at [SOURCE_CULL_GAP]. */
  fun isVisible(startMs: Long, durationSeconds: Int, originMs: Double, windowMin: Double, ppm: Double, laneW: Double): Boolean =
    cellBox(startMs, durationSeconds, originMs, windowMin, ppm, laneW, SOURCE_CULL_GAP) != null

  /** Whether a program is on air at `nowMs`. */
  fun isLive(startMs: Long, durationSeconds: Int, nowMs: Double): Boolean = nowMs >= startMs && nowMs < startMs + durationSeconds * 1000L

  /** How far through its cell "now" is (0..1): where a live cell's fill changes tone. `left` and `width` are the
   *  cell's [CellBox] values in the same unit as `ppm`. */
  fun liveFill(nowMs: Double, originMs: Double, ppm: Double, left: Double, width: Double): Double =
    max(0.0, min(1.0, ((nowMs - originMs) / MIN_MS * ppm - left) / width))

  /** The rows `scrollY` shows, partial rows included (all in px). Empty when there's nothing to draw. */
  fun visibleRows(scrollY: Double, rowH: Double, viewH: Double, count: Int): IntRange {
    if (count <= 0 || rowH <= 0 || viewH <= 0) return IntRange.EMPTY
    val first = min(count - 1, max(0, (scrollY / rowH).toInt()))
    val last = min(count - 1, ceil((scrollY + viewH) / rowH).toInt() - 1)
    return first..max(first, last)
  }

  /** The furthest the list scrolls: its end sits at the bottom of the view, and a short list doesn't scroll at all. */
  fun maxScroll(count: Int, rowH: Double, viewH: Double): Double = max(0.0, count * rowH - max(0.0, viewH))

  /** A dp box -> the pixel box requested from the image proxy: rounded UP to `step` px so near-identical boxes share
   *  one URL (and one cache entry), never below the drawn size, capped at `maxW` x `maxH`. Returns [w, h]. */
  fun artBox(widthDp: Double, heightDp: Double, pixelRatio: Double, maxW: Int, maxH: Int, step: Int = 64): IntArray =
    intArrayOf(artSide(widthDp, pixelRatio, maxW, step), artSide(heightDp, pixelRatio, maxH, step))

  /** One side of [artBox]: `dp` in px, rounded up to `step`, at least one step and at most `cap`. */
  fun artSide(dp: Double, pixelRatio: Double, cap: Int, step: Int = 64): Int {
    val px = max(1.0, ceil(dp * pixelRatio))
    return min(cap.toDouble(), ceil(px / step) * step).toInt()
  }

  /**
   * The part of a `srcW` x `srcH` image that fills a `dstW` x `dstH` box when it is scaled to cover the box and centered
   * (a React Native image's `resizeMode="cover"`), as [left, top, right, bottom] in source pixels written to `out`. An
   * image or box with no size crops nothing.
   */
  fun coverCrop(srcW: Int, srcH: Int, dstW: Double, dstH: Double, out: IntArray) {
    if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
      out[0] = 0
      out[1] = 0
      out[2] = max(0, srcW)
      out[3] = max(0, srcH)
      return
    }
    val scale = max(dstW / srcW, dstH / srcH)
    val w = dstW / scale
    val h = dstH / scale
    val left = (srcW - w) / 2
    val top = (srcH - h) / 2
    out[0] = left.roundToInt().coerceIn(0, srcW)
    out[1] = top.roundToInt().coerceIn(0, srcH)
    out[2] = (left + w).roundToInt().coerceIn(out[0], srcW)
    out[3] = (top + h).roundToInt().coerceIn(out[1], srcH)
  }

  /**
   * The size a `srcW` x `srcH` image is drawn at to fit entirely inside a `dstW` x `dstH` box, centered (a React Native image's
   * `resizeMode="contain"`): [width, height] written to `out`, never larger than the box and never upscaled past what the
   * box asks for. An image or box with no size draws nothing.
   */
  fun containFit(srcW: Int, srcH: Int, dstW: Double, dstH: Double, out: DoubleArray) {
    if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
      out[0] = 0.0
      out[1] = 0.0
      return
    }
    val scale = min(dstW / srcW, dstH / srcH)
    out[0] = srcW * scale
    out[1] = srcH * scale
  }

  /** `base` (the artwork URL up to its query) with the requested pixel box appended. */
  fun artUrl(base: String, box: IntArray): String = "$base${if (base.contains('?')) "&" else "?"}w=${box[0]}&h=${box[1]}"
}

/**
 * The `geo` prop: the row geometry, in dp, that JS computes (`vw()`, `cs()` and `line()` depend on the screen, so the
 * view never re-derives them). The shared fields are the ones [GuideGeometry] needs; every other dimension a painter
 * draws with arrives in the same object and is read by name through [dp].
 */
class GuideGeo(json: String) {
  private val o = JSONObject(json)

  /** One row's height. */
  val rowH = o.optDouble("rowH", 0.0)

  /** The channel rail's width; the lane starts here. */
  val railW = o.optDouble("railW", 0.0)
  val laneW = o.optDouble("laneW", 0.0)

  /** dp per minute along the lane. */
  val ppm = o.optDouble("ppm", 0.0)

  /** The timeline's left edge (epoch ms). The current time is not here: it is its own prop ([GuideFrame.nowMs]), so a clock tick never changes the geometry. */
  val originMs = o.optDouble("originMs", 0.0)

  /** Minutes of timeline across the lane. */
  val windowMin = o.optDouble("windowMin", 180.0)

  /** dp between adjacent cells. */
  val gap = o.optDouble("gap", 0.0)

  /** Any other dimension, in dp, by name (0 when absent). */
  fun dp(name: String): Double = o.optDouble(name, 0.0)

  /** One program's cell, or null when the row doesn't draw it: the filter's cull first, then the cell placed at `gap`. */
  fun cellBox(p: GuideProgram): GuideGeometry.CellBox? {
    if (!GuideGeometry.isVisible(p.startMs, p.durationSeconds, originMs, windowMin, ppm, laneW)) return null
    return GuideGeometry.cellBox(p.startMs, p.durationSeconds, originMs, windowMin, ppm, laneW, gap)
  }
}
