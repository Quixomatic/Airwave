package expo.modules.nativeguide

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

/** A row's clock is worked out once per row until the time or the geometry moves, not once per row per frame, and only for rows drawn lately. */
class ClockCacheTest {
  private val geo = GuideGeo("{}")
  private var asked = 0
  private val cache = ClockCache()

  private fun row(n: Int) = GuideRow(GuideChannel("c$n", "$n", "Channel $n", "lucide:Radio", null, emptyArray()), 0, false)

  private fun clockOf(r: GuideRow, g: GuideGeo = geo, now: Double = 1000.0, value: Long = 7) =
    cache.of(r, g, now) { asked += 1; value }

  @Test fun aRowIsAskedOncePerChangeNotOncePerFrameDrawn() {
    val rows = (0 until 12).map { row(it) }
    repeat(60) {
      cache.nextFrame()
      for (r in rows) assertEquals(7L, clockOf(r)) // sixty frames of twelve rows
    }
    assertEquals(12, asked)
  }

  @Test fun theTimeMovingAsksAgain() {
    val r = row(1)
    assertEquals(7L, clockOf(r, now = 1000.0, value = 7))
    assertEquals("the same time: remembered", 7L, clockOf(r, now = 1000.0, value = 99))
    assertEquals("a new time: asked again", 99L, clockOf(r, now = 61_000.0, value = 99))
    assertEquals(2, asked)
  }

  @Test fun aNewGeometryAsksAgain() {
    val r = row(1)
    clockOf(r)
    clockOf(r, g = GuideGeo("{}")) // another geometry object
    assertEquals(2, asked)
  }

  @Test fun eachRowHasItsOwnAnswer() {
    val a = row(1)
    val b = row(2)
    assertEquals(1L, clockOf(a, value = 1))
    assertEquals(2L, clockOf(b, value = 2))
    assertEquals(1L, clockOf(a, value = 5))
    assertNotEquals(clockOf(a, value = 5), clockOf(b, value = 5))
  }

  @Test fun anEqualButDifferentRowObjectIsAnotherRow() {
    // Rows are told apart by identity: a changed row is a new object, which is how a lineup update makes its recording stale too.
    clockOf(row(1))
    clockOf(row(1))
    assertEquals(2, asked)
  }

  @Test fun clearForgetsEverything() {
    val r = row(1)
    clockOf(r)
    cache.clear()
    assertEquals(0, cache.size)
    clockOf(r)
    assertEquals(2, asked)
  }

  @Test fun aRowThatIsNoLongerDrawnIsLetGoWithinTwoFrames() {
    // A lineup is replaced: its rows are not asked about again, and the cache does not keep them reachable.
    val old = (0 until 40).map { row(it) }
    for (r in old) clockOf(r)
    assertEquals(40, cache.size)
    val fresh = (100 until 112).map { row(it) }
    cache.nextFrame()
    for (r in fresh) clockOf(r)
    assertEquals("the last frame's rows are still held for the frame after", 52, cache.size)
    cache.nextFrame()
    for (r in fresh) clockOf(r)
    assertEquals("the old lineup is gone", 12, cache.size)
    val before = asked
    clockOf(old[0])
    assertEquals("an old row is worked out again", before + 1, asked)
  }

  @Test fun aRowDrawnInEveryFrameIsKeptAndOneSkippedForAFrameStillIs() {
    val steady = row(1)
    val skipped = row(2)
    clockOf(steady)
    clockOf(skipped)
    repeat(5) {
      cache.nextFrame()
      clockOf(steady)
    }
    assertEquals("the steady row was never asked again", 2, asked)
    val skippedOnce = row(3)
    clockOf(skippedOnce)
    cache.nextFrame() // a frame that does not draw it
    assertEquals(7L, clockOf(skippedOnce, value = 99)) // asked in the frame after: still remembered, so not worked out again
    assertEquals(3, asked)
  }
}
