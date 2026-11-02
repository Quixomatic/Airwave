package expo.modules.nativeguide

import org.json.JSONException
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** The lineup handover: full and incremental updates, reordering, the -1 resend request, and bad input. */
class LineupStoreTest {
  private val store = LineupStore()

  private fun program(id: String, startMs: Long = 1_000, durationSeconds: Int = 1800, title: String = "Title $id", art: String? = null, sub: String = "") =
    """["$id", $startMs, $durationSeconds, "$title", ${art?.let { "\"$it\"" } ?: "null"}, "$sub"]"""

  private fun channel(id: String, programs: List<String> = listOf(program("$id-p1")), logo: String? = null) =
    """["$id", "${id.removePrefix("c")}", "Name $id", "lucide:Radio", ${logo?.let { "\"$it\"" } ?: "null"}, [${programs.joinToString(",")}]]"""

  private fun update(
    session: String = "s1",
    order: List<String>,
    add: Map<String, String> = emptyMap(),
    accent: List<String>? = null,
    fav: List<Int>? = null,
  ): String {
    val parts = mutableListOf("\"s\": \"$session\"", "\"order\": [${order.joinToString(",") { "\"$it\"" }}]")
    accent?.let { parts.add("\"accent\": [${it.joinToString(",") { c -> "\"$c\"" }}]") }
    fav?.let { parts.add("\"fav\": [${it.joinToString(",")}]") }
    parts.add("\"add\": [${add.entries.joinToString(",") { (t, c) -> "[\"$t\", $c]" }}]")
    return "{" + parts.joinToString(",") + "}"
  }

  private fun ids(version: Int) = store.rows(version).map { it.channel.id }

  @Test fun aFullLineupBecomesRowsInOrder() {
    val v = store.apply(update(order = listOf("2", "1"), add = mapOf("1" to channel("c1"), "2" to channel("c2"))))
    assertTrue(v > 0)
    assertEquals(listOf("c2", "c1"), ids(v))
    val first = store.rows(v)[0].channel
    assertEquals("2", first.number)
    assertEquals("Name c2", first.name)
    assertEquals("lucide:Radio", first.icon)
    assertNull(first.logo)
    assertEquals("c2-p1", first.programs[0].id)
    assertEquals(1_000L, first.programs[0].startMs)
    assertEquals(1_000L + 1800_000L, first.programs[0].endMs)
  }

  @Test fun anIncrementalUpdateSendsOnlyTheOrder() {
    val v1 = store.apply(update(order = listOf("1", "2"), add = mapOf("1" to channel("c1"), "2" to channel("c2"))))
    val v2 = store.apply(update(order = listOf("2", "1")))
    assertTrue(v2 > v1)
    assertEquals(listOf("c2", "c1"), ids(v2))
    assertEquals("both channels survive a reorder", 2, store.rows(v2).size)
  }

  @Test fun aNewChannelCanJoinAnExistingLineup() {
    store.apply(update(order = listOf("1"), add = mapOf("1" to channel("c1"))))
    val v = store.apply(update(order = listOf("1", "2"), add = mapOf("2" to channel("c2"))))
    assertEquals(listOf("c1", "c2"), ids(v))
  }

  @Test fun aFilteredLineupDropsTheChannelsItNoLongerShows() {
    store.apply(update(order = listOf("1", "2"), add = mapOf("1" to channel("c1"), "2" to channel("c2"))))
    val v = store.apply(update(order = listOf("2")))
    assertEquals(listOf("c2"), ids(v))
    // The dropped channel is gone from the store, so bringing it back without its data asks for a resend.
    assertEquals(-1, store.apply(update(order = listOf("1", "2"))))
  }

  @Test fun anUnknownTokenAsksForAResendAndChangesNothing() {
    val v = store.apply(update(order = listOf("1"), add = mapOf("1" to channel("c1"))))
    assertEquals(-1, store.apply(update(order = listOf("1", "9"))))
    assertEquals("the previous lineup keeps drawing", listOf("c1"), ids(v))
    // The resend (every channel again) is accepted.
    val again = store.apply(update(order = listOf("1", "9"), add = mapOf("1" to channel("c1"), "9" to channel("c9"))))
    assertEquals(listOf("c1", "c9"), ids(again))
  }

  @Test fun aNewSessionForgetsTheOldChannels() {
    store.apply(update(session = "a", order = listOf("1"), add = mapOf("1" to channel("c1"))))
    assertEquals(-1, store.apply(update(session = "b", order = listOf("1"))))
    val v = store.apply(update(session = "b", order = listOf("1"), add = mapOf("1" to channel("c1b"))))
    assertEquals(listOf("c1b"), ids(v))
  }

  @Test fun rowsCarryTheirOwnAccentAndFavorite() {
    val v = store.apply(update(order = listOf("1", "2"), add = mapOf("1" to channel("c1"), "2" to channel("c2")), accent = listOf("#ff0000", "rgba(0, 255, 0, 1)"), fav = listOf(0, 1)))
    val rows = store.rows(v)
    assertEquals(0xFFFF0000.toInt(), rows[0].accent)
    assertEquals(0xFF00FF00.toInt(), rows[1].accent)
    assertFalse(rows[0].fav)
    assertTrue(rows[1].fav)
    // Reordering moves the accent with the position, not with the channel.
    val v2 = store.apply(update(order = listOf("2", "1"), accent = listOf("#0000ff", "#ff00ff"), fav = listOf(1, 0)))
    assertEquals(0xFF0000FF.toInt(), store.rows(v2)[0].accent)
    assertEquals("c2", store.rows(v2)[0].channel.id)
  }

  @Test fun aRowWithoutAnAccentOrFlagGetsTheDefaults() {
    val v = store.apply(update(order = listOf("1", "2"), add = mapOf("1" to channel("c1"), "2" to channel("c2")), accent = listOf("#112233")))
    val rows = store.rows(v)
    assertEquals(0xFF112233.toInt(), rows[0].accent)
    assertEquals(LineupStore.DEFAULT_ACCENT, rows[1].accent)
    assertFalse(rows[1].fav)
  }

  @Test fun logosAndArtArrivePerChannelAndProgram() {
    val ch = channel("c1", listOf(program("p", art = "http://s/img/c1?path=%2Fa"), program("q")), logo = "https://logo/c1.png")
    val v = store.apply(update(order = listOf("1"), add = mapOf("1" to ch)))
    val c = store.rows(v)[0].channel
    assertEquals("https://logo/c1.png", c.logo)
    assertEquals("http://s/img/c1?path=%2Fa", c.programs[0].art)
    assertNull(c.programs[1].art)
  }

  @Test fun fieldsOfTheWrongTypeDegradeInsteadOfFailing() {
    // number as a JSON number, a null title, a string duration, a fractional start, a negative duration, a junk row.
    val ch = """["c1", 7, "Name", null, null, [["p1", 1500.4, "90", null, null, null], ["p2", "2000", -5, "T", 12, 3], "junk", ["p3"]]]"""
    val v = store.apply(update(order = listOf("1"), add = mapOf("1" to ch)))
    val c = store.rows(v)[0].channel
    assertEquals("7", c.number)
    assertEquals("", c.icon)
    assertEquals(3, c.programs.size)
    assertEquals(1500L, c.programs[0].startMs)
    assertEquals(90, c.programs[0].durationSeconds)
    assertEquals("a JSON null is an empty string, not the text null", "", c.programs[0].title)
    assertEquals(2000L, c.programs[1].startMs)
    assertEquals("a negative duration is 0", 0, c.programs[1].durationSeconds)
    assertEquals("a number where text belongs reads as its text", "12", c.programs[1].art)
    assertEquals(0L, c.programs[2].startMs)
  }

  @Test fun malformedJsonThrowsAndChangesNothing() {
    val v = store.apply(update(order = listOf("1"), add = mapOf("1" to channel("c1"))))
    assertThrows(JSONException::class.java) { store.apply("{\"s\": \"s1\", \"order\": [") }
    assertThrows(JSONException::class.java) { store.apply("not json") }
    assertThrows(JSONException::class.java) { store.apply("[]") }
    assertEquals(listOf("c1"), ids(v))
  }

  @Test fun anUpdateWithoutAnOrderIsRejected() {
    assertThrows(JSONException::class.java) { store.apply("""{"s": "s1", "add": []}""") }
  }

  @Test fun anEmptyOrderIsAnEmptyLineup() {
    store.apply(update(order = listOf("1"), add = mapOf("1" to channel("c1"))))
    val v = store.apply(update(order = emptyList()))
    assertEquals(0, store.rows(v).size)
  }

  @Test fun versionsIncreaseAndTheLatestTwoAreKept() {
    val v1 = store.apply(update(order = listOf("1"), add = mapOf("1" to channel("c1"))))
    val v2 = store.apply(update(order = listOf("1", "2"), add = mapOf("2" to channel("c2"))))
    val v3 = store.apply(update(order = listOf("2")))
    assertTrue(v1 < v2 && v2 < v3)
    assertEquals(listOf("c2"), ids(v3))
    assertEquals("the previous version stays readable for a frame still drawing it", listOf("c1", "c2"), ids(v2))
    assertEquals("an older or unknown version reads as the current one", listOf("c2"), ids(v1))
    assertEquals(listOf("c2"), ids(9999))
  }

  @Test fun theSameChannelObjectIsSharedAcrossRows() {
    // Reordering keeps the parsed channel: only the row wrappers are new.
    val v1 = store.apply(update(order = listOf("1", "2"), add = mapOf("1" to channel("c1"), "2" to channel("c2"))))
    val before = store.rows(v1).map { it.channel }
    val v2 = store.apply(update(order = listOf("2", "1")))
    val after = store.rows(v2).map { it.channel }
    assertArrayEquals(arrayOf(before[1], before[0]), after.toTypedArray())
  }

  @Test fun aRowAnUpdateLeavesAsItWasIsTheSameObject() {
    val v1 = store.apply(update(order = listOf("1", "2"), add = mapOf("1" to channel("c1"), "2" to channel("c2")), accent = listOf("#ff0000", "#00ff00"), fav = listOf(0, 0)))
    val before = store.rows(v1)
    // A refetch that changed nothing, and a favorite toggled on row 2.
    val v2 = store.apply(update(order = listOf("1", "2"), accent = listOf("#ff0000", "#00ff00"), fav = listOf(0, 1)))
    val after = store.rows(v2)
    assertSame("nothing changed: the same row, so its recording stays", before[0], after[0])
    assertNotSame("the favorite flag changed", before[1], after[1])
    assertSame("the channel is still the parsed one", before[1].channel, after[1].channel)
    // A new accent (the lens moved an untinted channel's palette color) is a new row; the one beside it is not.
    val v3 = store.apply(update(order = listOf("1", "2"), accent = listOf("#0000ff", "#00ff00"), fav = listOf(0, 1)))
    assertNotSame(after[0], store.rows(v3)[0])
    assertSame(after[1], store.rows(v3)[1])
  }

  @Test fun aRowThatMovedKeepsItsObjectWhileItsDataIsTheSame() {
    val v1 = store.apply(update(order = listOf("1", "2"), add = mapOf("1" to channel("c1"), "2" to channel("c2")), accent = listOf("#ff0000", "#ff0000"), fav = listOf(0, 0)))
    val before = store.rows(v1)
    val v2 = store.apply(update(order = listOf("2", "1"), accent = listOf("#ff0000", "#ff0000"), fav = listOf(0, 0)))
    assertSame(before[1], store.rows(v2)[0])
    assertSame(before[0], store.rows(v2)[1])
  }

  @Test fun aChannelSentAgainUnderItsTokenIsANewRow() {
    val v1 = store.apply(update(order = listOf("1"), add = mapOf("1" to channel("c1")), accent = listOf("#ff0000"), fav = listOf(0)))
    val v2 = store.apply(update(order = listOf("1"), add = mapOf("1" to channel("c1", programs = listOf(program("c1-p2")))), accent = listOf("#ff0000"), fav = listOf(0)))
    assertNotSame(store.rows(v1)[0], store.rows(v2)[0])
    assertEquals("c1-p2", store.rows(v2)[0].channel.programs[0].id)
  }

  @Test fun aNewSessionStartsWithNoRowsToReuse() {
    store.apply(update(session = "a", order = listOf("1"), add = mapOf("1" to channel("c1")), accent = listOf("#ff0000"), fav = listOf(0)))
    val a = store.rows(1)[0]
    val v = store.apply(update(session = "b", order = listOf("1"), add = mapOf("1" to channel("c1")), accent = listOf("#ff0000"), fav = listOf(0)))
    assertNotSame(a, store.rows(v)[0])
  }

  @Test fun aProgramsArtIsItsUrlUpToTheQueryAndItsRequestAddsTheBox() {
    val v = store.apply(
      update(
        order = listOf("1"),
        add = mapOf("1" to channel("c1", listOf(program("a", art = "https://s.example/img/c1?path=%2Flibrary%2Fx"), program("b")))),
      ),
    )
    val (withArt, without) = store.rows(v)[0].channel.programs
    assertEquals("https://s.example/img/c1?path=%2Flibrary%2Fx", withArt.art)
    assertEquals("https://s.example/img/c1?path=%2Flibrary%2Fx&w=448&h=128", withArt.artUrl(448, 128))
    assertNull(without.art)
    assertNull(without.artUrl(448, 128))
  }

  @Test fun theArtUrlIsBuiltOncePerBoxAndRebuiltWhenTheBoxChanges() {
    val v = store.apply(update(order = listOf("1"), add = mapOf("1" to channel("c1", listOf(program("a", art = "http://s/img/c1?path=%2Fa"))))))
    val p = store.rows(v)[0].channel.programs[0]
    val first = p.artUrl(448, 128)
    assertEquals("http://s/img/c1?path=%2Fa&w=448&h=128", first)
    assertTrue("the same box gives the same string instance", first === p.artUrl(448, 128))
    assertEquals("http://s/img/c1?path=%2Fa&w=512&h=128", p.artUrl(512, 128))
    assertEquals("http://s/img/c1?path=%2Fa&w=448&h=128", p.artUrl(448, 128))
  }
}
