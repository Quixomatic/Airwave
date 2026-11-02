package expo.modules.nativeguide

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * A two-ink theme multiplies its second ink with what is beneath it. On Android 10 and up the painter does it with a fixed function
 * blend (MODULATE: `source * destination`, no read back of the screen) instead of PorterDuff MULTIPLY, and these tests hold the arithmetic that
 * makes the two the same on the opaque window the rows are drawn on.
 */
class InkBlendTest {
  /** PorterDuff MULTIPLY on premultiplied channels, as Skia defines it: `Sc*(1-Da) + Dc*(1-Sa) + Sc*Dc`. Values 0..1. */
  private fun multiply(c: Double, a: Double, d: Double, da: Double): Double = c * a * (1 - da) + d * (1 - a) + c * a * d

  /** MODULATE: `Sc * Dc`, premultiplied. */
  private fun modulate(m: Double, d: Double): Double = m * d

  @Test fun theFixedFunctionBlendIsUsedFromAndroid10() {
    assertFalse(InkBlend.modulates(26))
    assertFalse(InkBlend.modulates(28))
    assertTrue(InkBlend.modulates(29))
    assertTrue(InkBlend.modulates(36))
    assertEquals(29, InkBlend.MODULATE_SINCE)
  }

  @Test fun anOpaqueInkIsItsOwnMultiplier() {
    for (c in listOf(0xFF48B0, 0x243C96, 0x000000, 0xFFFFFF, 0xF8F2E3)) assertEquals(c or (0xFF shl 24), InkBlend.ink(c or (0xFF shl 24)))
  }

  @Test fun aTransparentInkChangesNothing() {
    // Multiplying by nothing leaves what is beneath as it was: the multiplier is white.
    assertEquals(0xFFFFFFFF.toInt(), InkBlend.ink(0x00243C96))
  }

  @Test fun aHalfTransparentInkIsItsColorLaidOverWhite() {
    val half = GuideColor.argb(128, 36, 60, 150)
    val m = InkBlend.ink(half)
    assertEquals(255, m ushr 24)
    assertEquals(145, (m shr 16) and 0xff) // 255 + (36 - 255) * 128 / 255
    assertEquals(157, (m shr 8) and 0xff)
    assertEquals(202, m and 0xff)
  }

  @Test fun modulatingWithTheMultiplierIsMultiplyingWithTheInkOverAnOpaqueDestination() {
    // Every ink channel and alpha, over a range of destinations: the two agree to within one level of 255 (the rounding of the multiplier).
    for (c in 0..255 step 5) for (a in 0..255 step 5) for (d in 0..255 step 15) {
      val color = GuideColor.argb(a, c, c, c)
      val m = (InkBlend.ink(color) and 0xff) / 255.0
      val viaMultiply = multiply(c / 255.0, a / 255.0, d / 255.0, 1.0) * 255
      val viaModulate = modulate(m, d / 255.0) * 255
      assertTrue("c=$c a=$a d=$d: $viaMultiply vs $viaModulate", abs(viaMultiply - viaModulate) <= 1.0)
    }
  }

  @Test fun overATransparentDestinationModulateDrawsNothingWhereMultiplyDrawsTheInk() {
    // Why the rows must not be drawn into an offscreen layer: with nothing beneath, MULTIPLY gives the source and MODULATE gives zero.
    assertEquals(0.6, multiply(0.6, 1.0, 0.0, 0.0), 1e-12)
    assertEquals(0.0, modulate(0.6, 0.0), 1e-12)
  }

  @Test fun theTwoInksOfRisographMixWhereTheyOverlapAndStayThemselvesElsewhere() {
    // Cobalt on flamingo over cream paper, per channel: where only the front ink lies it is the ink times the paper, and where the back copy
    // lies under it the two multiply again.
    val paper = doubleArrayOf(0xF8 / 255.0, 0xF2 / 255.0, 0xE3 / 255.0)
    val front = doubleArrayOf(0x24 / 255.0, 0x3C / 255.0, 0x96 / 255.0)
    val back = doubleArrayOf(1.0, 0x48 / 255.0, 0xB0 / 255.0)
    for (ch in 0..2) {
      val onlyFront = (front[ch] * paper[ch] * 255).roundToInt()
      val overlap = (front[ch] * back[ch] * paper[ch] * 255).roundToInt()
      val afterBack = back[ch] * paper[ch]
      assertEquals(overlap.toDouble(), modulate(front[ch], afterBack) * 255, 1.0)
      assertTrue(overlap <= onlyFront)
    }
  }
}
