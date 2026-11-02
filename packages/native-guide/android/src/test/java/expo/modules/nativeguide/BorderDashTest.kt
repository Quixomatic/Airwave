package expo.modules.nativeguide

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * A dashed border is drawn the way React Native draws it (BorderDrawable): three border widths on, three off, from the path's start.
 * Blueprint's tokens ask for 8 design px dashes with 6 design px gaps; React Native draws 3 widths and 3 widths whatever they say, and the
 * classic rows are what the native ones have to match.
 */
class BorderDashTest {
  @Test fun dashesAreThreeBorderWidthsOnAndThreeOff() {
    assertArrayEquals(floatArrayOf(6f, 6f, 6f, 6f), BorderDash.intervals(2f), 0f)
    assertArrayEquals(floatArrayOf(4.5f, 4.5f, 4.5f, 4.5f), BorderDash.intervals(1.5f), 0f)
  }

  @Test fun theRepeatIsTheSameWhateverTheWidth() {
    for (w in listOf(1f, 2f, 3.5f, 5.25f)) {
      val d = BorderDash.intervals(w)
      assertEquals(4, d.size)
      assertEquals(3 * w, d[0], 0f)
      assertEquals(d[0], d[2], 0f)
      assertEquals(d[1], d[3], 0f)
      assertEquals(d[0], d[1], 0f)
    }
  }
}
