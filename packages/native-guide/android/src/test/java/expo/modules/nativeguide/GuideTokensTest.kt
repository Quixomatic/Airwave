package expo.modules.nativeguide

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.lang.reflect.Modifier

/** The `tokens` prop: what the painter reads from the token JSON, and what it does with an incomplete or odd one. */
class GuideTokensTest {
  private val a = GuideTokens.AURORA

  private fun argb(hex: String) = GuideColor.parse(hex)

  private fun resource(name: String) = requireNotNull(javaClass.classLoader?.getResource(name)?.readText()) { "$name is missing from the test resources" }

  /** Every value the parsed tokens hold, by field name (reflection, so a field added later is covered without editing this). */
  private fun snapshot(t: GuideTokens): Map<String, Any?> =
    GuideTokens::class.java.declaredFields.filter { !Modifier.isStatic(it.modifiers) }.associate {
      it.isAccessible = true
      it.name to it.get(t)
    }

  @Test fun auroraHoldsTheStandardGuidesLiterals() {
    assertEquals(argb("#060a14"), a.railGround) // Aurora's rail has no color of its own: the guide's ground
    assertEquals(argb("rgba(148,163,184,0.12)"), a.rowBorder)
    assertEquals(argb("rgba(148,163,184,0.05)"), a.cellBg)
    assertEquals(GuideColor.TRANSPARENT, a.liveCellBg)
    assertEquals(argb("rgba(148,163,184,0.10)"), a.cellBorder)
    assertEquals(argb("#3b82f6"), a.ring)
    assertNull(a.ringOuter)
    assertEquals(0.32, a.liveElapsedA, 0.0)
    assertEquals(0.10, a.liveRemainA, 0.0)
    assertFalse(a.liveNeutral)
    assertEquals(argb("#f1f5f9"), a.title)
    assertEquals(600, a.titleWeight)
    assertEquals(argb("#94a3b8"), a.sub)
    assertEquals(0.12, a.railFocusA, 0.0)
    assertEquals(0.20, a.circleFillA, 0.0)
    assertEquals(0.35, a.circleBorderA, 0.0)
    assertEquals(argb("#c3c9d4"), a.heartOff)
    assertEquals(argb("#fb7185"), a.fav)
    assertEquals(argb("#94a3b8"), a.number)
    assertEquals(argb("#e6eaf1"), a.numberFocused)
    assertEquals(700, a.numberWeight)
    assertEquals(argb("#94a3b8"), a.name)
    assertEquals(0.0, a.accentShade, 0.0)
    assertNull(a.accentFixed)
    assertEquals(GuideColor.TRANSPARENT, a.logoPlate)
  }

  /** The tokens JS sends for Aurora (aurora-fixture.json, built by `rowTokens(AURORA)`): reading them gives Aurora back. */
  @Test fun theTokensJsSendsForAuroraAreAurora() {
    val sent = JSONObject(resource("aurora-fixture.json")).getJSONObject("tokens")
    assertEquals(snapshot(a), snapshot(GuideTokens.parse(sent.toString())))
  }

  private fun variants(): List<JSONObject> = JSONObject(resource("themes-fixture.json")).getJSONArray("variants").let { v -> (0 until v.length()).map { v.getJSONObject(it) } }

  private fun sentBy(theme: String, variant: String): JSONObject = variants().first { it.getString("theme") == theme && it.getString("variant") == variant }.getJSONObject("tokens")

  private fun tokens(theme: String, variant: String) = GuideTokens.parse(sentBy(theme, variant).toString())

  @Test fun theTokensJsSendsForEveryVariantAreReadBack() {
    val seen = variants().associate { "${it.getString("theme")}/${it.getString("variant")}" to GuideTokens.parse(it.getJSONObject("tokens").toString()) }
    assertEquals(28, seen.size)
    assertEquals(snapshot(a), snapshot(seen.getValue("aurora/default")))

    // Modern Light: ink ring on white cards, accents shaded toward the ink, a tinted live fill, hard shadows and a soft halo.
    val light = seen.getValue("modern/light")
    assertEquals(argb("#0f172a"), light.ring)
    assertEquals(argb("#0f172a"), light.title)
    assertEquals(0.5, light.accentShade, 0.0)
    assertNull(light.accentFixed)
    assertNull(light.ringOuter)
    assertFalse(light.liveNeutral)
    assertEquals(GuideLook.Progress.Style.BAR, light.look.progress.style)
    assertEquals(3, light.look.shadow?.steps?.size)
    assertEquals(2, light.look.shadowFocus?.steps?.size)
    assertEquals(2, light.look.halo?.size)
    assertEquals(argb("#ffffff"), light.look.cellFocusBg)
    assertNull(light.look.highlight)

    // High Contrast Signal: a white mark on every row, a neutral live fill, a double ring, a NOW tag and the Atkinson face.
    val hc = seen.getValue("high-contrast/signal")
    assertEquals(argb("#ffffff"), hc.ringOuter)
    assertEquals(argb("#ffffff"), hc.accentFixed)
    assertTrue(hc.liveNeutral)
    assertEquals(argb("#2e2e2e"), hc.liveElapsedColor)
    assertEquals(0, hc.liveRemainColor ushr 24) // nothing to the right of the now line
    assertEquals(700, hc.titleWeight)
    assertEquals(1.0, hc.circleBorderA, 0.0)
    assertEquals(GuideLook.AccentMode.FIXED, hc.look.accentMode)
    assertEquals(3.0, hc.look.ringOuterGap, 0.0)
    assertEquals("Atkinson Hyperlegible", hc.look.type.family(hc.look.type.title))
    assertEquals(700, hc.look.type.title.weight)
    assertEquals(GuideLook.Face.DISPLAY, hc.look.type.title.face)
    assertTrue(hc.look.statusLabel is GuideLook.StatusLabel.Plate)
    assertEquals("NOW", (hc.look.statusLabel as GuideLook.StatusLabel.Plate).text)
    assertEquals(argb("#ffffff"), hc.look.liveBarColor)
    assertEquals(0.0, hc.look.liveBarX, 0.0)
    assertEquals(true, hc.look.railFocus != null)
    assertEquals(true, hc.look.favStroke != null)
    assertEquals(true, hc.look.art.side)

    // Pop Art: row colors cycled by index, halftone dots behind the plates, a burst for the live word and the comic faces.
    val pop = seen.getValue("pop-art/sunny")
    assertEquals(GuideLook.AccentMode.CYCLE, pop.look.accentMode)
    assertEquals(3, pop.look.accentCycle?.size)
    assertNotNull(pop.look.patterns.halftone)
    assertTrue(pop.look.statusLabel is GuideLook.StatusLabel.Burst)
    assertEquals("Bangers", pop.look.type.displayFamily)
    assertEquals("Comic Neue", pop.look.type.textFamily)
    assertEquals(GuideLook.Progress.Style.BAND, pop.look.progress.style)
    assertEquals(true, pop.look.featuredPlate != null)

    // Risograph's grain and misregistration, Neo-Brutalist's numeral rail, Blueprint's dashes and ticks, Editorial's kicker and rule.
    val riso = seen.getValue("risograph/flamingo").look
    assertNotNull(riso.patterns.grain)
    assertEquals(setOf("circle", "ring"), riso.misregister?.shapes)
    assertEquals(setOf("number", "title", "featured", "header"), riso.misregister?.text)
    assertNull(riso.rowBorderW) // the stock hairline
    assertEquals(GuideLook.RailLayout.NUMERAL, seen.getValue("neo-brutalist/acid").look.railLayout)
    val blueprint = seen.getValue("blueprint/cyanotype").look
    assertEquals(GuideLook.Dash(10.0, 7.0), blueprint.cellBorderDash)
    assertEquals(GuideLook.Dash(8.0, 5.0), blueprint.ringOuterDash)
    assertEquals(GuideLook.Progress.Style.TICKS, blueprint.progress.style)
    assertNotNull(blueprint.progress.ticks)
    assertNotNull(blueprint.patterns.grid)
    assertNotNull(blueprint.circle.marks)
    val editorial = seen.getValue("editorial/newsprint").look
    assertTrue(editorial.statusLabel is GuideLook.StatusLabel.Kicker)
    assertNotNull(editorial.cellRule)
    assertNotNull(editorial.focusText)
    assertEquals("Fraunces", editorial.type.displayFamily)
    assertEquals("Source Sans 3", editorial.type.textFamily)
    assertEquals(GuideColor.TRANSPARENT, seen.getValue("swiss-poster/vermilion").cellBorder)
  }

  /** Every top-level key the parser reads is sent by JS for every variant, and JS sends nothing the parser ignores. */
  @Test fun jsSendsExactlyTheKeysTheParserReads() {
    for (v in variants()) {
      val sent = v.getJSONObject("tokens").keys().asSequence().toSet()
      val id = "${v.getString("theme")}/${v.getString("variant")}"
      assertEquals("$id: keys the painter reads but JS doesn't send", emptySet<String>(), GuideTokens.KEYS.toSet() - sent)
      assertEquals("$id: keys JS sends that nothing reads", emptySet<String>(), sent - GuideTokens.KEYS.toSet())
    }
  }

  /** The tokens JS sends for Aurora read back as the defaults the painter holds for them, field by field. */
  @Test fun theLookJsSendsForAuroraIsTheLookTheParserDefaultsTo() {
    assertEquals(GuideLook.AURORA, tokens("aurora", "default").look)
    assertEquals(GuideLook.AURORA, GuideLook.parse(JSONObject("{}")))
  }

  /**
   * Every value JS sends for the colors, alphas and weights changes what the parser reads: change each key (and each field inside the
   * objects) to a value the theme doesn't use and the parsed tokens must differ. A token the parser ignored would be a token that does
   * nothing. (What themes added is checked by [everyLookTokenJsSendsIsRead].)
   */
  @Test fun everyTokenJsSendsChangesWhatTheParserReads() {
    val themes = JSONObject(resource("themes-fixture.json")).getJSONArray("themes")
    val lookKeys = GuideLook.KEYS.toSet() + "ringOuter"
    for (t in 0 until themes.length()) {
      val theme = themes.getJSONObject(t)
      val sent = theme.getJSONObject("tokens")
      val base = snapshot(GuideTokens.parse(sent.toString()))
      for (key in sent.keys().asSequence().filter { it !in lookKeys }.toList()) {
        val v = sent.get(key)
        // A scalar is one probe; an object (liveFill, circle) is one per field, an array (artScrim) one per element.
        val probes: List<Pair<String, (JSONObject) -> Unit>> = when (v) {
          is JSONObject -> v.keys().asSequence().map { inner ->
            "$key.$inner" to { o: JSONObject -> o.getJSONObject(key).put(inner, otherThan(inner, o.getJSONObject(key).opt(inner))); Unit }
          }.toList()
          is JSONArray -> (0 until v.length()).map { i ->
            "$key[$i]" to { o: JSONObject -> o.getJSONArray(key).put(i, otherThan(key, o.getJSONArray(key).opt(i))); Unit }
          }
          else -> listOf(key to { o: JSONObject -> o.put(key, otherThan(key, o.opt(key))); Unit })
        }
        for ((name, change) in probes) {
          val changed = JSONObject(sent.toString())
          change(changed)
          assertNotEquals("${theme.getString("id")}: changing `$name` changes nothing the painter reads", base, snapshot(GuideTokens.parse(changed.toString())))
        }
      }
    }
  }

  /**
   * What themes added: for every variant, changing any one value it sets (anywhere in the object, down to the leaves) changes the
   * tokens the parser reads. A number moves a quarter, a color becomes another, a flag flips, and a word or an array is taken out. A value
   * that is the same as Aurora's, or the default word or zero an absent field reads as, is left out (changing it would not show),
   * so this finds a key the parser does not read but cannot find one that merely repeats a default. Arrays are read whole.
   */
  @Test fun everyLookTokenJsSendsIsRead() {
    val aurora = sentBy("aurora", "default")
    val lookKeys = GuideLook.KEYS.toSet() + "ringOuter"
    // The words, zeros and nulls that are what an absent field reads as.
    fun isDefaultish(v: Any?) = v == null || v == JSONObject.NULL || v == false || v == 0 || v == 0.0 || v == "" || v in setOf("none", "aurora", "channel", "text", "full", "transparent", "accent", "triangle")
    fun same(v: Any?, r: Any?) = when {
      v is JSONArray && r is JSONArray -> v.toString() == r.toString()
      v is Number && r is Number -> v.toDouble() == r.toDouble()
      else -> v == r
    }
    val colorLike = Regex("^(#[0-9a-fA-F]{3,8}|rgba?\\(.*\\))$")
    var probed = 0
    for (variant in variants()) {
      val id = "${variant.getString("theme")}/${variant.getString("variant")}"
      val full = variant.getJSONObject("tokens")
      val base = snapshot(GuideTokens.parse(full.toString()))
      fun walk(o: JSONObject, ref: JSONObject?, path: List<String>) {
        for (k in o.keys().asSequence().toList()) {
          val v = o.get(k)
          val r = ref?.opt(k)
          val here = path + k
          if (here.size == 1 && here[0] !in lookKeys) continue
          if (v is JSONObject) {
            walk(v, r as? JSONObject, here)
            continue
          }
          if (same(v, r) || isDefaultish(v)) continue
          val changed = JSONObject(full.toString())
          var holder = changed
          for (step in path) holder = holder.getJSONObject(step)
          when {
            v is Number -> holder.put(k, v.toDouble() - 0.25)
            v is Boolean -> holder.put(k, !v)
            v is String && colorLike.matches(v) -> holder.put(k, if (v == "#010203") "#040506" else "#010203")
            else -> holder.remove(k)
          }
          probed++
          assertNotEquals("$id: changing `${here.joinToString(".")}` changes nothing the painter reads", base, snapshot(GuideTokens.parse(changed.toString())))
        }
      }
      walk(full, aurora, emptyList())
    }
    assertTrue("only $probed values probed", probed > 400)
  }

  /** A value for `key` that differs from `old` and is of a kind the parser accepts there. */
  private fun otherThan(key: String, old: Any?): Any = when {
    key == "mode" -> if (old == "neutral") "tint" else "neutral"
    key.endsWith("Weight") -> if (old == "300") "400" else "300"
    old is Number -> if (old.toDouble() == 0.5) 0.25 else 0.5
    // A color, an absent color (null) or a neutral fill's color: anything but what it already is.
    else -> if (old == "#010203") "#040506" else "#010203"
  }

  @Test fun aPartialObjectKeepsAurorasValuesForTheRest() {
    val t = GuideTokens.parse("""{"ring": "#112233", "titleWeight": "700"}""")
    assertEquals(argb("#112233"), t.ring)
    assertEquals(700, t.titleWeight)
    assertEquals(a.title, t.title)
    assertEquals(a.cellBg, t.cellBg)
    assertEquals(a.liveElapsedA, t.liveElapsedA, 0.0)
  }

  @Test fun anEmptyObjectIsAurora() {
    assertEquals(snapshot(a), snapshot(GuideTokens.parse("{}")))
  }

  @Test fun theWrongTypeKeepsTheDefault() {
    val t = GuideTokens.parse(
      """{"ring": 5, "title": null, "liveFill": {"elapsed": "x", "remain": null}, "circle": 3, "titleWeight": true, "numberWeight": {},
          "ringOuter": 4, "accentFixed": [], "accentShade": "lots"}""",
    )
    assertEquals(a.ring, t.ring)
    assertEquals(a.title, t.title)
    assertEquals(a.liveElapsedA, t.liveElapsedA, 0.0)
    assertEquals(a.liveRemainA, t.liveRemainA, 0.0)
    assertEquals(a.circleFillA, t.circleFillA, 0.0)
    assertEquals(a.titleWeight, t.titleWeight)
    assertEquals(a.numberWeight, t.numberWeight)
    assertNull(t.ringOuter)
    assertNull(t.accentFixed)
    assertEquals(0.0, t.accentShade, 0.0)
  }

  @Test fun theNowColorIsAurorasUnlessTheThemeSetsOne() {
    // It marks "now" on a dimension line's progress; Aurora's is the red of the time header's marker.
    assertEquals(argb("#ef4444"), a.now)
    assertEquals(argb("#ffe27a"), GuideTokens.parse("""{"now": "#ffe27a"}""").now)
    assertEquals(a.now, GuideTokens.parse("""{"now": 7}""").now)
    assertEquals(a.now, GuideTokens.parse("""{"now": null}""").now)
  }

  @Test fun theLooksDefaultsStandInForEveryFieldAThemeLeavesOut() {
    // A theme that sets only its colors still has a text style, an unscaled round circle, no status label and no textures.
    val t = GuideTokens.parse("""{"cellBg": "#101010", "railLayout": "numeral"}""")
    assertEquals(GuideLook.RailLayout.NUMERAL, t.look.railLayout)
    assertEquals(GuideLook.AURORA.type, t.look.type)
    assertEquals(GuideLook.AURORA.circle, t.look.circle)
    assertEquals(GuideLook.StatusLabel.None, t.look.statusLabel)
    assertEquals(GuideLook.Patterns(null, null, null), t.look.patterns)
    assertEquals(GuideLook.AURORA.progress, t.look.progress)
    // A status label that names its mode but little else reads with a transparent plate and white text, not an unreadable one.
    val plate = GuideTokens.parse("""{"statusLabel": {"mode": "plate", "text": "NOW"}}""").look.statusLabel as GuideLook.StatusLabel.Plate
    assertEquals("NOW", plate.text)
    assertEquals(GuideColor.TRANSPARENT, plate.bg)
    assertEquals(GuideColor.WHITE, plate.fg)
    assertEquals(0.0, plate.minCell, 0.0)
    // A kicker names its word and color; a burst its size.
    val kicker = GuideTokens.parse("""{"statusLabel": {"mode": "kicker", "live": "ON NOW", "color": "#b50d27"}}""").look.statusLabel as GuideLook.StatusLabel.Kicker
    assertEquals("ON NOW", kicker.live)
    assertEquals(argb("#b50d27"), kicker.color)
    val burst = GuideTokens.parse("""{"statusLabel": {"mode": "burst", "text": "NOW!", "size": 78, "minCell": 560}}""").look.statusLabel as GuideLook.StatusLabel.Burst
    assertEquals(78.0, burst.size, 0.0)
    assertEquals(560.0, burst.minCell, 0.0)
    // A mode it does not know is no label.
    assertEquals(GuideLook.StatusLabel.None, GuideTokens.parse("""{"statusLabel": {"mode": "ticker"}}""").look.statusLabel)
  }

  @Test fun weightsReadAsCssStringsOrNumbers() {
    assertEquals(500, GuideTokens.parse("""{"titleWeight": "500"}""").titleWeight)
    assertEquals(800, GuideTokens.parse("""{"titleWeight": 800}""").titleWeight)
    assertEquals(600, GuideTokens.parse("""{"titleWeight": "bold"}""").titleWeight) // not a number: default
    assertEquals(600, GuideTokens.parse("""{"titleWeight": 0}""").titleWeight)
    assertEquals(600, GuideTokens.parse("""{"titleWeight": 5000}""").titleWeight)
  }

  @Test fun alphasAreHeldInsideZeroToOne() {
    val t = GuideTokens.parse("""{"railFocusAlpha": 3, "circle": {"fillA": -1, "borderA": 0.5}, "liveFill": {"elapsed": 1.5, "remain": 0}, "accentShade": 2}""")
    assertEquals(1.0, t.railFocusA, 0.0)
    assertEquals(0.0, t.circleFillA, 0.0)
    assertEquals(0.5, t.circleBorderA, 0.0)
    assertEquals(1.0, t.liveElapsedA, 0.0)
    assertEquals(0.0, t.liveRemainA, 0.0)
    assertEquals(1.0, t.accentShade, 0.0)
  }

  @Test fun anUnreadableColorIsWhiteSoItStaysVisible() {
    assertEquals(GuideColor.WHITE, GuideTokens.parse("""{"ring": "not a color"}""").ring)
    assertEquals(GuideColor.WHITE, GuideTokens.parse("""{"ringOuter": "nope"}""").ringOuter)
  }

  @Test fun aNeutralFillReadsItsTwoColorsAndATintedOneItsTwoAlphas() {
    val neutral = GuideTokens.parse("""{"liveFill": {"mode": "neutral", "elapsed": "#2e2e2e", "remain": "rgba(46,46,46,0)"}}""")
    assertTrue(neutral.liveNeutral)
    assertEquals(argb("#2e2e2e"), neutral.liveElapsedColor)
    assertEquals(0, neutral.liveRemainColor ushr 24)
    // Numbers in a neutral fill, or strings in a tinted one, are the wrong kind: the defaults.
    val odd = GuideTokens.parse("""{"liveFill": {"mode": "neutral", "elapsed": 0.5, "remain": 0.2}}""")
    assertTrue(odd.liveNeutral)
    assertEquals(GuideColor.TRANSPARENT, odd.liveElapsedColor)
    val tint = GuideTokens.parse("""{"liveFill": {"mode": "tint", "elapsed": 0.22, "remain": 0.07}}""")
    assertFalse(tint.liveNeutral)
    assertEquals(0.22, tint.liveElapsedA, 0.0)
    assertEquals(0.07, tint.liveRemainA, 0.0)
    // An unknown mode is a tint.
    assertFalse(GuideTokens.parse("""{"liveFill": {"mode": "stripes", "elapsed": 0.5, "remain": 0.5}}""").liveNeutral)
  }

  @Test fun theMarkIsTheAccentUnlessAThemeShadesOrFixesIt() {
    val accent = argb("#5b8fd6")
    assertEquals(accent, a.mark(accent))
    // Shaded toward the title color (the ink of a light theme).
    val shaded = GuideTokens.parse("""{"title": "#1d2430", "accentShade": 0.5}""")
    assertEquals(argb("#3c5a83"), shaded.mark(accent))
    // A fixed color wins over a shade.
    val fixed = GuideTokens.parse("""{"title": "#1d2430", "accentShade": 0.5, "accentFixed": "#ffffff"}""")
    assertEquals(argb("#ffffff"), fixed.mark(accent))
    assertEquals(argb("#ffffff"), fixed.mark(argb("#d05a52")))
    // A shade of zero leaves the accent as it is; a shade of one is the title color.
    assertEquals(accent, GuideTokens.parse("""{"accentShade": 0}""").mark(accent))
    assertEquals(argb("#1d2430"), GuideTokens.parse("""{"title": "#1d2430", "accentShade": 1}""").mark(accent))
  }

  @Test fun malformedJsonThrows() {
    assertThrows(JSONException::class.java) { GuideTokens.parse("{") }
    assertThrows(JSONException::class.java) { GuideTokens.parse("") }
  }
}
