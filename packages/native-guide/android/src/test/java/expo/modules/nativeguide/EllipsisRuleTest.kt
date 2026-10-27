package expo.modules.nativeguide

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Where a React Native one-line title is cut: Android's `StaticLayout.calculateEllipsis` (END), worked by hand with every character
 * 10 px wide. The two ways it differs from `TextUtils.ellipsize`, which cut a title one character early, are pinned below.
 */
class EllipsisRuleTest {
  private fun widths(text: String, each: Float = 10f) = FloatArray(text.length) { each }

  private fun cut(text: String, ellipsis: Float, avail: Float, w: FloatArray = widths(text)) = EllipsisRule.cut(text, w, text.length, ellipsis, avail)

  @Test fun aTextThatFitsIsNotCut() {
    assertEquals(-1, cut("ABCDEFGH", 12f, 80f)) // exactly as wide as the box
    assertEquals(-1, cut("ABCDEFGH", 12f, 200f))
    assertEquals(-1, cut("", 12f, 0f))
  }

  @Test fun aCutKeepsTheCharactersThatLeaveRoomForTheEllipsis() {
    // 80 px of text in 50: A, B and C (30 px) and the 12 px ellipsis fit (42), a fourth would make 52.
    assertEquals(3, cut("ABCDEFGH", 12f, 50f))
    // A character that leaves the whole exactly at the box's width stays: 40 + 12 = 52.
    assertEquals(4, cut("ABCDEFGH", 12f, 52f))
    assertEquals(3, cut("ABCDEFGH", 12f, 51.9f))
  }

  @Test fun aBoxTooNarrowForTheEllipsisKeepsNothingButTheEllipsis() {
    assertEquals(0, cut("ABCDEFGH", 12f, 11f))
    assertEquals(0, cut("ABCDEFGH", 12f, 0f))
  }

  @Test fun theEllipsisIsMeasuredInTheViewsPaintNotTheWordsOwn() {
    // The words are bold and their ellipsis is 18 px wide; the text view measures it in its own regular paint, where it is 12. In a 53 px
    // box that is one more character: 40 + 12 = 52 fits where 40 + 18 = 58 does not. This is the one character a bold title ended early.
    assertEquals(4, cut("ABCDEFGH", 12f, 53f))
    assertEquals(3, cut("ABCDEFGH", 18f, 53f))
  }

  @Test fun aCutAfterASpaceKeepsTheSpace() {
    // "Chilling A": the cut falls after the space, which stays ("Chilling ..."): TextUtils.ellipsize drops it.
    val text = "Chilling Adventures"
    assertEquals(9, cut(text, 12f, 9 * 10f + 12f)) // "Chilling " is 90 px, the ellipsis 12
    assertEquals(' ', text[8])
  }

  @Test fun aLinesTrailingSpacesHangAndDoNotCountTowardItsWidth() {
    // "ABCD   " is 40 px of letters and 30 of spaces: it fits a 40 px box, as Android lays it out.
    assertEquals(-1, cut("ABCD   ", 12f, 40f))
    assertEquals(2, cut("ABCD   ", 12f, 39f)) // but not a narrower one: A and B (20 + 12) stay, a third would make 42
  }

  @Test fun theCharactersThatHangAreMinikinsLineEndSpaces() {
    for (u in listOf(0x20, 0x0A, 0x1680, 0x2000, 0x2005, 0x200A, 0x205F, 0x3000)) assertTrue("U+%04X".format(u), EllipsisRule.isLineEndSpace(u.toChar()))
    // not a no-break space, a figure space, a zero-width space, a letter or a tab
    for (u in listOf(0xA0, 0x2007, 0x200B, 'a'.code, 0x09)) assertFalse("U+%04X".format(u), EllipsisRule.isLineEndSpace(u.toChar()))
  }

  @Test fun zeroWidthCharactersStayWithTheOneBeforeThem() {
    // The second half of a surrogate pair has no advance of its own, so it is kept along with the first: A, B and the emoji (30 + 12 = 42).
    val text = String(charArrayOf('A', 'B', 0xD83D.toChar(), 0xDE00.toChar(), 'C'))
    val w = floatArrayOf(10f, 10f, 10f, 0f, 20f)
    assertEquals(4, EllipsisRule.cut(text, w, 5, 12f, 42f))
  }

  @Test fun theEllipsisIsTheOneCharacterAndroidUses() {
    assertEquals(0x2026, EllipsisRule.ELLIPSIS[0].code)
    assertEquals(1, EllipsisRule.ELLIPSIS.length)
  }
}
