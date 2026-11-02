package expo.modules.nativeguide

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import androidx.core.graphics.PathParser
import org.json.JSONArray
import org.json.JSONObject

/**
 * One drawable piece of a lucide icon, from the icon's `iconNode`: lucide describes every icon as a list of
 * `[tag, attributes]` pairs on a 24 x 24 grid (`path`, `circle`, `rect`, `line`, `polyline`, `polygon`, `ellipse`).
 * Plain data: parsing is JVM-tested (LucideGlyphTest); [GlyphDrawer] turns it into pixels.
 */
sealed class GlyphShape {
  class PathData(val d: String) : GlyphShape()

  class Circle(val cx: Double, val cy: Double, val r: Double) : GlyphShape()

  class Ellipse(val cx: Double, val cy: Double, val rx: Double, val ry: Double) : GlyphShape()

  /** `rx` and `ry` are already resolved the way SVG does: a missing one copies the other, both clamp to half the size. */
  class Rect(val x: Double, val y: Double, val w: Double, val h: Double, val rx: Double, val ry: Double) : GlyphShape()

  class Line(val x1: Double, val y1: Double, val x2: Double, val y2: Double) : GlyphShape()

  /** `points` alternates x, y. */
  class Poly(val points: DoubleArray, val closed: Boolean) : GlyphShape()
}

/** An icon: its shapes, in drawing order. */
class Glyph(val shapes: List<GlyphShape>)

/**
 * The icons the rows can draw, by icon-set id (`lucide:Radio`). JS sends each distinct icon's node once (`setGlyphs`) taken
 * from the same `lucide-react-native` component the React Native rows render, so a native icon is the icon the other rows
 * draw, not a lookalike. Entries only ever get added or replaced.
 */
object LucideGlyphs {
  /** The icon that stands in for any id without a glyph of its own, as the React Native rows' `channelIcon` does. */
  const val FALLBACK = "lucide:Radio"

  /** The favorite heart, drawn in the focused rail's circle and as a favorite's badge. */
  const val HEART = "lucide:Heart"

  private val byId = HashMap<String, Glyph>()

  /** Moves whenever the set of icons changes, so a row that drew the fallback for an icon that has since arrived is drawn again. */
  @Volatile
  var version = 0
    private set

  /** Adds the glyphs in `json` (`{ "lucide:Radio": [["path", { "d": "..." }], ...], ... }`) and returns how many it read.
   *  Malformed JSON throws; a single unreadable icon is skipped. */
  @Synchronized
  fun register(json: String): Int {
    val o = JSONObject(json)
    var n = 0
    val ids = o.keys()
    while (ids.hasNext()) {
      val id = ids.next()
      val glyph = parseNode(o.optJSONArray(id)) ?: continue
      byId[id] = glyph
      n += 1
    }
    if (n > 0) version += 1
    return n
  }

  /** The glyph for `id`; the fallback icon's when `id` has none (or is blank); null only when neither is registered. */
  @Synchronized
  fun get(id: String): Glyph? = byId[id] ?: byId[FALLBACK]

  @Synchronized
  fun has(id: String): Boolean = byId.containsKey(id)

  @Synchronized
  fun clear() {
    byId.clear()
    version += 1
  }

  /** Reads an `iconNode` (`[[tag, attributes]...]`). Elements it can't read (an unknown tag, a missing attribute) are
   *  skipped; null when nothing in it is drawable. */
  fun parseNode(node: JSONArray?): Glyph? {
    if (node == null) return null
    val shapes = ArrayList<GlyphShape>(node.length())
    for (i in 0 until node.length()) {
      val pair = node.optJSONArray(i) ?: continue
      val tag = pair.optString(0)
      val attrs = pair.optJSONObject(1) ?: continue
      parseShape(tag, attrs)?.let { shapes.add(it) }
    }
    return if (shapes.isEmpty()) null else Glyph(shapes)
  }

  private fun parseShape(tag: String, a: JSONObject): GlyphShape? = when (tag) {
    "path" -> text(a, "d")?.let { GlyphShape.PathData(it) }
    "circle" -> {
      val cx = number(a, "cx") ?: 0.0
      val cy = number(a, "cy") ?: 0.0
      number(a, "r")?.takeIf { it > 0 }?.let { GlyphShape.Circle(cx, cy, it) }
    }
    "ellipse" -> {
      val rx = number(a, "rx")
      val ry = number(a, "ry")
      if (rx != null && ry != null && rx > 0 && ry > 0) GlyphShape.Ellipse(number(a, "cx") ?: 0.0, number(a, "cy") ?: 0.0, rx, ry) else null
    }
    "rect" -> {
      val w = number(a, "width")
      val h = number(a, "height")
      if (w == null || h == null || w <= 0 || h <= 0) {
        null
      } else {
        // SVG: a missing rx or ry takes the other's value, and neither may exceed half the side.
        val rxIn = number(a, "rx")
        val ryIn = number(a, "ry")
        val rx = (rxIn ?: ryIn ?: 0.0).coerceIn(0.0, w / 2)
        val ry = (ryIn ?: rxIn ?: 0.0).coerceIn(0.0, h / 2)
        GlyphShape.Rect(number(a, "x") ?: 0.0, number(a, "y") ?: 0.0, w, h, rx, ry)
      }
    }
    "line" -> GlyphShape.Line(number(a, "x1") ?: 0.0, number(a, "y1") ?: 0.0, number(a, "x2") ?: 0.0, number(a, "y2") ?: 0.0)
    "polyline", "polygon" -> points(text(a, "points"))?.let { GlyphShape.Poly(it, closed = tag == "polygon") }
    else -> null
  }

  /** "6 9 12 15" or "6,9 12,15"; null when there are fewer than two points or a coordinate isn't a number. */
  internal fun points(raw: String?): DoubleArray? {
    if (raw == null) return null
    val parts = raw.trim().split(Regex("[\\s,]+")).filter { it.isNotEmpty() }
    if (parts.size < 4 || parts.size % 2 != 0) return null
    return DoubleArray(parts.size) { parts[it].toDoubleOrNull()?.takeIf { v -> v.isFinite() } ?: return null }
  }

  /** An attribute as a number: lucide writes them as strings ("12", ".5") or numbers. */
  private fun number(a: JSONObject, key: String): Double? = when (val v = a.opt(key)) {
    is Number -> v.toDouble()
    is String -> v.trim().toDoubleOrNull()
    else -> null
  }?.takeIf { it.isFinite() }

  private fun text(a: JSONObject, key: String): String? = (a.opt(key) as? String)?.takeIf { it.isNotBlank() }
}

/**
 * Draws a [Glyph] the way `lucide-react-native` renders it: on a 24 x 24 viewBox scaled to the requested size, stroke
 * width 2 (scaling with the size, lucide's default, not `absoluteStrokeWidth`), round caps and joins, no fill unless one is
 * asked for (the filled heart). Android paths are built once per glyph. Main thread only.
 */
class GlyphDrawer {
  private val paths = HashMap<GlyphShape, Path>()
  private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeWidth = STROKE_WIDTH
    strokeCap = Paint.Cap.ROUND
    strokeJoin = Paint.Join.ROUND
  }
  private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private val rect = RectF()

  /**
   * Draws `glyph` into the `size` x `size` px square whose top-left corner is (`left`, `top`). `fillColor` fills each shape
   * before it is stroked (0 = no fill, since a transparent fill draws nothing anyway).
   */
  fun draw(canvas: Canvas, glyph: Glyph, left: Float, top: Float, size: Float, strokeColor: Int, fillColor: Int = 0) {
    if (size <= 0f) return
    stroke.color = strokeColor
    fill.color = fillColor
    canvas.save()
    canvas.translate(left, top)
    val s = size / VIEWBOX
    canvas.scale(s, s)
    for (shape in glyph.shapes) {
      val path = path(shape)
      if (fillColor != 0) canvas.drawPath(path, fill)
      canvas.drawPath(path, stroke)
    }
    canvas.restore()
  }

  /** Drops the cached paths (memory pressure, or the view detached). */
  fun trim() = paths.clear()

  private fun path(shape: GlyphShape): Path = paths.getOrPut(shape) { build(shape) }

  private fun build(shape: GlyphShape): Path {
    val p = Path()
    when (shape) {
      is GlyphShape.PathData -> return try {
        PathParser.createPathFromPathData(shape.d)
      } catch (_: RuntimeException) {
        p // Unreadable path data: an empty path draws nothing, and the rest of the icon still draws.
      }
      is GlyphShape.Circle -> p.addCircle(shape.cx.toFloat(), shape.cy.toFloat(), shape.r.toFloat(), Path.Direction.CW)
      is GlyphShape.Ellipse -> {
        rect.set((shape.cx - shape.rx).toFloat(), (shape.cy - shape.ry).toFloat(), (shape.cx + shape.rx).toFloat(), (shape.cy + shape.ry).toFloat())
        p.addOval(rect, Path.Direction.CW)
      }
      is GlyphShape.Rect -> {
        rect.set(shape.x.toFloat(), shape.y.toFloat(), (shape.x + shape.w).toFloat(), (shape.y + shape.h).toFloat())
        if (shape.rx > 0 || shape.ry > 0) p.addRoundRect(rect, shape.rx.toFloat(), shape.ry.toFloat(), Path.Direction.CW) else p.addRect(rect, Path.Direction.CW)
      }
      is GlyphShape.Line -> {
        p.moveTo(shape.x1.toFloat(), shape.y1.toFloat())
        p.lineTo(shape.x2.toFloat(), shape.y2.toFloat())
      }
      is GlyphShape.Poly -> {
        val pts = shape.points
        p.moveTo(pts[0].toFloat(), pts[1].toFloat())
        var i = 2
        while (i + 1 < pts.size) {
          p.lineTo(pts[i].toFloat(), pts[i + 1].toFloat())
          i += 2
        }
        if (shape.closed) p.close()
      }
    }
    return p
  }

  private companion object {
    const val VIEWBOX = 24f
    const val STROKE_WIDTH = 2f
  }
}
