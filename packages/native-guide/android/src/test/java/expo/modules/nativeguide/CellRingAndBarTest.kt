package expo.modules.nativeguide

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The boxes round the selected cell and inside an on-now cell, worked by hand for a 960 dp wide screen at density 2 (a design px is
 * 0.75 px). The cell's top is 7 px (the 2 px row border and a 4.5 px offset, which Yoga rounds up), and it is 117 px tall, from 6.5 to 123.5
 * before rounding. Every figure is in px.
 */
class CellRingAndBarTest {
  private val geoJson =
    """{"unit": 0.375, "rowH": 63, "railW": 72, "laneW": 800, "ppm": 4, "originMs": 0, "windowMin": 180, "gap": 3,
        "borderTop": 1, "padV": 6.75, "padH": 7.5, "barW": 1.5,
        "circle": 18, "circleBorder": 0.5, "circleRing": 1, "glyph": 9.5, "badge": 8, "badgeOff": 1.5,
        "numberSize": 12.75, "nameSize": 8.6, "nameLine": 10.3,
        "cellTop": 2.25, "cellInset": 4.5, "cellRadius": 4, "cellBorder": 0.5, "cellRing": 1, "ringOuterW": 0,
        "liveBarX": 1.1, "liveBarInset": 3.75, "liveBarW": 0.5, "liveBarR": 1,
        "padTop": 7.5, "padX": 7.5, "titleSize": 12.75, "subSize": 9.75, "subGap": 4.5, "kickerSize": 7.5, "plateSize": 8.25}"""

  private val layout = AuroraLayout(GuideGeo(geoJson), 2.0, 1760.0, 20, GuideLook.parse(JSONObject("{}")))
  private val box = GuideGeometry.CellBox(100.0, 200.0)

  private fun cell(): CellRect = CellRect().also { layout.placeCell(box, selected = false, out = it) }

  @Test fun aRingIsRoundedRelativeToTheFrameAroundTheCellNotToTheRow() {
    val c = cell()
    assertEquals(listOf(344, 7, 744, 124), listOf(c.left, c.top, c.right, c.bottom))
    // 4.25 px out (a 2.25 px gap and a 2 px ring). Yoga rounds the frame's offset in the row (4.5: 5) and the ring's in the frame (-4.25: -4),
    // so the ring starts 7 - 4 = 3, a pixel under where rounding 4.5 - 4.25 = 0.25 at once puts it (2).
    val ring = CellRect()
    layout.placeRing(box, grow = 4.25, w = 2.0, shrink = Stacks.NO_INSET, out = ring)
    assertEquals(3, ring.top)
    assertEquals(340, ring.left)
    // Its size comes from its own absolute edges: 2.25 to 127.75 is 128 - 2 = 126 px tall, 339.75 to 748.25 is 748 - 340 = 408 wide.
    assertEquals(129, ring.bottom)
    assertEquals(748, ring.right)
    assertEquals(2f, ring.border, 0f)
  }

  @Test fun aRingAWholeNumberOfPixelsOutIsTheCellsBoxGrownByIt() {
    val c = cell()
    val ring = CellRect()
    layout.placeRing(box, grow = 5.0, w = 3.0, shrink = Stacks.NO_INSET, out = ring)
    assertEquals(listOf(c.left - 5, c.top - 5, c.right + 5, c.bottom + 5), listOf(ring.left, ring.top, ring.right, ring.bottom))
  }

  @Test fun theCellRemembersWhereItStartedBeforeRounding() {
    val c = cell()
    assertEquals(344.0, c.absLeft, 0.0)
    assertEquals(6.5, c.absTop, 0.0)
    assertEquals(400.0, c.exactW, 0.0)
    assertEquals(117.0, c.exactH, 0.0)
    assertEquals(1.0, c.exactBorder, 0.0)
  }

  // A track 12 px tall, 10.9 px up from the padding box's bottom, with a 2.25 px border: its top is 99.6 before rounding.
  private fun bar(pct: Double, topOnly: Boolean = false, border: Double = if (topOnly) 2.0 else 2.25): BarRect =
    BarRect().also { layout.placeBar(cell(), inset = 0.0, bottom = 10.9, h = 12.0, border = border, topOnly = topOnly, pct = pct, out = it) }

  @Test fun theTrackIsPlacedFromTheCellsPaddingBox() {
    val b = bar(0.5)
    // From the cell's padding box (1 px in): 345 to 743 across, and 117 - 1 - 10.9 - 12 = 93.1 down from the cell's top: 100 to 112.
    assertEquals(listOf(345, 100, 743, 112), listOf(b.left, b.top, b.right, b.bottom))
    assertEquals(listOf(2.25f, 2.25f, 2.25f, 2.25f), listOf(b.borderLeft, b.borderTop, b.borderRight, b.borderBottom))
  }

  @Test fun theFillCanBeAPixelShorterThanTheRoomInsideTheBorder() {
    val b = bar(0.5)
    // The room inside the border is 2.25 px in from the track's edge: 7.5 px tall, from 101.85 to 109.35 before rounding. Yoga rounds
    // that to 102..109, seven rows, where the room (rounded to whole pixels) is eight: the last row of it stays the track's colour.
    assertEquals(listOf(347, 102, 544, 109), listOf(b.fillLeft, b.fillTop, b.fillRight, b.fillBottom))
    // The part to come is the rest of the width, 197 px, to the padding box's right edge (740.75 rounds up to 741).
    assertEquals(listOf(544, 102, 741, 109), listOf(b.remainLeft, b.remainTop, b.remainRight, b.remainBottom))
  }

  @Test fun theFillIsAsLongAsTheTimeGoneByOfTheRoomInsideTheBorder() {
    val none = bar(0.0)
    assertEquals(none.fillLeft, none.fillRight)
    val all = bar(1.0)
    assertEquals(347, all.fillLeft)
    assertEquals(741, all.fillRight)
    assertEquals(all.fillRight, all.remainLeft)
  }

  @Test fun aBorderOnTheTopOnlyLeavesTheOtherSidesOfTheTrackOpen() {
    val b = bar(0.5, topOnly = true)
    assertEquals(listOf(0f, 2f, 0f, 0f), listOf(b.borderLeft, b.borderTop, b.borderRight, b.borderBottom))
    // Inside it: from 2 px down to the track's bottom, and across the whole width.
    assertEquals(listOf(345, 102, 544, 112), listOf(b.fillLeft, b.fillTop, b.fillRight, b.fillBottom))
  }

  @Test fun aTrackInsetFromTheSidesIsNarrowerByIt() {
    val b = BarRect()
    layout.placeBar(cell(), inset = 6.0, bottom = 10.9, h = 12.0, border = 2.25, topOnly = false, pct = 0.5, out = b)
    assertEquals(345 + 6, b.left)
    assertEquals(743 - 6, b.right)
  }
}
