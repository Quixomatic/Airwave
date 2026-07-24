package expo.modules.keyinput

import android.view.KeyEvent
import android.view.Window
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Hardware-key input source — the Android twin of `ios/KeyInputModule.swift`. It wraps the current
 * Activity's `Window.Callback` (via Kotlin interface delegation, so every other callback method passes
 * straight through) and intercepts `dispatchKeyEvent`, emitting the same semantic `onKey {key, digit}`
 * events the JS dispatcher consumes.
 *
 * ⚠️ It ONLY consumes the keys `useTVEventHandler` does NOT deliver — **digits** and **channel up/down**.
 * D-pad / OK / Back fall straight through to normal RN + TV-remote handling, so there is no
 * double-dispatch on the TV build (react-native-tvos already routes the D-pad through useTVEventHandler).
 * This is what makes channel-number entry + CH±/Bluetooth-keyboard digits work on Android TV / Fire TV.
 */
class KeyInputModule : Module() {
  private var wrapped: KeyInterceptCallback? = null
  private var original: Window.Callback? = null

  override fun definition() = ModuleDefinition {
    Name("KeyInput")

    Events("onKey")

    // The activity may not exist yet at OnCreate; OnActivityEntersForeground is the reliable attach point
    // and re-wraps if the activity/callback was replaced (config change, etc.).
    OnCreate { attach() }
    OnActivityEntersForeground { attach() }
    OnDestroy { detach() }
  }

  private fun attach() {
    val window = appContext.currentActivity?.window ?: return
    if (window.callback is KeyInterceptCallback) return // already wrapped
    val base = window.callback ?: return
    original = base
    val cb = KeyInterceptCallback(base) { event -> handleKey(event) }
    wrapped = cb
    window.callback = cb
  }

  private fun detach() {
    val window = appContext.currentActivity?.window
    if (window != null && window.callback === wrapped) {
      window.callback = original
    }
    wrapped = null
    original = null
  }

  /**
   * Returns true to CONSUME the event (our keys — digits/CH±), false to let it fall through to normal
   * handling. Emits `onKey` only on key-DOWN; consumes the matching UP too so the event pair stays
   * balanced. `digit` carries 0–9 for number keys, -1 otherwise (mirrors the iOS module).
   */
  private fun handleKey(event: KeyEvent): Boolean {
    val mapped = keyMap(event.keyCode) ?: return false
    if (event.action == KeyEvent.ACTION_DOWN) {
      sendEvent("onKey", mapOf("key" to mapped.first, "digit" to mapped.second))
    }
    return true
  }

  /** Android keyCode → (SemanticKey, digit). Only digits + channel up/down; everything else is null
   *  (not consumed). `]`/`=` and `[`/`-` mirror the iOS bracket mapping for a Bluetooth keyboard. */
  private fun keyMap(code: Int): Pair<String, Int>? = when (code) {
    in KeyEvent.KEYCODE_0..KeyEvent.KEYCODE_9 -> "digit" to (code - KeyEvent.KEYCODE_0)
    in KeyEvent.KEYCODE_NUMPAD_0..KeyEvent.KEYCODE_NUMPAD_9 -> "digit" to (code - KeyEvent.KEYCODE_NUMPAD_0)
    KeyEvent.KEYCODE_CHANNEL_UP, KeyEvent.KEYCODE_RIGHT_BRACKET, KeyEvent.KEYCODE_EQUALS -> "chUp" to -1
    KeyEvent.KEYCODE_CHANNEL_DOWN, KeyEvent.KEYCODE_LEFT_BRACKET, KeyEvent.KEYCODE_MINUS -> "chDown" to -1
    else -> null
  }
}

/**
 * A `Window.Callback` that intercepts `dispatchKeyEvent` and delegates everything else to the real
 * callback via Kotlin's `by` interface delegation (no need to hand-write the ~20 other methods).
 */
private class KeyInterceptCallback(
  private val base: Window.Callback,
  private val onKey: (KeyEvent) -> Boolean,
) : Window.Callback by base {
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (onKey(event)) return true
    return base.dispatchKeyEvent(event)
  }
}
