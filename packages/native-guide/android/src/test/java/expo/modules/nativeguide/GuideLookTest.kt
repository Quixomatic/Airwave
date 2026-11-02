package expo.modules.nativeguide

import expo.modules.nativeguide.GuideLook.AccentMode
import expo.modules.nativeguide.GuideLook.Face
import expo.modules.nativeguide.GuideLook.Progress
import expo.modules.nativeguide.GuideLook.Spec
import expo.modules.nativeguide.GuideLook.StatusLabel
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** What a theme adds to the look, as the painter reads it from the token JSON: each field group, and what an odd value does. */
class GuideLookTest {
  private fun look(json: String) = GuideLook.parse(JSONObject(json))

  private fun argb(css: String) = GuideColor.parse(css)

  @Test fun anEmptyObjectIsAurora() {
    assertEquals(GuideLook.AURORA, look("{}"))
  }

  @Test fun auroraIsEveryFieldOff() {
    val a = GuideLook.AURORA
    assertEquals(AccentMode.CHANNEL, a.accentMode)
    assertNull(a.accentCycle)
    assertNull(a.rowBorderW)
    assertEquals(GuideColor.TRANSPARENT, a.railBg)
    assertNull(a.railFocus)
    assertEquals(GuideLook.RailBar(4.0, 0.0, null), a.railBar)
    assertNull(a.railDivider)
    assertEquals(GuideLook.RailLayout.AURORA, a.railLayout)
    assertEquals(0.5, a.circle.radius, 0.0)
    assertEquals(Spec.Kind.ACCENT, a.circle.fill.kind)
    assertNull(a.circle.borderW)
    assertEquals(2.0, a.glyphStroke, 0.0)
    assertEquals(listOf(null, null, null, null, null, null, null, null), listOf(a.cellFocusBg, a.focusText, a.liveText, a.cellBorderDash, a.cellRule, a.shadow, a.shadowFocus, a.highlight))
    assertNull(a.halo)
    assertEquals(Progress.Style.NONE, a.progress.style)
    assertEquals(StatusLabel.None, a.statusLabel)
    assertEquals(false, a.art.side)
    assertEquals(GuideLook.Patterns(null, null, null), a.patterns)
    assertEquals(listOf(null, null, null, null, null), listOf(a.misregister, a.headerStyle, a.featuredName, a.featuredPlate, a.favStroke))
    assertEquals(0.0, a.ringOuterGap, 0.0)
    assertEquals(3.0, a.liveBarX, 0.0)
    assertEquals(10.0, a.liveBarInset, 0.0)
    assertNull(a.liveBarColor)
    // Every text role is the system font at the weight the rows have always used.
    assertNull(a.type.displayFamily)
    assertNull(a.type.textFamily)
    assertEquals(listOf(600, 400, 700, 400, 600, 600, 700), listOf(a.type.title, a.type.sub, a.type.number, a.type.name, a.type.header, a.type.day, a.type.featured).map { it.weight })
    assertEquals(listOf(1.0), listOf(a.type.title, a.type.sub, a.type.number, a.type.name, a.type.header, a.type.day, a.type.featured).map { it.scale }.distinct())
  }

  @Test fun typeStyleReadsTheFamiliesAndTheRolesAThemeChanges() {
    val l = look(
      """{"typeStyle": {"display": {"family": "Bangers"}, "text": {"family": "Comic Neue"},
          "title": {"font": "display", "weight": "800", "case": "upper", "track": 0.04, "scale": 1.2, "italic": false},
          "name": {"font": "text", "weight": 700, "italic": true}}}""",
    )
    val t = l.type
    assertEquals("Bangers", t.displayFamily)
    assertEquals("Comic Neue", t.textFamily)
    assertEquals(GuideLook.TextStyle(Face.DISPLAY, 800, upper = true, track = 0.04, scale = 1.2, italic = false), t.title)
    assertEquals("Bangers", t.family(t.title))
    assertEquals("Comic Neue", t.family(t.name))
    assertEquals(700, t.name.weight)
    assertTrue(t.name.italic)
    // A role the theme doesn't mention keeps Aurora's.
    assertEquals(GuideLook.AURORA.type.sub, t.sub)
    assertEquals(GuideLook.AURORA.type.featured, t.featured)
    // A bad weight, scale or family is Aurora's.
    val odd = look("""{"typeStyle": {"display": {"family": ""}, "title": {"weight": "bold", "scale": -2, "font": 3}}}""").type
    assertNull(odd.displayFamily)
    assertEquals(GuideLook.AURORA.type.title, odd.title)
  }

  @Test fun theAccentComesFromTheChannelTheFixedColorOrTheCycle() {
    assertEquals(AccentMode.FIXED, look("""{"accentMode": "fixed"}""").accentMode)
    val cycle = look("""{"accentMode": "cycle", "accentCycle": ["#e0161e", "#1f4fd8", 7, "#ffd91a"]}""")
    assertEquals(AccentMode.CYCLE, cycle.accentMode)
    assertEquals(listOf(argb("#e0161e"), argb("#1f4fd8"), argb("#ffd91a")), cycle.accentCycle) // the number is no color
    assertEquals(AccentMode.CHANNEL, look("""{"accentMode": "rainbow"}""").accentMode)
    assertNull(look("""{"accentCycle": []}""").accentCycle)
  }

  @Test fun theRailAndTheCircleReadTheirVariants() {
    val l = look(
      """{"railBg": "#ffffff", "rowBorderW": 4, "railLayout": "numeral",
          "railFocus": {"bg": "#ffe600", "number": "#000000", "name": "#000000", "circle": "#000000", "glyph": null},
          "railBar": {"w": 12, "r": 2, "color": "#0b0b0b"}, "railDivider": {"w": 4, "color": "#7a7a7a"}, "glyphStroke": 2.75,
          "circleStyle": {"radius": 0, "scale": 0.72, "fill": "accent-solid", "border": "#0d0d0d", "borderW": 3, "glyph": "auto",
                          "marks": {"len": 9, "gap": 4, "w": 1.6}}}""",
    )
    assertEquals(argb("#ffffff"), l.railBg)
    assertEquals(4.0, l.rowBorderW!!, 0.0)
    assertEquals(GuideLook.RailLayout.NUMERAL, l.railLayout)
    assertEquals(GuideLook.RailFocus(argb("#ffe600"), argb("#000000"), argb("#000000"), argb("#000000"), null), l.railFocus)
    assertEquals(GuideLook.RailBar(12.0, 2.0, argb("#0b0b0b")), l.railBar)
    assertEquals(GuideLook.Rule(4.0, argb("#7a7a7a")), l.railDivider)
    assertEquals(2.75, l.glyphStroke, 0.0)
    val c = l.circle
    assertEquals(0.0, c.radius, 0.0)
    assertEquals(0.72, c.scale, 0.0)
    assertEquals(Spec.Kind.ACCENT_SOLID, c.fill.kind)
    assertEquals(Spec(Spec.Kind.COLOR, argb("#0d0d0d")), c.border)
    assertEquals(3.0, c.borderW!!, 0.0)
    assertEquals(Spec.Kind.AUTO, c.glyph.kind)
    assertEquals(GuideLook.Marks(9.0, 4.0, 1.6), c.marks)
    // A circle fill may also be "none" or any color; the radius is held to a circle at most.
    assertEquals(Spec.Kind.NONE, look("""{"circleStyle": {"fill": "none"}}""").circle.fill.kind)
    assertEquals(0.5, look("""{"circleStyle": {"radius": 3}}""").circle.radius, 0.0)
    // A focused rail needs its three colors; without them it is not a theme's rail at all.
    assertNull(look("""{"railFocus": {"bg": "#ffe600"}}""").railFocus)
  }

  @Test fun aCellsFocusFillTextShadowsAndGlowAreRead() {
    val l = look(
      """{"cellFocusBg": "#202a3d", "focusText": {"title": "#fff", "sub": "#eee", "kicker": "#ddd"}, "liveText": {"title": "#000", "sub": "#111"},
          "cellBorderDash": [10, 7], "cellRule": {"w": 2.67, "color": "#1b1813", "inset": 8}, "highlight": {"color": "rgba(255,255,255,0.09)", "w": 1.33},
          "shadow": {"inside": true, "steps": [{"dx": 5, "dy": 5, "grow": 0, "color": "#121212", "a": 1},
                                              {"dx": 0, "dy": 0, "grow": 2, "color": "#fff", "a": 1, "stroke": {"color": "#121212", "w": 3.5}},
                                              {"dx": 1, "dy": 1, "grow": 0, "color": 5, "a": 1}]},
          "halo": [{"w": 4, "a": 0.3, "color": "accent"}, {"w": 8, "a": 0.12, "color": "#ffffff"}, {"w": 1, "a": 1, "color": 7}]}""",
    )
    assertEquals(argb("#202a3d"), l.cellFocusBg)
    assertEquals(GuideLook.FocusText(argb("#fff"), argb("#eee"), argb("#ddd")), l.focusText)
    assertEquals(GuideLook.LiveText(argb("#000"), argb("#111")), l.liveText)
    assertEquals(GuideLook.Dash(10.0, 7.0), l.cellBorderDash)
    assertEquals(GuideLook.CellRule(2.67, argb("#1b1813"), 8.0), l.cellRule)
    assertEquals(GuideLook.Highlight(1.33, argb("rgba(255,255,255,0.09)")), l.highlight)
    val shadow = l.shadow!!
    assertTrue(shadow.inside)
    assertEquals(2, shadow.steps.size) // the step with a number for a color is not a step
    assertEquals(GuideLook.ShadowStep(5.0, 5.0, 0.0, argb("#121212"), 1.0, null), shadow.steps[0])
    assertEquals(GuideLook.Stroke(3.5, argb("#121212")), shadow.steps[1].stroke)
    assertEquals(listOf(4.0, 8.0), l.halo?.map { it.w }) // the ring with a number for a color is dropped
    assertEquals(0.12, l.halo!![1].a, 0.0)
    assertEquals(Spec.Kind.ACCENT, l.halo!![0].color.kind) // the first ring takes the row's accent, the second is white
    assertEquals(Spec(Spec.Kind.COLOR, argb("#ffffff")), l.halo!![1].color)
    // Nothing readable is nothing: a dash needs two numbers, a shadow a step.
    assertNull(look("""{"cellBorderDash": [10]}""").cellBorderDash)
    assertNull(look("""{"shadow": {"inside": true, "steps": []}}""").shadow)
  }

  @Test fun progressTheLiveWordAndTheArtLayoutAreRead() {
    val bar = look("""{"progress": {"style": "bar", "h": 16, "r": 0, "inset": 20, "bottom": 14, "track": "#000000", "fill": "#ffffff", "trackBorder": {"w": 3, "color": "#ffffff"}}}""").progress
    assertEquals(Progress.Style.BAR, bar.style)
    assertEquals(16.0, bar.h, 0.0)
    assertEquals(false, bar.fillAccent)
    assertEquals(argb("#ffffff"), bar.fill)
    assertEquals(Progress.TrackBorder(3.0, argb("#ffffff"), topOnly = false), bar.trackBorder)
    val accent = look("""{"progress": {"style": "band", "fill": "accent", "trackBorder": {"w": 2, "color": "#000", "sides": "top"}, "remainPattern": {"kind": "halftone", "pitch": 20, "dot": 4, "angle": 45, "color": "#e0161e"}}}""").progress
    assertEquals(Progress.Style.BAND, accent.style)
    assertTrue(accent.fillAccent)
    assertTrue(accent.trackBorder!!.topOnly)
    assertEquals(GuideLook.Halftone(20.0, 4.0, 45.0, argb("#e0161e")), accent.remainPattern)
    assertEquals(argb("#eef6ff"), look("""{"progress": {"style": "ticks", "ticks": {"every": 5, "majorEvery": 15, "minorH": 8, "majorH": 15, "w": 1.6, "color": "#eef6ff", "capH": 20}}}""").progress.ticks?.color)

    assertEquals(StatusLabel.Plate("NOW", argb("#ffffff"), argb("#000000"), 420.0), look("""{"statusLabel": {"mode": "plate", "text": "NOW", "bg": "#ffffff", "fg": "#000000", "minCell": 420}}""").statusLabel)
    assertEquals(StatusLabel.Burst("NOW!", argb("#e0161e"), argb("#fff"), argb("#121212"), 78.0, 560.0), look("""{"statusLabel": {"mode": "burst", "text": "NOW!", "bg": "#e0161e", "fg": "#fff", "outline": "#121212", "size": 78, "minCell": 560}}""").statusLabel)
    assertEquals(StatusLabel.Kicker("ON NOW", argb("#b50d27")), look("""{"statusLabel": {"mode": "kicker", "live": "ON NOW", "color": "#b50d27"}}""").statusLabel)
    assertEquals(StatusLabel.None, look("""{"statusLabel": {"mode": "marquee"}}""").statusLabel)

    val art = look("""{"art": {"layout": "side", "sideFrac": 0.36, "frameW": 3, "frameColor": "#fff", "placeholder": {"angle": 90, "stops": [["#8a8a8a", 0], ["#2a2a2a", 1]]}}}""").art
    assertTrue(art.side)
    assertEquals(0.36, art.sideFrac, 0.0)
    assertEquals(GuideLook.Gradient(90.0, listOf(argb("#8a8a8a") to 0.0, argb("#2a2a2a") to 1.0)), art.placeholder)
    // A gradient with fewer than two stops is Aurora's.
    assertEquals(GuideLook.AURORA.art.placeholder, look("""{"art": {"placeholder": {"stops": [["#fff", 0]]}}}""").art.placeholder)
  }

  @Test fun texturesAndMisregistrationAreRead() {
    val l = look(
      """{"patterns": {"bg": {"kind": "halftone", "pitch": 22, "dot": 5, "angle": 45, "color": "#e0161e"},
                         "overlay": {"kind": "grain", "tile": 128, "texel": 2, "density": 0.2, "alpha": 0.075, "colors": ["#5a4a2a"], "seed": 11}},
          "misregister": {"dx": 3.5, "dy": 2.5, "color": "#ff48b0", "blend": "multiply", "text": ["number", "title"], "shapes": ["circle"]}}""",
    )
    assertEquals(GuideLook.Halftone(22.0, 5.0, 45.0, argb("#e0161e")), l.patterns.halftone)
    assertNull(l.patterns.grid)
    assertEquals(GuideLook.Grain(128, 2, 0.2, 0.075, listOf(argb("#5a4a2a")), 11), l.patterns.grain)
    assertEquals(GuideLook.Misregister(3.5, 2.5, argb("#ff48b0"), setOf("number", "title"), setOf("circle")), l.misregister)
    val grid = look("""{"patterns": {"bg": {"kind": "grid", "minor": 32, "major": 160, "minorColor": "rgba(12,63,148,0.08)", "majorColor": "rgba(12,63,148,0.17)", "w": 1.33}}}""").patterns
    assertEquals(GuideLook.Grid(32.0, 160.0, argb("rgba(12,63,148,0.08)"), argb("rgba(12,63,148,0.17)"), 1.33), grid.grid)
    assertNull(grid.halftone)
    // Grain without a color, and a blend other than multiply, are not read.
    assertNull(look("""{"patterns": {"overlay": {"kind": "grain", "colors": []}}}""").patterns.grain)
    assertNull(look("""{"misregister": {"dx": 1, "dy": 1, "color": "#fff", "blend": "screen"}}""").misregister)
  }

  @Test fun theHeaderAndTheFeaturedPanelStylesAreRead() {
    val h = look("""{"headerStyle": {"bg": "#ffd91a", "rule": {"w": 4, "color": "#121212"}, "ruler": {"every": 5, "majorEvery": 30, "minorH": 8, "majorH": 16, "w": 1.6, "color": "#eef6ff"}, "markerShape": "square"}}""").headerStyle!!
    assertEquals(argb("#ffd91a"), h.bg)
    assertEquals(GuideLook.Rule(4.0, argb("#121212")), h.rule)
    assertEquals(30.0, h.ruler!!.majorEvery, 0.0)
    assertTrue(h.squareMarker)
    assertNull(look("""{"headerStyle": {"bg": null, "rule": null, "ruler": null, "markerShape": "triangle"}}""").headerStyle!!.bg)
    assertEquals(argb("#ffe600"), look("""{"featuredName": "#ffe600"}""").featuredName)
    assertNull(look("""{"featuredName": "accent"}""").featuredName)
    val p = look("""{"featuredPlate": {"bg": "#fff", "border": {"w": 5, "color": "#121212"}, "radius": 0, "shadow": {"dx": 8, "dy": 8, "color": "#121212"}}}""").featuredPlate!!
    assertEquals(GuideLook.FeaturedPlate(argb("#fff"), 5.0, argb("#121212"), 0.0, GuideLook.PlateShadow(8.0, 8.0, argb("#121212"))), p)
    assertEquals(GuideLook.Stroke(3.5, argb("#000000")), look("""{"favStroke": {"color": "#000000", "w": 3.5}}""").favStroke)
  }

  @Test fun theOuterRingsGapAndDashesAndTheLiveBarsOffsetsAreRead() {
    val l = look("""{"ringOuter": {"color": "#ffffff", "gap": 3, "dash": [8, 5]}, "liveBar": {"x": 0, "inset": 0, "color": "#ffffff"}}""")
    assertEquals(3.0, l.ringOuterGap, 0.0)
    assertEquals(GuideLook.Dash(8.0, 5.0), l.ringOuterDash)
    assertEquals(0.0, l.liveBarX, 0.0)
    assertEquals(0.0, l.liveBarInset, 0.0)
    assertEquals(argb("#ffffff"), l.liveBarColor)
    // The ring's color itself is read by GuideTokens.
    assertEquals(argb("#ffffff"), GuideTokens.parse("""{"ringOuter": {"color": "#ffffff", "gap": 3, "dash": null}}""").ringOuter)
    assertNull(GuideTokens.parse("""{"ringOuter": null}""").ringOuter)
  }

  @Test fun theWrongTypeEverywhereIsAurora() {
    val l = look(
      """{"typeStyle": 3, "accentMode": 1, "accentCycle": "red", "rowBorderW": -2, "railBg": 5, "railFocus": "x", "railBar": [], "railDivider": 0,
          "railLayout": {}, "circleStyle": "round", "glyphStroke": "thick", "cellFocusBg": false, "focusText": 4, "liveText": null, "cellBorderDash": {},
          "cellRule": "r", "shadow": 9, "shadowFocus": [], "highlight": "h", "halo": {}, "progress": "p", "statusLabel": 3, "art": [], "patterns": 1,
          "misregister": "m", "headerStyle": 2, "featuredName": 7, "featuredPlate": "p", "favStroke": 1, "liveBar": "bar"}""",
    )
    assertEquals(GuideLook.AURORA, l)
  }
}
