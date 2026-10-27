package expo.modules.nativeguide

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** How a line of text is drawn so its glyphs fall where the classic rows' do: which lines sit at subpixel positions, and their letter spacing. */
class TextRenderingTest {
  @Test fun aRegularSystemFontLineIsDrawnOnWholePixels() {
    // Aurora's sub-line and channel name: no weight, no family, no slant, so React Native adds no typeface span to them.
    assertFalse(TextFlags.subpixel(400, null, false))
  }

  @Test fun aLineWithAWeightAFamilyOrASlantIsDrawnAtSubpixelPositions() {
    assertTrue(TextFlags.subpixel(600, null, false)) // Aurora's title
    assertTrue(TextFlags.subpixel(700, null, false)) // its channel number, a kicker or a tag
    assertTrue(TextFlags.subpixel(400, "Fraunces", false)) // a bundled face, even at the regular weight
    assertTrue(TextFlags.subpixel(400, null, true)) // an italic
    assertTrue(TextFlags.subpixel(300, null, false)) // a lighter weight is a weight too
  }

  @Test fun theSpacingIsTheTracksShareOfTheExactSizeOverTheRoundedOne() {
    // 12.75 dp at density 2 is 25.5 px, drawn at 26. Spacing of 0.03 em of 12.75 dp is 0.3825 dp = 0.765 px, over 26 px of em.
    assertEquals(0.03 * 25.5 / 26.0, LetterSpacing.em(0.03, 25.5f).toDouble(), 1e-7)
    assertEquals(0.765 / 26.0, LetterSpacing.em(0.03, 25.5f).toDouble(), 1e-7)
    // Under the 0.03 em the size alone gives, and so under what it was.
    assertTrue(LetterSpacing.em(0.03, 25.5f) < 0.03f)
  }

  @Test fun aSizeThatIsAWholeNumberOfPixelsKeepsItsTrack() {
    assertEquals(0.14, LetterSpacing.em(0.14, 15f).toDouble(), 1e-7)
    assertEquals(-0.02, LetterSpacing.em(-0.02, 30f).toDouble(), 1e-7)
  }

  @Test fun noTrackIsNoSpacing() {
    assertEquals(0f, LetterSpacing.em(0.0, 25.5f), 0f)
    assertEquals(0f, LetterSpacing.em(0.03, 0f), 0f)
  }
}
