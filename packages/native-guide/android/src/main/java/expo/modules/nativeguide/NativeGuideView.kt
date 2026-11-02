package expo.modules.nativeguide

import android.app.ActivityManager
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.res.Configuration
import android.graphics.Canvas
import android.os.Build
import android.os.Looper
import android.os.MessageQueue
import android.os.SystemClock
import android.os.Trace
import androidx.annotation.RequiresApi
import android.util.Log
import android.view.View
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.ceil
import kotlin.math.min

/**
 * Every visible guide row drawn on ONE Canvas, as the native rows of tv-native's guide. The view is the engine:
 * it takes the props JS sends, picks the rows the scroll offset shows, and asks a [GuidePainter] to draw each one. The
 * look is the painter's; everything around it (the lineup, scrolling, fonts, images, errors, memory, accessibility)
 * lives here.
 *
 * Display only: JS owns focus, keys and scrolling (it passes the focused row and program, the zone and the scroll
 * offset as props) and the view never takes Android focus. A drawing error stops the rows and reports `onRenderError`;
 * the guide then switches back to the React Native rows for the rest of the session.
 */
class NativeGuideView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onRenderError by EventDispatcher()

  // Props.
  /** Which lineup store the rows draw from (`LineupStores`), and the version of it: one store per set of rows. */
  private var lineupId = ""
  private var lineupVersion = 0
  private var geo: GuideGeo? = null
  private var geoJson = ""

  /** The current time (epoch ms). Its own prop, not part of `geo`: it moves every minute and only a live cell's progress depends on it, so it must not rebuild the layout. */
  private var nowMs = 0.0
  private var tokens = ""
  private var focusRow = 0
  private var focusProgramId: String? = null
  private var zone = RowState.ZONE_GRID
  private var miniFocused = false
  private var scrollYdp = 0.0

  /** The one opaque color the rows are drawn over (ARGB), or 0 when the guide has not said or it is not opaque (see [RowNodes]). */
  private var backdrop = 0

  private val density = resources.displayMetrics.density.toDouble()
  private val onScreen = IntArray(2)
  private val text = GuideText(context)
  private val images = GuideImages { invalidate() }
  private val painter = GuidePainters.create(PainterKit(density, text, images))

  /** The rows' display lists (API 29 and up): a row is drawn again from its list while nothing it draws has changed. Null below API 29. */
  private val rowNodes: RowNodes? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) RowNodes() else null

  // Recording ahead (see [planAhead]): where the focus was, where it was before that, and the row guessed to be reached next.
  private var lastFocus: FocusPrediction.Focus? = null
  private var prevFocus: FocusPrediction.Focus? = null
  private var ahead: FocusPrediction.Focus? = null

  /** The row the focus is about to leave, whose recording with no focus is also made ahead (-1: none). */
  private var aheadLeaves = -1
  private var aheadQueued = false
  private var usesNodes = false
  private val aheadIdle = MessageQueue.IdleHandler {
    aheadQueued = false
    guard { recordAhead() }
    false
  }

  /** Latched on the first failure: the view then draws nothing until it is replaced. */
  private var broken = false

  /** A failure while applying props, reported once they are all applied. */
  private var pendingError: Throwable? = null

  init {
    setWillNotDraw(false)
    setLayerType(View.LAYER_TYPE_NONE, null)
    isFocusable = false
    isFocusableInTouchMode = false
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
    val memoryClass = (context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager)?.memoryClass ?: 0
    images.budgetBytes = imageBudgetBytes(memoryClass)
  }

  // Prop setters (NativeGuideModule).
  fun setLineupId(v: String) {
    lineupId = v
  }

  fun setLineupVersion(v: Int) {
    lineupVersion = v
  }

  fun setGeo(json: String) = prop {
    if (json != geoJson) {
      geo = GuideGeo(json)
      geoJson = json
    }
  }

  fun setNowMs(v: Double) {
    nowMs = v
  }

  fun setTokens(json: String) = prop {
    if (json != tokens) {
      painter.setTokens(json)
      tokens = json
    }
  }

  fun setFocusRow(v: Int) {
    focusRow = v
  }

  fun setFocusProgramId(v: String) {
    focusProgramId = v.ifEmpty { null }
  }

  fun setZone(v: String) {
    zone = v
  }

  fun setMiniFocused(v: Boolean) {
    miniFocused = v
  }

  fun setScrollY(v: Double) {
    scrollYdp = v
  }

  fun setBackdrop(css: String) {
    backdrop = if (css.isEmpty()) 0 else GuideColor.parse(css).takeIf { it ushr 24 == 0xFF } ?: 0
  }

  fun propsUpdated() {
    pendingError?.let {
      pendingError = null
      fail(it)
    }
    updateDescription()
    invalidate()
  }

  // Lifecycle.
  private val memory = object : ComponentCallbacks2 {
    override fun onTrimMemory(level: Int) {
      // Running low (10, before Android 14) or the UI hidden or backgrounded (20 and up): drop what isn't on screen.
      if (level >= TRIM_LEVEL) trim()
    }

    override fun onConfigurationChanged(newConfig: Configuration) = Unit

    @Deprecated("Deprecated in Java")
    override fun onLowMemory() = trim()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    context.applicationContext.registerComponentCallbacks(memory)
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    context.applicationContext.unregisterComponentCallbacks(memory)
    ahead = null
    aheadLeaves = -1
    rowNodes?.clear()
    images.clear()
    text.trim()
    prop { painter.release() }
  }

  private fun trim() {
    ahead = null
    aheadLeaves = -1
    // The rows are recorded afresh on the next frame, which this asks for (the lists on screen are gone).
    if (rowNodes != null) {
      rowNodes.clear()
      invalidate()
    }
    images.trim()
    text.trim()
    guard { painter.trim() }
  }

  // Drawing.
  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    if (broken) return
    Trace.beginSection("NativeGuide.draw")
    try {
      guard { drawRows(canvas) }
    } finally {
      Trace.endSection()
    }
  }

  private fun drawRows(canvas: Canvas) {
    val g = geo ?: return
    val rows = LineupStores.rows(lineupId, lineupVersion)
    if (rows.isEmpty() || g.rowH <= 0) return
    val rowHpx = g.rowH * density
    // The list never scrolls past its end.
    val scrollY = min(scrollYdp * density, GuideGeometry.maxScroll(rows.size, rowHpx, height.toDouble())).coerceAtLeast(0.0)
    val visible = GuideGeometry.visibleRows(scrollY, rowHpx, height.toDouble(), rows.size)
    if (visible.isEmpty()) return

    getLocationOnScreen(onScreen)
    val frame = GuideFrame(g, width.toFloat(), height.toFloat(), rowHpx.toFloat(), SystemClock.uptimeMillis(), nowMs, onScreen[0].toFloat(), onScreen[1].toFloat())
    images.beginFrame()
    painter.beginFrame(frame)
    canvas.save()
    canvas.clipRect(0f, 0f, width.toFloat(), height.toFloat())
    painter.drawBackdrop(canvas, frame)
    val nodes = rowNodes
    if (nodes != null && canvas.isHardwareAccelerated) {
      drawFromRecordings(nodes, canvas, rows, visible, scrollY, rowHpx, frame)
    } else {
      for (i in visible) {
        canvas.save()
        // Rows start on a whole pixel, as the React Native rows' layout puts them.
        canvas.translate(0f, PixelGrid.snap(i * rowHpx - scrollY).toFloat())
        painter.drawRow(canvas, rows[i], RowState.of(i, focusRow, focusProgramId, zone, miniFocused), frame)
        canvas.restore()
      }
    }
    painter.drawOverlay(canvas, frame)
    canvas.restore()
    painter.endFrame()
    images.endFrame()
    // Something still changing (an image fading in) redraws on the next vsync; a still frame stops redrawing.
    if (frame.animating) postInvalidateOnAnimation()
  }

  /**
   * The rows from their display lists: each row draws itself again only when something it draws changed (a focus move re-draws two rows, a
   * scroll none), and every row is placed on a whole pixel, as the direct path places it.
   */
  @RequiresApi(Build.VERSION_CODES.Q)
  private fun drawFromRecordings(nodes: RowNodes, canvas: Canvas, rows: Array<GuideRow>, visible: IntRange, scrollY: Double, rowHpx: Double, frame: GuideFrame) {
    val epoch = painter.epoch + (LucideGlyphs.version.toLong() shl 32)
    val rowH = ceil(rowHpx).toInt()
    Trace.beginSection("NativeGuide.rows")
    try {
      nodes.beginFrame()
      for (i in visible) {
        val top = PixelGrid.snap(i * rowHpx - scrollY)
        nodes.draw(canvas, i, rows[i], RowState.of(i, focusRow, focusProgramId, zone, miniFocused), top, width, rowH, epoch, backdrop, painter, frame, images)
      }
      nodes.retain(visible.first, visible.last)
      if (nodes.animating) frame.animating = true
      usesNodes = true
      planAhead(rows)
    } finally {
      Trace.endSection()
    }
  }

  /**
   * Guesses where the focus goes next from where it has just been (a held key goes on the same way: down a row, or along it) and queues the row it
   * would land on to be recorded in idle time, so the frame that key makes finds it ready. See [FocusPrediction].
   */
  @RequiresApi(Build.VERSION_CODES.Q)
  private fun planAhead(rows: Array<GuideRow>) {
    val g = geo ?: return
    if (miniFocused) {
      ahead = null
      aheadLeaves = -1
      return
    }
    val cur = FocusPrediction.Focus(focusRow, zone, focusProgramId)
    if (!cur.sameAs(lastFocus)) {
      prevFocus = lastFocus
      lastFocus = cur
    }
    ahead = FocusPrediction.next(
      prevFocus, cur, rows.size,
      programsOf = { r -> rows[r].channel.programs.filter { g.cellBox(it) != null }.map { it.id } },
      liveOf = { r ->
        val shown = rows[r].channel.programs.filter { g.cellBox(it) != null }
        (shown.firstOrNull { GuideGeometry.isLive(it.startMs, it.durationSeconds, nowMs) } ?: shown.firstOrNull())?.id
      },
    )
    // The row the focus leaves is drawn again without it: record that too, or the frame that moves the focus has that one to do.
    aheadLeaves = if (ahead != null && ahead?.row != cur.row) cur.row else -1
    if (ahead != null && !aheadQueued) {
      aheadQueued = true
      Looper.myQueue().addIdleHandler(aheadIdle)
    }
  }

  /** Records the row [planAhead] guessed, now that the main thread has nothing else to do. */
  @RequiresApi(Build.VERSION_CODES.Q)
  private fun recordAhead() {
    val next = ahead ?: return
    ahead = null
    val leaves = aheadLeaves
    aheadLeaves = -1
    val nodes = rowNodes ?: return
    val g = geo ?: return
    if (!usesNodes || !isAttachedToWindow || width <= 0) return
    val rows = LineupStores.rows(lineupId, lineupVersion)
    if (next.row !in rows.indices || g.rowH <= 0) return
    val rowHpx = g.rowH * density
    // (The screen origin only places a texture behind or over the rows, which a row's own drawing does not use.)
    val frame = GuideFrame(g, width.toFloat(), height.toFloat(), rowHpx.toFloat(), SystemClock.uptimeMillis(), nowMs)
    Trace.beginSection("NativeGuide.recordAhead")
    try {
      painter.beginFrame(frame)
      val epoch = painter.epoch + (LucideGlyphs.version.toLong() shl 32)
      val state = RowState.of(next.row, next.row, next.programId, next.zone, false)
      val rowH = ceil(rowHpx).toInt()
      nodes.recordAhead(next.row, rows[next.row], state, width, rowH, epoch, backdrop, painter, frame, images)
      if (leaves in rows.indices) {
        nodes.recordAhead(leaves, rows[leaves], RowState.of(leaves, -1, null, next.zone, false), width, rowH, epoch, backdrop, painter, frame, images)
      }
      if (nodes.animating) postInvalidateOnAnimation()
    } finally {
      Trace.endSection()
    }
  }

  /** Runs `block`; a failure latches the view as broken and reports it to JS once. */
  private inline fun guard(block: () -> Unit) {
    if (broken) return
    try {
      block()
    } catch (t: Throwable) {
      fail(t)
    }
  }

  /** Like [guard], for work done while props are being applied or the view is going away: the failure is reported
   *  when the props are done (`propsUpdated`), not from inside a setter (the view may not be able to emit yet). */
  private inline fun prop(block: () -> Unit) {
    if (broken) return
    try {
      block()
    } catch (t: Throwable) {
      if (pendingError == null) pendingError = t
    }
  }

  private fun fail(t: Throwable) {
    if (broken) return
    broken = true
    Log.e(TAG, "native guide failed", t)
    onRenderError(mapOf("message" to (t.message ?: t.javaClass.simpleName)))
    invalidate()
  }

  // Accessibility.
  /** The rows are one opaque view to TalkBack, so it at least reads the focused row (the header stays the main source). */
  private fun updateDescription() {
    val row = LineupStores.rows(lineupId, lineupVersion).getOrNull(focusRow)
    contentDescription = row?.let { RowState.of(focusRow, focusRow, focusProgramId, zone, miniFocused).description(it) }
  }

  private companion object {
    const val TAG = "AirwaveGuide"

    /** ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW (deprecated as a constant on Android 14, still the lowest level). */
    const val TRIM_LEVEL = 10
  }
}
