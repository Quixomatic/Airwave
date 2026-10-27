package expo.modules.nativeguide

import org.junit.Assert.assertEquals
import org.junit.Test

/** The color strings the tokens and the lineup carry, as the React Native rows' own values. */
class GuideColorTest {
  private fun argb(a: Int, r: Int, g: Int, b: Int) = (a shl 24) or (r shl 16) or (g shl 8) or b

  @Test fun parsesHex() {
    assertEquals(argb(255, 0x06, 0x0a, 0x14), GuideColor.parse("#060a14"))
    assertEquals(argb(255, 0xaa, 0xbb, 0xcc), GuideColor.parse("#abc"))
    assertEquals(argb(255, 0x3b, 0x82, 0xf6), GuideColor.parse("  #3B82F6 "))
  }

  @Test fun hexWithAlphaPutsAlphaLast() {
    assertEquals(argb(0x80, 0x12, 0x34, 0x56), GuideColor.parse("#12345680"))
  }

  @Test fun parsesRgbAndRgba() {
    assertEquals(argb(255, 148, 163, 184), GuideColor.parse("rgb(148, 163, 184)"))
    assertEquals(argb(31, 148, 163, 184), GuideColor.parse("rgba(148,163,184,0.12)")) // 0.12 * 255 = 30.6
    assertEquals(argb(82, 59, 130, 246), GuideColor.parse("rgba(59, 130, 246, 0.32)")) // 81.6 rounds up, like a React Native color
    assertEquals(argb(0, 0, 0, 0), GuideColor.parse("rgba(0, 0, 0, 0)"))
  }

  @Test fun transparentIsFullyClear() {
    assertEquals(0, GuideColor.parse("transparent"))
  }

  @Test fun anythingUnparseableIsWhite() {
    for (bad in listOf("", "red", "#12", "#12345", "#gggggg", "#-12345", "rgba(1, 2)", "rgb", "rgba(a, b, c, d)", "#1234567890")) {
      assertEquals("'$bad'", GuideColor.WHITE, GuideColor.parse(bad))
    }
  }

  @Test fun outOfRangeChannelsAreClamped() {
    assertEquals(argb(255, 255, 0, 255), GuideColor.parse("rgb(300, -5, 255)"))
  }

  @Test fun alphaReplacesTheAlphaChannel() {
    val c = GuideColor.parse("#3b82f6")
    assertEquals(argb(82, 0x3b, 0x82, 0xf6), GuideColor.alpha(c, 0.32))
    assertEquals(argb(0, 0x3b, 0x82, 0xf6), GuideColor.alpha(c, -1.0))
    assertEquals(c, GuideColor.alpha(c, 2.0))
  }

  @Test fun mixMovesEachChannelTowardTheOtherColorAndRoundsHalvesUp() {
    val a = GuideColor.parse("#5b8fd6")
    val b = GuideColor.parse("#1d2430")
    // 0 and 1 are the ends; the result is always opaque.
    assertEquals(a, GuideColor.mix(a, b, 0.0))
    assertEquals(b, GuideColor.mix(a, b, 1.0))
    assertEquals(GuideColor.parse("#000000"), GuideColor.mix(GuideColor.parse("rgba(10, 20, 30, 0.2)"), GuideColor.parse("#000000"), 1.0))
    // 0x5b -> 0x1d at 0.5 is 91 + (29 - 91) * 0.5 = 60 exactly; 0x8f -> 0x24: 143 - 107 * 0.5 = 89.5 rounds up to 90; 0xd6 -> 0x30: 214 - 166 * 0.5 = 131.
    assertEquals(GuideColor.parse("#3c5a83"), GuideColor.mix(a, b, 0.5))
  }

  @Test fun mixRoundsLikeJavaScriptMathRoundDoes() {
    // 100 + (116 - 100) * 0.5 = 108 exactly; 100 + (117 - 100) * 0.5 = 108.5 -> 109 (halves go toward +infinity, as Math.round does).
    assertEquals(GuideColor.argb(255, 108, 0, 0), GuideColor.mix(GuideColor.argb(255, 100, 0, 0), GuideColor.argb(255, 116, 0, 0), 0.5))
    assertEquals(GuideColor.argb(255, 109, 0, 0), GuideColor.mix(GuideColor.argb(255, 100, 0, 0), GuideColor.argb(255, 117, 0, 0), 0.5))
    // Moving down: 100 + (83 - 100) * 0.5 = 91.5 -> 92.
    assertEquals(GuideColor.argb(255, 92, 0, 0), GuideColor.mix(GuideColor.argb(255, 100, 0, 0), GuideColor.argb(255, 83, 0, 0), 0.5))
  }
}
