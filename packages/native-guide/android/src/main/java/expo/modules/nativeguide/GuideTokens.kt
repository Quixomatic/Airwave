package expo.modules.nativeguide

import org.json.JSONObject

/**
 * The look of the Aurora rows as the painter reads it: colors, accent alphas and font weights. JS builds this object from
 * the same token set the React Native rows draw with (tv-native `features/guide/native-rows-geo.ts` `rowTokens`), so both
 * renderers take their values from one place. Widths, radii and sizes are not tokens here: they depend on the screen, so
 * JS resolves them to dp and sends them in `geo` (see [GuideGeo]).
 *
 * Colors are CSS strings ([GuideColor.parse]); a missing or unreadable field keeps Aurora's own value, so a partial token
 * object never leaves a row invisible. No Android imports: unit-tested on the JVM.
 */
class GuideTokens private constructor(
  /** The 1 dp rule above each row. */
  val rowBorder: Int,
  /** A cell that isn't on now. */
  val cellBg: Int,
  /** The on-now cell, under its progress tint. */
  val liveCellBg: Int,
  val cellBorder: Int,
  /** The selected cell's outline, and the rail circle's border while the rail has focus. */
  val ring: Int,
  /** Accent alphas of the on-now cell's tint: left of the now line, and right of it. */
  val liveElapsedA: Double,
  val liveRemainA: Double,
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
  /** Over a program's art, left to right: the two ends of the scrim (translucent colors of one hue). */
  val artScrimStart: Int,
  val artScrimEnd: Int,
  /** A program's title and sub-line over its art. */
  val artTitle: Int,
  val artSub: Int,
) {
  companion object {
    /** The standard guide: the values the React Native rows used before they read tokens. */
    val AURORA = GuideTokens(
      rowBorder = GuideColor.parse("rgba(148,163,184,0.12)"),
      cellBg = GuideColor.parse("rgba(148,163,184,0.05)"),
      liveCellBg = GuideColor.TRANSPARENT,
      cellBorder = GuideColor.parse("rgba(148,163,184,0.10)"),
      ring = GuideColor.parse("#3b82f6"),
      liveElapsedA = 0.32,
      liveRemainA = 0.10,
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
      artScrimStart = GuideColor.parse("rgba(6,10,20,0.88)"),
      artScrimEnd = GuideColor.parse("rgba(6,10,20,0.8)"),
      artTitle = GuideColor.parse("#f1f5f9"),
      artSub = GuideColor.parse("#e6ebf2"),
    )

    /** Reads the `tokens` prop. Anything that isn't valid JSON throws (the view reports it and the guide falls back). */
    fun parse(json: String): GuideTokens {
      val o = JSONObject(json)
      val a = AURORA
      val liveFill = o.optJSONObject("liveFill")
      val circle = o.optJSONObject("circle")
      val scrim = o.optJSONArray("artScrim")
      return GuideTokens(
        rowBorder = color(o, "rowBorder", a.rowBorder),
        cellBg = color(o, "cellBg", a.cellBg),
        liveCellBg = color(o, "liveCellBg", a.liveCellBg),
        cellBorder = color(o, "cellBorder", a.cellBorder),
        ring = color(o, "ring", a.ring),
        liveElapsedA = alpha(liveFill, "elapsed", a.liveElapsedA),
        liveRemainA = alpha(liveFill, "remain", a.liveRemainA),
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
        artScrimStart = (scrim?.opt(0) as? String)?.let { GuideColor.parse(it) } ?: a.artScrimStart,
        artScrimEnd = (scrim?.opt(1) as? String)?.let { GuideColor.parse(it) } ?: a.artScrimEnd,
        artTitle = color(o, "artTitle", a.artTitle),
        artSub = color(o, "artSub", a.artSub),
      )
    }

    private fun color(o: JSONObject, key: String, default: Int): Int = (o.opt(key) as? String)?.let { GuideColor.parse(it) } ?: default

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
