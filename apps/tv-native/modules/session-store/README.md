# Apple TV session storage

AsyncStorage 2.2.0 uses `NSCachesDirectory` on tvOS and warns that its contents may
be removed. This local Expo module stores six small values in the app's
UserDefaults instead: server URL, bearer token, the two Better Auth Expo values,
device ID, and the server-specific capability onboarding flag.

The JS adapter migrates surviving AsyncStorage values before routing. An empty
string marks a migrated missing/deleted value, preventing old cache data from
restoring a logged-out session or a previous server. Already-purged values cannot
be recovered: affected users must configure/login once after upgrading.

Synchronous Expo functions let both credential interfaces read the same store.
Writes acknowledge UserDefaults synchronization before setup/login navigates.
Read/write errors reach the caller; startup provides a remote/touch Retry action
and never interprets a read error as a new installation. Logout clears bearer,
cookie and cached session values while retaining the server. Change Server also
clears the URL. Only a 401 for the current bearer session requires login;
network, 403 and 5xx failures retain configuration and credentials.

This preserves the existing keychain-free tvOS workaround. UserDefaults is not
encrypted storage, just as the former AsyncStorage fallback was not encrypted.
iOS/iPadOS and Android retain SecureStore for credentials and AsyncStorage for
configuration. No session expiry or server authorization rules change.

Each value is restricted to 32 KiB and keys are allowlisted, keeping these six
values below tvOS's 512 KiB UserDefaults warning threshold. The pod bundles the
required UserDefaults privacy declaration. A new native binary is required;
an OTA JavaScript update alone cannot supply this module.
