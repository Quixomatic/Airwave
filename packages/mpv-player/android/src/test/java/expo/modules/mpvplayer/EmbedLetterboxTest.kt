package expo.modules.mpvplayer

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * `embedLetterboxRatio(isEmbed, sdrIsEmbed, fit, w, h, previousRatio)`: `isEmbed` is the VO the core is actually
 * using (`MpvCore.isEmbed`), `sdrIsEmbed` is true only where every program is embed (`MpvCore.sdrIsEmbed`),
 * `previousRatio` is the ratio currently applied.
 */
class EmbedLetterboxTest {
  private val fits = listOf("contain", "cover", "fill", "unknown")
  private val sizes = listOf(0 to 0, 1920 to 1080, 1920 to 800, 720 to 540)
  private val previous = listOf(0f, 4f / 3f, 1920f / 800f)

  /** The behaviour before MediaTek devices were routed through embed: only HDR letterboxes, and not for cover/fill. */
  private fun before(hdr: Boolean, fit: String, w: Int, h: Int): Float {
    val forceFill = fit == "cover" || fit == "fill"
    return if (hdr && !forceFill && w > 0 && h > 0) w.toFloat() / h.toFloat() else 0f
  }

  @Test
  fun otherDevicesBehaveAsBefore() {
    // On every device that keeps gpu-next for SDR, the VO in use is embed exactly when the program is HDR, and the
    // previous ratio never matters (an unknown size still fills).
    for (hdr in listOf(true, false)) for (fit in fits) for ((w, h) in sizes) for (prev in previous) {
      assertEquals(
        "hdr=$hdr fit=$fit ${w}x$h previous=$prev",
        before(hdr, fit, w, h),
        embedLetterboxRatio(isEmbed = hdr, sdrIsEmbed = false, contentFit = fit, videoW = w, videoH = h, previousRatio = prev),
        0f,
      )
    }
  }

  @Test
  fun gpuNextIsNeverLetterboxedByTheView() {
    for (sdrEmbed in listOf(false, true)) for (fit in fits) for ((w, h) in sizes) for (prev in previous) {
      assertEquals(0f, embedLetterboxRatio(false, sdrEmbed, fit, w, h, prev), 0f)
    }
  }

  @Test
  fun theRatioFollowsTheVoInUse() {
    // A non-MediaTek device that played an HDR program and then loads one with no declared range stays on embed
    // (MpvCore.applyVoForLoad returns early), so the view must keep letterboxing: the answer depends on the VO only.
    assertEquals(1920f / 800f, embedLetterboxRatio(true, false, "contain", 1920, 800), 1e-6f)
    assertEquals(4f / 3f, embedLetterboxRatio(true, false, "contain", 720, 540), 1e-6f)
  }

  @Test
  fun hdrCoverStillFillsOnOtherDevices() {
    assertEquals(0f, embedLetterboxRatio(true, false, "cover", 1920, 800), 0f)
    assertEquals(0f, embedLetterboxRatio(true, false, "fill", 1920, 800), 0f)
  }

  @Test
  fun embedSdrLetterboxesContain() {
    assertEquals(1920f / 800f, embedLetterboxRatio(true, true, "contain", 1920, 800), 1e-6f)
    assertEquals(4f / 3f, embedLetterboxRatio(true, true, "contain", 720, 540), 1e-6f)
  }

  @Test
  fun embedSdrLetterboxesCoverInsteadOfStretching() {
    assertEquals(1920f / 800f, embedLetterboxRatio(true, true, "cover", 1920, 800), 1e-6f)
    assertEquals(4f / 3f, embedLetterboxRatio(true, true, "cover", 720, 540), 1e-6f)
  }

  @Test
  fun onlyCoverDependsOnSdrIsEmbedWhenTheSizeIsKnown() {
    for (fit in listOf("contain", "fill", "unknown")) for ((w, h) in sizes.filter { it.first > 0 }) {
      assertEquals(
        "fit=$fit ${w}x$h",
        embedLetterboxRatio(true, false, fit, w, h),
        embedLetterboxRatio(true, true, fit, w, h),
        0f,
      )
    }
  }

  @Test
  fun embedStillFillsForFillAndUnknownFirstSize() {
    // No previous ratio to hold, so an unknown size fills.
    for (sdrEmbed in listOf(false, true)) {
      assertEquals(0f, embedLetterboxRatio(true, sdrEmbed, "fill", 1920, 800), 0f)
      assertEquals(0f, embedLetterboxRatio(true, sdrEmbed, "contain", 0, 0), 0f)
      assertEquals(0f, embedLetterboxRatio(true, sdrEmbed, "contain", 1920, 0), 0f)
    }
    assertEquals(0f, embedLetterboxRatio(true, true, "cover", 1920, 0), 0f)
  }

  @Test
  fun embedSdrKeepsThePreviousRatioWhileTheNewSizeIsUnknown() {
    // A channel change on a device where every program is embed: the size is reset to unknown, and the surface
    // must stay letterboxed instead of going full and back (two resizes).
    val prev = 4f / 3f
    for (fit in listOf("contain", "cover")) for ((w, h) in listOf(0 to 0, 1920 to 0, 0 to 1080)) {
      assertEquals("fit=$fit ${w}x$h", prev, embedLetterboxRatio(true, true, fit, w, h, prev), 0f)
    }
    // ...and a same-shape next program then yields the same ratio, so nothing is resized at all.
    assertEquals(prev, embedLetterboxRatio(true, true, "cover", 720, 540, prev), 1e-6f)
  }

  @Test
  fun aKnownSizeWinsOverThePreviousRatio() {
    assertEquals(1920f / 800f, embedLetterboxRatio(true, true, "contain", 1920, 800, 4f / 3f), 1e-6f)
    assertEquals(1920f / 1080f, embedLetterboxRatio(true, true, "cover", 1920, 1080, 4f / 3f), 1e-6f)
  }

  @Test
  fun fillIsNotHeldEvenOnEmbedSdr() {
    assertEquals(0f, embedLetterboxRatio(true, true, "fill", 0, 0, 4f / 3f), 0f)
    assertEquals(0f, embedLetterboxRatio(true, true, "fill", 1920, 800, 4f / 3f), 0f)
  }

  @Test
  fun hdrOnlyEmbedDoesNotHoldThePreviousRatio() {
    // Other devices' HDR path keeps its old behaviour: an unknown size fills.
    assertEquals(0f, embedLetterboxRatio(true, false, "contain", 0, 0, 4f / 3f), 0f)
    assertEquals(0f, embedLetterboxRatio(true, false, "cover", 0, 0, 4f / 3f), 0f)
  }

  @Test
  fun onLoadSizeDrivesTheAspectOnlyWhereSdrIsNotEmbed() {
    assertEquals(true, loadSizeDrivesAspect(sdrIsEmbed = false))
    assertEquals(false, loadSizeDrivesAspect(sdrIsEmbed = true))
  }

  @Test
  fun anamorphicLoadSizeDoesNotResizeTheSurfaceWhereSdrIsEmbed() {
    // A channel change to an anamorphic 720x480 program (display size 853x480) on a device where every program is
    // embed. At file-loaded onLoad reports the codec's storage size, 720x480 (ratio 1.5); the PAR-correct display
    // size 853x480 (1.78) follows via dwidth/dheight. Model of the view: setPendingSource, mpvDidLoad, mpvVideoSize.
    val before = 4f / 3f
    var ratio = before
    var w = 0
    var h = 0
    val applied = mutableListOf<Float>()
    fun applyAspect() {
      ratio = embedLetterboxRatio(true, true, "cover", w, h, ratio)
      applied += ratio
    }
    applyAspect() // setPendingSource: size unknown, the letterbox is held
    if (loadSizeDrivesAspect(true)) { w = 720; h = 480; applyAspect() } // mpvDidLoad
    w = 853; h = 480; applyAspect() // mpvVideoSize
    assertEquals(listOf(before, 853f / 480f), applied.distinct())
    assertEquals(853f / 480f, ratio, 1e-6f)
  }

  @Test
  fun gpuNextFillsWhateverTheSizeOrPreviousRatio() {
    assertEquals(0f, embedLetterboxRatio(false, false, "contain", 0, 0, 4f / 3f), 0f)
    assertEquals(0f, embedLetterboxRatio(false, true, "contain", 0, 0, 4f / 3f), 0f)
  }
}
