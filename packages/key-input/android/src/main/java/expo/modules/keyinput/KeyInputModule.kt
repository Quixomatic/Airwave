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
 * ⚠️ THE ANDROID INPUT MODEL (the load-bearing difference from tvOS): on tvOS `useTVEventHandler` is a
 * GLOBAL, focus-independent handler (Siri-remote gesture recognizers), so the manual zone machine works
 * there and the iOS module never touches the D-pad. On **Android**, D-pad navigation IS the native focus
 * engine — the OS routes `KEYCODE_DPAD_*` to move focus BETWEEN focusable Views — but our whole UI is
 * `focusable={false}` (the browser-derived zone machine), so NOTHING is focusable, focus can't move, and
 * `useTVEventHandler` never fires → dead input. So on Android we capture the D-pad (+ OK) HERE at the
 * Activity's `dispatchKeyEvent`, which is global and focus-independent (it sees every key before the focus
 * engine), and forward it to the SAME dispatcher — the correct native model for an app that owns its own
 * navigation. Consuming the event (`return true`) also stops the focus engine from ever seeing it, so
 * there's no double-dispatch. (This is Kotlin — Android-only by construction; tvOS is untouched.)
 * BACK is the exception — handled JS-side via RN's `BackHandler` (see the `keyMap` note).
 *
 * Also consumes the keys no TV-remote handler ever delivers — **digits** and **channel up/down** — for
 * channel-number entry + CH± from a number remote / Bluetooth keyboard.
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
   * Returns true to CONSUME the event, false to let it fall through to normal handling. Emits `onKey`
   * only on key-DOWN; consumes the matching UP too so the event pair stays balanced. `digit` carries 0–9
   * for number keys, -1 otherwise (mirrors the iOS module). Directional keys re-emit on auto-repeat
   * (hold-to-scroll the guide); every other key fires once per press (repeatCount 0) so a held OK/Back
   * can't double-activate.
   */
  private fun handleKey(event: KeyEvent): Boolean {
    val mapped = keyMap(event.keyCode) ?: return false
    if (event.action == KeyEvent.ACTION_DOWN && (isDirectional(mapped.first) || event.repeatCount == 0)) {
      sendEvent("onKey", mapOf("key" to mapped.first, "digit" to mapped.second))
    }
    return true
  }

  private fun isDirectional(key: String) = key == "up" || key == "down" || key == "left" || key == "right"

  /**
   * Android keyCode → (SemanticKey, digit); null = not consumed (falls through).
   * - D-pad + OK: captured HERE because Android delivers them to the focused View, which our
   *   focusable={false} UI doesn't have (see the class doc). BACK is deliberately NOT here — on modern
   *   Android it's routed through the predictive-back dispatcher (OnBackInvokedCallback), not always
   *   `dispatchKeyEvent`, so it's handled JS-side via RN's `BackHandler` (which also lets it fall through
   *   to a real app-exit at the root — the true "regular back button" behavior).
   * - Digits + channel up/down: keys no TV-remote handler delivers. `]`/`=` and `[`/`-` mirror the iOS
   *   bracket mapping for a Bluetooth keyboard.
   */
  private fun keyMap(code: Int): Pair<String, Int>? = when (code) {
    KeyEvent.KEYCODE_DPAD_UP -> "up" to -1
    KeyEvent.KEYCODE_DPAD_DOWN -> "down" to -1
    KeyEvent.KEYCODE_DPAD_LEFT -> "left" to -1
    KeyEvent.KEYCODE_DPAD_RIGHT -> "right" to -1
    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER, KeyEvent.KEYCODE_BUTTON_A ->
      "ok" to -1
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
