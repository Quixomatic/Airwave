package expo.modules.nativeguide

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

/** A butt-capped straight stroke covers exactly one rectangle, and the dimension line is drawn as those rectangles. */
class StrokeRectTest {
  private fun h(x0: Float, x1: Float, y: Float, w: Float) = FloatArray(4).also { StrokeRect.horizontal(x0, x1, y, w, it) }

  private fun v(x: Float, y0: Float, y1: Float, w: Float) = FloatArray(4).also { StrokeRect.vertical(x, y0, y1, w, it) }

  @Test fun aHorizontalLineIsAStripCenteredOnItsRow() {
    assertArrayEquals(floatArrayOf(10f, 98.5f, 60f, 101.5f), h(10f, 60f, 100f, 3f), 0f)
  }

  @Test fun aVerticalLineIsAStripCenteredOnItsColumn() {
    assertArrayEquals(floatArrayOf(48.5f, 20f, 51.5f, 45f), v(50f, 20f, 45f, 3f), 0f)
  }

  @Test fun theEndsMayComeInEitherOrder() {
    // A tick is stood on the rule and reaches UP the screen: drawLine(x, y, x, y - height) has its second end first.
    assertArrayEquals(v(50f, 45f, 20f, 3f), v(50f, 20f, 45f, 3f), 0f)
    assertArrayEquals(h(60f, 10f, 100f, 3f), h(10f, 60f, 100f, 3f), 0f)
  }

  @Test fun aLineOfNoLengthCoversNothing() {
    val r = h(25f, 25f, 100f, 3f)
    assertEquals(r[0], r[2], 0f) // zero width: drawRect paints nothing, as a butt-capped drawLine of no length does
  }

  @Test fun theAreaIsLengthTimesWidth() {
    for (w in listOf(1f, 1.6f, 2.4f, 4f)) {
      val r = v(7f, 3f, 29f, w)
      assertEquals(26f * w, (r[2] - r[0]) * (r[3] - r[1]), 1e-4f)
    }
  }
}
