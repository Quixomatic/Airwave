package expo.modules.nativeguide

import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
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
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Draws one row of the Aurora guide (tv-native `features/guide/aurora-grid.tsx`, its `Row`) on a Canvas, so the native rows
 * look like the React Native rows they stand in for:
 *
 *  - the rail: a tinted background and an accent bar while the row is focused; a circle in the row's accent holding the
 *    channel's lucide icon (the favorite heart while the rail itself has focus) with a heart badge on its corner for a
 *    favorite; the channel number at the top right and the name along the bottom (two lines at most);
 *  - the lane: a rounded, bordered cell per program (the selected one drawn last, with the focus ring), an on-now cell's
 *    two-tone progress fill and accent bar, then its title and sub-line. With program art on (a program carries an art URL),
 *    the artwork fills the cell centre cropped, under a scrim, and the text takes the theme's art colors; a cell whose image
 *    failed is a plain cell.
 *
 * Every dimension comes in `geo` (dp, from JS) and every color in the tokens, so the painter owns no design values. The
 * layout is [AuroraLayout], which rounds boxes to the pixel grid as React Native's layout engine does; text is measured
 * with the same typefaces, rounded font sizes and font padding a React Native <Text> uses. Main thread only.
 */
internal class AuroraPainter(private val kit: PainterKit) : GuidePainter {
  private val text = kit.text
  private var tk = GuideTokens.AURORA
  private var stylesDirty = true

  private var geo: GuideGeo? = null
  private var layout: AuroraLayout? = null
  private var layoutWidth = -1f

  override var epoch = 0L
    private set

  // Paints. Colors are set per use; everything else is fixed here or by `applyStyles`.
  private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private val numberPaint = TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val namePaint = TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val titlePaint = TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val subPaint = TextPaint(Paint.ANTI_ALIAS_FLAG)

  // Text metrics, in px. With font padding on (a React Native <Text>'s default) a line's top is the font's `top`, so a
  // baseline sits `-top` below it.
  private var numberTopOffset = 0
  private var titleTopOffset = 0
  private var subTopOffset = 0
  private var nameLineHeight = 0

  private val glyphs = GlyphDrawer()
  private val rect = RectF()
  private val inner = RectF()
  private val clip = Path()
  private val cell = CellRect()

  // Program art: the image paint (alpha is the fade), the scrim's gradient (a unit one, placed per cell by a matrix) and scratch.
  private val bitmapPaint = Paint(Paint.FILTER_BITMAP_FLAG)
  private val scrimPaint = Paint().apply { style = Paint.Style.FILL }
  private var scrimShader: LinearGradient? = null
  private val scrimMatrix = Matrix()
  private val artSrc = Rect()
  private val artDst = RectF()
  private val crop = IntArray(4)

  private data class NameKey(val text: String, val width: Int, val size: Float, val face: Int, val lineHeight: Int)

  private val names = object : LinkedHashMap<NameKey, StaticLayout>(32, 0.75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<NameKey, StaticLayout>?) = size > MAX_NAMES
  }

  override fun setTokens(json: String) {
    epoch += 1
    tk = GuideTokens.parse(json)
    scrimShader = LinearGradient(0f, 0f, 1f, 0f, tk.artScrimStart, tk.artScrimEnd, Shader.TileMode.CLAMP)
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

  /** The geometry, the tokens' font weights or the width changed: re-resolve sizes, typefaces and the layout. */
  private fun rebuild(frame: GuideFrame) {
    epoch += 1
    val g = frame.geo
    numberPaint.apply {
      typeface = text.typeface(null, tk.numberWeight)
      textSize = text.fontPx(g.dp("numberSize"))
    }
    namePaint.apply {
      typeface = text.typeface(null, 400)
      textSize = text.fontPx(g.dp("nameSize"))
    }
    titlePaint.apply {
      typeface = text.typeface(null, tk.titleWeight)
      textSize = text.fontPx(g.dp("titleSize"))
    }
    subPaint.apply {
      typeface = text.typeface(null, 400)
      textSize = text.fontPx(g.dp("subSize"))
    }
    nameLineHeight = text.fontPx(g.dp("nameLine")).toInt()
    numberTopOffset = -numberPaint.fontMetricsInt.top
    titleTopOffset = -titlePaint.fontMetricsInt.top
    subTopOffset = -subPaint.fontMetricsInt.top
    val titleFm = titlePaint.fontMetricsInt
    layout = AuroraLayout(g, kit.density, frame.widthPx.toDouble(), titleFm.bottom - titleFm.top)
    geo = g
    layoutWidth = frame.widthPx
    stylesDirty = false
    names.clear()
  }

  override fun drawRow(canvas: Canvas, row: GuideRow, state: RowState, frame: GuideFrame) {
    val l = layout ?: return
    // The row's top rule.
    fill.color = tk.rowBorder
    canvas.drawRect(0f, 0f, frame.widthPx, l.borderTopPx, fill)
    drawRail(canvas, row, state, l)
    drawLane(canvas, row, state, frame, l)
  }

  // The rail.
  private fun drawRail(canvas: Canvas, row: GuideRow, state: RowState, l: AuroraLayout) {
    val accent = row.accent
    val bodyTop = l.body.start.toFloat()
    val bodyBottom = l.body.end.toFloat()
    if (state.focused) {
      fill.color = GuideColor.alpha(accent, tk.railFocusA)
      canvas.drawRect(l.rail.start.toFloat(), bodyTop, l.rail.end.toFloat(), bodyBottom, fill)
      fill.color = accent
      canvas.drawRect(l.rail.start.toFloat(), bodyTop, l.railBarEnd.toFloat(), bodyBottom, fill)
    }

    // The circle: tinted fill and border, or the focus ring while the rail has focus.
    val ringed = state.railFocused
    val bw = (if (ringed) l.circleRing else l.circleBorder).toFloat()
    rect.set(l.circleX.start.toFloat(), l.circleY.start.toFloat(), l.circleX.end.toFloat(), l.circleY.end.toFloat())
    val radius = AuroraLayout.radius(l.circleD / 2, rect.width(), rect.height())
    fill.color = GuideColor.alpha(accent, tk.circleFillA)
    canvas.drawRoundRect(rect, radius, radius, fill)
    if (bw > 0f) {
      stroke.color = if (ringed) tk.ring else GuideColor.alpha(accent, tk.circleBorderA)
      stroke.strokeWidth = bw
      inner.set(rect.left + bw / 2, rect.top + bw / 2, rect.right - bw / 2, rect.bottom - bw / 2)
      val innerRadius = max(0f, radius - bw / 2)
      canvas.drawRoundRect(inner, innerRadius, innerRadius, stroke)
    }

    // Inside it: the heart while the rail has focus (filled for a favorite), else the channel's icon in the accent.
    if (ringed) {
      heart()?.let {
        val color = if (row.fav) tk.fav else tk.heartOff
        glyphs.draw(canvas, it, l.glyphX.start.toFloat(), l.glyphY.start.toFloat(), (l.glyphX.end - l.glyphX.start).toFloat(), color, if (row.fav) tk.fav else 0)
      }
    } else {
      LucideGlyphs.get(row.channel.icon)?.let {
        glyphs.draw(canvas, it, l.glyphX.start.toFloat(), l.glyphY.start.toFloat(), (l.glyphX.end - l.glyphX.start).toFloat(), accent)
      }
      // A favorite's badge on the circle's corner: drawn over the circle's border and past its edge.
      if (row.fav) {
        heart()?.let {
          glyphs.draw(canvas, it, l.badgeX.start.toFloat(), l.badgeY.start.toFloat(), (l.badgeX.end - l.badgeX.start).toFloat(), tk.fav, tk.fav)
        }
      }
    }

    // The channel number, right-aligned beside the circle.
    val number = row.channel.number
    if (number.isNotEmpty()) {
      numberPaint.color = if (state.focused) tk.numberFocused else tk.number
      val width = ceil(numberPaint.measureText(number)).toInt()
      canvas.drawText(number, l.numberLeft(width).toFloat(), (l.numberTop + numberTopOffset).toFloat(), numberPaint)
    }

    // The name, up to two lines, ending at the rail's bottom padding.
    nameLayout(row.channel.name, l)?.let {
      namePaint.color = tk.name
      canvas.save()
      canvas.translate(l.nameLeft.toFloat(), l.nameTop(it.height).toFloat())
      it.draw(canvas)
      canvas.restore()
    }
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
      }
    }
    canvas.restore()
  }

  private fun drawCell(canvas: Canvas, row: GuideRow, p: GuideProgram, box: GuideGeometry.CellBox, selected: Boolean, g: GuideGeo, l: AuroraLayout, frame: GuideFrame) {
    val c = cell
    l.placeCell(box, selected, c)
    val w = (c.right - c.left).toFloat()
    val h = (c.bottom - c.top).toFloat()
    if (w <= 0f || h <= 0f) return
    val live = GuideGeometry.isLive(p.startMs, p.durationSeconds, frame.nowMs)
    val radius = AuroraLayout.radius(l.cellRadius, w, h)
    val bw = c.border

    // The cell's fill, under its border.
    rect.set(c.left.toFloat(), c.top.toFloat(), c.right.toFloat(), c.bottom.toFloat())
    val bg = if (live) tk.liveCellBg else tk.cellBg
    if (bg ushr 24 != 0) {
      fill.color = bg
      canvas.drawRoundRect(rect, radius, radius, fill)
    }
    // The border: a stroke centered half its width inside the box, which is how a React Native border is drawn.
    if (bw > 0f) {
      stroke.color = if (selected) tk.ring else tk.cellBorder
      stroke.strokeWidth = bw
      inner.set(rect.left + bw / 2, rect.top + bw / 2, rect.right - bw / 2, rect.bottom - bw / 2)
      val innerRadius = max(0f, radius - bw / 2)
      canvas.drawRoundRect(inner, innerRadius, innerRadius, stroke)
    }

    // Program art, when the program has some and its image hasn't failed: asked for at the cell's box.
    val art = artFor(p, box, l)?.takeIf { !it.failed }
    if (live || art != null) {
      // The art, the progress fill and the accent bar live in the padding box, clipped to its rounded corners.
      canvas.save()
      clip.rewind()
      rect.set(c.padLeft, c.padTop, c.padRight, c.padBottom)
      val padRadius = max(0f, radius - bw)
      clip.addRoundRect(rect, padRadius, padRadius, Path.Direction.CW)
      canvas.clipPath(clip)
      if (art != null) drawArt(canvas, art, c, frame)
    }
    if (live) {
      // Two tones with a hard edge where "now" falls, like a gradient whose stops sit at the same position.
      val pct = GuideGeometry.liveFill(frame.nowMs, g.originMs, g.ppm, box.left, box.width)
      val edge = c.padLeft + (pct * (c.padRight - c.padLeft)).roundToInt()
      fill.color = GuideColor.alpha(row.accent, tk.liveElapsedA)
      canvas.drawRect(c.padLeft, c.padTop, edge, c.padBottom, fill)
      fill.color = GuideColor.alpha(row.accent, tk.liveRemainA)
      canvas.drawRect(edge, c.padTop, c.padRight, c.padBottom, fill)
      // The bar's corners round to at most half its width.
      rect.set(c.barLeft.toFloat(), c.barTop.toFloat(), c.barRight.toFloat(), c.barBottom.toFloat())
      val barRadius = AuroraLayout.radius(l.barRadius, rect.width(), rect.height())
      fill.color = row.accent
      canvas.drawRoundRect(rect, barRadius, barRadius, fill)
    }
    if (live || art != null) canvas.restore()

    drawTexts(canvas, p, c, art != null)
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
   *  is there from the start (while the image loads the cell is its plain fill under the scrim). */
  private fun drawArt(canvas: Canvas, art: GuideImages.Entry, c: CellRect, frame: GuideFrame) {
    artDst.set(c.padLeft, c.padTop, c.padRight, c.padBottom)
    val bitmap = art.bitmap
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

  /** The title and the sub-line, each one line with an END ellipsis, in the art colors when the cell shows art. */
  private fun drawTexts(canvas: Canvas, p: GuideProgram, c: CellRect, art: Boolean) {
    if (c.textWidth <= 0) return
    val left = c.textLeft.toFloat()
    val right = left + c.textWidth
    if (p.title.isNotEmpty()) {
      titlePaint.color = if (art) tk.artTitle else tk.title
      text.drawLineIn(canvas, text.ellipsize(p.title, titlePaint, c.textWidth.toFloat()), left, right, (c.titleTop + titleTopOffset).toFloat(), titlePaint)
    }
    if (p.sub.isNotEmpty()) {
      subPaint.color = if (art) tk.artSub else tk.sub
      text.drawLineIn(canvas, text.ellipsize(p.sub, subPaint, c.textWidth.toFloat()), left, right, (c.subTop + subTopOffset).toFloat(), subPaint)
    }
  }

  override fun trim() {
    names.clear()
    glyphs.trim()
  }

  override fun release() {
    names.clear()
    glyphs.trim()
    geo = null
    layout = null
    layoutWidth = -1f
    epoch += 1
  }

  private companion object {
    const val NAME_LINES = 2
    const val MAX_NAMES = 64
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
