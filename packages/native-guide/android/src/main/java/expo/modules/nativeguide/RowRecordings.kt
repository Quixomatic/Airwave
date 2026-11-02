package expo.modules.nativeguide

/**
 * A row's [GuidePainter.clock], remembered while nothing it is made from has changed. A frame asks for the clock of every visible row, and a painter
 * finds it by looking through the row's programs (is one on air, and does the row draw it); the answer is the same for a row until the clock
 * (`nowMs`) or the geometry (which cells a row draws) changes, and a row is the same object frame after frame, so it is worked out once per row per
 * change, not once per row per frame. That is all a clock is made from: [GuidePainter.clock] is a function of the row, the frame's geometry and its
 * `nowMs`, and of nothing else the painter holds (not its tokens, so a change of those does not ask again).
 *
 * It keeps only the rows asked about in the last two frames ([nextFrame] starts one): a row that has stopped being drawn (scrolled far off, or replaced
 * by a new lineup) is let go within two frames, so the cache never keeps an old lineup's rows reachable. Main thread only.
 */
internal class ClockCache {
  private var geo: GuideGeo? = null
  private var nowMs = Double.NaN

  /** The rows asked about in this frame (and between frames, by record-ahead) and in the frame before it. */
  private var current = java.util.IdentityHashMap<GuideRow, Long>()
  private var previous = java.util.IdentityHashMap<GuideRow, Long>()

  /** The clock of `row`: `compute`d if it was not asked for since `geo` and `nowMs` last changed and the row was drawn in the last two frames. */
  fun of(row: GuideRow, geo: GuideGeo, nowMs: Double, compute: () -> Long): Long {
    if (geo !== this.geo || nowMs != this.nowMs) {
      current.clear()
      previous.clear()
      this.geo = geo
      this.nowMs = nowMs
    }
    current[row]?.let { return it }
    previous.remove(row)?.let {
      current[row] = it
      return it
    }
    return compute().also { current[row] = it }
  }

  /** A frame begins: what was asked about in the frame before last is let go. */
  fun nextFrame() {
    val older = previous
    previous = current
    current = older
    current.clear()
  }

  fun clear() {
    current.clear()
    previous.clear()
    geo = null
  }

  /** How many rows are held. (JVM tests.) */
  internal val size: Int get() = current.size + previous.size
}

/**
 * What each visible row last recorded, and whether that recording still is what drawing the row now would make.
 *
 * Drawing a row is the expensive part of a frame on a weak CPU (some 120 text runs and several hundred shapes for a screenful), and
 * most frames change very little: a D-pad move changes the focus of two rows, a scroll moves every row but changes none. So a row's
 * drawing is recorded once into a display list (an Android `RenderNode`, held here as an opaque `N` so this stays free of Android and
 * can be unit-tested) and the view draws the list again, at the row's new place, while nothing the row draws has changed.
 *
 * A recording is the row's drawing as a function of: the row (its channel, accent and favorite flag: a lineup change makes new
 * [GuideRow]s), its focus ([RowState]: a row keeps a recording for the focus it is drawn in and one for the focus it is expected to be drawn in
 * next, [VARIANTS] in all, so the frame that moves the focus finds the next one ready), the painter's [GuidePainter.epoch] (tokens, geometry and
 * size, which every row is drawn from), the images it asked for (`imagesVersion`: one arriving, failing or being let go changes what it draws;
 * `E` is what the image loader hands out), the clock while an image is still fading in or still loading, and the time the row's live cell is
 * drawn at (`clock`, [GuidePainter.clock]: 0 for a row with none, which a tick of the clock leaves alone). Anything else a row draws from is
 * constant for a given recording.
 *
 * Main thread only.
 */
internal class RowRecordings<N : Any, E : Any>(private val create: () -> N, private val discard: (N) -> Unit) {
  /** One recording of one row, in one focus: its node and what it was made from. */
  class Slot<N : Any, E : Any>(val node: N, private val focused: Boolean, private val railFocused: Boolean, private val focusedProgramId: String?) {
    var recorded = false
      private set
    private var row: GuideRow? = null
    private var epoch = 0L
    private var variant = 0L
    private var imagesVersion = 0L
    private var clock = 0L
    internal var lastUsed = 0L

    /** The images the recording drew (each the loader's own entry), so a replay of it can keep them in use. Empty for a row with none. */
    var images: List<E> = emptyList()
      private set

    /** The recording is not to be reused as it is: an image it drew is still loading, or still fading in. It is recorded again on the next frame. */
    var stale = false
      private set

    internal fun matches(state: RowState): Boolean = focused == state.focused && railFocused == state.railFocused && focusedProgramId == state.focusedProgramId

    /**
     * Whether the recording still equals what drawing `row` in its focus would record, given the painter's `epoch`, the images' `imagesVersion` and the
     * `variant` it is recorded in (whether it sits in a layer, and over which backdrop: the view's own business, which only has to differ when the
     * recording does) and the `clock` its row draws from.
     */
    fun isCurrent(row: GuideRow, epoch: Long, variant: Long, imagesVersion: Long, clock: Long): Boolean =
      recorded && !stale && this.row === row && this.epoch == epoch && this.variant == variant && this.clock == clock && (images.isEmpty() || this.imagesVersion == imagesVersion)

    /** The node now holds the drawing of `row` in this slot's focus. `images` are the loader's entries it drew; `stale` says one of them was not settled. */
    fun record(row: GuideRow, epoch: Long, variant: Long, imagesVersion: Long, images: List<E>, stale: Boolean, clock: Long) {
      recorded = true
      this.row = row
      this.epoch = epoch
      this.variant = variant
      this.clock = clock
      this.imagesVersion = imagesVersion
      this.images = images
      this.stale = stale
    }

    /** The node's list was thrown away: nothing is recorded. */
    fun forget() {
      recorded = false
      row = null
      stale = false
      images = emptyList()
    }
  }

  private val rows = HashMap<Int, ArrayList<Slot<N, E>>>()
  private var tick = 0L

  /**
   * The recording of row `index` in the focus `state` describes, with a new node when the row has none for it. A row keeps at most [VARIANTS], and the
   * least recently used is let go of to make room for another.
   */
  fun slot(index: Int, state: RowState): Slot<N, E> {
    val list = rows.getOrPut(index) { ArrayList(VARIANTS) }
    tick += 1
    for (s in list) {
      if (s.matches(state)) {
        s.lastUsed = tick
        return s
      }
    }
    if (list.size >= VARIANTS) {
      val victim = list.minByOrNull { it.lastUsed }!!
      list.remove(victim)
      discard(victim.node)
    }
    val s = Slot<N, E>(create(), state.focused, state.railFocused, state.focusedProgramId)
    s.lastUsed = tick
    list.add(s)
    return s
  }

  /**
   * Lets go of the nodes of the rows well off screen: every row more than `margin` rows outside `first`..`last`. A row that comes back
   * is recorded again, which is a frame of work the scroll would not have had, so the margin keeps the rows just past the edge.
   */
  fun retain(first: Int, last: Int, margin: Int) {
    val it = rows.entries.iterator()
    while (it.hasNext()) {
      val e = it.next()
      if (e.key < first - margin || e.key > last + margin) {
        for (s in e.value) discard(s.node)
        it.remove()
      }
    }
  }

  /** How many nodes the rows hold. */
  val size: Int get() = rows.values.sumOf { it.size }

  /** Releases every node (the view detached, or memory is short). */
  fun clear() {
    for (list in rows.values) for (s in list) discard(s.node)
    rows.clear()
  }

  companion object {
    /** The recordings a row keeps: one for the focus it is drawn in, and one for the focus it is expected to be drawn in next. */
    const val VARIANTS = 2
  }
}
