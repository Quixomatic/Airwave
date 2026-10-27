package expo.modules.nativeguide

/**
 * How a row is kept (see [RowNodes]): in a texture of its own or only as a display list, and over which opaque color. Pure, so the rule is unit-tested.
 *
 * A row that only paints over what is beneath it is kept in a layer. A row that reads what is beneath it (a multiply blend) can be kept in one only where
 * the guide says what is beneath the rows: one opaque color, which the layer is first filled with, so what the blend meets is what it would have met
 * on the window. Otherwise it is a plain display list drawn straight onto the window.
 */
internal class RowLayering private constructor(
  /** The row is kept in a compositing layer. */
  val layered: Boolean,
  /** The opaque color the layer is filled with first, or 0 for none. */
  val under: Int,
) {
  /** What a recording is made in, to tell it from one made another way: 0 for a plain list, else the layer and its fill. */
  val variant: Long get() = if (layered) (1L shl 32) or (under.toLong() and 0xFFFFFFFFL) else 0L

  /** Pixels the row's node reaches past its box on every side (a layer holds only what is inside its bounds). */
  val edge: Int get() = if (layered) EDGE else 0

  companion object {
    /** Pixels a layered row's node reaches past its box on every side: a border of an odd width straddles the edge it is measured from. */
    const val EDGE = 2

    fun of(readsBackdrop: Boolean, backdrop: Int): RowLayering {
      val under = if (readsBackdrop && backdrop ushr 24 == 0xFF) backdrop else 0
      return RowLayering(!readsBackdrop || under != 0, under)
    }
  }
}
