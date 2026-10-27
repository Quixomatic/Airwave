package expo.modules.nativeguide

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * What a theme changes about where things sit inside Aurora's row, worked by hand for a 960 dp wide screen at density 2 (a design px is
 * 0.75 px): the row's rule, the circle's scale, border and place, the `numeral` rail, the cell a hard shadow pulls in, the rings round a
 * selected cell and the kicker line above a title. Every figure is in px.
 */
class ThemeLayoutTest {
  private val geoJson =
    """{"unit": 0.375, "rowH": 63, "railW": 72, "laneW": 800, "ppm": 4, "originMs": 0, "windowMin": 180, "gap": 3,
        "borderTop": 1, "padV": 6.75, "padH": 7.5, "barW": 1.5,
        "circle": 18, "circleBorder": 0.5, "circleRing": 1, "glyph": 9.5, "badge": 8, "badgeOff": 1.5,
        "numberSize": 12.75, "nameSize": 8.6, "nameLine": 10.3,
        "cellTop": 2.25, "cellInset": 4.5, "cellRadius": 4, "cellBorder": 0.5, "cellRing": 1, "ringOuterW": 0,
        "liveBarX": 1.1, "liveBarInset": 3.75, "liveBarW": 0.5, "liveBarR": 1,
        "padTop": 7.5, "padX": 7.5, "titleSize": 12.75, "subSize": 9.75, "subGap": 4.5, "kickerSize": 7.5, "plateSize": 8.25}"""

  private fun layout(look: String = "{}", titleLineH: Int = 20) =
    AuroraLayout(GuideGeo(geoJson), 2.0, 1760.0, titleLineH, GuideLook.parse(JSONObject(look)))

  private val numeral = """{"railLayout": "numeral", "circleStyle": {"scale": 0.5}}"""

  /** A layout with the logo's own sizes, as the guide sends them: the gap is 8 design px (3 dp, 6 px here) and a plate pads the logo by `pad` dp. */
  private fun logoLayout(look: String = "{}", pad: Double = 0.0) =
    AuroraLayout(GuideGeo(geoJson.replace("{\"unit\"", "{\"logoGap\": 3, \"logoPad\": $pad, \"logoRadius\": 3, \"unit\"")), 2.0, 1760.0, 20, GuideLook.parse(JSONObject(look)))
  private val box = GuideGeometry.CellBox(100.0, 200.0)

  @Test fun anAuroraLayoutIsWhatItWasBeforeThemes() {
    val l = layout()
    assertFalse(l.numeral)
    assertEquals(2f, l.borderTopPx, 0f)
    assertEquals(36.0, l.circleD, 0.0)
    assertEquals(1.0, l.circleBorder, 0.0)
    assertEquals(15, l.circleX.start) // the circle first, against the left padding
    assertEquals(51, l.circleX.end)
    assertEquals(Int.MAX_VALUE, l.numberRoom())
  }

  @Test fun aThemesRowRuleHasItsOwnThicknessInWholePixels() {
    val l = layout("""{"rowBorderW": 4}""") // 4 design px = 3 px
    assertEquals(3f, l.borderTopPx, 0f)
    assertEquals(3, l.body.start)
    // Under a pixel is still one; none at all is none.
    assertEquals(1f, layout("""{"rowBorderW": 1.33}""").borderTopPx, 0f)
    assertEquals(0f, layout("""{"rowBorderW": 0}""").borderTopPx, 0f)
  }

  @Test fun theCirclesBorderIsTheThemesWidthOrTheStockHairline() {
    assertEquals(1.0, layout().circleBorder, 0.0)
    assertEquals(2.0, layout("""{"circleStyle": {"borderW": 3.33}}""").circleBorder, 0.0) // 2.5 px: 2
    assertEquals(0.0, layout("""{"circleStyle": {"borderW": 0}}""").circleBorder, 0.0) // no border at all
  }

  @Test fun theNumeralRailPutsTheCircleAtTheTopRightAndShrinksIt() {
    val l = layout(numeral)
    assertTrue(l.numeral)
    assertEquals(18.0, l.circleD, 0.0) // 36 px at half scale
    // Against the rail's right padding: 144 - 15 - 18 = 111, 18 wide.
    assertEquals(111, l.circleX.start)
    assertEquals(129, l.circleX.end)
    // Still at the row's top padding, and the rail itself is as it was.
    assertEquals(16, l.circleY.start)
    assertEquals(34, l.circleY.end)
    assertEquals(144, l.rail.end)
    // Its icon shrinks with it and stays centred.
    assertEquals(115, l.glyphX.start)
    assertEquals(125, l.glyphX.end)
    assertEquals(l.circleY.start + (l.circleY.end - l.circleY.start - (l.glyphY.end - l.glyphY.start)) / 2, l.glyphY.start)
  }

  @Test fun theNumeralNumberSitsAgainstTheLeftPaddingWhateverItsWidth() {
    val l = layout(numeral)
    assertEquals(15, l.numberLeft(10))
    assertEquals(15, l.numberLeft(120))
    assertEquals(15, l.numberLeftBesideLogo(40))
    // The other layout right-aligns it, or packs it after the circle when the two don't fit.
    val a = layout()
    assertEquals(15 + 114 - 20, a.numberLeft(20)) // 144 - 30 = 114 of room: right-aligned
    assertEquals(15 + 36, a.numberLeft(100)) // too wide for the room beside the circle: packed after it
  }

  @Test fun theNumeralNumberHasTheRoomBesideTheCircleLessAGap() {
    // 144 - 2 * 15 - 18 - 6 (8 design px) = 90.
    assertEquals(90, layout(numeral).numberRoom())
    // A bigger circle leaves less.
    assertEquals(90 - 18, layout("""{"railLayout": "numeral", "circleStyle": {"scale": 1}}""").numberRoom())
  }

  @Test fun anOversizedNumberShrinksToFitWhereTheClassicRowsShrinkIt() {
    // Classic: `big = numeral || number scale > 1`. Aurora's number is left as it is; a theme that scales its numbers up gets one that fits.
    assertFalse(layout().fitsNumber(1.0))
    assertTrue(layout().fitsNumber(1.4))
    assertFalse(layout().fitsNumber(0.8))
    assertTrue(layout(numeral).fitsNumber(1.0))
    assertTrue(layout(numeral).fitsNumber(2.0))
  }

  @Test fun aNumberThatFitsHasTheRoomTheCircleOrTheLogoLeavesIt() {
    // Not the numeral layout: 144 - 30 = 114 of room, the circle (36) first. Beside a logo, only the logo's gap (3 dp = 6 px) is kept.
    val withGap = AuroraLayout(GuideGeo(geoJson.replace("{\"unit\"", "{\"logoGap\": 3, \"unit\"")), 2.0, 1760.0, 20, GuideLook.parse(JSONObject("{}")))
    assertEquals(114 - 36, withGap.fittedNumberRoom(besideLogo = false))
    assertEquals(114 - 6, withGap.fittedNumberRoom(besideLogo = true))
    // The numeral layout has its own room when no logo is beside the number...
    assertEquals(layout(numeral).numberRoom(), layout(numeral).fittedNumberRoom(besideLogo = false))
    // ...and beside a logo what the two gaps leave: the logo's own and the row's (16 design px, 12 px), which the classic row has as `gap` plus `marginLeft`.
    assertEquals(114 - 12, logoLayout(numeral).fittedNumberRoom(besideLogo = true))
    // A divider takes its width off the room, as it does off the content box.
    assertEquals(111 - 36, layout("""{"railDivider": {"w": 4, "color": "#7a7a7a"}}""").fittedNumberRoom(besideLogo = false))
  }

  @Test fun aLogoStandsAtTheRightInTheNumeralRailAndAtTheLeftOtherwise() {
    val r = LogoRect()
    layout(numeral).placeLogo(30, r)
    // 144 - 30 (padding) - 30 (number) - 6 (the row's gap, which the geometry here has no logo gap to add to) = 78 wide, ending at the right padding.
    assertEquals(51, r.left)
    assertEquals(129, r.right)
    assertEquals(16, r.top)
    assertEquals(52, r.bottom) // as tall as the circle before the theme halved it (36 px), not as the shrunk circle (18)
    layout().placeLogo(30, r)
    assertEquals(15, r.left)
    assertEquals(99, r.right)
  }

  @Test fun aLogoBesideTheNumeralNumberHasBothGapsAndOtherwiseOne() {
    val r = LogoRect()
    // The numeral rail: the logo's gap (6 px) and the row's (6 px) between the number and the logo.
    logoLayout(numeral).placeLogo(30, r)
    assertEquals(129 - (114 - 30 - 12), r.left)
    assertEquals(129, r.right)
    // The other layout: the logo's own gap only.
    logoLayout().placeLogo(30, r)
    assertEquals(15, r.left)
    assertEquals(15 + (114 - 30 - 6), r.right)
  }

  @Test fun aLogoBoxIsTheCirclesSizeBeforeAThemeScalesItInItsHeightItsDecodeAndItsBadge() {
    val plain = logoLayout()
    val halved = logoLayout(numeral) // the circle is 18 px here, the logo box stays 36
    val a = LogoRect()
    val b = LogoRect()
    plain.placeLogo(30, a)
    halved.placeLogo(30, b)
    assertEquals(plain.circleD, 36.0, 0.0)
    assertEquals(18.0, halved.circleD, 0.0)
    assertEquals(a.bottom - a.top, b.bottom - b.top)
    assertEquals(a.top, b.top)
    assertEquals(a.badgeTop, b.badgeTop) // the badge hangs off the box's corner, which the scale does not move
    assertEquals(a.badgeBottom, b.badgeBottom)
    assertEquals(plain.logoDecodeH, halved.logoDecodeH) // and the logo is decoded for the same box
    assertEquals(64, halved.logoDecodeH) // 36 px -> 64, not the 32 an 18 px box would give
  }

  @Test fun aHardShadowPullsTheCellsRightAndBottomEdgesIn() {
    val plain = CellRect()
    val shrunk = CellRect()
    val l = layout()
    l.placeCell(box, selected = false, out = plain)
    l.placeCell(box, selected = false, out = shrunk, shrink = Stacks.Inset(5.0, 4.0)) // 3.75 px right, 3 px down
    assertEquals(plain.left, shrunk.left)
    assertEquals(plain.top, shrunk.top)
    assertEquals(744, plain.right)
    assertEquals(740, shrunk.right)
    assertEquals(124, plain.bottom)
    assertEquals(121, shrunk.bottom)
    // What lies inside it shrinks with it: the padding box and the width the text lays out in.
    assertTrue(shrunk.padRight < plain.padRight && shrunk.padBottom < plain.padBottom)
    assertTrue(plain.textWidth - shrunk.textWidth in 3..4) // 3.75 px, rounded outward as a text node's box is
    assertEquals(plain.textLeft, shrunk.textLeft)
  }

  @Test fun theKickerLineSitsAboveTheTitleAndPullsThemDown() {
    val l = layout()
    val plain = CellRect()
    val kicker = CellRect()
    l.placeCell(box, selected = false, out = plain)
    l.placeCell(box, selected = false, out = kicker, kickerLine = 20)
    // The cell's top is 7 px, its 1 px border puts the padding box at 8. A plain cell's title starts 15 px (20 design px) down.
    assertEquals(8 + 15, plain.titleTop)
    assertEquals(8 + 15 + 20 + 9, plain.subTop)
    // With a kicker the top padding is 12 design px (9 px); the 20 px line and a 4 design px (3 px) gap come before the title.
    assertEquals(8 + 9, kicker.kickerTop)
    assertEquals(8 + 9 + 20 + 3, kicker.titleTop)
    assertEquals(8 + 9 + 20 + 3 + 20 + 9, kicker.subTop)
    // A cell without one is laid out as it always was, and the width the text has is the same either way.
    assertEquals(plain.textWidth, kicker.textWidth)
    assertEquals(plain.bottom, kicker.bottom)
  }

  @Test fun aRingIsABoxGrownByItsReachFromTheCellsBorderBox() {
    val l = layout()
    val ring = CellRect()
    l.placeRing(box, grow = 5.0, w = 3.0, shrink = Stacks.NO_INSET, out = ring)
    val cell = CellRect()
    l.placeCell(box, selected = false, out = cell)
    assertEquals(3f, ring.border, 0f)
    assertEquals(cell.left - 5, ring.left)
    assertEquals(cell.right + 5, ring.right)
    assertEquals(cell.top - 5, ring.top)
    assertEquals(cell.bottom + 5, ring.bottom)
  }

  @Test fun aRingRoundAShadowedCellEnclosesTheVisibleBodyNotTheShadow() {
    val l = layout()
    val shrink = Stacks.Inset(5.0, 4.0)
    val body = CellRect()
    val ring = CellRect()
    l.placeCell(box, selected = true, out = body, shrink = shrink)
    l.placeRing(box, grow = 4.0, w = 4.0, shrink = shrink, out = ring)
    assertEquals(body.right + 4, ring.right)
    assertEquals(body.bottom + 4, ring.bottom)
    assertEquals(body.left - 4, ring.left)
    assertEquals(body.top - 4, ring.top)
  }

  @Test fun theOldOuterRingCallIsARingAsWideAsItself() {
    val l = AuroraLayout(GuideGeo(geoJson.replace("\"ringOuterW\": 0", "\"ringOuterW\": 2")), 2.0, 1760.0, 20)
    val old = CellRect()
    val ring = CellRect()
    l.placeOuterRing(box, old)
    l.placeRing(box, l.ringOuterW, l.ringOuterW, Stacks.NO_INSET, ring)
    assertEquals(listOf(ring.left, ring.top, ring.right, ring.bottom, ring.border), listOf(old.left, old.top, old.right, old.bottom, old.border))
  }

  @Test fun strokesAreWholePixelsAtTheScreensUnit() {
    val l = layout()
    assertEquals(3f, l.stroke(4.0), 0f)
    assertEquals(1f, l.stroke(0.3), 0f)
    assertEquals(0f, l.stroke(0.0), 0f)
  }
}
