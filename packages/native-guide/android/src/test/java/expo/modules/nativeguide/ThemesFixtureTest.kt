package expo.modules.nativeguide

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The guide's themes as JS sends them (themes-fixture.json, built by the real `auroraGeo`, `rowTokens` and `accentFg`): every
 * color variant of every theme must be read by the painter, which shades every accent exactly as the React Native rows do and lays out
 * each theme's row, including the zero-width borders, the larger text and the double ring a theme can ask for.
 */
class ThemesFixtureTest {
  private val fixture = JSONObject(requireNotNull(javaClass.classLoader?.getResource("themes-fixture.json")?.readText()) { "themes-fixture.json is missing from the test resources" })

  /** A theme's entry: its default variant's geo and tokens. */
  private fun theme(id: String): JSONObject {
    val all = fixture.getJSONArray("themes")
    return (0 until all.length()).map { all.getJSONObject(it) }.first { it.getString("id") == id }
  }

  private fun variants(): List<JSONObject> = fixture.getJSONArray("variants").let { v -> (0 until v.length()).map { v.getJSONObject(it) } }

  private fun variant(theme: String, id: String): JSONObject = variants().first { it.getString("theme") == theme && it.getString("variant") == id }

  private fun tokens(theme: String, id: String) = GuideTokens.parse(variant(theme, id).getJSONObject("tokens").toString())

  private fun layout(id: String, titleLineH: Int = 24): AuroraLayout {
    val t = theme(id)
    val density = t.getDouble("density")
    return AuroraLayout(GuideGeo(t.getJSONObject("geo").toString()), density, t.getDouble("widthDp") * density - 46 * density, titleLineH)
  }

  @Test fun everyVariantOfEveryThemeIsInTheFixture() {
    assertEquals(9, fixture.getJSONArray("themes").length())
    assertEquals(28, variants().size) // Aurora's one, and the 27 variants of the eight themes
    assertEquals(24, fixture.getJSONArray("accents").length())
  }

  @Test fun everyAccentIsShadedToTheSameColorAsJs() {
    val accents = fixture.getJSONArray("accents")
    for (v in variants()) {
      val id = "${v.getString("theme")}/${v.getString("variant")}"
      val t0 = GuideTokens.parse(v.getJSONObject("tokens").toString())
      val marks = v.getJSONArray("marks")
      assertEquals(accents.length(), marks.length())
      for (i in 0 until accents.length()) {
        assertEquals("$id: ${accents.getString(i)}", GuideColor.parse(marks.getString(i)), t0.mark(GuideColor.parse(accents.getString(i))))
      }
    }
  }

  @Test fun auroraFixedAndShadedMarksAreAsExpected() {
    val accents = fixture.getJSONArray("accents")
    // Aurora draws the accent itself; High Contrast draws white whatever the accent; Modern Light shades every accent toward its ink.
    for (i in 0 until accents.length()) {
      val accent = GuideColor.parse(accents.getString(i))
      assertEquals(accent, tokens("aurora", "default").mark(accent))
      assertEquals(GuideColor.WHITE, tokens("high-contrast", "signal").mark(accent))
      assertNotEquals(accent, tokens("modern", "light").mark(accent))
    }
    assertEquals(0.5, tokens("modern", "light").accentShade, 0.0)
  }

  @Test fun everyColorAVariantUsesIsOneThePainterCanRead() {
    val white = setOf("#fff", "#ffffff", "#ffffffff", "rgb(255,255,255)", "rgba(255,255,255,1)")
    val colorLike = Regex("^(#[0-9a-fA-F]{3,8}|rgba?\\(.*\\)|transparent)$")
    val bad = ArrayList<String>()
    fun walk(v: Any?, path: String) {
      when (v) {
        is String -> if (colorLike.matches(v) && GuideColor.parse(v) == GuideColor.WHITE && v.lowercase().replace(" ", "") !in white) bad.add("$path: $v")
        is JSONObject -> v.keys().forEach { walk(v.get(it), "$path.$it") }
        is JSONArray -> for (i in 0 until v.length()) walk(v.get(i), "$path[$i]")
      }
    }
    for (v in variants()) walk(v.getJSONObject("tokens"), "${v.getString("theme")}/${v.getString("variant")}")
    assertEquals(emptyList<String>(), bad)
  }

  @Test fun everyThemeLooksLikeSomethingToThePainter() {
    for (v in variants()) {
      val id = "${v.getString("theme")}/${v.getString("variant")}"
      val look = tokens(v.getString("theme"), v.getString("variant")).look
      if (v.getString("theme") == "aurora") assertEquals(id, GuideLook.AURORA, look) else assertNotEquals(id, GuideLook.AURORA, look)
    }
  }

  @Test fun highContrastScalesItsTextAndNothingElse() {
    val aurora = theme("aurora").getJSONObject("geo")
    val hc = theme("high-contrast").getJSONObject("geo")
    for (key in listOf("titleSize", "subSize", "numberSize", "nameSize", "nameLine")) {
      assertEquals(key, aurora.getDouble(key) * 1.12, hc.getDouble(key), 1e-9)
    }
    for (key in listOf("unit", "rowH", "railW", "padV", "padH", "circle", "glyph", "cellTop", "cellInset", "padTop", "padX", "subGap")) {
      assertEquals(key, aurora.getDouble(key), hc.getDouble(key), 0.0)
    }
  }

  @Test fun aBorderlessThemesCellHasNoBorderUntilItIsSelected() {
    val l = layout("swiss-poster")
    val box = GuideGeometry.CellBox(100.0, 200.0)
    val plain = CellRect()
    val selected = CellRect()
    l.placeCell(box, selected = false, out = plain)
    l.placeCell(box, selected = true, out = selected)
    assertEquals(0f, plain.border, 0f)
    assertEquals(plain.left.toFloat(), plain.padLeft, 0f) // the padding box is the whole cell
    assertEquals(plain.bottom.toFloat(), plain.padBottom, 0f)
    assertEquals(8f, selected.border, 0f) // the ring: line(7.5) = 4 dp at density 2
    assertEquals(plain.left, selected.left)
    assertEquals(plain.textLeft + 8, selected.textLeft) // the ring's width moves the text in, as it does in the React Native rows
    assertEquals(0.0, l.cellRadius, 0.0)
    assertEquals(0f, AuroraLayout.radius(l.cellRadius, 100f, 50f), 0f) // square cells
    assertEquals(0.0, l.barRadius, 0.0)
    assertEquals(0.0, l.ringOuterW, 0.0)
  }

  @Test fun aDoubleRingSitsJustOutsideTheSelectedCell() {
    val l = layout("high-contrast")
    val box = GuideGeometry.CellBox(100.0, 200.0)
    val cell = CellRect()
    val ring = CellRect()
    l.placeCell(box, selected = true, out = cell)
    l.placeOuterRing(box, ring)
    assertEquals(2.0, l.ringOuterW, 0.0) // line(2.25) = 1 dp at density 2
    assertEquals(2f, ring.border, 0f)
    assertEquals(5f, cell.border, 0f) // the inner ring: line(5.25) = 2.5 dp
    assertTrue(ring.left < cell.left && ring.right > cell.right && ring.top < cell.top && ring.bottom > cell.bottom)
    assertEquals(cell.left - 2, ring.left)
    assertEquals(cell.right + 2, ring.right)
    assertEquals(cell.top - 2, ring.top)
    assertEquals(cell.bottom + 2, ring.bottom)
  }

  @Test fun noThemePlatesItsLogosYetSoNoneInsetsThem() {
    val themes = fixture.getJSONArray("themes")
    for (t in 0 until themes.length()) {
      val id = themes.getJSONObject(t).getString("id")
      val l = layout(id)
      val r = LogoRect()
      l.placeLogo(30, r)
      val plated = tokens(id, theme(id).getString("variant")).logoPlate ushr 24 != 0
      assertEquals(id, plated, r.imgLeft > r.left)
      assertTrue(id, r.right > r.left && r.bottom == l.circleY.end && r.imgRight <= r.right && r.imgBottom <= r.bottom)
    }
  }

  @Test fun everyThemeLaysARowOutInsideItsLane() {
    val themes = fixture.getJSONArray("themes")
    for (t in 0 until themes.length()) {
      val id = themes.getJSONObject(t).getString("id")
      val l = layout(id)
      val c = CellRect()
      l.placeCell(GuideGeometry.CellBox(20.0, 200.0), selected = true, out = c)
      assertTrue(id, c.top >= l.body.start && c.bottom <= l.body.end)
      assertTrue(id, c.left >= l.lane.start)
      assertTrue(id, c.textWidth > 0 && c.textLeft + c.textWidth < c.right)
      if (l.ringOuterW > 0) {
        val r = CellRect()
        l.placeOuterRing(GuideGeometry.CellBox(20.0, 200.0), r)
        // The outer ring encloses the cell. (Neo-Brutalist's, 4 line px thick, is wider than the 2.5 px the row leaves under a cell, so
        // it reaches past the row's body there: the lane clips it, as it clips the React Native rows' ring.)
        assertTrue(id, r.left < c.left && r.right > c.right && r.top < c.top && r.bottom > c.bottom)
      }
    }
  }
}
