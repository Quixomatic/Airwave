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
}
