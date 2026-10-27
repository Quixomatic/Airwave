package expo.modules.nativeguide

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.lang.reflect.Modifier

/** The `tokens` prop: what the painter reads from the token JSON, and what it does with an incomplete or odd one. */
class GuideTokensTest {
  private val a = GuideTokens.AURORA

  private fun argb(hex: String) = GuideColor.parse(hex)

  /** Every value the parsed tokens hold, by field name (reflection, so a field added later is covered without editing this). */
  private fun snapshot(t: GuideTokens): Map<String, Any?> =
    GuideTokens::class.java.declaredFields.filter { !Modifier.isStatic(it.modifiers) }.associate {
      it.isAccessible = true
      it.name to it.get(t)
    }

  @Test fun auroraHoldsTheStandardGuidesLiterals() {
    assertEquals(argb("rgba(148,163,184,0.12)"), a.rowBorder)
    assertEquals(argb("rgba(148,163,184,0.05)"), a.cellBg)
    assertEquals(GuideColor.TRANSPARENT, a.liveCellBg)
    assertEquals(argb("rgba(148,163,184,0.10)"), a.cellBorder)
    assertEquals(argb("#3b82f6"), a.ring)
    assertEquals(0.32, a.liveElapsedA, 0.0)
    assertEquals(0.10, a.liveRemainA, 0.0)
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
    assertEquals(argb("rgba(6,10,20,0.88)"), a.artScrimStart)
    assertEquals(argb("rgba(6,10,20,0.8)"), a.artScrimEnd)
    assertEquals(argb("#f1f5f9"), a.artTitle)
    assertEquals(argb("#e6ebf2"), a.artSub)
  }

  /** The tokens JS sends for Aurora (aurora-fixture.json, built by `rowTokens(AURORA)`): reading them gives Aurora back. */
  @Test fun theTokensJsSendsForAuroraAreAurora() {
    val text = requireNotNull(javaClass.classLoader?.getResource("aurora-fixture.json")?.readText()) { "aurora-fixture.json is missing from the test resources" }
    val sent = JSONObject(text).getJSONObject("tokens")
    val t = GuideTokens.parse(sent.toString())
    assertEquals(a.rowBorder, t.rowBorder)
    assertEquals(a.cellBg, t.cellBg)
    assertEquals(a.liveCellBg, t.liveCellBg)
    assertEquals(a.cellBorder, t.cellBorder)
    assertEquals(a.ring, t.ring)
    assertEquals(a.liveElapsedA, t.liveElapsedA, 0.0)
    assertEquals(a.liveRemainA, t.liveRemainA, 0.0)
    assertEquals(a.title, t.title)
    assertEquals(a.titleWeight, t.titleWeight)
    assertEquals(a.sub, t.sub)
    assertEquals(a.railFocusA, t.railFocusA, 0.0)
    assertEquals(a.circleFillA, t.circleFillA, 0.0)
    assertEquals(a.circleBorderA, t.circleBorderA, 0.0)
    assertEquals(a.heartOff, t.heartOff)
    assertEquals(a.fav, t.fav)
    assertEquals(a.number, t.number)
    assertEquals(a.numberFocused, t.numberFocused)
    assertEquals(a.numberWeight, t.numberWeight)
    assertEquals(a.name, t.name)
    assertEquals(snapshot(a), snapshot(t))
  }

  /**
   * Every value JS sends changes what the painter reads: change each key (and each field inside an object, each element of an
   * array) to a value Aurora doesn't use and the parsed tokens must differ. A token the parser ignored would be a token that
   * does nothing.
   */
  @Test fun everyTokenJsSendsChangesWhatTheParserReads() {
    val sent = JSONObject(requireNotNull(javaClass.classLoader?.getResource("aurora-fixture.json")).readText()).getJSONObject("tokens")
    val base = snapshot(GuideTokens.parse(sent.toString()))
    for (key in sent.keys().asSequence().toList()) {
      val v = sent.get(key)
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
        assertNotEquals("changing `$name` changes nothing the painter reads", base, snapshot(GuideTokens.parse(changed.toString())))
      }
    }
  }

  /** A value for `key` that differs from `old` and is of a kind the parser accepts there. */
  private fun otherThan(key: String, old: Any?): Any = when {
    key.endsWith("Weight") -> if (old == "300") "400" else "300"
    old is Number -> if (old.toDouble() == 0.5) 0.25 else 0.5
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
    val t = GuideTokens.parse("{}")
    assertEquals(a.ring, t.ring)
    assertEquals(a.numberWeight, t.numberWeight)
    assertEquals(a.circleBorderA, t.circleBorderA, 0.0)
  }

  @Test fun theWrongTypeKeepsTheDefault() {
    val t = GuideTokens.parse("""{"ring": 5, "title": null, "liveFill": {"elapsed": "x", "remain": null}, "circle": 3, "titleWeight": true, "numberWeight": {}}""")
    assertEquals(a.ring, t.ring)
    assertEquals(a.title, t.title)
    assertEquals(a.liveElapsedA, t.liveElapsedA, 0.0)
    assertEquals(a.liveRemainA, t.liveRemainA, 0.0)
    assertEquals(a.circleFillA, t.circleFillA, 0.0)
    assertEquals(a.titleWeight, t.titleWeight)
    assertEquals(a.numberWeight, t.numberWeight)
  }

  @Test fun weightsReadAsCssStringsOrNumbers() {
    assertEquals(500, GuideTokens.parse("""{"titleWeight": "500"}""").titleWeight)
    assertEquals(800, GuideTokens.parse("""{"titleWeight": 800}""").titleWeight)
    assertEquals(600, GuideTokens.parse("""{"titleWeight": "bold"}""").titleWeight) // not a number: default
    assertEquals(600, GuideTokens.parse("""{"titleWeight": 0}""").titleWeight)
    assertEquals(600, GuideTokens.parse("""{"titleWeight": 5000}""").titleWeight)
  }

  @Test fun alphasAreHeldInsideZeroToOne() {
    val t = GuideTokens.parse("""{"railFocusAlpha": 3, "circle": {"fillA": -1, "borderA": 0.5}, "liveFill": {"elapsed": 1.5, "remain": 0}}""")
    assertEquals(1.0, t.railFocusA, 0.0)
    assertEquals(0.0, t.circleFillA, 0.0)
    assertEquals(0.5, t.circleBorderA, 0.0)
    assertEquals(1.0, t.liveElapsedA, 0.0)
    assertEquals(0.0, t.liveRemainA, 0.0)
  }

  @Test fun anUnreadableColorIsWhiteSoItStaysVisible() {
    assertEquals(GuideColor.WHITE, GuideTokens.parse("""{"ring": "not a color"}""").ring)
  }

  @Test fun malformedJsonThrows() {
    assertThrows(JSONException::class.java) { GuideTokens.parse("{") }
    assertThrows(JSONException::class.java) { GuideTokens.parse("") }
  }
}
