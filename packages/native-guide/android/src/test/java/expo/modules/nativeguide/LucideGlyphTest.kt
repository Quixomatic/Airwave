package expo.modules.nativeguide

import org.json.JSONArray
import org.json.JSONException
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** Icon nodes: what the painter makes of a lucide `iconNode` (parsing only: drawing needs a Canvas). */
class LucideGlyphTest {
  @Before @After fun reset() = LucideGlyphs.clear()

  private fun parse(json: String) = LucideGlyphs.parseNode(JSONArray(json))

  private inline fun <reified T : GlyphShape> only(json: String): T {
    val glyph = requireNotNull(parse(json)) { "nothing drawable in $json" }
    assertEquals(1, glyph.shapes.size)
    return glyph.shapes[0] as T
  }

  @Test fun aPathKeepsItsData() {
    // lucide's Radio, as lucide-react-native holds it: strings for every value, a `key` for React that means nothing here.
    val radio = requireNotNull(
      parse(
        """[["path", {"d": "M16.247 7.761a6 6 0 0 1 0 8.478", "key": "1fwjs5"}], ["path", {"d": "M19.075 4.933a10 10 0 0 1 0 14.134", "key": "ehdyv1"}],
            ["circle", {"cx": "12", "cy": "12", "r": "2", "key": "1c9p78"}]]""",
      ),
    )
    assertEquals(3, radio.shapes.size)
    assertEquals("M16.247 7.761a6 6 0 0 1 0 8.478", (radio.shapes[0] as GlyphShape.PathData).d)
    val dot = radio.shapes[2] as GlyphShape.Circle
    assertEquals(12.0, dot.cx, 0.0)
    assertEquals(12.0, dot.cy, 0.0)
    assertEquals(2.0, dot.r, 0.0)
  }

  @Test fun numbersReadWhetherTheyAreStringsOrNumbers() {
    val c = only<GlyphShape.Circle>("""[["circle", {"cx": 7.5, "cy": "16.5", "r": ".5"}]]""")
    assertEquals(7.5, c.cx, 0.0)
    assertEquals(16.5, c.cy, 0.0)
    assertEquals(0.5, c.r, 0.0)
  }

  @Test fun anEllipseNeedsBothRadii() {
    val e = only<GlyphShape.Ellipse>("""[["ellipse", {"cx": "12", "cy": "5", "rx": "9", "ry": "3"}]]""")
    assertEquals(9.0, e.rx, 0.0)
    assertEquals(3.0, e.ry, 0.0)
    assertNull(parse("""[["ellipse", {"cx": "12", "cy": "5", "rx": "9"}]]"""))
  }

  @Test fun aRectResolvesItsCornerRadiiTheWaySvgDoes() {
    val plain = only<GlyphShape.Rect>("""[["rect", {"x": "3", "y": "4", "width": "18", "height": "14"}]]""")
    assertEquals(0.0, plain.rx, 0.0)
    assertEquals(0.0, plain.ry, 0.0)

    val rounded = only<GlyphShape.Rect>("""[["rect", {"width": "18", "height": "14", "x": "3", "y": "4", "rx": "2"}]]""")
    assertEquals(2.0, rounded.rx, 0.0) // a missing ry copies rx
    assertEquals(2.0, rounded.ry, 0.0)

    val both = only<GlyphShape.Rect>("""[["rect", {"width": "18", "height": "14", "rx": "3", "ry": "1"}]]""")
    assertEquals(3.0, both.rx, 0.0)
    assertEquals(1.0, both.ry, 0.0)
    assertEquals(0.0, both.x, 0.0) // x and y default to 0

    val clamped = only<GlyphShape.Rect>("""[["rect", {"width": "10", "height": "4", "rx": "20"}]]""")
    assertEquals(5.0, clamped.rx, 0.0) // half the width
    assertEquals(2.0, clamped.ry, 0.0) // half the height
  }

  @Test fun aRectWithoutASizeIsSkipped() {
    assertNull(parse("""[["rect", {"x": "1", "y": "1"}]]"""))
    assertNull(parse("""[["rect", {"width": "0", "height": "5"}]]"""))
  }

  @Test fun aLineKeepsItsEnds() {
    val l = only<GlyphShape.Line>("""[["line", {"x1": "21", "x2": "9", "y1": "6", "y2": "6"}]]""")
    assertEquals(21.0, l.x1, 0.0)
    assertEquals(6.0, l.y1, 0.0)
    assertEquals(9.0, l.x2, 0.0)
    assertEquals(6.0, l.y2, 0.0)
  }

  @Test fun polylinesAndPolygonsReadTheirPoints() {
    val open = only<GlyphShape.Poly>("""[["polyline", {"points": "6 9 12 15 18 9"}]]""")
    assertArrayEquals(doubleArrayOf(6.0, 9.0, 12.0, 15.0, 18.0, 9.0), open.points, 0.0)
    assertFalse(open.closed)

    val closed = only<GlyphShape.Poly>("""[["polygon", {"points": "12,2 15.09,8.26 22,9.27"}]]""")
    assertArrayEquals(doubleArrayOf(12.0, 2.0, 15.09, 8.26, 22.0, 9.27), closed.points, 0.0)
    assertTrue(closed.closed)
  }

  @Test fun pointsMustPairUp() {
    assertNull(LucideGlyphs.points(null))
    assertNull(LucideGlyphs.points(""))
    assertNull(LucideGlyphs.points("1 2 3")) // odd count
    assertNull(LucideGlyphs.points("1 2")) // one point is no line
    assertNull(LucideGlyphs.points("1 2 x 4"))
    assertArrayEquals(doubleArrayOf(1.0, 2.0, 3.0, 4.0), LucideGlyphs.points("  1,2   3 ,4 ")!!, 0.0)
  }

  @Test fun anElementItCannotReadIsSkippedAndTheRestStays() {
    val g = requireNotNull(parse("""[["path", {"d": "M0 0h4"}], ["g", {"x": "1"}], ["path", {}], ["circle", {"cx": "1", "cy": "1"}], "junk", ["path", {"d": "M1 1h2"}]]"""))
    assertEquals(listOf("M0 0h4", "M1 1h2"), g.shapes.map { (it as GlyphShape.PathData).d })
  }

  @Test fun aNodeWithNothingDrawableIsNull() {
    assertNull(parse("[]"))
    assertNull(parse("""[["g", {}]]"""))
    assertNull(LucideGlyphs.parseNode(null))
  }

  @Test fun registeringAddsGlyphsById() {
    val n = LucideGlyphs.register("""{"lucide:Radio": [["circle", {"cx": "12", "cy": "12", "r": "2"}]], "lucide:Heart": [["path", {"d": "M2 9.5a5.5 5.5 0 0 1 9.591-3.676"}]]}""")
    assertEquals(2, n)
    assertTrue(LucideGlyphs.has("lucide:Radio"))
    assertTrue(LucideGlyphs.has("lucide:Heart"))
    assertFalse(LucideGlyphs.has("lucide:Tv"))
    assertEquals(1, LucideGlyphs.get("lucide:Heart")!!.shapes.size)
  }

  @Test fun registeringAgainReplacesAndKeepsTheRest() {
    LucideGlyphs.register("""{"lucide:Radio": [["circle", {"cx": "1", "cy": "1", "r": "1"}]], "lucide:Tv": [["circle", {"cx": "2", "cy": "2", "r": "2"}]]}""")
    val before = LucideGlyphs.get("lucide:Tv")
    LucideGlyphs.register("""{"lucide:Radio": [["circle", {"cx": "9", "cy": "9", "r": "9"}]]}""")
    assertSame(before, LucideGlyphs.get("lucide:Tv"))
    assertEquals(9.0, (LucideGlyphs.get("lucide:Radio")!!.shapes[0] as GlyphShape.Circle).r, 0.0)
  }

  @Test fun anUnknownIdDrawsRadioAsTheClassicRowsDo() {
    LucideGlyphs.register("""{"lucide:Radio": [["circle", {"cx": "12", "cy": "12", "r": "2"}]]}""")
    val radio = LucideGlyphs.get("lucide:Radio")
    assertNotNull(radio)
    assertSame(radio, LucideGlyphs.get("phosphor:Television")) // every phosphor id
    assertSame(radio, LucideGlyphs.get("lucide:NeverSent"))
    assertSame(radio, LucideGlyphs.get(""))
  }

  @Test fun withoutRadioAnUnknownIdHasNoGlyph() {
    assertNull(LucideGlyphs.get("lucide:Tv"))
    assertFalse(LucideGlyphs.has(LucideGlyphs.FALLBACK))
  }

  @Test fun oneUnreadableIconDoesNotStopTheRest() {
    val n = LucideGlyphs.register("""{"lucide:Bad": [["g", {}]], "lucide:NotAnArray": "x", "lucide:Good": [["path", {"d": "M0 0h4"}]]}""")
    assertEquals(1, n)
    assertTrue(LucideGlyphs.has("lucide:Good"))
    assertFalse(LucideGlyphs.has("lucide:Bad"))
  }

  @Test fun malformedJsonThrows() {
    assertThrows(JSONException::class.java) { LucideGlyphs.register("{") }
  }
}
