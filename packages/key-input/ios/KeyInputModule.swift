import ExpoModulesCore
import GameController

/// Hardware-keyboard input source. Reads the **GameController** `GCKeyboard` (iOS/tvOS 14+) app-wide —
/// no first-responder juggling, no interference with text fields (it's a parallel read, not a consumer)
/// — maps physical keys to our SemanticKey vocabulary, and emits an `onKey` event the JS dispatcher
/// forwards to the layer stack. Enables the D-pad zone machine + channel-number entry from any attached
/// keyboard/remote on the iPad (and, later, the same contract on Android via `onKeyDown`).
public class KeyInputModule: Module {
  private var connectObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("KeyInput")

    Events("onKey")

    OnCreate {
      // GCKeyboard is ONLY useful where there's no TV remote — the iPad (a Magic/BT keyboard). On tvOS the
      // Siri Remote is delivered via react-native-tvos `useTVEventHandler`, so this module is redundant
      // there. Critically, merely accessing `GCKeyboard.coalesced` on tvOS spins up the shared
      // GameController session that enumerates the Siri Remote — which crashes the release / New-Architecture
      // build at startup ('RCTFatalException: non-std C++ exception', right after "Connected devices changed
      // -> Siri Remote"). So we skip GameController entirely on tvOS; the remote works through useTVEventHandler.
      #if !os(tvOS)
      // A keyboard already attached at launch, plus any that connect later.
      if let keyboard = GCKeyboard.coalesced { self.attach(keyboard) }
      self.connectObserver = NotificationCenter.default.addObserver(
        forName: .GCKeyboardDidConnect, object: nil, queue: .main
      ) { [weak self] note in
        if let keyboard = note.object as? GCKeyboard { self?.attach(keyboard) }
      }
      #endif
    }

    OnDestroy {
      #if !os(tvOS)
      if let observer = self.connectObserver {
        NotificationCenter.default.removeObserver(observer)
        self.connectObserver = nil
      }
      GCKeyboard.coalesced?.keyboardInput?.keyChangedHandler = nil
      #endif
    }
  }

  private func attach(_ keyboard: GCKeyboard) {
    keyboard.handlerQueue = .main // deliver on main so sendEvent is safe
    keyboard.keyboardInput?.keyChangedHandler = { [weak self] _, _, keyCode, pressed in
      guard pressed else { return } // key-DOWN only (like a keydown; release is ignored)
      guard let mapped = KeyInputModule.keyMap[keyCode] else { return }
      self?.sendEvent("onKey", ["key": mapped.0, "digit": mapped.1])
    }
  }

  /// GCKeyCode → (SemanticKey string, digit). `digit` is -1 for non-digit keys. Arrows = D-pad;
  /// Enter/keypad-enter/Space = ok; Esc/Delete = back; `]`/`=` = chUp, `[`/`-` = chDown; number row and
  /// keypad both feed `digit`. (Mirrors the mapping a webOS remote / Android keyEvent path will use.)
  private static let keyMap: [GCKeyCode: (String, Int)] = [
    .upArrow: ("up", -1),
    .downArrow: ("down", -1),
    .leftArrow: ("left", -1),
    .rightArrow: ("right", -1),
    .returnOrEnter: ("ok", -1),
    .keypadEnter: ("ok", -1),
    .spacebar: ("ok", -1),
    .escape: ("back", -1),
    .deleteOrBackspace: ("back", -1),
    .closeBracket: ("chUp", -1),
    .equalSign: ("chUp", -1),
    .openBracket: ("chDown", -1),
    .hyphen: ("chDown", -1),
    .zero: ("digit", 0), .keypad0: ("digit", 0),
    .one: ("digit", 1), .keypad1: ("digit", 1),
    .two: ("digit", 2), .keypad2: ("digit", 2),
    .three: ("digit", 3), .keypad3: ("digit", 3),
    .four: ("digit", 4), .keypad4: ("digit", 4),
    .five: ("digit", 5), .keypad5: ("digit", 5),
    .six: ("digit", 6), .keypad6: ("digit", 6),
    .seven: ("digit", 7), .keypad7: ("digit", 7),
    .eight: ("digit", 8), .keypad8: ("digit", 8),
    .nine: ("digit", 9), .keypad9: ("digit", 9),
  ]
}
