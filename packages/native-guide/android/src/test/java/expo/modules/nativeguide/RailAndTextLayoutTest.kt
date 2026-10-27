package expo.modules.nativeguide

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The channel rail's content box and the text in the rail and the cells, worked by hand for a 960 dp wide screen at density 2 (a design px
 * is 0.75 px): a theme's divider is the rail's right border, which Yoga takes off the width the rail lays out in; a text node's top and
 * left round down; and a line of text with no line height of its own sits in the font's own line box. Every figure is in px.
 */
class RailAndTextLayoutTest {
  private val geoJson =
    """{"unit": 0.375, "rowH": 63, "railW": 72, "laneW": 800, "ppm": 4, "originMs": 0, "windowMin": 180, "gap": 3,
        "borderTop": 1, "padV": 6.75, "padH": 7.5, "barW": 1.5,
        "circle": 18, "circleBorder": 0.5, "circleRing": 1, "glyph": 9.5, "badge": 8, "badgeOff": 1.5,
        "numberSize": 12.75, "nameSize": 8.6, "nameLine": 10.3,
        "cellTop": 2.25, "cellInset": 4.5, "cellRadius": 4, "cellBorder": 0.5, "cellRing": 1, "ringOuterW": 0,
        "liveBarX": 1.1, "liveBarInset": 3.75, "liveBarW": 0.5, "liveBarR": 1,
        "padTop": 7.5, "padX": 7.5, "titleSize": 12.75, "subSize": 9.75, "subGap": 4.5, "kickerSize": 7.5, "plateSize": 8.25}"""

  private fun layout(look: String = "{}") = AuroraLayout(GuideGeo(geoJson), 2.0, 1760.0, 20, GuideLook.parse(JSONObject(look)))

  // 4 design px is 3 px; the rail is 144 px wide with 15 px of padding either side, so 114 px of content, and 111 with the divider.
  private val divider = """"railDivider": {"w": 4, "color": "#7a7a7a"}"""
  private val withDivider = "{$divider}"
  private val numeral = """"railLayout": "numeral", "circleStyle": {"scale": 0.5}"""

  @Test fun aDividerTakesItsWidthOffTheWidthTheNameWrapsIn() {
    assertEquals(114, layout().nameWidth)
    assertEquals(111, layout(withDivider).nameWidth) // "Cinema Two" wraps in a High Contrast rail, in the classic rows and now in the native ones
    assertEquals(15, layout(withDivider).nameLeft) // the name's left edge does not move
  }

  @Test fun aFractionalDividerIsExactInTheLayoutAndTheNameBoxIsRoundedOutward() {
    // 3 design px is 2.25 px: 111.75 px of content. The name is a text node, whose box Yoga never rounds narrower than its width.
    assertEquals(112, layout("""{"railDivider": {"w": 3, "color": "#7a7a7a"}}""").nameWidth)
  }

  @Test fun theNumberSitsAgainstTheContentsRightEdgeNotTheRailsPadding() {
    assertEquals(15 + 114 - 30, layout().numberLeft(30))
    assertEquals(15 + 111 - 30, layout(withDivider).numberLeft(30)) // 3 px further left
    assertEquals(15 + 111 - 30, layout(withDivider).numberLeftBesideLogo(30))
    // Too wide to sit beside the circle: packed after it, as before.
    assertEquals(15 + 36, layout(withDivider).numberLeft(100))
  }

  @Test fun theNumeralRailsCircleAndLogoEndAtTheContentsRightEdge() {
    val plain = layout("{$numeral}")
    val l = layout("{$numeral, $divider}")
    assertEquals(111, plain.circleX.start) // 144 - 15 - 18
    assertEquals(129, plain.circleX.end)
    assertEquals(108, l.circleX.start) // 3 px in from there
    assertEquals(126, l.circleX.end)
    assertEquals(90, plain.numberRoom())
    assertEquals(87, l.numberRoom())
    val r = LogoRect()
    l.placeLogo(30, r) // 111 - 30 - 6 (the row's gap) = 75 wide, ending at the content's right edge
    assertEquals(51, r.left)
    assertEquals(126, r.right)
    assertEquals(15, l.numberLeft(10)) // the number itself stays at the left padding
  }

  @Test fun aRailWithoutADividerIsLaidOutAsItWas() {
    val a = layout()
    val b = layout("""{"railDivider": {"w": 0, "color": "#7a7a7a"}}""")
    assertEquals(a.nameWidth, b.nameWidth)
    assertEquals(a.numberLeft(30), b.numberLeft(30))
    assertEquals(a.numberRoom(), b.numberRoom())
  }

  @Test fun aLineWithNoLineHeightSitsInTheFontsOwnLineBox() {
    // The system font keeps the font's padding: the line box starts at the font's top.
    assertEquals(35, LineMetrics.baseline(-33, -35, includeFontPadding = true))
    // A bundled face is set without it: the line box starts at the ascent.
    assertEquals(33, LineMetrics.baseline(-33, -35, includeFontPadding = false))
  }

  @Test fun theNumbersBaselineIsNotLiftedByHalfTheLeadingOfALineBoxItsOwnSize() {
    // A face whose natural line is 42 px (ascent -33, descent 9) at 36 px: reading the number as a line box exactly its size
    // splits a leading of -6 and sets the baseline 3 px higher than the React Native rows, which have no line height on the number.
    val boxed = -LineBox.of(-33, 9, 36).ascent
    assertEquals(30, boxed)
    assertEquals(3, LineMetrics.baseline(-33, -35, includeFontPadding = false) - boxed)
  }

  @Test fun aTextNodesTopRoundsDownWhereAViewsRoundsToTheNearest() {
    val l = layout()
    // The name ends 13.5 px above the rail's bottom: 126 - 2 - 13.5 - 42 = 68.5 down from the body's top, which a text node rounds down.
    assertEquals(2 + 68, l.nameTop(42))
    assertEquals(2 + 69, l.nameTop(41)) // 69.5
    assertEquals(2 + 67, l.nameTop(43)) // 67.5
  }

  @Test fun aTextNodesLeftRoundsDownToo() {
    // 3 design px of divider is 2.25 px: 111.75 px of content, so a 30 px number starts 81.75 px in, at 81 and not 82.
    val l = layout("""{"railDivider": {"w": 3, "color": "#7a7a7a"}}""")
    assertEquals(15 + 81, l.numberLeft(30))
    assertEquals(15 + 81, l.numberLeftBesideLogo(30))
  }

  @Test fun theTextInACellStartsWhereTheRoundedDownOffsetsPutIt() {
    // A cell whose top padding is 14.5 px (7.25 dp): the title is a text node and starts at 14, where a view would start at 15.
    val geo = GuideGeo(geoJson.replace("\"padTop\": 7.5", "\"padTop\": 7.25"))
    val l = AuroraLayout(geo, 2.0, 1760.0, 20, GuideLook.parse(JSONObject("{}")))
    val c = CellRect()
    l.placeCell(GuideGeometry.CellBox(100.0, 200.0), selected = false, out = c)
    assertEquals(8 + 14, c.titleTop) // the padding box starts at 8
    assertEquals(8 + 14 + 20 + 9, c.subTop) // 14.5 + 20 + 9 = 43.5: 43
    val kicker = CellRect()
    l.placeCell(GuideGeometry.CellBox(100.0, 200.0), selected = false, out = kicker, kickerLine = 20)
    assertEquals(8 + 9, kicker.kickerTop) // 12 design px of padding: 9 px
  }

  @Test fun aBigNumberPacksTheNameUnderItWhenTheyLeaveNoRoomBetweenThem() {
    val l = layout()
    // A name 42 px tall ends 68.5 px down from the body's top; a number 70 px tall puts the name's top at 13.5 + 70 = 83.5, lower than that.
    assertEquals(2 + 83, l.nameTop(42, numberH = 70))
    // A number that leaves room (the circle is 36 px: its row is that tall at least) leaves the name at the bottom.
    assertEquals(2 + 68, l.nameTop(42, numberH = 20))
    assertEquals(2 + 68, l.nameTop(42))
    // Exactly no room: the two meet.
    assertEquals(2 + 68, l.nameTop(42, numberH = 54)) // 13.5 + 54 = 67.5, under 68.5
    assertEquals(2 + 69, l.nameTop(42, numberH = 56)) // 69.5
  }

  @Test fun aNumbersLineBoxIsTheFontsOwn() {
    // Natural line 42 px (ascent -33, descent 9) with the font's top and bottom 2 px further out each way.
    assertEquals(46, LineMetrics.height(-33, 9, -35, 11, includeFontPadding = true))
    assertEquals(42, LineMetrics.height(-33, 9, -35, 11, includeFontPadding = false))
  }
}
