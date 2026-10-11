import Foundation

final class FailingDefaults: UserDefaults {
  override func synchronize() -> Bool { false }
}

@main
struct SessionStoreTests {
  static func check(_ actual: String?, _ expected: String?) { assert(actual == expected) }

  static func main() throws {
    let suite = "airwave-session-test-" + UUID().uuidString
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = PersistentSessionStore(defaults: defaults)
    check(try store.getItem("cg-tv-server-url"), nil)
    try store.setItem("cg-tv-server-url", value: "https://example.test")
    let restarted = PersistentSessionStore(defaults: UserDefaults(suiteName: suite)!)
    check(try restarted.getItem("cg-tv-server-url"), "https://example.test")
    try restarted.setItem("cg-tv-token", value: "test-credential")
    check(try store.getItem("cg-tv-token"), "test-credential")
    try restarted.setItem("cg-tv-token", value: "")
    check(try store.getItem("cg-tv-token"), "")
    do {
      try store.setItem("unrelated-key", value: "x")
      fatalError("Unsupported key accepted")
    } catch { assert((error as NSError).code == 1) }
    do {
      try store.setItem("cg_cookie", value: String(repeating: "x", count: 32769))
      fatalError("Oversized value accepted")
    } catch { assert((error as NSError).code == 3) }
    defaults.set(123, forKey: "airwave.session.cg_cookie")
    do {
      _ = try store.getItem("cg_cookie")
      fatalError("Corrupt value accepted")
    } catch { assert((error as NSError).code == 2) }
    let failingDefaults = FailingDefaults(suiteName: suite)!
    let failing = PersistentSessionStore(defaults: failingDefaults)
    do {
      try failing.setItem("cg-tv-server-url", value: "https://other.test")
      fatalError("Failed persistence accepted")
    } catch { assert((error as NSError).code == 4) }
    check(try failing.getItem("cg-tv-server-url"), "https://example.test")
    print("PersistentSessionStore: all checks passed")
  }
}
