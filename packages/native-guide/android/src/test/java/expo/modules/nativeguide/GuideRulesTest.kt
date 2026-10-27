package expo.modules.nativeguide

import java.util.TimeZone
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The small pure rules the painter draws a theme's decorations by. */
class GuideRulesTest {
  private fun shadow(inside: Boolean, vararg steps: Triple<Double, Double, Double>) =
    GuideLook.Shadow(inside, steps.map { GuideLook.ShadowStep(it.first, it.second, it.third, GuideColor.BLACK, 1.0, null) })

  // The status words.
  @Test fun theKickerFitsWhenItsWholeLabelFitsTheTextsWidth() {
    // Editorial at 1080p: a 12 minute cell is 143 design px wide, less 20 padding either side: 77 px of text. "9:01 PM" in 20 px type with
    // 14% tracking is about 66 px: it fits, as it does in the mock.
    assertTrue(StatusRules.kickerFits(66f, 77f))
    assertTrue(StatusRules.kickerFits(77f, 77f)) // exactly fits
    assertFalse(StatusRules.kickerFits(78f, 77f)) // a pixel too wide is dropped whole, not cut to "9:0..."
    assertFalse(StatusRules.kickerFits(10f, 0f)) // no room at all
    assertFalse(StatusRules.kickerFits(10f, -4f))
  }

  @Test fun anOversizedNumberShrinksToItsRoomDownToHalf() {
    assertEquals(1f, StatusRules.fitScale(60f, 80f), 0f) // fits: untouched
    assertEquals(1f, StatusRules.fitScale(80f, 80f), 0f)
    assertEquals(0.8f, StatusRules.fitScale(100f, 80f), 1e-6f) // 100 px of digits in 80 px of room: 80 per cent
    assertEquals(0.5f, StatusRules.fitScale(200f, 80f), 0f) // never below half (the caller then cuts it with an ellipsis)
    assertEquals(0.5f, StatusRules.fitScale(50f, 0f), 0f) // no room at all
    assertEquals(1f, StatusRules.fitScale(0f, 0f), 0f) // nothing to fit
    assertEquals(0.25f, StatusRules.fitScale(100f, 20f, 0.25f), 1e-6f)
  }

  @Test fun aTagOrABurstNeedsItsOwnMinimumCell() {
    assertTrue(StatusRules.fits(420.0, 420.0))
    assertTrue(StatusRules.fits(900.0, 560.0))
    assertFalse(StatusRules.fits(419.9, 420.0))
    assertFalse(StatusRules.fits(300.0, 560.0))
  }

  @Test fun theKickerSaysOnNowOrTheStartTime() {
    val zone = TimeZone.getTimeZone("America/Chicago")
    val eight = 1_761_613_260_000L // 2026-10-27 20:01 in Chicago (UTC-5 until the clocks change on Nov 1)
    assertEquals("ON NOW", StatusRules.kickerText(true, "ON NOW", eight, zone))
    assertEquals("8:01 PM", StatusRules.kickerText(false, "ON NOW", eight, zone))
    assertEquals("8:01 PM", TimeLabel.format(eight, zone))
    assertEquals("12:00 AM", TimeLabel.format(eight + 3 * 3_600_000L + 59 * 60_000L, zone))
    assertEquals("9:31 PM", TimeLabel.format(eight + 90 * 60_000L, zone))
  }

  @Test fun aTagsPlateIsItsTextsLineBoxAndPaddingAroundTheSubLinesBaseline() {
    // 22 px type with a font whose ascent is -20 and descent 6 (26 tall): a 1.25 line is 27.5, so 0.75 of leading each side.
    val r = StatusRules.plateReach(-20f, 6f, 22f, 1f)
    assertEquals(20f + 0.75f + 1f, r[0], 1e-5f)
    assertEquals(6f + 0.75f + 1f, r[1], 1e-5f)
    // Taller than the line box: the leading is negative and the plate is tighter than the font's own box.
    val tight = StatusRules.plateReach(-30f, 10f, 22f, 0f)
    assertEquals(30f - 6.25f, tight[0], 1e-5f)
    assertEquals(10f - 6.25f, tight[1], 1e-5f)
  }

  @Test fun aTagIsDrawnInAColumnTooNarrowForItAndLeavesTheSubLineNoRoom() {
    // The plate and the burst are dropped by the cell's width alone (`fits`), as the classic rows' `labelFits` has it.
    assertTrue(StatusRules.fits(180.0, 180.0))
    assertFalse(StatusRules.fits(179.9, 180.0))
    // What follows the tag: the column less the tag and its gap, never negative: a tag wider than the column is still drawn.
    assertEquals(100f, StatusRules.subRoomAfterPlate(40f, 10f, 150f), 0f)
    assertEquals(0f, StatusRules.subRoomAfterPlate(40f, 10f, 50f), 0f)
    assertEquals(0f, StatusRules.subRoomAfterPlate(60f, 10f, 50f), 0f)
    assertEquals(0f, StatusRules.subRoomAfterPlate(40f, 10f, 0f), 0f)
  }

  // Shadows and rings.
  @Test fun aHardShadowInsideThePullsTheBodyInByItsLargestOffset() {
    val s = shadow(true, Triple(4.0, 4.0, 0.0), Triple(9.0, 6.0, 0.0), Triple(2.0, 11.0, 1.0))
    val inset = Stacks.inset(s)
    assertEquals(9.0, inset.dx, 0.0)
    assertEquals(11.0, inset.dy, 0.0)
    // A soft shadow that grows outside the box, and no shadow, pull nothing in.
    assertEquals(Stacks.NO_INSET, Stacks.inset(shadow(false, Triple(0.0, 3.0, 2.0))))
    assertEquals(Stacks.NO_INSET, Stacks.inset(null))
    // A shadow offset up and left never pushes the edges out.
    assertEquals(0.0, Stacks.inset(shadow(true, Triple(-3.0, -3.0, 0.0))).dx, 0.0)
  }

  @Test fun theRingsRoundASelectedCellStackOutwardFromTheOuterRing() {
    // High Contrast: an outer ring 2 px thick, 3 px off the cell: its outside edge is 5 px out, and it is drawn inside that box.
    val one = Stacks.rings(3.0, 2.0, emptyList())
    assertEquals(1, one.size)
    assertEquals(5.0, one[0].grow, 0.0)
    assertEquals(2.0, one[0].w, 0.0)
    assertEquals(-1, one[0].halo)
    // Modern's glow: two rings 3 px thick, each against the one before it.
    val glow = Stacks.rings(0.0, 0.0, listOf(3.0, 3.0))
    assertEquals(listOf(3.0, 6.0), glow.map { it.grow })
    assertEquals(listOf(0, 1), glow.map { it.halo })
    // An outer ring and a glow: the glow starts where the outer ring ends.
    val both = Stacks.rings(2.0, 4.0, listOf(3.0))
    assertEquals(listOf(6.0, 9.0), both.map { it.grow })
    assertEquals(listOf(-1, 0), both.map { it.halo })
    // A ring with no width is not there, and the one after it still counts from the last real edge.
    assertEquals(listOf(5.0), Stacks.rings(0.0, 0.0, listOf(0.0, 5.0)).map { it.grow })
    assertEquals(listOf(1), Stacks.rings(0.0, 0.0, listOf(0.0, 5.0)).map { it.halo })
  }

  // Gradients, ticks, the burst, the blend.
  @Test fun aCssGradientLineRunsCornerToCornerAt135Degrees() {
    // 135deg across 100 x 50: a line |w sin| + |h cos| = 106.07 long through the centre (50, 25), pointing to the bottom right.
    assertArrayEquals(doubleArrayOf(12.5, -12.5, 87.5, 62.5), GradientLine.of(135.0, 100.0, 50.0), 1e-9)
    // 90deg is left to right across the width; 0deg is bottom to top.
    assertArrayEquals(doubleArrayOf(0.0, 25.0, 100.0, 25.0), GradientLine.of(90.0, 100.0, 50.0), 1e-9)
    assertArrayEquals(doubleArrayOf(50.0, 50.0, 50.0, 0.0), GradientLine.of(0.0, 100.0, 50.0), 1e-9)
  }

  @Test fun aDimensionLinesTicksFallEveryFiveMinutesWithAMajorOneEveryFifteen() {
    // Blueprint: ticks every 5 minutes, a taller one every 15; 50 px per 5 minutes along 200 px.
    val t = TickRule.ticks(200.0, 50.0, 0.0, 5.0, 15.0)
    assertEquals(listOf(0.0, 50.0, 100.0, 150.0, 200.0), t.map { it.x })
    assertEquals(listOf(true, false, false, true, false), t.map { it.major })
  }

  @Test fun aCellThatBeganBeforeTheTimelineSkipsTheTicksBeforeItsStartButKeepsTheCount() {
    // The programme began 70 px before the line: its first tick is 70 px before the start (major), then 20 px before (skipped), and so on.
    val t = TickRule.ticks(200.0, 50.0, 70.0, 5.0, 15.0)
    assertEquals(listOf(30.0, 80.0, 130.0, 180.0), t.map { it.x })
    // k counts from the programme's start: -70 (0), -20 (1), 30 (2), 80 (3), 130 (4), 180 (5)
    assertEquals(listOf(false, true, false, false), t.map { it.major })
  }

  @Test fun theTickIndexesTheRowsWalkAreTheOnesTheListHolds() {
    // The painter draws by index so it needs no list: the same x and the same major flag as `ticks`.
    for (phase in listOf(0.0, 20.0, 70.0, 125.0)) {
      val listed = TickRule.ticks(300.0, 50.0, phase, 5.0, 15.0)
      val walked = ArrayList<Pair<Double, Boolean>>()
      var k = TickRule.firstIndex(50.0, phase)
      while (TickRule.xAt(k, 50.0, phase) <= 300.5) {
        walked.add(TickRule.xAt(k, 50.0, phase) to TickRule.isMajor(k, 5.0, 15.0))
        k++
      }
      assertEquals("phase $phase", listed.map { it.x to it.major }, walked)
    }
  }

  @Test fun noTicksWithoutAStepOrAWidth() {
    assertTrue(TickRule.ticks(100.0, 0.0, 0.0, 5.0, 15.0).isEmpty())
    assertTrue(TickRule.ticks(0.0, 10.0, 0.0, 5.0, 15.0).isEmpty())
  }

  @Test fun theTicksPhaseIsHowFarTheTimelineClippedTheCell() {
    // Started 20 minutes before the timeline at 4 dp a minute: its raw left is -80, clamped to the 3 dp gap: 83 dp were clipped.
    val origin = 1_000_000_000_000.0
    val start = (origin - 20 * 60_000.0).toLong()
    assertEquals(83.0, TickRule.phase(start, origin, 4.0, 3.0), 1e-9)
    // A cell that starts inside the timeline is not clipped.
    assertEquals(0.0, TickRule.phase((origin + 10 * 60_000.0).toLong(), origin, 4.0, 40.0), 1e-9)
  }

  @Test fun theBurstIsA24VertexStarInsideItsUnitBox() {
    val v = Burst.vertices()
    assertEquals(48, v.size)
    assertTrue(v.all { it in 0f..1f })
    // Vertices alternate between the long and the short radius about the centre, starting straight up.
    fun r(i: Int) = Math.hypot((v[i * 2] - 0.5f).toDouble(), (v[i * 2 + 1] - 0.5f).toDouble())
    for (i in 0 until Burst.POINTS) assertEquals(if (i % 2 == 0) 0.5 else 0.38, r(i), 1e-6)
    assertEquals(0.5f, v[0], 1e-6f)
    assertEquals(0f, v[1], 1e-6f)
    // A quarter of the way round (6 steps of 15 degrees) is straight right.
    assertEquals(1f, v[12], 1e-6f)
    assertEquals(0.5f, v[13], 1e-6f)
  }

  // Color helpers.
  @Test fun aGlyphOnAFillIsBlackOrWhiteWhicheverReadsBetter() {
    assertEquals(GuideColor.BLACK, GuideColor.autoInk(GuideColor.parse("#ffd91a"))) // sunny yellow
    assertEquals(GuideColor.WHITE, GuideColor.autoInk(GuideColor.parse("#243c96"))) // cobalt
    assertEquals(GuideColor.WHITE, GuideColor.autoInk(GuideColor.parse("#e0161e"))) // red: white 4.8:1, black 4.3:1
    assertEquals(GuideColor.BLACK, GuideColor.autoInk(GuideColor.WHITE))
    // A translucent fill is read as it lands on the rail: white 10% over a black rail is nearly black, so the glyph is white.
    assertEquals(GuideColor.WHITE, GuideColor.autoInk(GuideColor.parse("rgba(255,255,255,0.1)"), GuideColor.BLACK))
    assertEquals(GuideColor.BLACK, GuideColor.autoInk(GuideColor.parse("rgba(0,0,0,0.1)"), GuideColor.WHITE))
  }

  @Test fun overAndContrastMatchTheTypeScriptsMath() {
    // White at half alpha over black: 127.5 rounds up to 128, opaque.
    assertEquals(GuideColor.parse("#808080"), GuideColor.over(GuideColor.parse("rgba(255,255,255,0.5)"), GuideColor.BLACK))
    assertEquals(21.0, GuideColor.contrast(GuideColor.BLACK, GuideColor.WHITE), 1e-9)
    assertEquals(1.0, GuideColor.contrast(GuideColor.WHITE, GuideColor.WHITE), 1e-9)
    assertEquals(4.54, GuideColor.contrast(GuideColor.parse("#767676"), GuideColor.WHITE), 0.01) // the familiar AA grey
    assertEquals(0.0, GuideColor.luminance(GuideColor.BLACK), 0.0)
    assertEquals(1.0, GuideColor.luminance(GuideColor.WHITE), 1e-12)
  }
}
