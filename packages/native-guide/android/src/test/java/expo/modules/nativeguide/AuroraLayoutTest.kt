package expo.modules.nativeguide

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The pixel-grid arithmetic the painter lays Aurora's row out with, worked by hand for a density of 2, and the contract with
 * the `geo` JS sends (aurora-fixture.json, built by `auroraGeo`).
 */
class AuroraLayoutTest {
  @Test fun snapRoundsHalvesUpLikeYoga() {
    assertEquals(3, PixelGrid.snap(2.5))
    assertEquals(3, PixelGrid.snap(3.4))
    assertEquals(4, PixelGrid.snap(3.5))
    assertEquals(0, PixelGrid.snap(0.49))
    assertEquals(0, PixelGrid.snap(-0.4))
    assertEquals(-1, PixelGrid.snap(-0.6))
    // A hair under a half is still half (Yoga's epsilon); a clear miss is not.
    assertEquals(14, PixelGrid.snap(13.49995))
    assertEquals(13, PixelGrid.snap(13.4))
  }

  @Test fun aChildStartsRoundedRelativeToItsParentAndSizesFromTheRoundedEdges() {
    val parent = Span(10, 100, 10.0)
    val c = parent.child(2.5, 4.0) // absolute 12.5..16.5: start 10 + round(2.5) = 13; end 13 + (round(16.5) - round(12.5)) = 13 + (17 - 13) = 17
    assertEquals(13, c.start)
    assertEquals(17, c.end)
    assertEquals(12.5, c.abs, 0.0)
    // The same child one pixel over snaps its size from the absolute edges: 13.5..17.5 -> 14 and 18
    val d = parent.child(3.5, 4.0)
    assertEquals(14, d.start)
    assertEquals(18, d.end)
  }

  @Test fun aTextNodeIsRoundedOutwardWhereOtherBoxesRoundToNearest() {
    // Yoga's rule for a node with a measure function: its start edge goes down, its end edge up unless the width is whole.
    assertEquals(361, PixelGrid.floorEdge(361.5))
    assertEquals(362, PixelGrid.floorEdge(361.99995)) // a hair under the next pixel is on it
    assertEquals(361, PixelGrid.ceilEdge(361.00005)) // and a hair over one is on it too
    assertEquals(729, PixelGrid.ceilEdge(728.2))
    assertTrue(PixelGrid.isFractional(367.2))
    assertFalse(PixelGrid.isFractional(367.00005))
    assertEquals(729, PixelGrid.textEnd(361.0, 367.2)) // fractional width: the end goes up (728.2 -> 729)
    assertEquals(728, PixelGrid.textEnd(361.5, 367.0)) // whole width: the end stays under (728.5 -> 728), so the box is 367 wide
    val parent = Span(10, 100, 10.0)
    val box = parent.child(2.5, 4.0) // an ordinary box starts at round(2.5) = 3 and ends where round(16.5) puts it: 13..17
    assertEquals(13, box.start)
    assertEquals(17, box.end)
    val whole = parent.textChild(2.5, 4.0) // a text node starts at floor(2.5) = 2 and, being whole, ends at floor(16.5) = 16: 12..16
    assertEquals(12, whole.start)
    assertEquals(16, whole.end)
    val fractional = parent.textChild(2.5, 4.3) // fractional: ceil(16.8) = 17 - floor(12.5) = 12 -> 5 px for 4.3
    assertEquals(12, fractional.start)
    assertEquals(17, fractional.end)
    assertEquals(12.5, fractional.abs, 0.0)
  }

  // A 1 dp row border and these dimensions at density 2: every figure below is worked out in px by hand.
  private val geoJson =
    """{"rowH": 63, "railW": 72, "laneW": 800, "ppm": 4, "originMs": 0, "windowMin": 180, "gap": 3,
        "borderTop": 1, "padV": 6.75, "padH": 7.5, "barW": 1.5,
        "circle": 18, "circleBorder": 0.5, "circleRing": 1, "glyph": 9.5, "badge": 8, "badgeOff": 1.5,
        "numberSize": 12.75, "nameSize": 8.6, "nameLine": 10.3,
        "cellTop": 2.25, "cellInset": 4.5, "cellRadius": 4, "cellBorder": 0.5, "cellRing": 1,
        "liveBarX": 1.1, "liveBarInset": 3.75, "liveBarW": 0.5, "liveBarR": 1,
        "padTop": 7.5, "padX": 7.5, "titleSize": 12.75, "subSize": 9.75, "subGap": 4.5}"""
  private val geo = GuideGeo(geoJson)
  private val layout = AuroraLayout(geo, 2.0, 1760.0, titleLineH = 20)

  @Test fun theRowIsARailAndALaneUnderTheTopBorder() {
    assertEquals(0, layout.rail.start)
    assertEquals(144, layout.rail.end)
    assertEquals(144, layout.lane.start)
    assertEquals(1760, layout.lane.end)
    assertEquals(2f, layout.borderTopPx, 0f)
    assertEquals(2, layout.body.start) // under the 1 dp border
    assertEquals(126, layout.body.end) // the row's bottom
  }

  @Test fun theCircleSitsInTheRailsPaddingAndTheIconIsCenteredInIt() {
    assertEquals(15, layout.circleX.start)
    assertEquals(51, layout.circleX.end)
    assertEquals(16, layout.circleY.start) // 2 + round(13.5)
    assertEquals(52, layout.circleY.end)
    assertEquals(24, layout.glyphX.start) // 15 + round(8.5)
    assertEquals(43, layout.glyphX.end)
    assertEquals(19, layout.glyphX.end - layout.glyphX.start)
    assertEquals(25, layout.glyphY.start) // 16 + round(8.5)
    assertEquals(44, layout.glyphY.end)
  }

  @Test fun theBadgeHangsOffTheCirclesBottomRight() {
    // right edge: circle 36 px - 1 px border + 3 px = 38 px past the circle's left; the badge is 16 px wide.
    assertEquals(15 + 22, layout.badgeX.start)
    assertEquals(15 + 38, layout.badgeX.end)
    assertTrue(layout.badgeX.end > layout.circleX.end) // it passes the circle's edge
    assertTrue(layout.badgeY.end > layout.circleY.end)
  }

  @Test fun theNumberSitsAgainstTheRightPaddingOrPacksAfterTheCircle() {
    assertEquals(99, layout.numberLeft(30)) // 15 + (114 - 30)
    assertEquals(51, layout.numberLeft(90)) // 36 + 90 > 114: packed after the circle (15 + 36)
    assertEquals(layout.circleY.start, layout.numberTop)
  }

  @Test fun theNameEndsAtTheRailsBottomPadding() {
    assertEquals(114, layout.nameWidth)
    assertEquals(15, layout.nameLeft)
    assertEquals(71, layout.nameTop(42)) // 2 + round(126 - 2 - 13.5 - 42 = 68.5)
    assertEquals(113, layout.nameTop(42) + 42) // 13 px above the row's bottom: the 13.5 px bottom padding
  }

  @Test fun anUnselectedCellIsPlacedInsideTheLane() {
    val c = CellRect()
    layout.placeCell(GuideGeometry.CellBox(100.0, 200.0), selected = false, out = c) // dp from the lane's left
    assertEquals(344, c.left) // lane 144 + 200
    assertEquals(744, c.right)
    assertEquals(7, c.top) // 2 + round(4.5)
    assertEquals(124, c.bottom)
    assertEquals(1f, c.border, 0f) // 0.5 dp
    assertEquals(345f, c.padLeft, 0f)
    assertEquals(743f, c.padRight, 0f)
    assertEquals(8f, c.padTop, 0f)
    assertEquals(123f, c.padBottom, 0f)
    assertEquals(347, c.barLeft)
    assertEquals(348, c.barRight)
    assertEquals(16, c.barTop)
    assertEquals(116, c.barBottom)
    assertEquals(360, c.textLeft) // inside the border and 15 px of padding
    assertEquals(368, c.textWidth) // 400 - 2 - 30
    assertEquals(23, c.titleTop) // 8 + 15
    assertEquals(52, c.subTop) // 8 + round(15 + 20 + 9)
  }

  @Test fun theSelectedCellsThickerBorderMovesItsContentIn() {
    val plain = CellRect()
    val ring = CellRect()
    val box = GuideGeometry.CellBox(100.0, 200.0)
    layout.placeCell(box, selected = false, out = plain)
    layout.placeCell(box, selected = true, out = ring)
    assertEquals(plain.left, ring.left) // the outer box doesn't move
    assertEquals(plain.right, ring.right)
    assertEquals(2f, ring.border, 0f) // 1 dp
    assertEquals(346f, ring.padLeft, 0f)
    assertEquals(742f, ring.padRight, 0f)
    assertEquals(361, ring.textLeft)
    assertEquals(366, ring.textWidth)
    assertEquals(plain.titleTop + 1, ring.titleTop)
  }

  @Test fun theNameIsMeasuredInTheRoundedOutWidthOfItsTextNode() {
    assertEquals(114, layout.nameWidth) // 144 - 30 = 114 px exactly: nothing to round
    // A rail of 144.6 px leaves the name 114.6 px; Yoga rounds that text box up to 115 (end 129.6 -> 130, start 15).
    val wider = AuroraLayout(GuideGeo(geoJson.replace("\"railW\": 72,", "\"railW\": 72.3,")), 2.0, 1760.0, titleLineH = 20)
    assertEquals(115, wider.nameWidth)
    assertEquals(15, wider.nameLeft)
  }

  /**
   * The ellipsis mismatch seen in High Contrast: its 1 dp (2 px) cell border, 2 dp (4 px) selected ring and fractional cell widths
   * left the native text one glyph narrower than the React Native <Text>, which truncates in the width Yoga rounds outward
   * rather than in the floor of the exact width. Worked by hand at density 2 for a cell 100.25 dp from the lane's left and
   * 200.6 dp wide (200.5 px and 401.2 px), so its absolute left is 144 + 200.5 = 344.5 px.
   */
  @Test fun aTitleTruncatesInTheWidthYogaGivesItsTextNodeWithAThickBorder() {
    val thick = AuroraLayout(GuideGeo(geoJson.replace("\"cellBorder\": 0.5, \"cellRing\": 1", "\"cellBorder\": 1, \"cellRing\": 2")), 2.0, 1760.0, titleLineH = 20)
    val box = GuideGeometry.CellBox(100.25, 200.6)
    val plain = CellRect()
    val ring = CellRect()
    thick.placeCell(box, selected = false, out = plain)
    thick.placeCell(box, selected = true, out = ring)
    assertEquals(345, plain.left) // 144 + round(200.5)
    assertEquals(746, plain.right)
    assertEquals(2f, plain.border, 0f)
    assertEquals(362, plain.textLeft) // 345 + 2 (border) + 15 (padding)
    // Text box: starts at 344.5 + 2 + 15 = 361.5 and is 401.2 - 4 - 30 = 367.2 wide, so it ends at 728.7. Yoga rounds that to 361..729.
    assertEquals(368, plain.textWidth) // not floor(367.2) = 367
    assertEquals(4f, ring.border, 0f)
    assertEquals(364, ring.textLeft)
    // Selected: 344.5 + 4 + 15 = 363.5 .. 726.7 -> 363..727
    assertEquals(364, ring.textWidth) // not floor(363.2) = 363
    // The ordinary border box and the padding box keep rounding to the nearest pixel.
    assertEquals(plain.left, ring.left)
    assertEquals(plain.right, ring.right)
  }

  @Test fun artworkIsRequestedAtTheCellsSizeRoundedUpToTheStep() {
    // Density 2: a 200 dp wide cell is 400 px -> 448; the cell is 63 - 4.5 = 58.5 dp tall, 117 px -> 128.
    assertEquals(448, layout.artW(GuideGeometry.CellBox(100.0, 200.0)))
    assertEquals(128, layout.artH)
    assertEquals(64, layout.artW(GuideGeometry.CellBox(0.0, 20.0))) // 40 px: one step at least
    assertEquals(1024, layout.artW(GuideGeometry.CellBox(0.0, 5000.0))) // capped at ART_MAX: a wide cell's picture is cover-scaled to its width
    // Two cells a couple of dp apart in width share one request.
    assertEquals(layout.artW(GuideGeometry.CellBox(0.0, 201.0)), layout.artW(GuideGeometry.CellBox(0.0, 203.0)))
  }

  @Test fun aCellsEdgesFollowItsFractionalPositionOnThePixelGrid() {
    val c = CellRect()
    layout.placeCell(GuideGeometry.CellBox(10.3, 20.2), selected = false, out = c)
    // left 20.6 px, width 40.4 px: relative start round(20.6) = 21 -> 144 + 21; end from the absolute edges round(164.6) / round(205.0)
    assertEquals(165, c.left)
    assertEquals(165 + (PixelGrid.snap(144 + 20.6 + 40.4) - PixelGrid.snap(144 + 20.6)), c.right)
  }

  @Test fun aRowDrawsFromTheClockOnlyWhileItHasALiveCell() {
    // Cells 30 min long from the origin at 4 dp a minute: p1 = 0..30 min, p2 = 30..60 min, p3 = 400..430 min (past the window).
    val min = 60_000L
    val programs = arrayOf(
      GuideProgram("p1", 0, 1800, "One", null, ""),
      GuideProgram("p2", 30 * min, 1800, "Two", null, ""),
      GuideProgram("p3", 400 * min, 1800, "Three", null, ""),
    )
    assertEquals("p1 is on air and drawn", 10 * min, AuroraLayout.clockOf(geo, programs, (10 * min).toDouble()))
    assertEquals("the clock moves with it", 20 * min, AuroraLayout.clockOf(geo, programs, (20 * min).toDouble()))
    assertEquals("p2 is on air", 45 * min, AuroraLayout.clockOf(geo, programs, (45 * min).toDouble()))
    assertEquals("nothing is on air after p2", 0L, AuroraLayout.clockOf(geo, programs, (90 * min).toDouble()))
    assertEquals("a live program the row does not draw (past the window) does not count", 0L, AuroraLayout.clockOf(geo, arrayOf(programs[2]), (410 * min).toDouble()))
    assertEquals("no programs", 0L, AuroraLayout.clockOf(geo, emptyArray(), (10 * min).toDouble()))
  }

  @Test fun theRadiusNeverExceedsHalfTheShortSide() {
    assertEquals(4f, AuroraLayout.radius(4.0, 100f, 50f), 0f)
    assertEquals(10f, AuroraLayout.radius(40.0, 100f, 20f), 0f)
    assertEquals(0f, AuroraLayout.radius(-3.0, 100f, 20f), 0f)
  }

  // The contract with JS.
  private val fixture = JSONObject(requireNotNull(javaClass.classLoader?.getResource("aurora-fixture.json")?.readText()) { "aurora-fixture.json is missing from the test resources" })
  private val sent = fixture.getJSONObject("geo")
  private val shared = setOf("rowH", "railW", "laneW", "ppm", "originMs", "windowMin", "gap")

  @Test fun jsSendsEveryFieldTheLayoutReads() {
    val missing = AuroraLayout.KEYS.filter { !sent.has(it) }
    assertEquals("geo fields the painter reads but JS doesn't send", emptyList<String>(), missing)
    assertEquals("shared fields", emptyList<String>(), shared.filter { !sent.has(it) })
  }

  @Test fun theLayoutReadsEveryFieldJsSends() {
    val unread = sent.keys().asSequence().filter { it !in AuroraLayout.KEYS && it !in shared }.toList()
    assertEquals("geo fields JS sends that nothing reads", emptyList<String>(), unread)
  }

  @Test fun theSentGeoLaysOutAnAndroidTvRowSensibly() {
    val density = fixture.getDouble("density")
    val width = fixture.getDouble("widthDp") * density // the guide's whole width, px
    val g = GuideGeo(sent.toString())
    val l = AuroraLayout(g, density, width - 46 * density, titleLineH = 24)
    assertEquals(0, l.rail.start)
    assertEquals(l.rail.end, l.lane.start)
    assertEquals(PixelGrid.snap(width - 46 * density), l.lane.end)
    assertTrue(l.circleX.end <= l.rail.end)
    assertTrue(l.circleY.end < l.body.end)
    assertTrue(l.glyphX.start >= l.circleX.start && l.glyphX.end <= l.circleX.end)
    // The first screen's cells all fit in the row, and the title sits inside its cell.
    val c = CellRect()
    l.placeCell(GuideGeometry.CellBox(20.0, 200.0), selected = false, out = c)
    assertTrue(c.top >= l.body.start && c.bottom <= l.body.end)
    assertTrue(c.left >= l.lane.start)
    assertTrue(c.textLeft > c.left && c.textLeft + c.textWidth < c.right)
    assertTrue(c.titleTop > c.top && c.subTop > c.titleTop)
    assertFalse(c.textWidth <= 0)
  }
}

/** The web-like line box React Native's lineHeight produces, for the channel name. */
class LineBoxTest {
  @Test fun leadingIsSplitAroundTheTextHalfAboveHalfBelow() {
    // Roboto-ish at 18 px: ascent -17, descent 5 (natural 22) in a 26 px line: 4 px of leading, 2 above and 2 below.
    val b = LineBox.of(-17, 5, 26)
    assertEquals(-19, b.ascent)
    assertEquals(7, b.descent)
    assertEquals(26, b.descent - b.ascent)
  }

  @Test fun anOddLeadingPutsTheExtraPixelAbove() {
    val b = LineBox.of(-17, 5, 25) // 3 px of leading: ceil(1.5) = 2 above, floor(1.5) = 1 below
    assertEquals(-19, b.ascent)
    assertEquals(6, b.descent)
    assertEquals(25, b.descent - b.ascent)
  }

  @Test fun aLineHeightSmallerThanTheTextTrimsItEvenly() {
    val b = LineBox.of(-17, 5, 20) // -2 px of leading: ceil(-1) = -1 -> ascent -16; floor(-1) = -1 -> descent 4
    assertEquals(-16, b.ascent)
    assertEquals(4, b.descent)
    assertEquals(20, b.descent - b.ascent)
  }

  @Test fun anExactFitChangesNothing() {
    val b = LineBox.of(-17, 5, 22)
    assertEquals(-17, b.ascent)
    assertEquals(5, b.descent)
  }
}
