package expo.modules.nativeguide

import org.json.JSONObject

/**
 * The look of the Aurora rows as the painter reads it: colors, accent alphas and font weights, and (in [look]) everything a
 * theme adds to that. JS builds this object from
 * the same token set the React Native rows draw with (tv-native `features/guide/native-rows-geo.ts` `rowTokens`), so both
 * renderers take their values from one place. Widths, radii and sizes are not tokens here: they depend on the screen, so
 * JS resolves them to dp and sends them in `geo` (see [GuideGeo]).
 *
 * Colors are CSS strings ([GuideColor.parse]); a missing or unreadable field keeps Aurora's own value, so a partial token
 * object never leaves a row invisible. No Android imports: unit-tested on the JVM.
 */
class GuideTokens private constructor(
  /** The opaque color a channel's rail sits on: the rail's own color laid over the guide's ground. What the circle's `auto` glyph ink is
   *  decided against, as the React Native rows do (`circleColors`' `under`). */
  val railGround: Int,
  /** The 1 dp rule above each row. */
  val rowBorder: Int,
  /** A cell that isn't on now. */
  val cellBg: Int,
  /** The on-now cell, under its progress tint. */
  val liveCellBg: Int,
  val cellBorder: Int,
  /** The selected cell's outline, and the rail circle's border while the rail has focus. */
  val ring: Int,
  /** A second outline just outside the selected cell's ring (a double ring), or null for none. Its width is `geo.ringOuterW`; its gap and dashes are in [look]. */
  val ringOuter: Int?,
  /** Accent alphas of the on-now cell's tint: left of the now line, and right of it. */
  val liveElapsedA: Double,
  val liveRemainA: Double,
  /** A neutral on-now fill: [liveElapsedColor] and [liveRemainColor] are the colors left and right of the now line, the same
   *  on every row, and the accent alphas above are not used. Otherwise the fill is the row's accent at those alphas. */
  val liveNeutral: Boolean,
  val liveElapsedColor: Int,
  val liveRemainColor: Int,
  val title: Int,
  val titleWeight: Int,
  val sub: Int,
  /** Accent alpha of the focused rail's background. */
  val railFocusA: Double,
  /** Accent alphas of the rail circle's fill and border. */
  val circleFillA: Double,
  val circleBorderA: Double,
  /** The heart's outline when the channel is not a favorite, and the favorite heart's color. */
  val heartOff: Int,
  val fav: Int,
  val number: Int,
  val numberFocused: Int,
  val numberWeight: Int,
  val name: Int,
  /** How far a row's accent moves toward [title] where it is drawn as a mark rather than a tint (0..1), and a fixed color for
   *  those marks in place of the accent, or null. See [mark]. */
  val accentShade: Double,
  val accentFixed: Int?,
  /** The plate painted behind a channel's logo so a white or light logo stays visible; transparent for none. */
  val logoPlate: Int,
  /** The "now" color: the tick that marks now on a dimension-line progress bar (the time header's marker, in JS, is the same color). */
  val now: Int,
  /** Over a program's art, left to right: the two ends of the scrim (translucent colors of one hue). */
  val artScrimStart: Int,
  val artScrimEnd: Int,
  /** A program's title and sub-line over its art. */
  val artTitle: Int,
  val artSub: Int,
  /** What themes added: typefaces, rail and circle variants, shadows, progress, textures and the rest. See [GuideLook]. */
  val look: GuideLook,
) {
  /**
   * The color a row's accent is drawn in where it is a mark rather than a tint: the channel glyph, the on-now and focused-rail
   * bars and the rail circle's border. Tints (the circle's fill, the rail's focus wash, a tinted live fill) use the raw
   * accent at their alphas. Mirrors tv-native's `accentFg`: the fixed color if the theme has one, else the accent moved
   * toward the title color by the shade, else the accent as it is.
   */
  fun mark(accent: Int): Int {
    accentFixed?.let { return it }
    return if (accentShade > 0.0) GuideColor.mix(accent, title, accentShade) else accent
  }

  companion object {
    /** The top-level keys [parse] reads: JS has to send every one (and nothing the painter would ignore). */
    val KEYS = listOf(
      "railGround", "rowBorder", "cellBg", "liveCellBg", "cellBorder", "ring", "ringOuter", "liveFill",
      "title", "titleWeight", "sub", "railFocusAlpha", "circle", "heartOff", "fav",
      "number", "numberFocused", "numberWeight", "name", "accentShade", "accentFixed", "logoPlate", "now",
      "artScrim", "artTitle", "artSub",
    ) + GuideLook.KEYS

    /** The standard guide: the values the React Native rows used before they read tokens. */
    val AURORA = GuideTokens(
      railGround = GuideColor.parse("#060a14"),
      rowBorder = GuideColor.parse("rgba(148,163,184,0.12)"),
      cellBg = GuideColor.parse("rgba(148,163,184,0.05)"),
      liveCellBg = GuideColor.TRANSPARENT,
      cellBorder = GuideColor.parse("rgba(148,163,184,0.10)"),
      ring = GuideColor.parse("#3b82f6"),
      ringOuter = null,
      liveElapsedA = 0.32,
      liveRemainA = 0.10,
      liveNeutral = false,
      liveElapsedColor = GuideColor.TRANSPARENT,
      liveRemainColor = GuideColor.TRANSPARENT,
      title = GuideColor.parse("#f1f5f9"),
      titleWeight = 600,
      sub = GuideColor.parse("#94a3b8"),
      railFocusA = 0.12,
      circleFillA = 0.20,
      circleBorderA = 0.35,
      heartOff = GuideColor.parse("#c3c9d4"),
      fav = GuideColor.parse("#fb7185"),
      number = GuideColor.parse("#94a3b8"),
      numberFocused = GuideColor.parse("#e6eaf1"),
      numberWeight = 700,
      name = GuideColor.parse("#94a3b8"),
      accentShade = 0.0,
      accentFixed = null,
      logoPlate = GuideColor.TRANSPARENT,
      now = GuideColor.parse("#ef4444"),
      artScrimStart = GuideColor.parse("rgba(6,10,20,0.88)"),
      artScrimEnd = GuideColor.parse("rgba(6,10,20,0.8)"),
      artTitle = GuideColor.parse("#f1f5f9"),
      artSub = GuideColor.parse("#e6ebf2"),
      look = GuideLook.AURORA,
    )

    /** Reads the `tokens` prop. Anything that isn't valid JSON throws (the view reports it and the guide falls back). */
    fun parse(json: String): GuideTokens {
      val o = JSONObject(json)
      val a = AURORA
      val liveFill = o.optJSONObject("liveFill")
      val circle = o.optJSONObject("circle")
      val neutral = liveFill?.opt("mode") == "neutral"
      val scrim = o.optJSONArray("artScrim")
      return GuideTokens(
        railGround = color(o, "railGround", a.railGround),
        rowBorder = color(o, "rowBorder", a.rowBorder),
        cellBg = color(o, "cellBg", a.cellBg),
        liveCellBg = color(o, "liveCellBg", a.liveCellBg),
        cellBorder = color(o, "cellBorder", a.cellBorder),
        ring = color(o, "ring", a.ring),
        ringOuter = ringOuterColor(o),
        liveElapsedA = alpha(liveFill, "elapsed", a.liveElapsedA),
        liveRemainA = alpha(liveFill, "remain", a.liveRemainA),
        liveNeutral = neutral,
        liveElapsedColor = if (neutral) colorIn(liveFill, "elapsed", a.liveElapsedColor) else a.liveElapsedColor,
        liveRemainColor = if (neutral) colorIn(liveFill, "remain", a.liveRemainColor) else a.liveRemainColor,
        title = color(o, "title", a.title),
        titleWeight = weight(o, "titleWeight", a.titleWeight),
        sub = color(o, "sub", a.sub),
        railFocusA = alpha(o, "railFocusAlpha", a.railFocusA),
        circleFillA = alpha(circle, "fillA", a.circleFillA),
        circleBorderA = alpha(circle, "borderA", a.circleBorderA),
        heartOff = color(o, "heartOff", a.heartOff),
        fav = color(o, "fav", a.fav),
        number = color(o, "number", a.number),
        numberFocused = color(o, "numberFocused", a.numberFocused),
        numberWeight = weight(o, "numberWeight", a.numberWeight),
        name = color(o, "name", a.name),
        accentShade = alpha(o, "accentShade", a.accentShade),
        accentFixed = optionalColor(o, "accentFixed"),
        logoPlate = color(o, "logoPlate", a.logoPlate),
        now = color(o, "now", a.now),
        artScrimStart = (scrim?.opt(0) as? String)?.let { GuideColor.parse(it) } ?: a.artScrimStart,
        artScrimEnd = (scrim?.opt(1) as? String)?.let { GuideColor.parse(it) } ?: a.artScrimEnd,
        artTitle = color(o, "artTitle", a.artTitle),
        artSub = color(o, "artSub", a.artSub),
        look = GuideLook.parse(o),
      )
    }

    /** The outer ring's color. JS sends `ringOuter` as `{ color, gap, dash }` or null; a bare color string reads as the color too. */
    private fun ringOuterColor(o: JSONObject): Int? = when (val v = o.opt("ringOuter")) {
      is String -> GuideColor.parse(v)
      is JSONObject -> optionalColor(v, "color")
      else -> null
    }

    private fun color(o: JSONObject, key: String, default: Int): Int = (o.opt(key) as? String)?.let { GuideColor.parse(it) } ?: default

    private fun colorIn(o: JSONObject?, key: String, default: Int): Int = (o?.opt(key) as? String)?.let { GuideColor.parse(it) } ?: default

    /** A color that may be absent: JSON null, a missing key or the wrong type all mean none. */
    private fun optionalColor(o: JSONObject, key: String): Int? = (o.opt(key) as? String)?.let { GuideColor.parse(it) }

    private fun alpha(o: JSONObject?, key: String, default: Double): Double {
      val v = (o?.opt(key) as? Number)?.toDouble() ?: return default
      return if (v.isFinite()) v.coerceIn(0.0, 1.0) else default
    }

    /** A font weight, as CSS writes it ("600") or as a number; outside 1..1000 keeps the default. */
    private fun weight(o: JSONObject, key: String, default: Int): Int {
      val w = when (val v = o.opt(key)) {
        is Number -> v.toInt()
        is String -> v.trim().toIntOrNull()
        else -> null
      }
      return if (w != null && w in 1..1000) w else default
    }
  }
}
