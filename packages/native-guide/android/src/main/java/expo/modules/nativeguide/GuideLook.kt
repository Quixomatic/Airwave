package expo.modules.nativeguide

import org.json.JSONArray
import org.json.JSONObject

/**
 * Everything a guide theme adds to the look beyond Aurora's colors, as the painter reads it: typefaces, an accent source, the rail
 * and circle variants, how a cell is lifted, outlined and shadowed, the progress bar, the "live" word, program-art layout,
 * textures, two-ink misregistration and the time header's and featured panel's styles. JS sends the theme's resolved token set
 * (tv-native `features/guide/guide-tokens.ts`, `GuideTokens`) and `GuideTokens.parse` hands the matching part of it to
 * [GuideLook.parse].
 *
 * Every field's absent value is Aurora's: a missing, null or unreadable field reads as [GuideLook.AURORA]'s, so a partial token
 * object never changes what Aurora draws. No Android imports: unit-tested on the JVM.
 *
 * Units. Sizes in here are design px on the 2560-wide reference screen (what the TypeScript calls `vw()`), not dp, because only
 * the layout knows the screen: multiply by [AuroraLayout.vw]. A few sizes the rows already had (a cell's border, ring and radius, the
 * live bar's width, the outer ring's width) are in `geo` as dp, as before; this class holds only what themes added. Colors are
 * ARGB ints (see [GuideColor.parse]), or null where the TypeScript says "use the row's own".
 *
 * Which fields the painter draws and which only React Native does (the time header, the featured panel, the accent each row
 * is given) is the TypeScript's `layer` of each field; all of them are parsed so the two sides share one reading.
 */
data class GuideLook(
  val type: TypeStyle,
  val accentMode: AccentMode,
  val accentCycle: List<Int>?,
  /** The rule above each row, in design px, or null for the stock 1 dp hairline. */
  val rowBorderW: Double?,
  val railBg: Int,
  val railFocus: RailFocus?,
  /** The focused rail's edge bar: its corner radius and color are read from here; its width the layout takes from `geo` (`barW`, the same width in dp). */
  val railBar: RailBar,
  val railDivider: Rule?,
  val railLayout: RailLayout,
  val circle: CircleStyle,
  /** The channel glyph's stroke width in the 24 unit lucide box (2 is lucide's own). */
  val glyphStroke: Double,
  val cellFocusBg: Int?,
  val focusText: FocusText?,
  val liveText: LiveText?,
  /** `[on, off]` in design px: the outline of a cell that is neither live nor selected, or null for a solid one. */
  val cellBorderDash: Dash?,
  val cellRule: CellRule?,
  val shadow: Shadow?,
  val shadowFocus: Shadow?,
  val highlight: Highlight?,
  val halo: List<HaloRing>?,
  val progress: Progress,
  val statusLabel: StatusLabel,
  val art: ArtLayout,
  val patterns: Patterns,
  val misregister: Misregister?,
  val headerStyle: HeaderStyle?,
  /** The color of the featured panel's channel number and name, or null for the row's accent mark. */
  val featuredName: Int?,
  val featuredPlate: FeaturedPlate?,
  val favStroke: Stroke?,
  /** The gap between the selected cell's ring and its outer ring, and the outer ring's dashes; design px. */
  val ringOuterGap: Double,
  val ringOuterDash: Dash?,
  /** The on-now bar: where it starts from the padding edge and the gap above and below it (design px), and a fixed color or null. The
   *  layout takes its place from `geo` (`liveBarX`, `liveBarInset`: JS sends these same two converted to dp), so only the color is read from here. */
  val liveBarX: Double,
  val liveBarInset: Double,
  val liveBarColor: Int?,
) {
  enum class AccentMode { CHANNEL, FIXED, CYCLE }

  enum class RailLayout { AURORA, NUMERAL }

  /** `font`: which of the theme's two faces draws the role. */
  enum class Face { TEXT, DISPLAY }

  data class TextStyle(val face: Face, val weight: Int, val upper: Boolean, val track: Double, val scale: Double, val italic: Boolean)

  /**
   * A family and a size multiplier per text role. A null family is the system font (what Aurora uses). [family] is the family the
   * role is drawn in, to hand to `GuideText.typeface(family, weight, italic)`.
   */
  data class TypeStyle(
    val displayFamily: String?,
    val textFamily: String?,
    val title: TextStyle,
    val sub: TextStyle,
    val number: TextStyle,
    val name: TextStyle,
    val header: TextStyle,
    val day: TextStyle,
    val featured: TextStyle,
  ) {
    fun family(role: TextStyle): String? = if (role.face == Face.DISPLAY) displayFamily else textFamily
  }

  data class Dash(val on: Double, val off: Double)

  data class Rule(val w: Double, val color: Int)

  data class Stroke(val w: Double, val color: Int)

  data class CellRule(val w: Double, val color: Int, val inset: Double)

  data class Highlight(val w: Double, val color: Int)

  /** One ring of the selected cell's glow: the color is a [Spec], the row's accent mark (`ACCENT`) or a fixed color. */
  data class HaloRing(val w: Double, val a: Double, val color: Spec)

  /** Solid colors for a focused rail; a null `circle` or `glyph` keeps the circle style's own. */
  data class RailFocus(val bg: Int, val number: Int, val name: Int, val circle: Int?, val glyph: Int?)

  data class RailBar(val w: Double, val r: Double, val color: Int?)

  /**
   * The channel circle. [fill] and [glyph] are a [Spec] (the row's accent, a fixed color, or none/auto); [borderW] null is Aurora's
   * `line(1)` hairline (see `geo.circleBorder`).
   */
  data class CircleStyle(
    val radius: Double,
    val scale: Double,
    val fill: Spec,
    val border: Spec,
    val borderW: Double?,
    val glyph: Spec,
    val marks: Marks?,
  )

  /** A color named by role: the row's accent (`ACCENT`), the accent as a solid (`ACCENT_SOLID`), none, black-or-white by contrast (`AUTO`), or fixed. */
  data class Spec(val kind: Kind, val color: Int) {
    enum class Kind { ACCENT, ACCENT_SOLID, NONE, AUTO, COLOR }
  }

  data class Marks(val len: Double, val gap: Double, val w: Double)

  data class FocusText(val title: Int, val sub: Int, val kicker: Int)

  data class LiveText(val title: Int, val sub: Int)

  data class ShadowStep(val dx: Double, val dy: Double, val grow: Double, val color: Int, val a: Double, val stroke: Stroke?)

  /** A hard shadow: shapes painted in order under the cell. `inside` shrinks the visible body by the offset instead of growing the box. */
  data class Shadow(val inside: Boolean, val steps: List<ShadowStep>)

  data class Ticks(val every: Double, val majorEvery: Double, val minorH: Double, val majorH: Double, val w: Double, val color: Int, val capH: Double)

  data class Progress(
    val style: Style,
    val h: Double,
    val r: Double,
    val inset: Double,
    val bottom: Double,
    val track: Int,
    /** The fill: the row's accent mark when [fillAccent], else [fill]. */
    val fillAccent: Boolean,
    val fill: Int,
    val trackBorder: TrackBorder?,
    val remainPattern: Halftone?,
    val ticks: Ticks?,
  ) {
    enum class Style { NONE, BAR, BAND, TICKS }

    data class TrackBorder(val w: Double, val color: Int, val topOnly: Boolean)
  }

  /** A word that says a cell is live. `minCell` (design px) drops it on cells narrower than that. */
  sealed class StatusLabel {
    object None : StatusLabel()

    data class Plate(val text: String, val bg: Int, val fg: Int, val minCell: Double) : StatusLabel()

    data class Burst(val text: String, val bg: Int, val fg: Int, val outline: Int, val size: Double, val minCell: Double) : StatusLabel()

    data class Kicker(val live: String, val color: Int) : StatusLabel()
  }

  data class Gradient(val angle: Double, val stops: List<Pair<Int, Double>>)

  data class ArtLayout(val side: Boolean, val sideFrac: Double, val frameW: Double, val frameColor: Int, val placeholder: Gradient)

  data class Halftone(val pitch: Double, val dot: Double, val angle: Double, val color: Int)

  data class Grid(val minor: Double, val major: Double, val minorColor: Int, val majorColor: Int, val w: Double)

  data class Grain(val tile: Int, val texel: Int, val density: Double, val alpha: Double, val colors: List<Int>, val seed: Int)

  data class Patterns(val halftone: Halftone?, val grid: Grid?, val grain: Grain?)

  /** Two-ink misregistration: the listed roles and shapes are drawn twice, the back copy in [color], offset by (dx, dy) and multiplied. */
  data class Misregister(val dx: Double, val dy: Double, val color: Int, val text: Set<String>, val shapes: Set<String>)

  data class HeaderStyle(val bg: Int?, val rule: Rule?, val ruler: Ticks?, val squareMarker: Boolean)

  data class FeaturedPlate(val bg: Int, val borderW: Double, val borderColor: Int, val radius: Double, val shadow: PlateShadow?)

  data class PlateShadow(val dx: Double, val dy: Double, val color: Int)

  companion object {
    /** The top-level keys [parse] reads. */
    val KEYS = listOf(
      "typeStyle", "accentMode", "accentCycle", "rowBorderW", "railBg", "railFocus", "railBar", "railDivider", "railLayout",
      "circleStyle", "glyphStroke", "cellFocusBg", "focusText", "liveText", "cellBorderDash", "cellRule", "shadow", "shadowFocus",
      "highlight", "halo", "progress", "statusLabel", "art", "patterns", "misregister", "headerStyle", "featuredName",
      "featuredPlate", "favStroke", "liveBar",
    )

    private val ROLE_WEIGHTS = mapOf("title" to 600, "sub" to 400, "number" to 700, "name" to 400, "header" to 600, "day" to 600, "featured" to 700)

    private fun auroraRole(role: String) = TextStyle(Face.TEXT, ROLE_WEIGHTS.getValue(role), upper = false, track = 0.0, scale = 1.0, italic = false)

    /** Aurora: every field off. */
    val AURORA = GuideLook(
      type = TypeStyle(null, null, auroraRole("title"), auroraRole("sub"), auroraRole("number"), auroraRole("name"), auroraRole("header"), auroraRole("day"), auroraRole("featured")),
      accentMode = AccentMode.CHANNEL,
      accentCycle = null,
      rowBorderW = null,
      railBg = GuideColor.TRANSPARENT,
      railFocus = null,
      railBar = RailBar(4.0, 0.0, null),
      railDivider = null,
      railLayout = RailLayout.AURORA,
      circle = CircleStyle(0.5, 1.0, Spec(Spec.Kind.ACCENT, 0), Spec(Spec.Kind.ACCENT, 0), null, Spec(Spec.Kind.ACCENT, 0), null),
      glyphStroke = 2.0,
      cellFocusBg = null,
      focusText = null,
      liveText = null,
      cellBorderDash = null,
      cellRule = null,
      shadow = null,
      shadowFocus = null,
      highlight = null,
      halo = null,
      progress = Progress(
        Progress.Style.NONE, 8.0, 4.0, 20.0, 16.0, GuideColor.parse("rgba(148,163,184,0.18)"), fillAccent = true, fill = 0, trackBorder = null, remainPattern = null, ticks = null,
      ),
      statusLabel = StatusLabel.None,
      art = ArtLayout(
        side = false,
        sideFrac = 0.38,
        frameW = 0.0,
        frameColor = GuideColor.TRANSPARENT,
        placeholder = Gradient(135.0, listOf(GuideColor.parse("#f59e0b") to 0.0, GuideColor.parse("#db2777") to 0.5, GuideColor.parse("#4338ca") to 1.0)),
      ),
      patterns = Patterns(null, null, null),
      misregister = null,
      headerStyle = null,
      featuredName = null,
      featuredPlate = null,
      favStroke = null,
      ringOuterGap = 0.0,
      ringOuterDash = null,
      liveBarX = 3.0,
      liveBarInset = 10.0,
      liveBarColor = null,
    )

    /** Reads the look out of the whole `tokens` object. Anything absent or unreadable is Aurora's. */
    fun parse(o: JSONObject): GuideLook {
      val a = AURORA
      val ringOuter = o.optJSONObject("ringOuter")
      val liveBar = o.optJSONObject("liveBar")
      val cycle = o.optJSONArray("accentCycle")?.let { arr -> (0 until arr.length()).mapNotNull { (arr.opt(it) as? String)?.let(GuideColor::parse) } }?.takeIf { it.isNotEmpty() }
      return GuideLook(
        type = typeStyle(o.optJSONObject("typeStyle"), a.type),
        accentMode = when (o.opt("accentMode")) {
          "fixed" -> AccentMode.FIXED
          "cycle" -> AccentMode.CYCLE
          else -> AccentMode.CHANNEL
        },
        accentCycle = cycle,
        rowBorderW = nonNegative(o, "rowBorderW"),
        railBg = color(o, "railBg", a.railBg),
        railFocus = o.optJSONObject("railFocus")?.let { railFocus(it) },
        railBar = o.optJSONObject("railBar")?.let { RailBar(num(it, "w", a.railBar.w), num(it, "r", a.railBar.r), optColor(it, "color")) } ?: a.railBar,
        railDivider = o.optJSONObject("railDivider")?.let { rule(it) },
        railLayout = if (o.opt("railLayout") == "numeral") RailLayout.NUMERAL else RailLayout.AURORA,
        circle = circleStyle(o.optJSONObject("circleStyle"), a.circle),
        glyphStroke = positive(o, "glyphStroke", a.glyphStroke),
        cellFocusBg = optColor(o, "cellFocusBg"),
        focusText = o.optJSONObject("focusText")?.let { t -> text3(t)?.let { (title, sub, kicker) -> FocusText(title, sub, kicker) } },
        liveText = o.optJSONObject("liveText")?.let { t -> (optColor(t, "title") to optColor(t, "sub")).let { (title, sub) -> if (title != null && sub != null) LiveText(title, sub) else null } },
        cellBorderDash = dash(o.optJSONArray("cellBorderDash")),
        cellRule = o.optJSONObject("cellRule")?.let { r -> optColor(r, "color")?.let { c -> CellRule(num(r, "w", 0.0), c, num(r, "inset", 0.0)) } },
        shadow = shadow(o.optJSONObject("shadow")),
        shadowFocus = shadow(o.optJSONObject("shadowFocus")),
        highlight = o.optJSONObject("highlight")?.let { h -> optColor(h, "color")?.let { c -> Highlight(num(h, "w", 0.0), c) } },
        halo = o.optJSONArray("halo")?.let { arr ->
          (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }.mapNotNull { r ->
            (r.opt("color") as? String)?.let { c -> HaloRing(num(r, "w", 0.0), alpha(r, "a", 1.0), spec(c, Spec(Spec.Kind.ACCENT, 0), mapOf("accent" to Spec.Kind.ACCENT))) }
          }
        }?.takeIf { it.isNotEmpty() },
        progress = progress(o.optJSONObject("progress"), a.progress),
        statusLabel = statusLabel(o.optJSONObject("statusLabel")),
        art = art(o.optJSONObject("art"), a.art),
        patterns = patterns(o.optJSONObject("patterns")),
        misregister = o.optJSONObject("misregister")?.let { misregister(it) },
        headerStyle = o.optJSONObject("headerStyle")?.let { h ->
          HeaderStyle(optColor(h, "bg"), h.optJSONObject("rule")?.let { rule(it) }, h.optJSONObject("ruler")?.let { ticks(it) }, h.opt("markerShape") == "square")
        },
        featuredName = (o.opt("featuredName") as? String)?.takeIf { it != "accent" }?.let(GuideColor::parse),
        featuredPlate = o.optJSONObject("featuredPlate")?.let { p ->
          val border = p.optJSONObject("border")
          optColor(p, "bg")?.let { bg ->
            FeaturedPlate(
              bg,
              border?.let { num(it, "w", 0.0) } ?: 0.0,
              border?.let { color(it, "color", GuideColor.TRANSPARENT) } ?: GuideColor.TRANSPARENT,
              num(p, "radius", 0.0),
              p.optJSONObject("shadow")?.let { s -> optColor(s, "color")?.let { c -> PlateShadow(num(s, "dx", 0.0), num(s, "dy", 0.0), c) } },
            )
          }
        },
        favStroke = o.optJSONObject("favStroke")?.let { s -> optColor(s, "color")?.let { c -> Stroke(num(s, "w", 0.0), c) } },
        ringOuterGap = ringOuter?.let { num(it, "gap", 0.0) } ?: 0.0,
        ringOuterDash = ringOuter?.let { dash(it.optJSONArray("dash")) },
        liveBarX = liveBar?.let { num(it, "x", a.liveBarX) } ?: a.liveBarX,
        liveBarInset = liveBar?.let { num(it, "inset", a.liveBarInset) } ?: a.liveBarInset,
        liveBarColor = liveBar?.let { optColor(it, "color") },
      )
    }

    // -- readers: each returns Aurora's value for anything missing or of the wrong type --

    private fun color(o: JSONObject?, key: String, default: Int): Int = (o?.opt(key) as? String)?.let { GuideColor.parse(it) } ?: default

    private fun optColor(o: JSONObject?, key: String): Int? = (o?.opt(key) as? String)?.let { GuideColor.parse(it) }

    private fun num(o: JSONObject?, key: String, default: Double): Double {
      val v = (o?.opt(key) as? Number)?.toDouble() ?: return default
      return if (v.isFinite()) v else default
    }

    private fun nonNegative(o: JSONObject?, key: String): Double? = (o?.opt(key) as? Number)?.toDouble()?.takeIf { it.isFinite() && it >= 0 }

    private fun positive(o: JSONObject?, key: String, default: Double): Double = num(o, key, default).takeIf { it > 0 } ?: default

    private fun alpha(o: JSONObject?, key: String, default: Double): Double = num(o, key, default).coerceIn(0.0, 1.0)

    private fun dash(a: JSONArray?): Dash? {
      if (a == null || a.length() < 2) return null
      val on = (a.opt(0) as? Number)?.toDouble() ?: return null
      val off = (a.opt(1) as? Number)?.toDouble() ?: return null
      return if (on > 0 && off >= 0) Dash(on, off) else null
    }

    private fun rule(o: JSONObject): Rule? = optColor(o, "color")?.let { Rule(num(o, "w", 0.0), it) }

    private fun text3(o: JSONObject): Triple<Int, Int, Int>? {
      val title = optColor(o, "title") ?: return null
      val sub = optColor(o, "sub") ?: return null
      val kicker = optColor(o, "kicker") ?: return null
      return Triple(title, sub, kicker)
    }

    private fun railFocus(o: JSONObject): RailFocus? {
      val bg = optColor(o, "bg") ?: return null
      val number = optColor(o, "number") ?: return null
      val name = optColor(o, "name") ?: return null
      return RailFocus(bg, number, name, optColor(o, "circle"), optColor(o, "glyph"))
    }

    private fun role(o: JSONObject?, default: TextStyle): TextStyle {
      if (o == null) return default
      val weight = when (val w = o.opt("weight")) {
        is Number -> w.toInt()
        is String -> w.trim().toIntOrNull()
        else -> null
      }?.takeIf { it in 1..1000 } ?: default.weight
      return TextStyle(
        face = if (o.opt("font") == "display") Face.DISPLAY else Face.TEXT,
        weight = weight,
        upper = o.opt("case") == "upper",
        track = num(o, "track", default.track),
        scale = positive(o, "scale", default.scale),
        italic = o.opt("italic") == true,
      )
    }

    private fun family(o: JSONObject?): String? = (o?.opt("family") as? String)?.takeIf { it.isNotEmpty() }

    private fun typeStyle(o: JSONObject?, a: TypeStyle) = TypeStyle(
      displayFamily = family(o?.optJSONObject("display")),
      textFamily = family(o?.optJSONObject("text")),
      title = role(o?.optJSONObject("title"), a.title),
      sub = role(o?.optJSONObject("sub"), a.sub),
      number = role(o?.optJSONObject("number"), a.number),
      name = role(o?.optJSONObject("name"), a.name),
      header = role(o?.optJSONObject("header"), a.header),
      day = role(o?.optJSONObject("day"), a.day),
      featured = role(o?.optJSONObject("featured"), a.featured),
    )

    private fun spec(raw: Any?, default: Spec, words: Map<String, Spec.Kind>): Spec {
      val s = raw as? String ?: return default
      words[s]?.let { return Spec(it, 0) }
      return Spec(Spec.Kind.COLOR, GuideColor.parse(s))
    }

    private fun circleStyle(o: JSONObject?, a: CircleStyle): CircleStyle {
      if (o == null) return a
      val marks = o.optJSONObject("marks")?.let { m -> Marks(num(m, "len", 0.0), num(m, "gap", 0.0), num(m, "w", 0.0)) }
      return CircleStyle(
        radius = alpha(o, "radius", a.radius).coerceAtMost(0.5),
        scale = positive(o, "scale", a.scale),
        fill = spec(o.opt("fill"), a.fill, mapOf("accent" to Spec.Kind.ACCENT, "accent-solid" to Spec.Kind.ACCENT_SOLID, "none" to Spec.Kind.NONE)),
        border = spec(o.opt("border"), a.border, mapOf("accent" to Spec.Kind.ACCENT)),
        borderW = nonNegative(o, "borderW"),
        glyph = spec(o.opt("glyph"), a.glyph, mapOf("accent" to Spec.Kind.ACCENT, "auto" to Spec.Kind.AUTO)),
        marks = marks,
      )
    }

    private fun shadow(o: JSONObject?): Shadow? {
      val arr = o?.optJSONArray("steps") ?: return null
      val steps = (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }.mapNotNull { s ->
        optColor(s, "color")?.let { c ->
          ShadowStep(num(s, "dx", 0.0), num(s, "dy", 0.0), num(s, "grow", 0.0), c, alpha(s, "a", 1.0), s.optJSONObject("stroke")?.let { st -> optColor(st, "color")?.let { sc -> Stroke(num(st, "w", 0.0), sc) } })
        }
      }
      return if (steps.isEmpty()) null else Shadow(o.opt("inside") == true, steps)
    }

    private fun ticks(o: JSONObject) = Ticks(
      every = positive(o, "every", 5.0),
      majorEvery = positive(o, "majorEvery", 15.0),
      minorH = num(o, "minorH", 0.0),
      majorH = num(o, "majorH", 0.0),
      w = num(o, "w", 0.0),
      color = color(o, "color", GuideColor.WHITE),
      capH = num(o, "capH", 0.0),
    )

    private fun halftone(o: JSONObject?): Halftone? =
      o?.takeIf { it.opt("kind") == "halftone" }?.let { h -> optColor(h, "color")?.let { c -> Halftone(positive(h, "pitch", 22.0), num(h, "dot", 0.0), num(h, "angle", 45.0), c) } }

    private fun progress(o: JSONObject?, a: Progress): Progress {
      if (o == null) return a
      val fill = o.opt("fill") as? String
      val border = o.optJSONObject("trackBorder")
      return Progress(
        style = when (o.opt("style")) {
          "bar" -> Progress.Style.BAR
          "band" -> Progress.Style.BAND
          "ticks" -> Progress.Style.TICKS
          else -> Progress.Style.NONE
        },
        h = num(o, "h", a.h),
        r = num(o, "r", a.r),
        inset = num(o, "inset", a.inset),
        bottom = num(o, "bottom", a.bottom),
        track = color(o, "track", a.track),
        fillAccent = fill == null || fill == "accent",
        fill = if (fill == null || fill == "accent") 0 else GuideColor.parse(fill),
        trackBorder = border?.let { b -> optColor(b, "color")?.let { c -> Progress.TrackBorder(num(b, "w", 0.0), c, b.opt("sides") == "top") } },
        remainPattern = halftone(o.optJSONObject("remainPattern")),
        ticks = o.optJSONObject("ticks")?.let { ticks(it) },
      )
    }

    private fun statusLabel(o: JSONObject?): StatusLabel {
      if (o == null) return StatusLabel.None
      val text = o.opt("text") as? String ?: ""
      return when (o.opt("mode")) {
        "plate" -> StatusLabel.Plate(text, color(o, "bg", GuideColor.TRANSPARENT), color(o, "fg", GuideColor.WHITE), num(o, "minCell", 0.0))
        "burst" -> StatusLabel.Burst(text, color(o, "bg", GuideColor.TRANSPARENT), color(o, "fg", GuideColor.WHITE), color(o, "outline", GuideColor.TRANSPARENT), num(o, "size", 0.0), num(o, "minCell", 0.0))
        "kicker" -> StatusLabel.Kicker(o.opt("live") as? String ?: "", color(o, "color", GuideColor.WHITE))
        else -> StatusLabel.None
      }
    }

    private fun gradient(o: JSONObject?, default: Gradient): Gradient {
      val arr = o?.optJSONArray("stops") ?: return default
      val stops = (0 until arr.length()).mapNotNull { arr.optJSONArray(it) }.mapNotNull { s ->
        val c = (s.opt(0) as? String)?.let(GuideColor::parse) ?: return@mapNotNull null
        val at = (s.opt(1) as? Number)?.toDouble() ?: return@mapNotNull null
        c to at.coerceIn(0.0, 1.0)
      }
      return if (stops.size < 2) default else Gradient(num(o, "angle", default.angle), stops)
    }

    private fun art(o: JSONObject?, a: ArtLayout): ArtLayout {
      if (o == null) return a
      return ArtLayout(
        side = o.opt("layout") == "side",
        sideFrac = alpha(o, "sideFrac", a.sideFrac),
        frameW = num(o, "frameW", a.frameW),
        frameColor = color(o, "frameColor", a.frameColor),
        placeholder = gradient(o.optJSONObject("placeholder"), a.placeholder),
      )
    }

    /** The `patterns` token object (`{ "bg": ..., "overlay": ... }`) as [Patterns]. */
    internal fun parsePatterns(o: JSONObject?): Patterns = patterns(o)

    private fun patterns(o: JSONObject?): Patterns {
      val bg = o?.optJSONObject("bg")
      val grain = o?.optJSONObject("overlay")?.takeIf { it.opt("kind") == "grain" }?.let { g ->
        val colors = g.optJSONArray("colors")?.let { arr -> (0 until arr.length()).mapNotNull { (arr.opt(it) as? String)?.let(GuideColor::parse) } }.orEmpty()
        if (colors.isEmpty()) null else Grain(num(g, "tile", 128.0).toInt().coerceAtLeast(1), num(g, "texel", 2.0).toInt().coerceAtLeast(1), alpha(g, "density", 0.2), alpha(g, "alpha", 0.05), colors, num(g, "seed", 0.0).toInt())
      }
      val grid = bg?.takeIf { it.opt("kind") == "grid" }?.let { g -> Grid(positive(g, "minor", 32.0), positive(g, "major", 160.0), color(g, "minorColor", GuideColor.TRANSPARENT), color(g, "majorColor", GuideColor.TRANSPARENT), num(g, "w", 1.0)) }
      return Patterns(halftone(bg), grid, grain)
    }

    private fun misregister(o: JSONObject): Misregister? {
      val c = optColor(o, "color") ?: return null
      if (o.opt("blend") != "multiply") return null
      fun words(key: String) = o.optJSONArray(key)?.let { arr -> (0 until arr.length()).mapNotNull { arr.opt(it) as? String }.toSet() }.orEmpty()
      return Misregister(num(o, "dx", 0.0), num(o, "dy", 0.0), c, words("text"), words("shapes"))
    }
  }
}
