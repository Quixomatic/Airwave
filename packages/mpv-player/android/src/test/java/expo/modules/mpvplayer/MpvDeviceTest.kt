package expo.modules.mpvplayer

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MpvDeviceTest {
  @Test
  fun matchesTheConfirmedSocByHardware() {
    assertTrue(needsEmbedForSdr("mt5889", ""))
    assertTrue(needsEmbedForSdr("mt5889", "something_else"))
    assertTrue(needsEmbedForSdr("mt5889", null))
  }

  @Test
  fun matchesTheConfirmedSocByBoard() {
    assertTrue(needsEmbedForSdr("unknown", "mt5889"))
    assertTrue(needsEmbedForSdr("", "mt5889"))
    assertTrue(needsEmbedForSdr(null, "mt5889"))
  }

  @Test
  fun isCaseInsensitiveAndIgnoresSurroundingWhitespace() {
    assertTrue(needsEmbedForSdr("MT5889", ""))
    assertTrue(needsEmbedForSdr("Mt5889", ""))
    assertTrue(needsEmbedForSdr("", "MT5889"))
    assertTrue(needsEmbedForSdr(" mt5889 ", ""))
  }

  @Test
  fun matchesThePartNumberWithASuffix() {
    // The exact property string on the QM8 was not re-checked, so a suffix after the part number must still match.
    for (value in listOf("mt5889_tcl", "MT5889_TCL", "mt5889-v2", "mt5889x", "mt5889.1", " mt5889_tcl ")) {
      assertTrue("hardware=$value", needsEmbedForSdr(value, ""))
      assertTrue("board=$value", needsEmbedForSdr("", value))
    }
  }

  @Test
  fun aDigitAfterThePartNumberIsADifferentPart() {
    for (value in listOf("mt58890", "mt58891", "mt588900", "MT58890", "mt58892")) {
      assertFalse("hardware=$value", needsEmbedForSdr(value, ""))
      assertFalse("board=$value", needsEmbedForSdr("", value))
    }
  }

  @Test
  fun doesNotMatchOtherMt5xxxParts() {
    // Sony Bravia-style MediaTek parts: MpvCore lists Sony Bravia as tested-good on gpu-next, and the freeze has
    // only been reproduced on the mt5889. A pattern such as mt5xxx would have caught these.
    for (soc in listOf("mt5891", "mt5893", "mt5895", "mt5880", "mt5886", "mt5891_tcl", "mt5895_sony")) {
      assertFalse("hardware=$soc", needsEmbedForSdr(soc, ""))
      assertFalse("board=$soc", needsEmbedForSdr("", soc))
      assertFalse("both=$soc", needsEmbedForSdr(soc, soc))
    }
  }

  @Test
  fun doesNotMatchOtherMediatekSeries() {
    // mt9xxx TV parts and the mt6xxx / mt8xxx series are not confirmed either. The Google TV Streamer (also
    // MediaTek; which part it reports was not checked) stays on gpu-next on purpose: a similar teardown stall
    // was seen there, but not this one.
    for (soc in listOf("mt9950", "mt9602", "mt6893", "mt8183", "mt8696")) {
      assertFalse("hardware=$soc", needsEmbedForSdr(soc, ""))
      assertFalse("board=$soc", needsEmbedForSdr("", soc))
    }
  }

  @Test
  fun doesNotMatchOtherSocs() {
    assertFalse(needsEmbedForSdr("g12a", "g12a")) // Amlogic
    assertFalse(needsEmbedForSdr("darcy", "darcy")) // NVIDIA Tegra (Shield)
    assertFalse(needsEmbedForSdr("ranchu", "goldfish_x86_64")) // emulator
    assertFalse(needsEmbedForSdr("goldfish", "goldfish"))
    assertFalse(needsEmbedForSdr("qcom", "sdm845"))
    assertFalse(needsEmbedForSdr("exynos990", "universal990"))
  }

  @Test
  fun requiresThePartNumberAtTheStart() {
    assertFalse(needsEmbedForSdr("mt5", ""))
    assertFalse(needsEmbedForSdr("mt58", ""))
    assertFalse(needsEmbedForSdr("mt588", ""))
    assertFalse(needsEmbedForSdr("mt", ""))
    assertFalse(needsEmbedForSdr("xmt5889", ""))
    assertFalse(needsEmbedForSdr("tcl_mt5889", "")) // not a substring match
    assertFalse(needsEmbedForSdr("mt 5889", ""))
    assertFalse(needsEmbedForSdr("mt-5889", ""))
  }

  @Test
  fun emptyAndMissingValuesDoNotMatch() {
    assertFalse(needsEmbedForSdr("", ""))
    assertFalse(needsEmbedForSdr("   ", " "))
    assertFalse(needsEmbedForSdr(null, null))
    assertFalse(needsEmbedForSdr(null, ""))
  }
}
