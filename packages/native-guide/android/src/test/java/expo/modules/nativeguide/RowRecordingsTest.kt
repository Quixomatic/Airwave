package expo.modules.nativeguide

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

private typealias S = RowRecordings.Slot<RowRecordingsTest.Node, String>

/**
 * A row is drawn from its recording while nothing it draws has changed. These pin what "changed" means (what makes a recording stale), which focuses a row
 * keeps a recording for, and how many rows a D-pad move or a scroll records afresh, which is what keeps a frame cheap on a weak CPU.
 */
class RowRecordingsTest {
  internal class Node(val id: Int) {
    var discarded = false
  }

  private val made = ArrayList<Node>()
  private val rec = RowRecordings<Node, String>({ Node(made.size).also { made.add(it) } }, { it.discarded = true })

  private fun row(n: Int) = GuideRow(GuideChannel("c$n", "$n", "Channel $n", "lucide:Radio", null, emptyArray()), 0xFF336699.toInt(), false)

  private fun state(index: Int, focusRow: Int = -1, program: String? = "p1", zone: String = RowState.ZONE_GRID) = RowState.of(index, focusRow, program, zone, false)

  private fun S.current(r: GuideRow, epoch: Long = 1, variant: Long = 0, images: Long = 1, clock: Long = 0) = isCurrent(r, epoch, variant, images, clock)

  private fun S.recorded(r: GuideRow, epoch: Long = 1, variant: Long = 0, images: Long = 1, drew: List<String> = emptyList(), stale: Boolean = false, clock: Long = 0) =
    record(r, epoch, variant, images, drew, stale, clock)

  @Test fun aFreshSlotIsNotCurrentAndARecordedOneIs() {
    val r = row(1)
    val s = rec.slot(1, state(1))
    assertFalse(s.current(r))
    s.recorded(r)
    assertTrue(s.current(r))
  }

  @Test fun theSameRowInTheSameFocusKeepsItsSlotAndItsNode() {
    val a = rec.slot(3, state(3))
    val b = rec.slot(3, state(3))
    assertSame(a, b)
    assertEquals(1, made.size)
  }

  @Test fun aRowKeepsARecordingForItsFocusAndOneForTheFocusExpectedNext() {
    val now = rec.slot(1, state(1, focusRow = 5))
    val next = rec.slot(1, state(1, focusRow = 1, program = "p1"))
    assertNotSame(now, next)
    // Both are there when the frame that moves the focus asks for them.
    assertSame(now, rec.slot(1, state(1, focusRow = 9)))
    assertSame(next, rec.slot(1, state(1, focusRow = 1, program = "p1")))
    assertEquals(2, rec.size)
    assertFalse(made.any { it.discarded })
  }

  @Test fun aThirdFocusLetsGoOfTheLeastRecentlyUsedRecording() {
    val a = rec.slot(1, state(1, focusRow = 5))
    val b = rec.slot(1, state(1, focusRow = 1, program = "p1"))
    rec.slot(1, state(1, focusRow = 5)) // a is the more recently used now
    val c = rec.slot(1, state(1, focusRow = 1, program = "p2"))
    assertEquals(2, rec.size)
    assertTrue("the older one was let go", b.node.discarded)
    assertFalse(a.node.discarded)
    assertFalse(c.node.discarded)
    assertSame(a, rec.slot(1, state(1, focusRow = 9)))
  }

  @Test fun everyFocusIsItsOwnState() {
    val grid = rec.slot(1, state(1, focusRow = 1, program = "p1"))
    val rail = rec.slot(1, state(1, focusRow = 1, program = "p1", zone = RowState.ZONE_RAIL))
    assertNotSame(grid, rail)
    // The sidebar focuses no row: such a row is the same as an unfocused one.
    val none = rec.slot(2, state(2, focusRow = 2, program = "p1", zone = RowState.ZONE_SIDEBAR))
    assertSame(none, rec.slot(2, state(2, focusRow = 7)))
  }

  @Test fun aRecordingIsOfOneRowObject() {
    val s = rec.slot(1, state(1))
    val r = row(1)
    s.recorded(r)
    // A store makes a new GuideRow when a row's channel, accent or favorite flag changes (and only then): the recording is of the old one.
    assertFalse(s.current(row(1)))
    assertTrue(s.current(r))
  }

  @Test fun aMovedClockMakesOnlyARowThatDrawsFromItStale() {
    val r = row(1)
    val live = rec.slot(1, state(1))
    live.recorded(r, clock = 1_000)
    assertTrue(live.current(r, clock = 1_000))
    assertFalse("the live cell's progress moved", live.current(r, clock = 61_000))
    val idle = rec.slot(2, state(2))
    idle.recorded(r, clock = 0)
    assertTrue("a row with no live cell draws nothing from the clock", idle.current(r, clock = 0))
  }

  @Test fun aNewEpochMakesTheRecordingStale() {
    val r = row(1)
    val s = rec.slot(1, state(1))
    s.recorded(r, epoch = 7)
    assertFalse(s.current(r, epoch = 8))
    assertTrue(s.current(r, epoch = 7))
  }

  @Test fun aRecordingMadeAnotherWayIsStale() {
    // The variant is how the view made the list: in a layer or not, and over which backdrop.
    val r = row(1)
    val s = rec.slot(1, state(1))
    s.recorded(r, variant = 0)
    assertFalse("now it sits in a layer", s.current(r, variant = 1))
    s.recorded(r, variant = (1L shl 32) or 0xFFEBE2CDL)
    assertTrue(s.current(r, variant = (1L shl 32) or 0xFFEBE2CDL))
    assertFalse("the backdrop changed", s.current(r, variant = (1L shl 32) or 0xFF243C96L))
  }

  @Test fun onlyARowThatDrewAnImageIsStaleWhenTheImagesChange() {
    val r = row(1)
    val plain = rec.slot(1, state(1))
    plain.recorded(r, images = 10)
    assertTrue("no image drawn", plain.current(r, images = 11))
    val art = rec.slot(2, state(2))
    art.recorded(r, images = 10, drew = listOf("poster.png"))
    assertTrue(art.current(r, images = 10))
    assertFalse("an image arrived, failed or was let go", art.current(r, images = 11))
  }

  @Test fun aRowWithAnUnsettledImageIsRecordedAgainOnTheNextFrame() {
    val r = row(1)
    val s = rec.slot(1, state(1))
    s.recorded(r, drew = listOf("poster.png"), stale = true)
    assertFalse(s.current(r))
    s.recorded(r, drew = listOf("poster.png"), stale = false)
    assertTrue(s.current(r))
  }

  @Test fun forgettingASlotMakesItStaleButKeepsItsNode() {
    val r = row(1)
    val s = rec.slot(1, state(1))
    s.recorded(r, drew = listOf("x"))
    s.forget()
    assertFalse(s.current(r))
    assertTrue(s.images.isEmpty())
    assertFalse(s.node.discarded)
  }

  @Test fun rowsWellOffScreenLoseTheirNodesAndTheOnesJustPastTheEdgeKeepThem() {
    for (i in 0..20) rec.slot(i, state(i))
    rec.retain(first = 8, last = 12, margin = 2)
    assertEquals(9, rec.size) // 6..14
    assertTrue(made.filter { it.id in 0..5 || it.id in 15..20 }.all { it.discarded })
    assertTrue(made.filter { it.id in 6..14 }.none { it.discarded })
    // A row that comes back gets a new node and nothing recorded.
    val back = rec.slot(2, state(2))
    assertFalse(back.recorded)
    assertEquals(22, made.size)
  }

  @Test fun rowsLetGoOfTakeEveryRecordingOfTheRowWithThem() {
    rec.slot(0, state(0, focusRow = 5))
    rec.slot(0, state(0, focusRow = 0))
    rec.retain(first = 10, last = 12, margin = 2)
    assertEquals(0, rec.size)
    assertTrue(made.all { it.discarded })
  }

  @Test fun clearReleasesEveryNode() {
    for (i in 0..4) rec.slot(i, state(i))
    rec.clear()
    assertEquals(0, rec.size)
    assertTrue(made.all { it.discarded })
  }

  /** The slots the frame on screen drew: a node in it that the next frame leaves out loses its list. One never drawn (recorded ahead) keeps it. */
  private var inTree = HashSet<S>()

  private fun slotFor(i: Int, st: RowState): S = rec.slot(i, st)

  /**
   * The view's loop, as it runs per frame: record what is stale, draw the rest from their lists. Returns how many rows it recorded. A node the frame
   * does not draw loses its list (the GPU side frees the list of a node the display list on screen no longer names), which is modeled here.
   */
  private fun frame(rows: List<GuideRow>, visible: IntRange, focusRow: Int, program: String, epoch: Long = 1): Int {
    var recorded = 0
    val drawn = HashSet<S>()
    for (i in visible) {
      val s = slotFor(i, state(i, focusRow, program))
      if (!s.current(rows[i], epoch = epoch)) {
        s.recorded(rows[i], epoch = epoch)
        recorded += 1
      }
      drawn.add(s)
    }
    for (s in inTree) if (s !in drawn) s.forget()
    inTree = drawn
    rec.retain(visible.first, visible.last, 2)
    return recorded
  }

  /** What the view does in idle time after a frame: the row the focus will reach is recorded in its focus, and the one it leaves without one. */
  private fun lookAhead(rows: List<GuideRow>, from: Int, to: Int, program: String) {
    if (to !in rows.indices) return
    val reached = slotFor(to, state(to, to, program))
    if (!reached.current(rows[to])) reached.recorded(rows[to])
    val left = slotFor(from, state(from, to, program))
    if (!left.current(rows[from])) left.recorded(rows[from])
  }

  @Test fun aScreenfulIsRecordedOnceAndNothingChangedRecordsNothing() {
    val rows = (0 until 48).map { row(it) }
    assertEquals("the first frame records every visible row", 6, frame(rows, 0..5, 0, "p1"))
    assertEquals("nothing changed", 0, frame(rows, 0..5, 0, "p1"))
    assertEquals("nothing changed", 0, frame(rows, 0..5, 0, "p1"))
  }

  @Test fun aFocusMoveWithoutLookingAheadRecordsTheRowReachedAndTheRowLeft() {
    val rows = (0 until 48).map { row(it) }
    frame(rows, 0..5, 0, "p1")
    assertEquals("the row the focus left is drawn without it, the one it reached with it: both lists were freed or never made", 2, frame(rows, 0..5, 1, "p1"))
    assertEquals(2, frame(rows, 0..5, 2, "p1"))
    assertEquals("the selected program moved along the row", 1, frame(rows, 0..5, 2, "p2"))
  }

  @Test fun walkingTheWholeListRecordsTwoRowsPerStepWithoutLookingAhead() {
    val rows = (0 until 48).map { row(it) }
    var top = 0
    var total = 0
    frame(rows, 0..5, 0, "p1")
    for (focus in 1 until 48) {
      if (focus > top + 5) top = focus - 5
      total += frame(rows, top..top + 5, focus, "p1")
    }
    assertEquals(47 * 2, total)
  }

  @Test fun walkingTheWholeListWithTheNextRowRecordedAheadRecordsNothingOnceItIsRunning() {
    val rows = (0 until 48).map { row(it) }
    var top = 0
    var worst = 0
    var total = 0
    frame(rows, 0..5, 0, "p1")
    frame(rows, 0..5, 1, "p1") // the first moves have nothing to go by
    for (focus in 2 until 48) {
      lookAhead(rows, from = focus - 1, to = focus, program = "p1") // idle after the previous frame: the focus is expected at `focus`
      if (focus > top + 5) top = focus - 5
      val n = frame(rows, top..top + 5, focus, "p1")
      worst = maxOf(worst, n)
      total += n
    }
    assertEquals("worst step recorded $worst rows", 0, worst)
    assertEquals(0, total)
  }

  @Test fun aWrongGuessCostsOnlyTheRecordingTheStepWouldHaveHad() {
    val rows = (0 until 48).map { row(it) }
    frame(rows, 0..5, 0, "p1")
    lookAhead(rows, from = 0, to = 1, program = "p1")
    // The focus does not go down but along the row: the guess is of no use, and the move is drawn as it would have been without one.
    assertEquals(1, frame(rows, 0..5, 0, "p2"))
  }
}
