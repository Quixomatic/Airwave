package expo.modules.nativeguide

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The repeating textures' arithmetic: the grain tile's pixels (checked against the theme mocks' own generator, which draws the same
 * specks from the same seed), and the size of every tile and of its marks at a screen's unit.
 */
class TileMathTest {
  private fun grain(tile: Int, density: Double, alpha: Double, colors: List<String>, seed: Int, texel: Int = 2) =
    GuideLook.Grain(tile, texel, density, alpha, colors.map(GuideColor::parse), seed)

  private fun unsigned(v: Int) = v.toLong() and 0xFFFFFFFFL

  /** A checksum of the whole tile, computed the way the mock's generator was checked: h = h * 31 + pixel in 32 bit arithmetic. */
  private fun hash(px: IntArray): Int {
    var h = 0
    for (v in px) h = h * 31 + v
    return h
  }

  @Test fun theRandomGeneratorIsTheMocksMulberry32() {
    // The first draws for seed 1, worked out with the JavaScript the mock uses (Math.imul and >>> 0 are 32 bit arithmetic).
    val r = TileMath.Rng(1)
    val first = DoubleArray(3) { r.next() }
    assertEquals(0.6270739405881613, first[0], 1e-15)
    assertEquals(0.002735721180215478, first[1], 1e-15)
    assertEquals(0.5274470399599522, first[2], 1e-15)
    // The same seed starts the same run, and a draw is always inside [0, 1).
    val again = TileMath.Rng(1)
    assertEquals(first[0], again.next(), 0.0)
    val many = TileMath.Rng(99)
    repeat(1000) { assertTrue(many.next() in 0.0..0.9999999999) }
  }

  @Test fun theGrainTileIsExactlyTheOneTheMockDraws() {
    // Risograph's grain: seed 11, one ink, 20% of the specks lit.
    val px = TileMath.grainPixels(grain(128, 0.2, 0.075, listOf("#5a4a2a"), 11))
    assertEquals(128 * 128, px.size)
    assertEquals(3344, px.count { it != 0 })
    assertEquals(46382, px.sumOf { (it ushr 24).toLong() }.toInt())
    assertEquals(-63169384, hash(px))
    assertEquals(listOf(6 to 257575466L, 13 to 207243818L, 17 to 257575466L), listOf(6, 13, 17).map { it to unsigned(px[it]) })
    assertEquals(240798250L, unsigned(px[16379]))
    assertEquals(0, px[16380])
  }

  @Test fun aGrainWithTwoInksPicksOneForEachSpeck() {
    // Neo-Brutalist's: black and white specks, 30% lit, seed 23.
    val px = TileMath.grainPixels(grain(128, 0.3, 0.08, listOf("#000000", "#ffffff"), 23))
    assertEquals(4999, px.count { it != 0 })
    assertEquals(74289, px.sumOf { (it ushr 24).toLong() }.toInt())
    assertEquals(217829122, hash(px))
    // Every lit speck is one of the two inks, at the grain's alpha scaled by 0.45..1.
    val lit = px.filter { it != 0 }
    assertTrue(lit.all { (it and 0xFFFFFF) == 0 || (it and 0xFFFFFF) == 0xFFFFFF })
    assertTrue(lit.all { (it ushr 24) in (255 * 0.08 * 0.45).toInt()..(255 * 0.08).toInt() + 1 })
    assertTrue(lit.any { (it and 0xFFFFFF) == 0 } && lit.any { (it and 0xFFFFFF) == 0xFFFFFF })
  }

  @Test fun aSmallTileWithThreeInksKeepsTheMocksOrderOfDraws() {
    // The color roll is spent even for a lit speck's single choice, and the alpha roll only for a lit one.
    val px = TileMath.grainPixels(grain(8, 0.5, 1.0, listOf("#ff0000", "#00ff00", "#0000ff"), 0))
    assertEquals(30, px.count { it != 0 })
    assertEquals(5536, px.sumOf { (it ushr 24).toLong() }.toInt())
    assertEquals(824290076, hash(px))
    assertEquals(listOf(0 to 2466185216L, 1 to 3204513536L, 4 to 2499870464L), listOf(0, 1, 4).map { it to unsigned(px[it]) })
  }

  @Test fun aGrainTileIsReproducibleAndASeedChangesIt() {
    val g = grain(32, 0.25, 0.5, listOf("#123456"), 7)
    assertArrayEquals(TileMath.grainPixels(g), TileMath.grainPixels(g))
    assertTrue(!TileMath.grainPixels(g).contentEquals(TileMath.grainPixels(grain(32, 0.25, 0.5, listOf("#123456"), 8))))
    // No density, no specks; full density, every pixel.
    assertEquals(0, TileMath.grainPixels(grain(16, 0.0, 0.5, listOf("#ffffff"), 3)).count { it != 0 })
    assertEquals(16 * 16, TileMath.grainPixels(grain(16, 1.0, 0.5, listOf("#ffffff"), 3)).count { it != 0 })
  }

  @Test fun aGrainTexelIsItsDesignSizeAtTheScreensUnit() {
    val g = grain(128, 0.2, 0.05, listOf("#ffffff"), 1, texel = 2)
    assertEquals(1.5f, TileMath.texelPx(g, 0.75), 0f) // a 1080p screen: one design px is 0.75 px
    assertEquals(3f, TileMath.texelPx(g, 1.5), 0f) // 4K
  }

  @Test fun halftoneDotsRepeatAtExactlyThePitch() {
    // Pop Art's background dots: pitch 22, dot 5, on a 1080p screen (0.75 px a design px): 16.5 px.
    val d = TileMath.dots(GuideLook.Halftone(22.0, 5.0, 45.0, GuideColor.WHITE), 0.75)
    assertEquals(17, d.side) // a whole number of pixels, and the shader scales it back to the exact period
    assertEquals(16.5f / 17f, d.scale, 1e-6f)
    assertEquals(16.5, d.side * d.scale.toDouble(), 1e-5)
    // The radius is the dot's share of the pitch, in the tile's own pixels.
    assertEquals(5f * 17f / 22f, d.radius, 1e-6f)
    // Two dots, a quarter and three quarters of the way across and down.
    assertArrayEquals(floatArrayOf(4.25f, 4.25f, 12.75f, 12.75f), d.centres, 1e-6f)
    // The smaller dots of a band's remainder: pitch 12 is 9 px, an exact tile.
    val small = TileMath.dots(GuideLook.Halftone(12.0, 3.2, 45.0, GuideColor.WHITE), 0.75)
    assertEquals(9, small.side)
    assertEquals(1f, small.scale, 1e-6f)
    assertEquals(3.2f * 9f / 12f, small.radius, 1e-6f)
  }

  @Test fun aTileIsNeverUnderTwoPixelsWhateverThePitch() {
    assertEquals(2, TileMath.dots(GuideLook.Halftone(1.0, 0.2, 45.0, GuideColor.WHITE), 0.1).side)
    assertEquals(2, TileMath.lines(GuideLook.Grid(1.0, 2.0, GuideColor.WHITE, GuideColor.WHITE, 1.0), 0.1).side)
  }

  @Test fun graphPaperHasAMinorLineFiveTimesAcrossAMajorSquare() {
    // Blueprint's: a line every 32 and a stronger one every 160, 1.33 thick, on a 1080p screen: a 120 px tile, a line every 24 px, 1 px thick.
    val l = TileMath.lines(GuideLook.Grid(32.0, 160.0, GuideColor.WHITE, GuideColor.WHITE, 1.33), 0.75)
    assertEquals(120, l.side)
    assertEquals(1f, l.scale, 1e-6f)
    assertEquals(5, l.count)
    assertEquals(24.0, l.minorStep, 1e-9)
    assertEquals(1, l.lineW)
    assertEquals(listOf(0, 24, 48, 72, 96), (0 until l.count).map { l.minorAt(it) })
    // On a 4K screen (1.5 px a design px) the tile doubles and the lines are two pixels thick.
    val big = TileMath.lines(GuideLook.Grid(32.0, 160.0, GuideColor.WHITE, GuideColor.WHITE, 1.33), 1.5)
    assertEquals(240, big.side)
    assertEquals(48.0, big.minorStep, 1e-9)
    assertEquals(2, big.lineW)
  }

  @Test fun aGridWhosePeriodIsNotWholeScalesItsTileToTheExactPeriod() {
    val l = TileMath.lines(GuideLook.Grid(32.0, 160.0, GuideColor.WHITE, GuideColor.WHITE, 1.33), 0.7) // 112 px exactly
    assertEquals(112, l.side)
    val odd = TileMath.lines(GuideLook.Grid(32.0, 160.0, GuideColor.WHITE, GuideColor.WHITE, 1.33), 0.6666) // 106.656 px
    assertEquals(107, odd.side)
    assertEquals(106.656, odd.side * odd.scale.toDouble(), 1e-3)
  }

  @Test fun aStrokeIsWholePixelsAndNeverVanishes() {
    assertEquals(0f, TileMath.strokePx(0.0, 0.75), 0f)
    assertEquals(0f, TileMath.strokePx(-2.0, 0.75), 0f)
    assertEquals(1f, TileMath.strokePx(0.5, 0.75), 0f) // under a pixel is one
    assertEquals(1f, TileMath.strokePx(1.33, 0.75), 0f) // a hairline
    assertEquals(3f, TileMath.strokePx(4.0, 0.75), 0f)
    assertEquals(4f, TileMath.strokePx(5.33, 0.75), 0f)
    assertEquals(8f, TileMath.strokePx(5.33, 1.5), 0f)
  }
}
