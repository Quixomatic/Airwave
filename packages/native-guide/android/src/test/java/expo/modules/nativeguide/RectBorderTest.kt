package expo.modules.nativeguide

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

/** The row's rule and the rail's divider are borders on views with no corner radius, which React Native draws its own way (see [RectBorder]). */
class RectBorderTest {
  @Test fun aBorderIsDrawnInWholePixels() {
    assertEquals(3, RectBorder.widthPx(3f))
    assertEquals(3, RectBorder.widthPx(2.5f)) // halves round up
    assertEquals(2, RectBorder.widthPx(2.4f))
    assertEquals(0, RectBorder.widthPx(0.4f)) // under half a pixel there is none
  }

  @Test fun anEvenWidthCoversExactlyItsPixelsInsideTheEdge() {
    assertArrayEquals(floatArrayOf(0f, 2f), RectBorder.band(2), 0f)
    assertArrayEquals(floatArrayOf(0f, 4f), RectBorder.band(4), 0f)
  }

  @Test fun anOddWidthStraddlesAPixelBoundary() {
    // High Contrast's rule and divider are 3 px: half a pixel past the edge, then two whole pixels and half of a third inside it.
    assertArrayEquals(floatArrayOf(-0.5f, 2.5f), RectBorder.band(3), 0f)
    assertArrayEquals(floatArrayOf(-0.5f, 0.5f), RectBorder.band(1), 0f)
    assertArrayEquals(floatArrayOf(-0.5f, 4.5f), RectBorder.band(5), 0f)
  }
}
