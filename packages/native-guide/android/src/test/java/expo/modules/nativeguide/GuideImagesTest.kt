package expo.modules.nativeguide

import org.junit.Assert.assertEquals
import org.junit.Test

class GuideImagesTest {
  private val mb = 1024L * 1024L

  @Test fun theBudgetIsAnEighthOfTheMemoryClass() {
    assertEquals(24 * mb, imageBudgetBytes(192))
    assertEquals(32 * mb, imageBudgetBytes(256))
  }

  @Test fun theBudgetIsBounded() {
    assertEquals("unknown memory class", 16 * mb, imageBudgetBytes(0))
    assertEquals(16 * mb, imageBudgetBytes(64))
    assertEquals(48 * mb, imageBudgetBytes(512))
    assertEquals(48 * mb, imageBudgetBytes(4096))
  }
}
