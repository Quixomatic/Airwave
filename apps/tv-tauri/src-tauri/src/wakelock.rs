//! Keep the machine + display awake while video is playing (macOS / Windows / Linux).
//!
//! Tauri has no first-class sleep-inhibition API (open feature request tauri#3697), so we do what our
//! Tauri+libmpv reference (soia) and plezy both do: hold an OS wake assertion while a program is playing and
//! release it the moment playback stops. The `keepawake` crate maps to the right native mechanism per OS —
//! `IOPMAssertion` (macOS, same as plezy's `kIOPMAssertionTypeNoDisplaySleep`), `SetThreadExecutionState`
//! (Windows), and D-Bus / systemd-inhibit (Linux). `.display(true)` keeps the DISPLAY awake (not just the
//! system), which is what a 10-foot video app wants.
//!
//! Rule (agreed, matches soia + plezy): awake while a file is loaded and NOT user-paused — buffering counts
//! as playing. The caller drives `update(!paused && !idle_active)`; the assertion is released on
//! pause / stop / idle, and automatically on drop (event-loop thread exit / shutdown).

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
mod desktop {
    use keepawake::{Builder, KeepAwake};

    /// Holds an OS wake assertion while playback is active. `update` is idempotent — it only acquires or
    /// releases when the desired state actually changes.
    pub struct WakeLockManager {
        lock: Option<KeepAwake>,
        active: bool,
    }

    impl WakeLockManager {
        pub fn new() -> Self {
            Self {
                lock: None,
                active: false,
            }
        }

        /// `should_keep_awake` = a program is loaded and not user-paused.
        pub fn update(&mut self, should_keep_awake: bool) {
            if should_keep_awake && !self.active {
                match Builder::default()
                    .display(true) // keep the screen on, not just the system
                    .idle(false)
                    .create()
                {
                    Ok(lock) => {
                        self.lock = Some(lock);
                        self.active = true;
                        log::info!("[wakelock] ENABLED — holding display awake while playing");
                    }
                    // Non-fatal: playback continues, the machine just isn't kept awake (e.g. no session bus
                    // on a headless Linux box). Never break playback over a wake assertion.
                    Err(e) => {
                        log::warn!("[wakelock] failed to acquire (sleep NOT inhibited): {e}");
                        self.lock = None;
                        self.active = false;
                    }
                }
            } else if !should_keep_awake && self.active {
                self.lock.take(); // drop releases the OS assertion
                self.active = false;
                log::info!("[wakelock] released — sleep allowed (paused / stopped)");
            }
        }
    }

    impl Drop for WakeLockManager {
        fn drop(&mut self) {
            self.lock.take();
            self.active = false;
        }
    }
}

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
pub use desktop::WakeLockManager;

// Non-desktop (a hypothetical mobile build): a no-op so the event loop compiles unchanged.
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub struct WakeLockManager;

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
impl WakeLockManager {
    pub fn new() -> Self {
        Self
    }
    pub fn update(&mut self, _should_keep_awake: bool) {}
}
