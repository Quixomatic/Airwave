package expo.modules.nativeguide

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The focus rules the React Native rows apply per row, as the view derives them from its props. */
class RowStateTest {
  private fun state(index: Int, zone: String, mini: Boolean = false, focusRow: Int = 2) = RowState.of(index, focusRow, "p9", zone, mini)

  @Test fun theFocusedRowInTheGridSelectsItsProgram() {
    val s = state(2, "grid")
    assertTrue(s.focused)
    assertFalse(s.railFocused)
    assertEquals("p9", s.focusedProgramId)
  }

  @Test fun theFocusedRowInTheRailFocusesItsRailAndNoProgram() {
    val s = state(2, "rail")
    assertTrue(s.focused)
    assertTrue(s.railFocused)
    assertNull(s.focusedProgramId)
  }

  @Test fun noRowIsFocusedWhileTheSidebarHasFocus() {
    val s = state(2, "sidebar")
    assertFalse(s.focused)
    assertFalse(s.railFocused)
    assertNull(s.focusedProgramId)
  }

  @Test fun noRowIsFocusedWhileTheMiniPlayerHasFocus() {
    for (zone in listOf("grid", "rail", "sidebar")) {
      val s = state(2, zone, mini = true)
      assertFalse(zone, s.focused)
      assertFalse(zone, s.railFocused)
      assertNull(zone, s.focusedProgramId)
    }
  }

  @Test fun otherRowsAreNeverFocused() {
    for (zone in listOf("grid", "rail", "sidebar")) {
      val s = state(3, zone)
      assertFalse(s.focused)
      assertFalse(s.railFocused)
      assertNull(s.focusedProgramId)
      assertEquals(3, s.index)
    }
  }

  @Test fun aMissingProgramIdStaysNull() {
    assertNull(RowState.of(0, 0, null, "grid", false).focusedProgramId)
  }

  private val row = GuideRow(
    GuideChannel(
      "c1", "12", "News 12", "lucide:Radio", null,
      arrayOf(GuideProgram("p8", 0, 1800, "Earlier", null, ""), GuideProgram("p9", 1_800_000, 1800, "Evening News", null, "")),
    ),
    accent = 0,
    fav = false,
  )

  @Test fun talkBackReadsTheFocusedRowAndItsSelectedProgramInTheGrid() {
    assertEquals("12, News 12, Evening News", state(2, "grid").description(row))
  }

  @Test fun talkBackReadsOnlyTheChannelWhileTheRailHasFocus() {
    assertEquals("12, News 12", state(2, "rail").description(row))
  }

  @Test fun talkBackReadsNoRowWhileTheSidebarOrTheMiniPlayerHasFocus() {
    assertNull(state(2, "sidebar").description(row))
    for (zone in listOf("grid", "rail", "sidebar")) assertNull(zone, state(2, zone, mini = true).description(row))
  }

  @Test fun talkBackSkipsAnEmptyNameAndAProgramTheRowDoesNotHave() {
    val bare = GuideRow(GuideChannel("c2", "7", "", "", null, arrayOf()), accent = 0, fav = false)
    assertEquals("7", state(2, "grid").description(bare))
  }
}
