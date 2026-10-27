package expo.modules.nativeguide

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The featured panel's dimension line, laid out natively: the numbers the React Native `DimensionLine` (react-native-svg) draws with, in the
 * view's pixels. The values are the ones Blueprint's tokens give on a 1080p TV (a design px is 0.75 px).
 */
class DimensionLayoutTest {
  // 1500 x 24 px bar, Blueprint's ticks: a tick every 5 minutes, a tall one every 30 (every 6th), 8 and 16 design px tall, 1.6 thick, caps 24.
  private fun layout(pct: Double = 0.4, durationMin: Double = 60.0, width: Float = 1500f) =
    DimensionLayout(width, 24f, 0.75f, pct, DimensionLayout.stepsAcross(durationMin, 5.0), DimensionLayout.majorTicks(5.0, 30.0), 8f, 16f, 1.6f, 24f)

  @Test fun theRuleSitsEightDesignPixelsAboveTheBottomAndNowFallsAtItsShareOfTheWidth() {
    val l = layout()
    assertEquals(24f - 8f * 0.75f, l.y, 1e-4f)
    assertEquals(600f, l.nowX, 1e-3f)
    val out = FloatArray(4)
    l.rule(true, out)
    // The heavier part is twice as thick as the lighter one and ends at now.
    assertArrayEquals(floatArrayOf(0f, 18f - 1.2f, 600f, 18f + 1.2f), out, 1e-3f)
    l.rule(false, out)
    assertArrayEquals(floatArrayOf(600f, 18f - 0.6f, 1500f, 18f + 0.6f), out, 1e-3f)
  }

  @Test fun aTickEveryStepAcrossTheWidthAndATallOneEveryNth() {
    val l = layout(durationMin = 60.0)
    val xs = ArrayList<Float>()
    val major = ArrayList<Boolean>()
    l.ticks { x, m ->
      xs.add(x)
      major.add(m)
    }
    // 60 minutes at a tick per 5: 12 steps of 125 px, and the one at 1500 (the end) is within the half pixel allowed past it.
    assertEquals(13, xs.size)
    assertEquals(0f, xs.first(), 0f)
    assertEquals(125f, xs[1], 1e-3f)
    assertEquals(1500f, xs.last(), 1e-3f)
    // Every sixth is a major one (30 minutes): at 0, 750 and 1500.
    assertEquals(listOf(0, 6, 12), major.indices.filter { major[it] })
  }

  @Test fun aTickIsAStrokeFromTheRuleUpByItsHeight() {
    val l = layout()
    val out = FloatArray(4)
    l.tick(125f, false, out)
    assertArrayEquals(floatArrayOf(125f - 0.6f, 18f - 8f * 0.75f, 125f + 0.6f, 18f), out, 1e-3f)
    l.tick(750f, true, out)
    assertArrayEquals(floatArrayOf(750f - 0.6f, 18f - 16f * 0.75f, 750f + 0.6f, 18f), out, 1e-3f)
  }

  @Test fun theCapsStandInFromTheEndsAndAreTrimmedAndTheNowMarkIsTallerThanThem() {
    val l = layout()
    val out = FloatArray(4)
    assertEquals(0.6f, l.capX(false), 1e-4f)
    assertEquals(1500f - 0.6f, l.capX(true), 1e-3f)
    l.cap(l.capX(false), out)
    // (capH / 2 - 4) design px each way from the rule, 1.5 times as thick as a tick.
    val half = (12f - 4f) * 0.75f
    assertArrayEquals(floatArrayOf(0.6f - 0.9f, 18f - half, 0.6f + 0.9f, 18f + half), out, 1e-3f)
    l.nowMark(out)
    assertArrayEquals(floatArrayOf(600f - 1.2f, 18f - (24f - 6f) * 0.75f, 600f + 1.2f, 18f + 5f * 0.75f), out, 1e-3f)
  }

  @Test fun aProgrammeShorterThanOneStepIsOneStepWide() {
    // The step is never shorter than the line: a 3 minute programme with a tick per 5 has its only step across the whole width.
    assertEquals(1.0, DimensionLayout.stepsAcross(3.0, 5.0), 0.0)
    val l = layout(durationMin = 3.0)
    var n = 0
    l.ticks { _, _ -> n += 1 }
    assertEquals(2, n)
  }

  @Test fun majorTicksAreCountedInTicksNotMinutes() {
    assertEquals(6, DimensionLayout.majorTicks(5.0, 30.0))
    assertEquals(1, DimensionLayout.majorTicks(5.0, 0.0))
    assertEquals(3, DimensionLayout.majorTicks(10.0, 30.0))
  }

  @Test fun nowIsClampedToTheLine() {
    assertEquals(0f, layout(pct = -0.3).nowX, 0f)
    assertEquals(1500f, layout(pct = 1.7).nowX, 1e-3f)
    assertFalse(layout().nowX.isNaN())
    assertTrue(layout(pct = 0.0).nowX == 0f)
  }
}

/** Edges land where Skia's CPU rasterizer puts them: on a quarter of a pixel. */
class QuarterPixelTest {
  @Test fun anEdgeIsTheNearestQuarter() {
    assertEquals(345.25f, quarterPixel(345.31f), 0f)
    assertEquals(347.75f, quarterPixel(347.69f), 0f)
    assertEquals(346.0f, quarterPixel(345.9f), 0f)
    assertEquals(347.0f, quarterPixel(347.1f), 0f)
    assertEquals(0.0f, quarterPixel(0.1f), 0f)
    assertEquals(-0.25f, quarterPixel(-0.2f), 0f)
  }
}
