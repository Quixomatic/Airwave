package expo.modules.nativeguide

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The guide screen can be mounted twice (one pushed over another stays mounted beneath it), each with its own lineup: every set of rows
 * has a store of its own, and one unmounting must not take the other's lineup with it.
 */
class LineupStoresTest {
  private val used = ArrayList<String>()

  @After fun cleanUp() {
    for (id in used) LineupStores.clear(id)
  }

  private fun id(name: String) = "test-$name".also { used.add(it) }

  private fun update(session: String, order: List<String>, add: Map<String, String> = emptyMap()): String =
    """{"s": "$session", "order": [${order.joinToString(",") { "\"$it\"" }}], "add": [${add.entries.joinToString(",") { (t, id) -> "[\"$t\", [\"$id\", \"1\", \"Name $id\", \"lucide:Radio\", null, []]]" }}]}"""

  private fun ids(id: String, version: Int) = LineupStores.rows(id, version).map { it.channel.id }

  @Test fun everyIdHoldsItsOwnLineup() {
    val a = id("a")
    val b = id("b")
    val va = LineupStores.apply(a, update("s1", listOf("1", "2"), mapOf("1" to "all-1", "2" to "all-2")))
    val vb = LineupStores.apply(b, update("s1", listOf("1"), mapOf("1" to "fav-1")))
    assertEquals(listOf("all-1", "all-2"), ids(a, va))
    assertEquals(listOf("fav-1"), ids(b, vb))
    // The same token in two stores is two channels: tokens are per store.
    assertEquals(listOf("all-1"), ids(a, va).take(1))
  }

  @Test fun clearingOneLeavesTheOtherAsItWas() {
    val a = id("a")
    val b = id("b")
    val va = LineupStores.apply(a, update("s1", listOf("1"), mapOf("1" to "all-1")))
    val vb = LineupStores.apply(b, update("s1", listOf("1"), mapOf("1" to "fav-1")))
    LineupStores.clear(b)
    assertEquals("the screen still mounted keeps drawing", listOf("all-1"), ids(a, va))
    assertEquals(0, LineupStores.rows(b, vb).size)
    // An incremental update to the cleared one asks for a resend; the other takes its update.
    assertEquals(-1, LineupStores.apply(b, update("s1", listOf("1"))))
    assertTrue(LineupStores.apply(a, update("s1", listOf("1"))) >= 0)
  }

  @Test fun anIdWithNoStoreHasNoRows() {
    assertEquals(0, LineupStores.rows(id("never-given-one"), 1).size)
    LineupStores.clear(id("never-given-one")) // harmless
  }

  @Test fun anUpdateFromANewJsContextDropsTheOldOnesStores() {
    val old = id("old")
    val fresh = id("fresh")
    LineupStores.apply(old, update("session-1", listOf("1"), mapOf("1" to "c1")))
    val before = LineupStores.size
    val v = LineupStores.apply(fresh, update("session-2", listOf("1"), mapOf("1" to "c1")))
    assertEquals("the reloaded context's cleanup never ran: its store goes", before, LineupStores.size)
    assertEquals(0, LineupStores.rows(old, 1).size)
    assertEquals(listOf("c1"), ids(fresh, v))
  }

  @Test fun storesOfTheSameContextAreKept() {
    val a = id("a")
    val b = id("b")
    val before = LineupStores.size
    LineupStores.apply(a, update("session-1", listOf("1"), mapOf("1" to "c1")))
    LineupStores.apply(b, update("session-1", listOf("1"), mapOf("1" to "c2")))
    assertEquals(before + 2, LineupStores.size)
  }

  @Test fun aRejectedUpdateDropsNothing() {
    val a = id("a")
    val b = id("b")
    val va = LineupStores.apply(a, update("session-1", listOf("1"), mapOf("1" to "c1")))
    assertEquals(-1, LineupStores.apply(b, update("session-2", listOf("1"))))
    assertEquals(listOf("c1"), ids(a, va))
  }
}
