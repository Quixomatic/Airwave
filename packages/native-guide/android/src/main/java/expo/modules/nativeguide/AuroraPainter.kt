package expo.modules.nativeguide

import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.DashPathEffect
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.os.Build
import android.os.Trace
import android.text.Layout
import android.text.SpannableString
import android.text.Spanned
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import android.text.style.LineHeightSpan
import com.facebook.react.uimanager.PixelUtil
import java.util.Locale
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Draws one row of the Aurora guide (tv-native `features/guide/aurora-grid.tsx`, its `Row`) on a Canvas, so the native rows
 * look like the React Native rows they stand in for, in any of the guide's themes:
 *
 *  - the rail: a background plate (a theme's, or a tinted one and an edge bar while the row is focused, or a solid inverted one), a
 *    divider on its right edge; a circle (round or square, its own fill, border, glyph color and centre marks) holding the channel's
 *    lucide icon (the favorite heart while the rail itself has focus) with a heart badge on its corner for a favorite, or the
 *    channel's logo in its place when it has one and it loaded; the channel number and the name along the bottom (two lines at most),
 *    or, in the `numeral` layout, an oversized number at the top left and the circle at the top right;
 *  - the lane: a bordered cell per program (the selected one drawn last, with its ring, its outer rings and its glow), under a stack of
 *    hard shadow shapes if the theme has them; an on-now cell's two-tone fill, its bar, its progress (a rounded bar, a band with a
 *    patterned remainder or a dimension line of ticks) and its status word (a tag, a kicker line or a star burst); then its
 *    title and sub-line. With program art on (a program carries an art URL), the artwork fills the cell centre cropped, under a scrim, or
 *    sits in a framed strip beside the text (the theme chooses); a cell whose image failed is a plain cell.
 *  - behind and over the rows: a theme's background texture (graph paper, dots) and its grain.
 *
 * Every dimension comes in `geo` (dp, from JS) or in the tokens (design px, which the layout turns into pixels) and every color in the
 * tokens, so the painter owns no design values. The layout is [AuroraLayout], which rounds boxes to the pixel grid as React Native's
 * layout engine does; text is measured with the same typefaces (the bundled theme fonts, through React Native's own font handling),
 * rounded font sizes and font padding a React Native <Text> uses. Main thread only.
 */
internal class AuroraPainter(private val kit: PainterKit) : GuidePainter {
  private val text = kit.text
  private var tk = GuideTokens.AURORA
  private var look = tk.look
  private var stylesDirty = true

  private var geo: GuideGeo? = null
  private var layout: AuroraLayout? = null
  private var layoutWidth = -1f

  override var epoch = 0L
    private set

  /** Two-ink printing multiplies its second ink with what is beneath it ([InkBlend]). */
  override val readsBackdrop: Boolean get() = look.misregister != null

  // Paints. Colors are set per use; everything else is fixed here or by `rebuild`.
  private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private val patternPaint = Paint()
  private val numberPaint = TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val namePaint = TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val titlePaint = TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val subPaint = TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val kickerPaint = TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val platePaint = TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val burstPaint = TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val ink = InkBlend()

  // Text metrics, in px. With font padding on (a React Native <Text>'s default) a line's top is the font's `top`, so a
  // baseline sits `-top` below it.
  private var numberTopOffset = 0
  private var titleTopOffset = 0
  private var subTopOffset = 0
  private var nameLineHeight = 0
  private var kickerLine = 0

  private val glyphs = GlyphDrawer()
  private val tiles = GuideTiles()
  private val fm = Paint.FontMetrics()
  private val burstVertices = Burst.vertices()
  private val dashes = HashMap<Long, DashPathEffect>()
  private val dashed = DashedBorders()
  private val strokeBox = FloatArray(4)

  // The cell insets a hard shadow pulls its body in by, resting and selected (design px).
  private var insetRest = Stacks.NO_INSET
  private var insetFocus = Stacks.NO_INSET
  private val rect = RectF()
  private val inner = RectF()
  private val clip = Path()
  private val path = Path()
  private val cell = CellRect()
  private val ringBox = CellRect()
  private val barRect = BarRect()

  // Program art: the image paint (alpha is the fade), the scrim's gradient (a unit one, placed per cell by a matrix) and scratch.
  private val bitmapPaint = Paint(Paint.FILTER_BITMAP_FLAG)
  private val scrimPaint = Paint().apply { style = Paint.Style.FILL }
  private var scrimShader: LinearGradient? = null
  private val scrimMatrix = Matrix()
  private val artSrc = Rect()
  private val artDst = RectF()
  private val crop = IntArray(4)

  // The placeholder gradient's shaders, one per box size ([drawPlaceholder]), and the rings round the selected cell for the current
  // layout ([ringsFor]), so neither is rebuilt every frame.
  private val placeholders = HashMap<Long, LinearGradient>()
  private val placeholderMatrix = Matrix()
  private var ringsLayout: AuroraLayout? = null
  private var ringList: List<Stacks.Ring> = emptyList()

  // Channel logos: the box laid out for the row being drawn, and the fitted size of the image inside it.
  private val logoRect = LogoRect()
  private val fit = DoubleArray(2)

  /** The row being drawn: its accent as a mark (glyph, bars, circle border). Set by `drawRow`. */
  private var mark = 0

  private data class NameKey(val text: String, val width: Int, val size: Float, val face: Int, val lineHeight: Int)

  private val names = object : LinkedHashMap<NameKey, StaticLayout>(32, 0.75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<NameKey, StaticLayout>?) = size > MAX_NAMES
  }

  // Strings derived per frame are derived once: capitals, and a program's start time for the kicker line.
  private val capitals = HashMap<String, String>()
  private val startTimes = HashMap<Long, String>()
  private val kickerWidths = HashMap<String, Float>()

  override fun setTokens(json: String) {
    epoch += 1
    tk = GuideTokens.parse(json)
    look = tk.look
    insetRest = Stacks.inset(look.shadow)
    insetFocus = Stacks.inset(look.shadowFocus ?: look.shadow)
    dashes.clear()
    dashed.clear()
    text.trim() // the cut strings and ellipsis widths of the old look's faces
    scrimShader = LinearGradient(0f, 0f, 1f, 0f, tk.artScrimStart, tk.artScrimEnd, Shader.TileMode.CLAMP)
    tiles.clear()
    placeholders.clear()
    ringsLayout = null
    capitals.clear()
    stylesDirty = true
  }

  override fun clock(row: GuideRow, frame: GuideFrame): Long = AuroraLayout.clockOf(frame.geo, row.channel.programs, frame.nowMs)

  override fun beginFrame(frame: GuideFrame) {
    if (frame.geo !== geo || stylesDirty || frame.widthPx != layoutWidth) {
      Trace.beginSection("NativeGuide.rebuild")
      try {
        rebuild(frame)
      } finally {
        Trace.endSection()
      }
    }
  }

  /** The geometry, the tokens' typefaces or the width changed: re-resolve sizes, typefaces and the layout. */
  private fun rebuild(frame: GuideFrame) {
    epoch += 1
    val g = frame.geo
    val type = look.type
    style(numberPaint, type.number, tk.numberWeight, type.family(type.number), g.dp("numberSize"))
    style(namePaint, type.name, type.name.weight, type.family(type.name), g.dp("nameSize"))
    style(titlePaint, type.title, tk.titleWeight, type.family(type.title), g.dp("titleSize"))
    style(subPaint, type.sub, type.sub.weight, type.family(type.sub), g.dp("subSize"))
    // The status words: the kicker and the tag set in the theme's text face, bold, spaced out; the burst's word in its display face.
    kickerPaint.apply {
      typeface = text.typeface(type.textFamily, 700)
      textSize = text.fontPx(g.dp("kickerSize"))
      letterSpacing = spacingEm(KICKER_TRACK.toDouble(), g.dp("kickerSize"))
      isSubpixelText = TextFlags.subpixel(700, type.textFamily, false)
    }
    platePaint.apply {
      typeface = text.typeface(type.textFamily, 700)
      textSize = text.fontPx(g.dp("plateSize"))
      letterSpacing = spacingEm(PLATE_TRACK.toDouble(), g.dp("plateSize"))
      isSubpixelText = TextFlags.subpixel(700, type.textFamily, false)
    }
    burstPaint.apply {
      typeface = text.typeface(type.displayFamily, 400)
      letterSpacing = BURST_TRACK
      isSubpixelText = TextFlags.subpixel(400, type.displayFamily, false)
    }
    nameLineHeight = text.fontPx(g.dp("nameLine") * type.name.scale).toInt()
    kickerLine = ceil(kickerPaint.textSize * StatusRules.KICKER_LINE).toInt()
    // Aurora's text sits in the font's own line boxes, as a React Native <Text> without a lineHeight does. A theme that sets its own faces
    // lays its lines out the way the theme mocks do instead (the title and sub-line 1.2 of their size tall, the number exactly its size),
    // because a display face's own line box can be far taller than its letters and would push the sub-line into the progress bar.
    val boxed = type.textFamily != null || type.displayFamily != null
    val titleLine: Int
    if (boxed) {
      titleLine = text.fontPx(g.dp("titleSize") * type.title.scale * LINE_BOX).toInt()
      titleTopOffset = baselineIn(titlePaint, titleLine)
      subTopOffset = baselineIn(subPaint, text.fontPx(g.dp("subSize") * type.sub.scale * LINE_BOX).toInt())
      numberTopOffset = numberOffset()
    } else {
      val titleFm = titlePaint.fontMetricsInt
      titleLine = titleFm.bottom - titleFm.top
      numberTopOffset = numberOffset()
      titleTopOffset = -titlePaint.fontMetricsInt.top
      subTopOffset = -subPaint.fontMetricsInt.top
    }
    layout = AuroraLayout(g, kit.density, frame.widthPx.toDouble(), titleLine, look)
    geo = g
    layoutWidth = frame.widthPx
    stylesDirty = false
    names.clear()
    kickerWidths.clear()
  }

  /**
   * Where the channel number's baseline sits below its top, at the number paint's current size. The number is a React Native <Text> with
   * no line height of its own, so it sits in the font's own line box: from the font's `top` when the text has the font's padding (the system
   * font), from its `ascent` when it has not (a bundled face, which the classic rows set without the padding).
   */
  private fun numberOffset(): Int {
    val fm = numberPaint.fontMetricsInt
    return LineMetrics.baseline(fm.ascent, fm.top, look.type.family(look.type.number) == null)
  }

  /** How tall the channel number's text is at the number paint's current size: the font's own line box, with or without the font's padding (see [numberOffset]). */
  private fun numberHeight(): Int {
    val fm = numberPaint.fontMetricsInt
    return LineMetrics.height(fm.ascent, fm.descent, fm.top, fm.bottom, look.type.family(look.type.number) == null)
  }

  /** Where the baseline sits below the top of a line box `lineH` tall holding this paint's text, with the leading split around it as React Native does. */
  private fun baselineIn(p: TextPaint, lineH: Int): Int = -LineBox.of(p.fontMetricsInt.ascent, p.fontMetricsInt.descent, lineH).ascent

  /** A role's paint: its theme face at its weight and slant, the Aurora size times the role's own scale, its tracking. */
  private fun style(p: TextPaint, role: GuideLook.TextStyle, weight: Int, family: String?, dp: Double) {
    p.typeface = text.typeface(family, weight, role.italic)
    p.textSize = text.fontPx(dp * role.scale)
    p.letterSpacing = spacingEm(role.track, dp * role.scale)
    p.isSubpixelText = TextFlags.subpixel(weight, family, role.italic)
  }

  /**
   * A line's letter spacing in em, as React Native sets it: the spacing (`track` em of the font's size in dp) in pixels over the font's size
   * rounded UP to a whole pixel, which is a little under `track` when the size has a fraction. `dp` is the font's size in dp.
   */
  private fun spacingEm(track: Double, dp: Double): Float = LetterSpacing.em(track, PixelUtil.toPixelFromSP(dp.toFloat()))

  /** `s` as the role sets it: in capitals when it says so. */
  private fun cased(s: String, role: GuideLook.TextStyle): String = if (role.upper) capital(s) else s

  private fun capital(s: String): String {
    if (capitals.size > MAX_CAPITALS) capitals.clear()
    return capitals.getOrPut(s) { s.uppercase(Locale.ROOT) }
  }

  // Frame-wide layers.
  override fun drawBackdrop(canvas: Canvas, frame: GuideFrame) {
    val l = layout ?: return
    val p = look.patterns
    val unit = l.vw(1.0)
    val ox = -frame.screenX
    val oy = -frame.screenY
    p.halftone?.let {
      tiles.halftone(it, unit, patternPaint, ox, oy)
      canvas.drawRect(0f, 0f, frame.widthPx, frame.heightPx, patternPaint)
    }
    p.grid?.let {
      tiles.grid(it, unit, patternPaint, ox, oy)
      canvas.drawRect(0f, 0f, frame.widthPx, frame.heightPx, patternPaint)
    }
    patternPaint.shader = null
  }

  override fun drawOverlay(canvas: Canvas, frame: GuideFrame) {
    val l = layout ?: return
    val grain = look.patterns.grain ?: return
    tiles.grain(grain, l.vw(1.0), patternPaint, -frame.screenX, -frame.screenY)
    canvas.drawRect(0f, 0f, frame.widthPx, frame.heightPx, patternPaint)
    patternPaint.shader = null
  }

  override fun drawRow(canvas: Canvas, row: GuideRow, state: RowState, frame: GuideFrame) {
    val l = layout ?: return
    mark = tk.mark(row.accent)
    // The row's top rule: a border on a view with no radius, which React Native draws as RectBorder says.
    val rule = RectBorder.widthPx(l.borderTopPx)
    if (rule > 0) {
      val band = RectBorder.band(rule)
      fill.color = tk.rowBorder
      canvas.drawRect(0f, band[0], frame.widthPx, band[1], fill)
    }
    drawRail(canvas, row, state, l, frame)
    drawLane(canvas, row, state, frame, l)
  }

  // The rail.
  private fun drawRail(canvas: Canvas, row: GuideRow, state: RowState, l: AuroraLayout, frame: GuideFrame) {
    val accent = row.accent
    val bodyTop = l.body.start.toFloat()
    val bodyBottom = l.body.end.toFloat()
    val rf = look.railFocus
    if (look.railBg ushr 24 != 0) {
      fill.color = look.railBg
      canvas.drawRect(l.rail.start.toFloat(), bodyTop, l.rail.end.toFloat(), bodyBottom, fill)
    }
    if (state.focused) {
      // The focused rail: a solid inverted plate if the theme has one, else the accent's wash; then the edge bar.
      fill.color = rf?.bg ?: GuideColor.alpha(accent, tk.railFocusA)
      canvas.drawRect(l.rail.start.toFloat(), bodyTop, l.rail.end.toFloat(), bodyBottom, fill)
      if (l.railBarEnd > l.rail.start) {
        fill.color = look.railBar.color ?: mark
        val radius = l.vw(look.railBar.r).toFloat()
        if (radius > 0f) {
          rect.set(l.rail.start.toFloat(), bodyTop, l.railBarEnd.toFloat(), bodyBottom)
          val r = AuroraLayout.radius(radius.toDouble(), rect.width(), rect.height())
          canvas.drawRoundRect(rect, r, r, fill)
        } else {
          canvas.drawRect(l.rail.start.toFloat(), bodyTop, l.railBarEnd.toFloat(), bodyBottom, fill)
        }
      }
    }
    look.railDivider?.let {
      val w = RectBorder.widthPx(l.stroke(it.w))
      if (w > 0 && it.color ushr 24 != 0) {
        // The rail's right border: its band is measured in from the rail's right edge (an odd width puts a half pixel past it).
        val band = RectBorder.band(w)
        fill.color = it.color
        canvas.drawRect(l.rail.end - band[1], bodyTop, l.rail.end - band[0], bodyBottom, fill)
      }
    }

    val type = look.type
    val number = row.channel.number
    // A channel's logo stands in for its circle, unless the rail has focus (the circle is then the favorite heart) or the logo
    // failed to load. While it loads, the box is empty (or just its plate). (Decided first: the number's room depends on it.)
    val logo = if (state.railFocused) null else logoFor(row.channel, l)

    // An oversized number shrinks to the room the circle (or the logo) leaves it, on one line (down to half its size, and cut with an ellipsis
    // beyond that), as the classic rows' number does: in the `numeral` layout, and wherever the theme scales its numbers up (Neo-Brutalist's "1001"
    // would run on into the cells otherwise). Its line box shrinks with it, so it stays against the rail's top.
    val numberSize = numberPaint.textSize
    var shownNumber = if (number.isEmpty()) number else cased(number, type.number)
    var numberOffset = numberTopOffset
    if (l.fitsNumber(type.number.scale) && shownNumber.isNotEmpty()) {
      val room = l.fittedNumberRoom(logo != null).toFloat()
      val scale = StatusRules.fitScale(numberPaint.measureText(shownNumber), room)
      if (scale < 1f) {
        numberPaint.textSize = numberSize * scale
        numberOffset = numberOffset()
      }
      // A number shrunk to exactly its room measures a hair over it in floating point: that is not a reason to cut it.
      shownNumber = text.ellipsize(shownNumber, numberPaint, room + FIT_SLACK_PX).toString()
    }
    val numberW = if (shownNumber.isNotEmpty()) ceil(numberPaint.measureText(shownNumber)).toInt() else 0
    val numberH = if (shownNumber.isNotEmpty()) numberHeight() else 0

    if (logo != null) drawLogo(canvas, row, logo, numberW, l, frame) else drawCircle(canvas, row, state, l)

    // The channel number: right-aligned beside the circle or the logo (against the left padding in the numeral layout).
    if (shownNumber.isNotEmpty()) {
      val color = if (state.focused) (rf?.number ?: tk.numberFocused) else tk.number
      val left = if (logo != null) l.numberLeftBesideLogo(numberW) else l.numberLeft(numberW)
      val baseline = (l.numberTop + numberOffset).toFloat()
      drawInk(canvas, shownNumber, left.toFloat(), baseline, numberPaint, color, "number", l)
    }
    numberPaint.textSize = numberSize

    // The name, up to two lines, ending at the rail's bottom padding.
    nameLayout(cased(row.channel.name, type.name), l)?.let {
      namePaint.color = if (state.focused) (rf?.name ?: tk.name) else tk.name
      canvas.save()
      canvas.translate(l.nameLeft.toFloat(), l.nameTop(it.height, numberH).toFloat())
      it.draw(canvas)
      canvas.restore()
    }
  }

  /**
   * One piece of text in `color`, or, when the theme misregisters this `role` (two-ink printing), twice: a back copy in the second ink
   * offset by the theme's amount, then the front copy, each multiplied with what is beneath so the inks mix where they overlap.
   * The multiply is [InkBlend]'s: a blend with no read back of the screen on Android 10 and up, PorterDuff MULTIPLY (which a hardware
   * canvas draws, minSdkVersion 26) below that. The React Native rows' `mixBlendMode` needs Android 10 and draw the back copy plain below that.
   */
  private fun drawInk(canvas: Canvas, s: CharSequence, x: Float, baseline: Float, paint: TextPaint, color: Int, role: String, l: AuroraLayout) {
    val mis = look.misregister
    if (mis != null && role in mis.text) {
      ink.on(paint)
      paint.color = ink.color(mis.color)
      canvas.drawText(s, 0, s.length, x + l.vw(mis.dx).toFloat(), baseline + l.vw(mis.dy).toFloat(), paint)
      paint.color = ink.color(color)
      canvas.drawText(s, 0, s.length, x, baseline, paint)
      ink.off(paint)
    } else {
      paint.color = color
      canvas.drawText(s, 0, s.length, x, baseline, paint)
    }
  }

  /** A line of title or sub-line text in `color`: [drawInk]'s double draw when the theme misregisters `role`, else one pass. */
  private fun drawLineInk(canvas: Canvas, s: CharSequence, left: Float, right: Float, baseline: Float, paint: TextPaint, color: Int, role: String, l: AuroraLayout) {
    val mis = look.misregister
    if (mis != null && role in mis.text) {
      ink.on(paint)
      paint.color = ink.color(mis.color)
      val dx = l.vw(mis.dx).toFloat()
      text.drawLineIn(canvas, s, left + dx, right + dx, baseline + l.vw(mis.dy).toFloat(), paint)
      paint.color = ink.color(color)
      text.drawLineIn(canvas, s, left, right, baseline, paint)
      ink.off(paint)
    } else {
      paint.color = color
      text.drawLineIn(canvas, s, left, right, baseline, paint)
    }
  }

  /** The circle: fill, border and glyph in the theme's style (round or square, scaled), or the focus ring while the rail has focus, with
   *  the channel's icon (the favorite heart while the rail has focus), centre marks and a favorite's badge. */
  private fun drawCircle(canvas: Canvas, row: GuideRow, state: RowState, l: AuroraLayout) {
    val accent = row.accent
    val c = look.circle
    val rf = look.railFocus
    val ringed = state.railFocused
    // A focused row's rail may recolor the circle and its glyph (an inverted rail).
    val recolor = state.focused && rf != null
    val bw = (if (ringed) l.circleRing else l.circleBorder).toFloat()
    rect.set(l.circleX.start.toFloat(), l.circleY.start.toFloat(), l.circleX.end.toFloat(), l.circleY.end.toFloat())
    val radius = if (c.radius >= 0.5) min(rect.width(), rect.height()) / 2f else AuroraLayout.radius((c.radius * rect.width()), rect.width(), rect.height())
    var fillColor = when (c.fill.kind) {
      GuideLook.Spec.Kind.ACCENT -> GuideColor.alpha(accent, tk.circleFillA)
      GuideLook.Spec.Kind.ACCENT_SOLID -> accent
      GuideLook.Spec.Kind.NONE -> GuideColor.TRANSPARENT
      else -> c.fill.color
    }
    if (recolor) rf?.circle?.let { fillColor = it }
    if (fillColor ushr 24 != 0) {
      fill.color = fillColor
      canvas.drawRoundRect(rect, radius, radius, fill)
    }
    val borderColor = when {
      ringed -> tk.ring
      c.border.kind == GuideLook.Spec.Kind.ACCENT -> GuideColor.alpha(mark, tk.circleBorderA)
      else -> c.border.color
    }
    if (bw > 0f && borderColor ushr 24 != 0) {
      stroke.color = borderColor
      stroke.strokeWidth = bw
      inner.set(rect.left + bw / 2, rect.top + bw / 2, rect.right - bw / 2, rect.bottom - bw / 2)
      val innerRadius = max(0f, radius - bw / 2)
      // Two-ink printing prints the border off register, blended with the fill beneath it.
      val mis = look.misregister?.takeIf { "circle" in it.shapes }
      if (mis != null) {
        ink.on(stroke)
        stroke.color = ink.color(borderColor)
        inner.offset(l.vw(mis.dx).toFloat(), l.vw(mis.dy).toFloat())
        canvas.drawRoundRect(inner, innerRadius, innerRadius, stroke)
        ink.off(stroke)
      } else {
        canvas.drawRoundRect(inner, innerRadius, innerRadius, stroke)
      }
    }
    // Draftsman's centre marks: four short ticks through the circle's centre lines, just outside it.
    c.marks?.let { m ->
      val len = l.vw(m.len).toFloat()
      val gap = l.vw(m.gap).toFloat()
      val w = l.stroke(m.w)
      if (len > 0f && w > 0f && borderColor ushr 24 != 0) {
        fill.color = borderColor
        val cx = (rect.left + rect.right) / 2
        val cy = (rect.top + rect.bottom) / 2
        canvas.drawRect(cx - w / 2, rect.top - gap - len, cx + w / 2, rect.top - gap, fill)
        canvas.drawRect(cx - w / 2, rect.bottom + gap, cx + w / 2, rect.bottom + gap + len, fill)
        canvas.drawRect(rect.left - gap - len, cy - w / 2, rect.left - gap, cy + w / 2, fill)
        canvas.drawRect(rect.right + gap, cy - w / 2, rect.right + gap + len, cy + w / 2, fill)
      }
    }

    // Inside it: the heart while the rail has focus (filled for a favorite), else the channel's icon in the glyph color.
    val glyphSize = (l.glyphX.end - l.glyphX.start).toFloat()
    val strokeBox = look.glyphStroke.toFloat()
    if (ringed) {
      heart()?.let {
        val color = if (row.fav) tk.fav else tk.heartOff
        glyphs.draw(canvas, it, l.glyphX.start.toFloat(), l.glyphY.start.toFloat(), glyphSize, color, if (row.fav) tk.fav else 0, strokeBox)
      }
    } else {
      val glyphColor = when {
        recolor && rf?.glyph != null -> rf.glyph
        c.glyph.kind == GuideLook.Spec.Kind.ACCENT -> mark
        c.glyph.kind == GuideLook.Spec.Kind.AUTO -> GuideColor.autoInk(fillColor, tk.railGround)
        else -> c.glyph.color
      }
      LucideGlyphs.get(row.channel.icon)?.let {
        glyphs.draw(canvas, it, l.glyphX.start.toFloat(), l.glyphY.start.toFloat(), glyphSize, glyphColor, 0, strokeBox)
      }
      // A favorite's badge on the circle's corner: drawn over the circle's border and past its edge.
      if (row.fav) drawBadge(canvas, l.badgeX.start.toFloat(), l.badgeY.start.toFloat(), (l.badgeX.end - l.badgeX.start).toFloat(), l)
    }
  }

  /** A favorite's heart badge: filled, outlined in the theme's own color (so it shows on any rail) or, by default, in its own. */
  private fun drawBadge(canvas: Canvas, left: Float, top: Float, size: Float, l: AuroraLayout) {
    val heart = heart() ?: return
    val s = look.favStroke
    val widthBox = if (s != null && size > 0f) (l.stroke(s.w) / size * GLYPH_BOX).coerceAtLeast(0f) else 2f
    glyphs.draw(canvas, heart, left, top, size, s?.color ?: tk.fav, tk.fav, widthBox)
  }

  /**
   * The channel's logo image, or null when it has none or it failed to load (the circle is drawn instead). Logos are decoded
   * down to the box a logo can fill, one size for every channel.
   */
  private fun logoFor(channel: GuideChannel, l: AuroraLayout): GuideImages.Entry? {
    val url = channel.logo ?: return null
    return kit.images.get(url, l.logoDecodeW, l.logoDecodeH).takeIf { !it.failed }
  }

  /** The logo in its box beside the number: the theme's plate behind it (if any), the image fitted inside and centered, fading in
   *  over 300 ms when it just arrived, and a favorite's badge on the box's corner. */
  private fun drawLogo(canvas: Canvas, row: GuideRow, logo: GuideImages.Entry, numberW: Int, l: AuroraLayout, frame: GuideFrame) {
    val r = logoRect
    l.placeLogo(numberW, r)
    if (r.right > r.left && r.bottom > r.top) {
      rect.set(r.left.toFloat(), r.top.toFloat(), r.right.toFloat(), r.bottom.toFloat())
      val radius = AuroraLayout.radius(l.logoRadius, rect.width(), rect.height())
      if (tk.logoPlate ushr 24 != 0) {
        fill.color = tk.logoPlate
        canvas.drawRoundRect(rect, radius, radius, fill)
      }
      val bitmap = logo.bitmap
      if (bitmap != null) {
        GuideGeometry.containFit(bitmap.width, bitmap.height, (r.imgRight - r.imgLeft).toDouble(), (r.imgBottom - r.imgTop).toDouble(), fit)
        if (fit[0] > 0 && fit[1] > 0) {
          val cx = (r.imgLeft + r.imgRight) / 2
          val cy = (r.imgTop + r.imgBottom) / 2
          artDst.set(cx - fit[0].toFloat() / 2, cy - fit[1].toFloat() / 2, cx + fit[0].toFloat() / 2, cy + fit[1].toFloat() / 2)
          val fade = GuideImages.fade(logo.arrivedAt, frame.uptimeMs)
          bitmapPaint.alpha = (fade * 255).roundToInt()
          // The box clips its logo to the plate's rounded corners.
          canvas.save()
          clip.rewind()
          clip.addRoundRect(rect, radius, radius, Path.Direction.CW)
          canvas.clipPath(clip)
          canvas.drawBitmap(bitmap, null, artDst, bitmapPaint)
          canvas.restore()
          if (fade < 1f) frame.animating = true
        }
      }
    }
    if (row.fav) drawBadge(canvas, r.badgeLeft.toFloat(), r.badgeTop.toFloat(), (r.badgeRight - r.badgeLeft).toFloat(), l)
  }

  private fun heart(): Glyph? = if (LucideGlyphs.has(LucideGlyphs.HEART)) LucideGlyphs.get(LucideGlyphs.HEART) else null

  /** The name laid out like a React Native <Text numberOfLines={2}> with a lineHeight: font padding on, high-quality line
   *  breaking, no hyphenation, END ellipsis, and the line height applied the way React Native applies it. Cached. */
  private fun nameLayout(name: String, l: AuroraLayout): StaticLayout? {
    if (name.isEmpty() || l.nameWidth <= 0) return null
    val key = NameKey(name, l.nameWidth, namePaint.textSize, namePaint.typeface.hashCode(), nameLineHeight)
    names[key]?.let { return it }
    val spanned = SpannableString(name)
    spanned.setSpan(WebLineHeightSpan(nameLineHeight), 0, name.length, Spanned.SPAN_INCLUSIVE_INCLUSIVE)
    val builder = StaticLayout.Builder.obtain(spanned, 0, name.length, namePaint, l.nameWidth)
      .setAlignment(Layout.Alignment.ALIGN_NORMAL)
      .setLineSpacing(0f, 1f)
      .setIncludePad(true)
      .setBreakStrategy(Layout.BREAK_STRATEGY_HIGH_QUALITY)
      .setHyphenationFrequency(Layout.HYPHENATION_FREQUENCY_NONE)
      .setEllipsize(TextUtils.TruncateAt.END)
      .setMaxLines(NAME_LINES)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) builder.setUseLineSpacingFromFallbacks(true)
    return builder.build().also { names[key] = it }
  }

  // The lane.
  private fun drawLane(canvas: Canvas, row: GuideRow, state: RowState, frame: GuideFrame, l: AuroraLayout) {
    val programs = row.channel.programs
    if (programs.isEmpty()) return
    val g = frame.geo
    canvas.save()
    canvas.clipRect(l.lane.start.toFloat(), l.body.start.toFloat(), l.lane.end.toFloat(), l.body.end.toFloat())
    val selectedId = state.focusedProgramId
    for (p in programs) {
      if (p.id == selectedId) continue
      val box = g.cellBox(p) ?: continue
      drawCell(canvas, row, p, box, false, g, l, frame)
    }
    // The selected cell goes last so its ring sits over its neighbors.
    if (selectedId != null) {
      for (p in programs) {
        if (p.id != selectedId) continue
        val box = g.cellBox(p) ?: continue
        drawCell(canvas, row, p, box, true, g, l, frame)
        drawRings(canvas, box, l)
      }
    }
    canvas.restore()
  }

  /** The shadow shapes a cell casts: the selected one's own set if the theme has one, else the resting set. */
  private fun shadowOf(selected: Boolean): GuideLook.Shadow? = if (selected) look.shadowFocus ?: look.shadow else look.shadow

  private fun insetOf(selected: Boolean): Stacks.Inset = if (selected) insetFocus else insetRest

  /**
   * The rings round the selected cell, outside its own: the theme's outer ring (a gap off it, solid or dashed), then the glow, stacked
   * strokes at falling alpha in the row's accent. Each is a stroke inside a box grown from the cell's border box, the way a React
   * Native border is drawn; and, where the theme prints in two inks, one more ring of the second ink, off register, over the cell's own.
   */
  private fun drawRings(canvas: Canvas, box: GuideGeometry.CellBox, l: AuroraLayout) {
    val shrink = insetOf(true)
    val halo = look.halo
    val outer = tk.ringOuter?.takeIf { it ushr 24 != 0 }
    for (ring in ringsFor(l, outer != null)) {
      val color = if (ring.halo < 0) outer ?: continue else halo!![ring.halo].let { GuideColor.scaleAlpha(if (it.color.kind == GuideLook.Spec.Kind.ACCENT) mark else it.color.color, it.a) }
      if (color ushr 24 == 0) continue
      l.placeRing(box, ring.grow, ring.w, shrink, ringBox)
      val dash = if (ring.halo < 0) look.ringOuterDash else null
      strokeInside(canvas, ringBox, AuroraLayout.radius(l.cellRadius + ring.grow, (ringBox.right - ringBox.left).toFloat(), (ringBox.bottom - ringBox.top).toFloat()), ringBox.border, color, dash, l)
    }
    look.misregister?.takeIf { "ring" in it.shapes }?.let { mis ->
      l.placeRing(box, 0.0, l.cellRing.toDouble(), shrink, ringBox)
      ringBox.left += l.vw(mis.dx).roundToInt()
      ringBox.right += l.vw(mis.dx).roundToInt()
      ringBox.top += l.vw(mis.dy).roundToInt()
      ringBox.bottom += l.vw(mis.dy).roundToInt()
      ink.on(stroke)
      strokeInside(canvas, ringBox, AuroraLayout.radius(l.cellRadius, (ringBox.right - ringBox.left).toFloat(), (ringBox.bottom - ringBox.top).toFloat()), ringBox.border, ink.color(mis.color), null, l)
      ink.off(stroke)
    }
  }

  /** The rings round the selected cell for layout `l`, made once per layout (the sizes only change with it, and the tokens' own set drops it). */
  private fun ringsFor(l: AuroraLayout, outer: Boolean): List<Stacks.Ring> {
    if (ringsLayout !== l) {
      ringsLayout = l
      ringList = Stacks.rings(
        outerGap = l.vw(look.ringOuterGap),
        outerW = if (outer) l.ringOuterW else 0.0,
        halo = look.halo?.map { l.stroke(it.w).toDouble() }.orEmpty(),
      )
    }
    return ringList
  }

  /** A border `w` thick drawn inside `box` (a stroke centred half its width in, which is how React Native draws a border), solid or dashed.
   *  A dashed one is the same rounded rectangle React Native strokes with the same dashes, so the dashes fall where its do. It is
   *  drawn from a mask made once per size ([DashedBorders]), not by a path effect cut again on every frame; only a box too big for
   *  a mask is stroked with the effect. */
  private fun strokeInside(canvas: Canvas, box: CellRect, radius: Float, w: Float, color: Int, dash: GuideLook.Dash?, l: AuroraLayout) {
    if (w <= 0f || box.right - box.left <= 0 || box.bottom - box.top <= 0) return
    val r = max(0f, radius - w / 2)
    if (dash != null && dashed.draw(canvas, box.left, box.top, box.right, box.bottom, w, r, color)) return
    stroke.color = color
    stroke.strokeWidth = w
    inner.set(box.left + w / 2, box.top + w / 2, box.right - w / 2, box.bottom - w / 2)
    if (dash != null) stroke.pathEffect = dashEffect(w)
    canvas.drawRoundRect(inner, r, r, stroke)
    if (dash != null) stroke.pathEffect = null
  }

  /** The dashes of a border `w` px thick: React Native's own, which is what the classic rows draw whatever lengths the theme asks for. */
  private fun dashEffect(w: Float): DashPathEffect = dashes.getOrPut(w.toRawBits().toLong()) { DashPathEffect(BorderDash.intervals(w), 0f) }

  private fun drawCell(canvas: Canvas, row: GuideRow, p: GuideProgram, box: GuideGeometry.CellBox, selected: Boolean, g: GuideGeo, l: AuroraLayout, frame: GuideFrame) {
    val c = cell
    val live = GuideGeometry.isLive(p.startMs, p.durationSeconds, frame.nowMs)
    val shadow = shadowOf(selected)
    val sl = look.statusLabel
    val cellPx = box.width * kit.density
    // Program art, when the program has some and its image hasn't failed: asked for at the cell's box.
    val art = artFor(p, box, l)?.takeIf { !it.failed }
    val side = art != null && look.art.side
    // A kicker line goes over the title when the cell has the room for it (the room the art strip leaves the text), else it is
    // dropped and the cell is laid out as one without; a tag or a burst names a live cell that is wide enough for it.
    l.placeCell(box, selected, c, insetOf(selected))
    var kickerLabel: String? = null
    if (sl is GuideLook.StatusLabel.Kicker) {
      val label = capital(if (live) sl.live else timeOf(p.startMs))
      val room = c.textWidth - (if (side) ((c.padRight - c.padLeft) * look.art.sideFrac.toFloat()).roundToInt() else 0)
      if (StatusRules.kickerFits(kickerWidth(label), room.toFloat())) {
        kickerLabel = label
        l.placeCell(box, selected, c, insetOf(selected), kickerLine)
      }
    }
    val w = (c.right - c.left).toFloat()
    val h = (c.bottom - c.top).toFloat()
    if (w <= 0f || h <= 0f) return
    val radius = AuroraLayout.radius(l.cellRadius, w, h)
    val bw = c.border

    // Hard shadow shapes under the cell: copies of its box, moved and grown, in order.
    shadow?.let { drawShadow(canvas, it, c, l) }

    // The cell's fill, under its border.
    rect.set(c.left.toFloat(), c.top.toFloat(), c.right.toFloat(), c.bottom.toFloat())
    val bg = if (selected) look.cellFocusBg ?: (if (live) tk.liveCellBg else tk.cellBg) else if (live) tk.liveCellBg else tk.cellBg
    if (bg ushr 24 != 0) {
      fill.color = bg
      canvas.drawRoundRect(rect, radius, radius, fill)
    }
    // The border: a stroke centered half its width inside the box, which is how a React Native border is drawn; dashed for a resting
    // cell if the theme draws those so.
    if (bw > 0f) {
      val dash = if (!selected && !live) look.cellBorderDash else null
      strokeInside(canvas, c, radius, bw, if (selected) tk.ring else tk.cellBorder, dash, l)
    }

    val progress = live && look.progress.style != GuideLook.Progress.Style.NONE
    val needsClip = live || art != null
    // How much of the cell's width the text gives up: the art strip beside it, the burst's room.
    var textW = c.textWidth
    if (needsClip) {
      // The art, the progress fill and the accent bar live in the padding box, clipped to its rounded corners.
      canvas.save()
      clip.rewind()
      rect.set(c.padLeft, c.padTop, c.padRight, c.padBottom)
      val padRadius = max(0f, radius - bw)
      clip.addRoundRect(rect, padRadius, padRadius, Path.Direction.CW)
      canvas.clipPath(clip)
      if (art != null) {
        if (side) textW -= drawArtStrip(canvas, art, c, l, frame) else drawArt(canvas, art, c, frame)
      }
    }
    var pct = 0.0
    if (live) {
      // Two tones with a hard edge where "now" falls, like a gradient whose stops sit at the same position: the row's accent
      // at two alphas, or (a neutral theme) two fixed colors that don't depend on the channel.
      pct = GuideGeometry.liveFill(frame.nowMs, g.originMs, g.ppm, box.left, box.width)
      val edge = c.padLeft + (pct * (c.padRight - c.padLeft)).roundToInt()
      val elapsed = if (tk.liveNeutral) tk.liveElapsedColor else GuideColor.alpha(row.accent, tk.liveElapsedA)
      val remain = if (tk.liveNeutral) tk.liveRemainColor else GuideColor.alpha(row.accent, tk.liveRemainA)
      if (elapsed ushr 24 != 0) {
        fill.color = elapsed
        canvas.drawRect(c.padLeft, c.padTop, edge, c.padBottom, fill)
      }
      if (remain ushr 24 != 0) {
        fill.color = remain
        canvas.drawRect(edge, c.padTop, c.padRight, c.padBottom, fill)
      }
      // The bar's corners round to at most half its width.
      rect.set(c.barLeft.toFloat(), c.barTop.toFloat(), c.barRight.toFloat(), c.barBottom.toFloat())
      val barRadius = AuroraLayout.radius(l.barRadius, rect.width(), rect.height())
      fill.color = look.liveBarColor ?: mark
      canvas.drawRoundRect(rect, barRadius, barRadius, fill)
    }
    // A column rule on the cell's left edge (a cell without a box), and a hairline of light along a resting cell's top.
    look.cellRule?.let {
      val rw = l.stroke(it.w)
      if (rw > 0f) {
        val inset = l.vw(it.inset).toFloat()
        fill.color = it.color
        canvas.drawRect(c.padLeft, c.padTop + inset, c.padLeft + rw, c.padBottom - inset, fill)
      }
    }
    if (!selected) {
      look.highlight?.let {
        val hw = l.stroke(it.w)
        if (hw > 0f) {
          fill.color = it.color
          canvas.drawRect(c.padLeft + radius, c.padTop, c.padRight - radius, c.padTop + hw, fill)
        }
      }
    }
    if (progress) drawProgress(canvas, p, box, c, l, g, pct)
    if (live && sl is GuideLook.StatusLabel.Burst && StatusRules.fits(cellPx, l.vw(sl.minCell))) textW -= drawBurst(canvas, sl, c, l)
    if (needsClip) canvas.restore()

    // The texts.
    val plate = if (live && sl is GuideLook.StatusLabel.Plate && StatusRules.fits(cellPx, l.vw(sl.minCell))) sl else null
    drawTexts(canvas, p, c, max(0, textW), art != null && !side, selected, live, kickerLabel, plate, l)
  }

  /** How wide the kicker line writes `label`, measured once per string. */
  private fun kickerWidth(label: String): Float {
    if (kickerWidths.size > MAX_TIMES) kickerWidths.clear()
    return kickerWidths.getOrPut(label) { kickerPaint.measureText(label) }
  }

  /** A program's start time as the kicker writes it, formatted once per program. */
  private fun timeOf(ms: Long): String {
    if (startTimes.size > MAX_TIMES) startTimes.clear()
    return startTimes.getOrPut(ms) { TimeLabel.format(ms) }
  }

  /** The shadow's shapes, in order, each a copy of the cell's box moved by (dx, dy) and grown by `grow` on every side. */
  private fun drawShadow(canvas: Canvas, s: GuideLook.Shadow, c: CellRect, l: AuroraLayout) {
    for (step in s.steps) {
      val grow = l.vw(step.grow).toFloat()
      val dx = PixelGrid.snap(l.vw(step.dx)).toFloat()
      val dy = PixelGrid.snap(l.vw(step.dy)).toFloat()
      rect.set(c.left + dx - grow, c.top + dy - grow, c.right + dx + grow, c.bottom + dy + grow)
      if (rect.width() <= 0f || rect.height() <= 0f) continue
      val r = AuroraLayout.radius(l.cellRadius + grow, rect.width(), rect.height())
      val color = GuideColor.scaleAlpha(step.color, step.a)
      if (color ushr 24 != 0) {
        fill.color = color
        canvas.drawRoundRect(rect, r, r, fill)
      }
      step.stroke?.let {
        val sw = l.stroke(it.w)
        if (sw > 0f) {
          ringBox.left = rect.left.roundToInt()
          ringBox.top = rect.top.roundToInt()
          ringBox.right = rect.right.roundToInt()
          ringBox.bottom = rect.bottom.roundToInt()
          strokeInside(canvas, ringBox, r, sw, it.color, null, l)
        }
      }
    }
  }

  /**
   * The image for this program's art at the cell's box, or null when it has none. The request is the one the React Native
   * rows make for the same cell: the art URL with the cell's size (dp, the box's width and the row's height less the cell
   * inset) in pixels, rounded up to a 64 px step, so a repeat of a cell is a cache hit whichever renderer drew it first.
   * It is decoded to that box and cropped to what the cell shows of it ([GuideImages.get] `cover`), so the bitmap the cell pins while it is on
   * screen (which no memory budget limits) is the size of the cell, not of the picture. Fresco's own cache can still hold the uncropped decode,
   * capped by [GuideGeometry.ART_MAX] and evictable (see [CoverCropPostprocessor]).
   */
  private fun artFor(p: GuideProgram, box: GuideGeometry.CellBox, l: AuroraLayout): GuideImages.Entry? {
    if (p.art == null) return null
    val w = l.artW(box)
    val h = l.artH
    val url = p.artUrl(w, h) ?: return null
    return kit.images.get(url, w, h, cover = true)
  }

  /** The art centre cropped to the padding box, fading in over 300 ms when it just arrived, then the scrim over it. The scrim
   *  is there from the start; while the image loads, and while it fades in, the theme's placeholder gradient is under it, as in the
   *  React Native rows. */
  private fun drawArt(canvas: Canvas, art: GuideImages.Entry, c: CellRect, frame: GuideFrame) {
    artDst.set(c.padLeft, c.padTop, c.padRight, c.padBottom)
    val bitmap = art.bitmap
    if (bitmap == null || GuideImages.fade(art.arrivedAt, frame.uptimeMs) < 1f) drawPlaceholder(canvas, artDst)
    if (bitmap != null) {
      GuideGeometry.coverCrop(bitmap.width, bitmap.height, artDst.width().toDouble(), artDst.height().toDouble(), crop)
      artSrc.set(crop[0], crop[1], crop[2], crop[3])
      val fade = GuideImages.fade(art.arrivedAt, frame.uptimeMs)
      bitmapPaint.alpha = (fade * 255).roundToInt()
      canvas.drawBitmap(bitmap, artSrc, artDst, bitmapPaint)
      if (fade < 1f) frame.animating = true
    }
    val shader = scrimShader ?: return
    scrimMatrix.setScale(artDst.width(), 1f)
    scrimMatrix.postTranslate(artDst.left, 0f)
    shader.setLocalMatrix(scrimMatrix)
    scrimPaint.shader = shader
    canvas.drawRect(artDst, scrimPaint)
    scrimPaint.shader = null
  }

  /**
   * The art in a strip down the cell's right side, so the words stay on the cell's plate: the strip is a share of the padding box, its
   * left edge a frame in the theme's color, its picture centre cropped, a gradient standing in until it arrives. Returns how many px
   * wide the strip is (the text gives that up).
   */
  private fun drawArtStrip(canvas: Canvas, art: GuideImages.Entry, c: CellRect, l: AuroraLayout, frame: GuideFrame): Int {
    val a = look.art
    val stripW = ((c.padRight - c.padLeft) * a.sideFrac.toFloat()).roundToInt().toFloat()
    if (stripW <= 0f) return 0
    val left = c.padRight - stripW
    val frameW = min(stripW, l.stroke(a.frameW))
    artDst.set(left + frameW, c.padTop, c.padRight, c.padBottom)
    val bitmap = art.bitmap
    // While it loads, and while it fades in over it, the theme's gradient.
    if (bitmap == null || GuideImages.fade(art.arrivedAt, frame.uptimeMs) < 1f) drawPlaceholder(canvas, artDst)
    if (bitmap != null) {
      GuideGeometry.coverCrop(bitmap.width, bitmap.height, artDst.width().toDouble(), artDst.height().toDouble(), crop)
      artSrc.set(crop[0], crop[1], crop[2], crop[3])
      val fade = GuideImages.fade(art.arrivedAt, frame.uptimeMs)
      bitmapPaint.alpha = (fade * 255).roundToInt()
      canvas.drawBitmap(bitmap, artSrc, artDst, bitmapPaint)
      if (fade < 1f) frame.animating = true
    }
    if (frameW > 0f && a.frameColor ushr 24 != 0) {
      fill.color = a.frameColor
      canvas.drawRect(left, c.padTop, left + frameW, c.padBottom, fill)
    }
    return stripW.roundToInt()
  }

  /**
   * The theme's placeholder gradient over `box`, as CSS lays a `linear-gradient(angle, stops)` over an element. The shader is made once
   * per box size, in the box's own coordinates, and moved onto each box by its matrix (as the scrim's is), so a cell that waits for its
   * picture costs no allocation per frame.
   */
  private fun drawPlaceholder(canvas: Canvas, box: RectF) {
    val w = box.width()
    val h = box.height()
    val key = (w.toRawBits().toLong() shl 32) or (h.toRawBits().toLong() and 0xFFFFFFFFL)
    val shader = placeholders.getOrPut(key) {
      if (placeholders.size >= MAX_PLACEHOLDERS) placeholders.clear()
      val g = look.art.placeholder
      val line = GradientLine.of(g.angle, w.toDouble(), h.toDouble())
      LinearGradient(
        line[0].toFloat(), line[1].toFloat(), line[2].toFloat(), line[3].toFloat(),
        g.stops.map { it.first }.toIntArray(), g.stops.map { it.second.toFloat() }.toFloatArray(), Shader.TileMode.CLAMP,
      )
    }
    placeholderMatrix.setTranslate(box.left, box.top)
    shader.setLocalMatrix(placeholderMatrix)
    scrimPaint.shader = shader
    canvas.drawRect(box, scrimPaint)
    scrimPaint.shader = null
  }

  /**
   * The on-now cell's progress: a track along the cell's bottom (rounded, or a full-bleed band, with an optional border all round or on
   * top only and a halftone over the part still to come) and a fill to "now"; or a dimension line, a ruler of ticks with end caps and a
   * mark at "now". Drawn in the padding box, inside its clip.
   */
  private fun drawProgress(canvas: Canvas, p: GuideProgram, box: GuideGeometry.CellBox, c: CellRect, l: AuroraLayout, g: GuideGeo, pct: Double) {
    val pr = look.progress
    val inset = l.vw(pr.inset).toFloat()
    val bottom = l.vw(pr.bottom).toFloat()
    if (pr.style == GuideLook.Progress.Style.TICKS) {
      drawDimensionLine(canvas, p, box, c, l, g, pct, pr, inset, bottom)
      return
    }
    val border = pr.trackBorder
    val bar = barRect
    l.placeBar(c, l.vw(pr.inset), l.vw(pr.bottom), l.vw(pr.h), if (border != null) l.vw(border.w) else 0.0, border?.topOnly == true, pct, bar)
    if (bar.right <= bar.left || bar.bottom <= bar.top) return
    rect.set(bar.left.toFloat(), bar.top.toFloat(), bar.right.toFloat(), bar.bottom.toFloat())
    val r = AuroraLayout.radius(l.vw(pr.r), rect.width(), rect.height())
    if (pr.track ushr 24 != 0) {
      fill.color = pr.track
      canvas.drawRoundRect(rect, r, r, fill)
    }
    // The border, inside the track's edge: all round, or on its top edge only (a band's rule). Its width is not whole pixels: the
    // React Native rows draw it as it is, so an edge covers part of a pixel and the inside of the track starts that far in.
    if (border != null && bar.borderTop > 0f) {
      if (border.topOnly) {
        fill.color = border.color
        canvas.drawRect(rect.left, rect.top, rect.right, rect.top + bar.borderTop, fill)
      } else {
        ringBox.left = bar.left
        ringBox.top = bar.top
        ringBox.right = bar.right
        ringBox.bottom = bar.bottom
        strokeInside(canvas, ringBox, r, bar.borderTop, border.color, null, l)
      }
    }
    // The fill and the part to come lie inside the track's padding box, which clips them to its rounded corners.
    inner.set(rect.left + bar.borderLeft, rect.top + bar.borderTop, rect.right - bar.borderRight, rect.bottom - bar.borderBottom)
    if (inner.right <= inner.left || inner.bottom <= inner.top) return
    canvas.save()
    clip.rewind()
    val innerR = if (border?.topOnly == true) r else max(0f, r - bar.borderTop)
    clip.addRoundRect(inner, innerR, innerR, Path.Direction.CW)
    canvas.clipPath(clip)
    // The part of the programme still to come, in halftone dots where the theme has them.
    pr.remainPattern?.let {
      if (bar.remainRight > bar.remainLeft && bar.remainBottom > bar.remainTop) {
        canvas.save()
        canvas.clipRect(bar.remainLeft, bar.remainTop, bar.remainRight, bar.remainBottom)
        tiles.halftone(it, l.vw(1.0), patternPaint, bar.remainLeft.toFloat(), bar.remainTop.toFloat())
        canvas.drawRect(bar.remainLeft.toFloat(), bar.remainTop.toFloat(), bar.remainRight.toFloat(), bar.remainBottom.toFloat(), patternPaint)
        patternPaint.shader = null
        canvas.restore()
      }
    }
    val fillColor = if (pr.fillAccent) mark else pr.fill
    if (fillColor ushr 24 != 0 && bar.fillRight > bar.fillLeft && bar.fillBottom > bar.fillTop) {
      fill.color = fillColor
      rect.set(bar.fillLeft.toFloat(), bar.fillTop.toFloat(), bar.fillRight.toFloat(), bar.fillBottom.toFloat())
      val fr = AuroraLayout.radius(l.vw(pr.r), rect.width(), rect.height())
      if (fr > 0f) canvas.drawRoundRect(rect, fr, fr, fill) else canvas.drawRect(rect, fill)
    }
    canvas.restore()
  }

  /** A dimension line along the cell's bottom: a heavier line to "now", a lighter one after it, a tick every few minutes of the
   *  programme (taller every fifteen), caps at both ends and a mark in the "now" color where now falls. */
  private fun drawDimensionLine(canvas: Canvas, p: GuideProgram, box: GuideGeometry.CellBox, c: CellRect, l: AuroraLayout, g: GuideGeo, pct: Double, pr: GuideLook.Progress, inset: Float, bottom: Float) {
    val t = pr.ticks ?: return
    val left = c.padLeft + inset
    val width = (c.padRight - c.padLeft) - 2 * inset
    if (width <= 0f) return
    val y = c.padBottom - bottom - l.vw(DIMENSION_BASE).toFloat()
    val nowX = left + width * pct.toFloat()
    // Every stroke of a dimension line is straight and butt-capped, so each is drawn as the rectangle it covers ([StrokeRect]).
    val r = strokeBox
    fill.color = t.color
    StrokeRect.horizontal(left, nowX, y, max(1f, l.vw(t.w * 2).toFloat()), r)
    canvas.drawRect(r[0], r[1], r[2], r[3], fill)
    val tickW = max(1f, l.vw(t.w).toFloat())
    fill.color = GuideColor.alpha(t.color, (t.color ushr 24) / 255.0 * AFTER_NOW_ALPHA)
    StrokeRect.horizontal(nowX, left + width, y, tickW, r)
    canvas.drawRect(r[0], r[1], r[2], r[3], fill)
    fill.color = t.color
    val step = t.every * g.ppm * kit.density
    val phase = TickRule.phase(p.startMs, g.originMs, g.ppm, box.left) * kit.density
    val minorH = l.vw(t.minorH).toFloat()
    val majorH = l.vw(t.majorH).toFloat()
    var k = TickRule.firstIndex(step, phase)
    while (true) {
      val dx = TickRule.xAt(k, step, phase)
      if (dx > width + 0.5) break
      val x = left + dx.toFloat()
      StrokeRect.vertical(x, y, y - (if (TickRule.isMajor(k, t.every, t.majorEvery)) majorH else minorH), tickW, r)
      canvas.drawRect(r[0], r[1], r[2], r[3], fill)
      k++
    }
    val capW = max(1f, l.vw(t.w * 1.5).toFloat())
    val cap = l.vw(t.capH).toFloat()
    val capGap = l.vw(DIMENSION_CAP_TRIM).toFloat()
    for (x in floatArrayOf(left + l.vw(0.8).toFloat(), left + width - l.vw(0.8).toFloat())) {
      StrokeRect.vertical(x, y - cap / 2 + capGap, y + cap / 2 - capGap, capW, r)
      canvas.drawRect(r[0], r[1], r[2], r[3], fill)
    }
    // Now: a mark in the theme's "now" color, taller than the caps.
    fill.color = tk.now
    StrokeRect.vertical(nowX, y - cap + l.vw(DIMENSION_NOW_TOP).toFloat(), y + l.vw(DIMENSION_NOW_BOTTOM).toFloat(), max(1f, l.vw(t.w * 2).toFloat()), r)
    canvas.drawRect(r[0], r[1], r[2], r[3], fill)
  }

  /** The "NOW!" burst in the cell's top right corner: a star-shaped outline, a smaller face, the word tilted across it. Returns how many
   *  px of the cell's width the text must keep clear. */
  private fun drawBurst(canvas: Canvas, b: GuideLook.StatusLabel.Burst, c: CellRect, l: AuroraLayout): Int {
    val size = l.vw(b.size).toFloat()
    if (size <= 0f) return 0
    val left = c.padRight - l.vw(StatusRules.BURST_RIGHT).toFloat() - size
    val top = c.padTop + l.vw(StatusRules.BURST_TOP).toFloat()
    val v = burstVertices
    fill.color = b.outline
    burstPath(left, top, size, 1f, v)
    canvas.drawPath(path, fill)
    fill.color = b.bg
    burstPath(left, top, size, Burst.FACE.toFloat(), v)
    canvas.drawPath(path, fill)
    burstPaint.textSize = size * BURST_TEXT
    burstPaint.color = b.fg
    val cx = left + size / 2
    val cy = top + size / 2
    burstPaint.getFontMetrics(fm)
    canvas.save()
    canvas.rotate(BURST_TILT, cx, cy)
    canvas.drawText(b.text, cx - burstPaint.measureText(b.text) / 2, cy - (fm.ascent + fm.descent) / 2, burstPaint)
    canvas.restore()
    return ceil(size + l.vw(StatusRules.BURST_CLEAR)).toInt()
  }

  /** The burst's outline in `path`: `v` (unit box vertices) scaled to `size`, shrunk about its centre by `shrink`, placed at (left, top). */
  private fun burstPath(left: Float, top: Float, size: Float, shrink: Float, v: FloatArray) {
    path.rewind()
    val s = size * shrink
    val ox = left + (size - s) / 2
    val oy = top + (size - s) / 2
    for (i in v.indices step 2) {
      val x = ox + v[i] * s
      val y = oy + v[i + 1] * s
      if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
    }
    path.close()
  }

  /**
   * The kicker line, the title and the sub-line, each one line with an END ellipsis, in the art colors when the cell shows its art under
   * them, in the focus colors on a selected cell that changes its fill, and in the live colors on an on-now one that does.
   */
  private fun drawTexts(canvas: Canvas, p: GuideProgram, c: CellRect, textW: Int, artFull: Boolean, selected: Boolean, live: Boolean, kicker: String?, plate: GuideLook.StatusLabel.Plate?, l: AuroraLayout) {
    if (textW <= 0) return
    val type = look.type
    val ft = look.focusText.takeIf { selected }
    val lt = look.liveText.takeIf { live }
    val left = c.textLeft.toFloat()
    val right = left + textW
    if (kicker != null) {
      val sl = look.statusLabel as? GuideLook.StatusLabel.Kicker
      kickerPaint.getFontMetrics(fm)
      val base = c.kickerTop + (kickerLine - (fm.descent - fm.ascent)) / 2f - fm.ascent
      kickerPaint.color = ft?.kicker ?: sl?.color ?: tk.title
      text.drawLineIn(canvas, text.ellipsize(kicker, kickerPaint, textW.toFloat()), left, right, base, kickerPaint)
    }
    if (p.title.isNotEmpty()) {
      val color = if (artFull) tk.artTitle else ft?.title ?: lt?.title ?: tk.title
      drawLineInk(canvas, text.ellipsize(cased(p.title, type.title), titlePaint, textW.toFloat()), left, right, (c.titleTop + titleTopOffset).toFloat(), titlePaint, color, "title", l)
    }
    val subColor = if (artFull) tk.artSub else ft?.sub ?: lt?.sub ?: tk.sub
    val subBase = (c.subTop + subTopOffset).toFloat()
    var subLeft = left
    var subW = textW.toFloat()
    if (plate != null && plate.text.isNotEmpty()) {
      val padX = l.vw(StatusRules.PLATE_PAD_X).toFloat()
      val tagW = ceil(platePaint.measureText(plate.text)) + 2 * padX
      platePaint.getFontMetrics(fm)
      val reach = StatusRules.plateReach(fm.ascent, fm.descent, platePaint.textSize, l.vw(StatusRules.PLATE_PAD_Y).toFloat())
      // Drawn whenever the cell is wide enough for it (`plate` is null otherwise: `StatusRules.fits`, the rule the classic rows apply as `labelFits`),
      // not only when it is narrower than the text column: a column that cannot hold it leaves the sub-line no room.
      val gap = l.vw(StatusRules.PLATE_GAP).toFloat()
      rect.set(left, subBase - reach[0], left + tagW, subBase + reach[1])
      fill.color = plate.bg
      canvas.drawRect(rect, fill)
      platePaint.color = plate.fg
      canvas.drawText(plate.text, left + padX, subBase, platePaint)
      subLeft = left + tagW + gap
      subW = StatusRules.subRoomAfterPlate(tagW, gap, textW.toFloat())
    }
    if (p.sub.isNotEmpty() && subW > 0f) {
      subPaint.color = subColor
      text.drawLineIn(canvas, text.ellipsize(cased(p.sub, type.sub), subPaint, subW), subLeft, right, subBase, subPaint)
    }
  }

  override fun trim() {
    names.clear()
    glyphs.trim()
    capitals.clear()
    startTimes.clear()
    tiles.clear()
    placeholders.clear()
    dashed.clear()
  }

  override fun release() {
    names.clear()
    glyphs.trim()
    capitals.clear()
    startTimes.clear()
    tiles.clear()
    placeholders.clear()
    dashed.clear()
    ringsLayout = null
    geo = null
    layout = null
    layoutWidth = -1f
    epoch += 1
  }

  private companion object {
    const val NAME_LINES = 2
    const val MAX_NAMES = 64
    const val MAX_PLACEHOLDERS = 64
    const val MAX_CAPITALS = 1000
    const val MAX_TIMES = 1000

    /** Letter spacing (em) of the status words. */
    const val KICKER_TRACK = 0.14f
    const val PLATE_TRACK = 0.06f
    const val BURST_TRACK = 0.03f

    /** Pixels of slack when a shrunken line is tested against its room. */
    const val FIT_SLACK_PX = 0.5f

    /** The burst's word is this share of the burst's size, tilted this many degrees. */
    const val BURST_TEXT = 0.3f
    const val BURST_TILT = -8f

    /** A themed title and sub-line are this many times their font size tall. */
    const val LINE_BOX = 1.2

    /** The 24 unit lucide box a glyph's stroke width is in. */
    const val GLYPH_BOX = 24f

    /** A dimension line's geometry, design px (the theme mocks'): its baseline sits this far above the line's box bottom, its end caps are
     *  trimmed this much and the "now" mark starts and ends this far from the baseline. */
    const val DIMENSION_BASE = 8.0
    const val DIMENSION_CAP_TRIM = 4.0
    const val DIMENSION_NOW_TOP = 6.0
    const val DIMENSION_NOW_BOTTOM = 5.0

    /** The dimension line's part after "now" is drawn at this share of its color's alpha. */
    const val AFTER_NOW_ALPHA = 0.85
  }
}

/**
 * How React Native applies a `lineHeight` (its CustomLineHeightSpan): the line box is exactly `lineHeight` tall, with the
 * leading split around the text's ascent and descent (the extra half going above), and the first line's top and the last
 * line's bottom set to match, so a single line is as tall as the line height.
 */
internal class WebLineHeightSpan(private val height: Int) : LineHeightSpan {
  override fun chooseHeight(text: CharSequence, start: Int, end: Int, spanstartv: Int, lineHeight: Int, fm: Paint.FontMetricsInt) {
    val box = LineBox.of(fm.ascent, fm.descent, height)
    fm.ascent = box.ascent
    fm.descent = box.descent
    if (start == 0) fm.top = fm.ascent
    if (end == text.length) fm.bottom = fm.descent
  }
}

/** The web-like line box math behind [WebLineHeightSpan], free of Android types so it can be unit-tested. */
object LineBox {
  class Box(val ascent: Int, val descent: Int)

  /** `ascent` (negative, as Android reports it) and `descent` for a line of height `lineHeight`: the leading
   *  `lineHeight - (descent - ascent)` is added half above (rounded up) and half below (rounded down). */
  fun of(ascent: Int, descent: Int, lineHeight: Int): Box {
    val leading = lineHeight - (-ascent + descent)
    return Box(ascent - ceil(leading / 2.0f).toInt(), descent + floor(leading / 2.0f).toInt())
  }
}
