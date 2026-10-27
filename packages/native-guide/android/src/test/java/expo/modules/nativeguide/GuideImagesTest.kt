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

  @Test fun aFreshFetchFadesInOver300msAndACacheHitIsDrawnAtOnce() {
    assertEquals(1f, GuideImages.fade(0, 5_000), 0f) // a memory-cache hit
    assertEquals(0f, GuideImages.fade(1_000, 1_000), 0f)
    assertEquals(0.5f, GuideImages.fade(1_000, 1_150), 1e-6f)
    assertEquals(1f, GuideImages.fade(1_000, 1_300), 0f)
    assertEquals("past the fade", 1f, GuideImages.fade(1_000, 9_000), 0f)
    assertEquals("a clock that went backwards", 0f, GuideImages.fade(1_000, 900), 0f)
  }
}
