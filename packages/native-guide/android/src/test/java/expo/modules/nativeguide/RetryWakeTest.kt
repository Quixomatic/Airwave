package expo.modules.nativeguide

import org.junit.Assert.assertEquals
import org.junit.Test

/** GuideImages' shared retry wake-up: the posted tick must always fire by the EARLIEST requested time. */
class RetryWakeTest {
  @Test fun firstRequestPostsItsDelay() {
    val w = RetryWake()
    assertEquals(4_000L, w.request(now = 1_000, delayMs = 4_000))
    assertEquals(5_000L, w.dueAt)
  }

  @Test fun anEarlierRequestRepostsTheTick() {
    // A single "posted" flag would drop this one: a 1 s retry would wait behind a pending 4 s one.
    val w = RetryWake()
    w.request(0, 4_000)
    assertEquals(1_000L, w.request(100, 1_000))
    assertEquals(1_100L, w.dueAt)
  }

  @Test fun aLaterRequestIsCoveredByThePostedTick() {
    val w = RetryWake()
    w.request(0, 1_000)
    assertEquals(-1L, w.request(100, 4_000))
    assertEquals(-1L, w.request(100, 900)) // due 1000 exactly: covered
    assertEquals(1_000L, w.dueAt)
  }

  @Test fun theFrescoNotReadyRecheckIsNotStarvedByABackoff() {
    val w = RetryWake()
    w.request(0, 4_000)
    assertEquals(250L, w.request(0, 250))
  }

  @Test fun firingClearsSoTheNextRequestPostsAgain() {
    val w = RetryWake()
    w.request(0, 1_000)
    w.fired()
    assertEquals(-1L, w.dueAt)
    assertEquals(2_000L, w.request(1_000, 2_000))
  }

  @Test fun resetForgetsThePostedTick() {
    val w = RetryWake()
    w.request(0, 1_000)
    w.reset()
    assertEquals(3_000L, w.request(0, 3_000))
  }

  @Test fun delaysAreClampedToAFrame() {
    val w = RetryWake()
    assertEquals(RetryWake.MIN_DELAY_MS, w.request(0, -50))
    assertEquals(RetryWake.MIN_DELAY_MS, w.dueAt)
  }

  @Test fun everyRequestIsServedByItsDueTime() {
    // Whatever is requested, the posted tick is never later than the earliest due request.
    val w = RetryWake()
    var earliest = Long.MAX_VALUE
    var now = 0L
    val delays = longArrayOf(4_000, 1_000, 2_000, 250, 25_000, 16, 8_000, 3, 1_000)
    for (d in delays) {
      now += 7
      w.request(now, d)
      earliest = minOf(earliest, now + maxOf(d, RetryWake.MIN_DELAY_MS))
      assertEquals(earliest, w.dueAt)
    }
  }
}
