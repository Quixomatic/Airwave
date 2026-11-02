package expo.modules.nativeguide

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** How a row is kept: in a texture or as a plain list, and over which color. */
class RowLayeringTest {
  private val paper = 0xFFEBE2CD.toInt()

  @Test fun aRowThatOnlyPaintsOverWhatIsBeneathIsAlwaysLayered() {
    for (backdrop in listOf(0, paper, 0x80EBE2CD.toInt())) {
      val l = RowLayering.of(readsBackdrop = false, backdrop = backdrop)
      assertTrue(l.layered)
      assertEquals("it needs no fill", 0, l.under)
      assertEquals(RowLayering.EDGE, l.edge)
    }
  }

  @Test fun aRowThatReadsWhatIsBeneathIsLayeredOnlyOverAnOpaqueColor() {
    val over = RowLayering.of(readsBackdrop = true, backdrop = paper)
    assertTrue(over.layered)
    assertEquals(paper, over.under)
    assertEquals(RowLayering.EDGE, over.edge)
    // Not said, or not opaque (a texture behind, or a translucent ground): nothing sure to multiply with, so a plain list on the window.
    for (backdrop in listOf(0, 0x80EBE2CD.toInt(), 0x00FFFFFF)) {
      val plain = RowLayering.of(readsBackdrop = true, backdrop = backdrop)
      assertFalse(plain.layered)
      assertEquals(0, plain.under)
      assertEquals(0, plain.edge)
      assertEquals(0L, plain.variant)
    }
  }

  @Test fun aRecordingMadeOneWayIsNotTakenForOneMadeAnother() {
    val plain = RowLayering.of(true, 0).variant
    val layered = RowLayering.of(false, 0).variant
    val overPaper = RowLayering.of(true, paper).variant
    val overInk = RowLayering.of(true, 0xFF243C96.toInt()).variant
    assertEquals(4, setOf(plain, layered, overPaper, overInk).size)
    assertNotEquals(layered, overPaper)
  }
}
