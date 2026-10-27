package expo.modules.nativeguide

import org.json.JSONArray
import org.json.JSONObject

/** One program cell's data (see `PackedProgram` in src/index.ts). */
class GuideProgram(
  val id: String,
  val startMs: Long,
  val durationSeconds: Int,
  /** The title the cell shows (the show's name for an episode). */
  val title: String,
  /** The artwork's request URL up to its query (the size is appended natively), or null for none. */
  val art: String?,
  /** The cell's second line, built in JS (season and episode, rating, runtime). */
  val sub: String,
) {
  val endMs: Long get() = startMs + durationSeconds * 1000L

  // The URL last built for this program's art, so a frame doesn't build a string per cell. Main thread only.
  private var urlW = 0
  private var urlH = 0
  private var urlText: String? = null

  /** The request URL for this program's art at a `w` x `h` px box ([GuideGeometry.artUrl]), or null when it has no art. */
  fun artUrl(w: Int, h: Int): String? {
    val base = art ?: return null
    val cached = urlText
    if (cached != null && w == urlW && h == urlH) return cached
    return GuideGeometry.artUrl(base, intArrayOf(w, h)).also {
      urlText = it
      urlW = w
      urlH = h
    }
  }
}

/** One channel's data (see `PackedChannel` in src/index.ts). */
class GuideChannel(
  val id: String,
  val number: String,
  val name: String,
  /** The icon-set id the rail's circle shows (`lucide:Radio`); empty for none. */
  val icon: String,
  /** A logo image URL, or null when the channel has none. */
  val logo: String?,
  val programs: Array<GuideProgram>,
)

/**
 * One row of the lineup in display order. `accent` and `fav` belong to the row, not the channel: an untinted channel's
 * accent depends on its position in the lineup JS is showing (the filter lens changes it), so JS sends both with the order.
 */
class GuideRow(val channel: GuideChannel, val accent: Int, val fav: Boolean)

/**
 * The lineup ONE set of native rows draws, handed over INCREMENTALLY from JS: every channel arrives once under a token, after
 * which an update is only the row order, plus the accent and favorite flag of each row. The store holds exactly the
 * channels of the latest order. Each applied update gets a version; the view draws the version its `lineupVersion`
 * prop names, so a frame drawn between a lineup change and the matching focus and scroll props never mixes the two
 * (the previous version is kept until the next update for that).
 *
 * A guide screen can be mounted more than once (a screen pushed over another stays mounted beneath it), each with its own
 * lineup, so every set of rows has a store of its own: see [LineupStores].
 *
 * The update is a JSON object (`LineupUpdate` in src/index.ts):
 * `{ "s": session, "order": [token…], "accent": [color…], "fav": [0|1…], "add": [[token, channel]…] }`
 * where a channel is `[id, number, name, icon, logo|null, [[id, startMs, durationSeconds, title, art|null, sub]…]]`.
 * `s` identifies the JS context (a reload restarts the token numbering). A structurally broken update throws; a field
 * of the wrong type degrades to an empty or zero value instead, so one bad program never takes down the lineup.
 *
 * A row whose channel, accent and favorite flag an update leaves as they were stays the same [GuideRow] object: the row recordings
 * (see [RowRecordings]) are keyed on it, so only the rows an update really changed are recorded again.
 */
class LineupStore {
  /** The session of the last update, which the tokens below belong to. */
  var session = ""
    private set
  private var byToken = HashMap<String, GuideChannel>()
  private var rowByToken = HashMap<String, GuideRow>()
  private var version = 0
  private var current: Pair<Int, Array<GuideRow>> = 0 to emptyArray()
  private var previous: Pair<Int, Array<GuideRow>> = 0 to emptyArray()

  companion object {
    /** The accent a row gets when JS sends none for it. */
    const val DEFAULT_ACCENT = 0xFF7C8AA3.toInt()
  }

  /** Rows for a version (the current or the previous one), else the current rows. */
  @Synchronized
  fun rows(forVersion: Int): Array<GuideRow> = when (forVersion) {
    current.first -> current.second
    previous.first -> previous.second
    else -> current.second
  }

  /**
   * Applies an update and returns its version, or -1 when it referenced a token this store doesn't hold (the caller
   * then sends the full lineup). Nothing changes unless the whole update is accepted. Throws on malformed JSON.
   */
  @Synchronized
  fun apply(json: String): Int {
    val o = JSONObject(json)
    val s = str(o, "s")
    val order = o.getJSONArray("order")
    val accents = o.optJSONArray("accent")
    val favs = o.optJSONArray("fav")
    val added = HashMap<String, GuideChannel>()
    val add = o.optJSONArray("add")
    if (add != null) {
      for (i in 0 until add.length()) {
        val entry = add.optJSONArray(i) ?: continue
        val channel = entry.optJSONArray(1) ?: continue
        added[str(entry, 0)] = readChannel(channel)
      }
    }

    // A new session starts from an empty store: the old tokens mean nothing in it.
    val known = if (s == session) byToken else HashMap()
    val knownRows = if (s == session) rowByToken else HashMap()
    val next = HashMap<String, GuideChannel>(order.length() * 2)
    val nextRows = HashMap<String, GuideRow>(order.length() * 2)
    val rows = ArrayList<GuideRow>(order.length())
    for (i in 0 until order.length()) {
      val token = str(order, i)
      val channel = added[token] ?: known[token] ?: return -1
      val accent = accents?.let { accent(it, i) } ?: DEFAULT_ACCENT
      val fav = favs?.let { flag(it, i) } ?: false
      // The same channel with the same accent and flag is the same row.
      val row = knownRows[token]?.takeIf { it.channel === channel && it.accent == accent && it.fav == fav } ?: GuideRow(channel, accent, fav)
      next[token] = channel
      nextRows[token] = row
      rows.add(row)
    }
    session = s
    byToken = next
    rowByToken = nextRows
    version += 1
    previous = current
    current = version to rows.toTypedArray()
    return version
  }

  private fun readChannel(a: JSONArray): GuideChannel {
    val programs = ArrayList<GuideProgram>()
    val list = a.optJSONArray(5)
    if (list != null) {
      for (i in 0 until list.length()) {
        val p = list.optJSONArray(i) ?: continue
        programs.add(GuideProgram(str(p, 0), long(p, 1), int(p, 2).coerceAtLeast(0), str(p, 3), nullableStr(p, 4), str(p, 5)))
      }
    }
    return GuideChannel(str(a, 0), str(a, 1), str(a, 2), str(a, 3), nullableStr(a, 4), programs.toTypedArray())
  }

  private fun accent(a: JSONArray, i: Int): Int? = nullableStr(a, i)?.let { GuideColor.parse(it) }

  private fun flag(a: JSONArray, i: Int): Boolean = when (val v = a.opt(i)) {
    is Boolean -> v
    is Number -> v.toInt() == 1
    else -> false
  }

  // Lenient readers (org.json's own optString would turn a JSON null into the text "null" on Android).
  private fun nullableStr(a: JSONArray, i: Int): String? = text(a.opt(i))

  private fun str(a: JSONArray, i: Int): String = nullableStr(a, i) ?: ""

  private fun str(o: JSONObject, key: String): String = text(o.opt(key)) ?: ""

  private fun text(v: Any?): String? = when (v) {
    is String -> v
    is Number, is Boolean -> v.toString()
    else -> null
  }

  private fun long(a: JSONArray, i: Int): Long = when (val v = a.opt(i)) {
    is Int -> v.toLong()
    is Long -> v
    is Number -> rounded(v.toDouble())
    is String -> v.toLongOrNull() ?: rounded(v.toDoubleOrNull() ?: 0.0)
    else -> 0L
  }

  private fun int(a: JSONArray, i: Int): Int = long(a, i).coerceIn(Int.MIN_VALUE.toLong(), Int.MAX_VALUE.toLong()).toInt()

  private fun rounded(d: Double): Long = if (d.isFinite()) Math.round(d) else 0L
}

/**
 * The lineup stores of the native rows mounted right now, by the id their view names (`lineupId`). A guide screen pushed over another
 * leaves the one beneath it mounted, and each draws its own lineup: when one unmounts it clears only its own store, and rows with
 * different filters never share channels, tokens or versions.
 *
 * A store belongs to the JS context that made it. When an update arrives from another context (a reload: the old one's views and
 * cleanup are gone), the stores of the old one are dropped, so nothing outlives its context.
 */
object LineupStores {
  private val stores = HashMap<String, LineupStore>()

  /** Applies `json` to the store for `id`, made on first use: see [LineupStore.apply]. */
  @Synchronized
  fun apply(id: String, json: String): Int {
    val store = stores.getOrPut(id) { LineupStore() }
    val version = store.apply(json)
    if (version >= 0) {
      val session = store.session
      stores.values.removeAll { it !== store && it.session != session }
    }
    return version
  }

  /** The rows of store `id` for a version; none for an id that has no store (it was never given a lineup, or it was cleared). */
  @Synchronized
  fun rows(id: String, forVersion: Int): Array<GuideRow> = stores[id]?.rows(forVersion) ?: emptyArray()

  /** Drops store `id` (its rows unmounted). Other stores are untouched. */
  @Synchronized
  fun clear(id: String) {
    stores.remove(id)
  }

  /** How many stores are held. */
  @get:Synchronized
  val size: Int get() = stores.size
}
