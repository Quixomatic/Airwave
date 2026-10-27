package expo.modules.nativeguide

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Where the focus goes next, so a row can be drawn before the key that focuses it. */
class FocusPredictionTest {
  private val programs = mapOf(
    0 to listOf("a0", "a1", "a2"),
    1 to listOf("b0", "b1", "b2", "b3"),
    2 to listOf("c0"),
    3 to emptyList(),
  )
  private val live = mapOf(0 to "a1", 1 to "b0", 2 to "c0", 3 to null)

  private fun next(prev: FocusPrediction.Focus?, cur: FocusPrediction.Focus) =
    FocusPrediction.next(prev, cur, 4, { programs[it].orEmpty() }, { live[it] })

  private fun grid(row: Int, program: String?) = FocusPrediction.Focus(row, RowState.ZONE_GRID, program)

  @Test fun movingDownGoesOnDownToTheLiveProgramOfTheNextRow() {
    val n = next(grid(0, "a1"), grid(1, "b0"))!!
    assertEquals(2, n.row)
    assertEquals("c0", n.programId)
    assertEquals(RowState.ZONE_GRID, n.zone)
  }

  @Test fun movingUpGoesOnUp() {
    val n = next(grid(2, "c0"), grid(1, "b0"))!!
    assertEquals(0, n.row)
    assertEquals("a1", n.programId)
  }

  @Test fun theEndOfTheListHasNothingBeyondIt() {
    assertNull(next(grid(2, "c0"), grid(3, null)))
    assertNull(next(grid(1, "b0"), grid(0, "a1")))
  }

  @Test fun aRowWithNoProgramOnAirHasNothingToSelectAhead() {
    assertNull(next(grid(1, "b0"), grid(2, "c0")))
  }

  @Test fun movingAlongARowGoesOnAlongIt() {
    val n = next(grid(1, "b0"), grid(1, "b1"))!!
    assertEquals(1, n.row)
    assertEquals("b2", n.programId)
    val back = next(grid(1, "b3"), grid(1, "b2"))!!
    assertEquals("b1", back.programId)
  }

  @Test fun theEndOfARowHasNothingBeyondIt() {
    assertNull(next(grid(1, "b2"), grid(1, "b3")))
    assertNull(next(grid(1, "b1"), grid(1, "b0")))
  }

  @Test fun inTheRailTheFocusMovesDownTheRailsWithoutAProgram() {
    val n = next(FocusPrediction.Focus(0, RowState.ZONE_RAIL, null), FocusPrediction.Focus(1, RowState.ZONE_RAIL, null))!!
    assertEquals(2, n.row)
    assertEquals(RowState.ZONE_RAIL, n.zone)
    assertNull(n.programId)
  }

  @Test fun noMoveToRepeatIsNoGuess() {
    assertNull(next(null, grid(1, "b0")))
    assertNull(next(grid(1, "b0"), grid(1, "b0")))
    // A change of zone is not a move to repeat.
    assertNull(next(grid(1, "b0"), FocusPrediction.Focus(1, RowState.ZONE_RAIL, null)))
    assertNull(next(FocusPrediction.Focus(1, RowState.ZONE_SIDEBAR, null), FocusPrediction.Focus(2, RowState.ZONE_SIDEBAR, null)))
  }

  @Test fun aProgramThatIsNotInTheRowIsNoGuess() {
    assertNull(next(grid(1, "x"), grid(1, "b1")))
    assertNull(next(grid(1, "b0"), grid(1, "zz")))
  }

  @Test fun sameAsComparesTheThreeParts() {
    assertTrue(grid(1, "b0").sameAs(grid(1, "b0")))
    assertTrue(!grid(1, "b0").sameAs(grid(1, "b1")))
    assertTrue(!grid(1, "b0").sameAs(null))
  }
}
