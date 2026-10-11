import Foundation

/// AsyncStorage uses purgeable caches on tvOS. Store only these small configuration/session
/// values in UserDefaults, without the keychain used by SecureStore on other platforms.
final class PersistentSessionStore {
  private let defaults: UserDefaults
  private let prefix = "airwave.session."
  private let keys: Set<String> = [
    "cg-tv-server-url", "cg-tv-token", "cg_cookie", "cg_session_data",
    "cg-device-id", "cg-caps-done"
  ]

  init(defaults: UserDefaults = .standard) { self.defaults = defaults }

  private func storageKey(_ key: String) throws -> String {
    guard keys.contains(key) else { throw failure(1, "Unsupported session storage key") }
    return prefix + key
  }

  private func failure(_ code: Int, _ message: String) -> NSError {
    NSError(domain: "SessionStore", code: code, userInfo: [NSLocalizedDescriptionKey: message])
  }

  func getItem(_ key: String) throws -> String? {
    let value = defaults.object(forKey: try storageKey(key))
    guard let value else { return nil }
    guard let string = value as? String else { throw failure(2, "Invalid session storage value") }
    return string
  }

  func setItem(_ key: String, value: String) throws {
    // Six bounded strings stay below tvOS's 512 KB UserDefaults warning threshold.
    guard value.utf8.count <= 32 * 1024 else { throw failure(3, "Session storage value is too large") }
    let key = try storageKey(key)
    let previous = defaults.object(forKey: key)
    defaults.set(value, forKey: key)
    // A synchronous acknowledgement lets setup/login await persistence before navigating.
    // This is intentionally stronger than an asynchronous UserDefaults/Settings write.
    guard defaults.synchronize() else {
      if let previous { defaults.set(previous, forKey: key) }
      else { defaults.removeObject(forKey: key) }
      throw failure(4, "Could not persist session storage")
    }
  }
}
