package expo.modules.nativeguide

/**
 * Where Android cuts a line of text that is wider than its box and ends with an ellipsis: `StaticLayout`'s `calculateEllipsis` with
 * `TruncateAt.END`, which is what a React Native `<Text numberOfLines={1}>` lays out (its text view is a plain Android `TextView`). No
 * Android imports, so it is unit-tested on the JVM; [GuideText] feeds it the widths Android measures. Checked against a real `TextView`
 * with the font, size and letter spacing as spans and view settings (API 31, 247 thousand title, width, size, weight and spacing
 * combinations: one differs, a tie in the last float digit).
 *
 * Two things in it are easy to get wrong, and `TextUtils.ellipsize`, which this replaces, gets both of them differently:
 *  - The ellipsis is measured with the text view's own paint, not the paint the words are drawn with. A React Native text sets the words'
 *    typeface and weight as spans, so the paint the layout measures the ellipsis with is the view's base one: the system's default
 *    typeface at the text's size and letter spacing. A bold title is cut where the (narrower) regular ellipsis leaves room.
 *  - Nothing is trimmed: when the cut falls after a space the space stays ("Chilling ..."), where `TextUtils.ellipsize` drops it.
 */
object EllipsisRule {
  /** The character a cut line ends with (U+2026, the one `TextUtils.getEllipsisString` gives for END). */
  const val ELLIPSIS = "…"

  /**
   * The index the text is cut at (the words keep their first `index` characters, then the ellipsis), or -1 when the whole of it fits.
   * `widths` are the advances of the first `count` characters of `text`, `ellipsisWidth` the width the ellipsis is measured at, `avail`
   * the width of the box. A character stays while its own width, the widths before it and the ellipsis still fit. The text fits if it
   * does without an ellipsis; a line's trailing spaces hang past its end and do not count.
   */
  fun cut(text: CharSequence, widths: FloatArray, count: Int, ellipsisWidth: Float, avail: Float): Int {
    var end = count
    while (end > 0 && isLineEndSpace(text[end - 1])) end--
    var total = 0f
    for (i in 0 until end) total += widths[i]
    if (total <= avail) return -1
    var sum = 0f
    var i = 0
    while (i < count) {
      val w = widths[i]
      if (w + sum + ellipsisWidth > avail) break
      sum += w
      i++
    }
    return i
  }

  /** The characters that hang at the end of a line (Minikin's `isLineEndSpace`): a new line, the spaces, but not a no-break or a figure space. */
  fun isLineEndSpace(c: Char): Boolean {
    val u = c.code
    return u == 0x0A || u == 0x20 || u == 0x1680 || (u in 0x2000..0x200A && u != 0x2007) || u == 0x205F || u == 0x3000
  }
}
