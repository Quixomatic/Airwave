package expo.modules.nativeguide

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The dashed outlines are drawn from masks made once per size. The cache that holds them is bounded by bytes and drops the least recently
 * drawn first, so a long scroll over many cell sizes cannot grow it past its budget.
 */
class DashCacheTest {
  private class Blob(val bytes: Long)

  private fun lru(max: Long) = ByteLru<String, Blob>(max) { it.bytes }

  @Test fun anEntryComesBackAsItWasPut() {
    val c = lru(100)
    val a = Blob(10)
    c.put("a", a)
    assertSame(a, c["a"])
    assertNull(c["b"])
    assertEquals(10, c.bytes)
    assertEquals(1, c.size)
  }

  @Test fun theLeastRecentlyUsedGoFirstWhenTheBudgetIsPassed() {
    val c = lru(30)
    c.put("a", Blob(10))
    c.put("b", Blob(10))
    c.put("c", Blob(10))
    assertEquals(30, c.bytes)
    c["a"] // a is now the most recently used; b is the oldest
    c.put("d", Blob(10))
    assertNull(c["b"])
    assertTrue(c["a"] != null && c["c"] != null && c["d"] != null)
    assertEquals(30, c.bytes)
  }

  @Test fun theBudgetHoldsOverALongRunOfDistinctSizes() {
    val c = lru(1_000)
    for (i in 0 until 5_000) {
      c.put("k$i", Blob(37L + i % 90))
      assertTrue("after $i: ${c.bytes}", c.bytes <= 1_000)
    }
    assertTrue(c.size in 8..40)
  }

  @Test fun anEntryLargerThanTheBudgetIsKeptUntilTheNextOneArrives() {
    val c = lru(50)
    c.put("big", Blob(80))
    assertEquals(1, c.size)
    assertTrue(c["big"] != null)
    c.put("small", Blob(10))
    assertNull(c["big"])
    assertEquals(10, c.bytes)
  }

  @Test fun replacingAKeyDoesNotCountItTwice() {
    val c = lru(100)
    c.put("a", Blob(40))
    c.put("a", Blob(25))
    assertEquals(25, c.bytes)
    assertEquals(1, c.size)
  }

  @Test fun clearForgetsEverything() {
    val c = lru(100)
    c.put("a", Blob(40))
    c.put("b", Blob(40))
    c.clear()
    assertEquals(0, c.bytes)
    assertEquals(0, c.size)
    assertNull(c["a"])
  }

  @Test fun aMaskIsOnlyMadeForABoxASensibleSize() {
    assertTrue(DashMask.fits(1650, 130)) // a long cell
    assertTrue(DashMask.fits(1920, 1080)) // a whole screen
    assertFalse(DashMask.fits(0, 100))
    assertFalse(DashMask.fits(100, 0))
    assertFalse(DashMask.fits(-5, 100))
    assertFalse(DashMask.fits(4000, 4000))
    assertFalse("no overflow in the product", DashMask.fits(Int.MAX_VALUE, Int.MAX_VALUE))
  }

  @Test fun theBudgetHoldsAScreenfulOfCells() {
    // ~70 cells of ~400 x 120 px at one byte a pixel is under 4 MB, so the 16 MB budget keeps a screen and the same again.
    val screenful = 70L * 400 * 120
    assertTrue(screenful * 2 < DashedBorders.MAX_BYTES)
  }
}
