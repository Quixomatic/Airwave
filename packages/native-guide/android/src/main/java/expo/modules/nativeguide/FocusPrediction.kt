package expo.modules.nativeguide

/**
 * Where the focus is likely to go next, so the row it lands on can be drawn ahead of time, in the idle time between frames, and the frame the D-pad
 * press makes finds it ready. A key that is held (or pressed again) goes the same way as the last one: down a row, or on along a row. A guess that is wrong
 * costs the idle time it took and nothing else (the row is drawn when it is needed, as it would have been), so this only has to be right usually.
 *
 * It follows the guide's own rules (tv-native `aurora-grid.tsx`): a move to another row selects that row's program that is on air now (the first one if
 * none is), in the grid zone, and keeps the rail focused in the rail zone; a move along a row selects the next program. No Android types: unit-tested.
 */
internal object FocusPrediction {
  /** Where the focus is: a row, which part of the guide has it (`RowState.ZONE_*`), and the selected program in the grid zone. */
  class Focus(val row: Int, val zone: String, val programId: String?) {
    fun sameAs(o: Focus?): Boolean = o != null && row == o.row && zone == o.zone && programId == o.programId
  }

  /**
   * The focus after the move that took `prev` to `cur` is made again, or null when there is no such move to repeat (no move, a change of zone, the end of
   * the list or the row). `programsOf(row)` is the ids of the programs the row draws, in order; `liveOf(row)` the id of the one that is on air.
   */
  fun next(prev: Focus?, cur: Focus, rowCount: Int, programsOf: (Int) -> List<String>, liveOf: (Int) -> String?): Focus? {
    if (prev == null || prev.zone != cur.zone) return null
    if (cur.row != prev.row) {
      val row = cur.row + (if (cur.row > prev.row) 1 else -1)
      if (row !in 0 until rowCount) return null
      return when (cur.zone) {
        RowState.ZONE_GRID -> liveOf(row)?.let { Focus(row, cur.zone, it) }
        RowState.ZONE_RAIL -> Focus(row, cur.zone, null)
        else -> null
      }
    }
    if (cur.zone != RowState.ZONE_GRID || cur.programId == prev.programId) return null
    val ids = programsOf(cur.row)
    val was = ids.indexOf(prev.programId)
    val now = ids.indexOf(cur.programId)
    if (was < 0 || now < 0 || was == now) return null
    val next = now + (if (now > was) 1 else -1)
    return if (next in ids.indices) Focus(cur.row, cur.zone, ids[next]) else null
  }
}
