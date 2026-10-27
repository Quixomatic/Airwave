package expo.modules.nativeguide

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Where graph paper's lines start: whole multiples of the step, none at or past the edge. */
class GridLinesTest {
  @Test fun aLineEveryStepFromTheEdgeUpToTheExtent() {
    assertArrayEquals(floatArrayOf(0f, 24f, 48f, 72f), GridLines.starts(24.0, 96.0), 0f)
    // The edge itself is not a line start: a line there would be wholly outside the view.
    assertEquals(4, GridLines.starts(24.0, 96.0).size)
    // A partial last cell still gets its line at its start.
    assertArrayEquals(floatArrayOf(0f, 24f, 48f, 72f, 96f), GridLines.starts(24.0, 97.0), 0f)
  }

  @Test fun eachLineIsAtItsMultipleOfTheStepNotTheSumOfTheStepsBefore() {
    // 15.96 px: a sum of floats drifts, a multiple does not. The line at index 999 is at 999 * 15.96.
    val at = GridLines.starts(15.96, 16_000.0)
    assertEquals((999 * 15.96).toFloat(), at[999], 0f)
    assertEquals(1003, at.size)
  }

  @Test fun theMajorLinesFallOnMinorOnesWhenTheyDivide() {
    val minor = GridLines.starts(24.0, 1920.0).toSet()
    val major = GridLines.starts(120.0, 1920.0)
    assertTrue(major.all { it in minor })
    assertEquals(16, major.size)
  }

  @Test fun noStepOrNoExtentIsNoLines() {
    assertEquals(0, GridLines.starts(0.0, 100.0).size)
    assertEquals(0, GridLines.starts(-5.0, 100.0).size)
    assertEquals(0, GridLines.starts(Double.NaN, 100.0).size)
    assertEquals(0, GridLines.starts(24.0, 0.0).size)
    assertEquals(0, GridLines.starts(24.0, -3.0).size)
  }
}
