import ExpoModulesCore

public class SessionStoreModule: Module {
  private let store = PersistentSessionStore()

  public func definition() -> ModuleDefinition {
    Name("AirwaveSessionStore")
    Function("getItem") { (key: String) throws -> String? in
      try self.store.getItem(key)
    }
    Function("setItem") { (key: String, value: String) throws -> Bool in
      try self.store.setItem(key, value: value)
      return true
    }
  }
}
