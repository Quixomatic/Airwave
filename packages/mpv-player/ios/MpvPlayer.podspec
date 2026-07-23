Pod::Spec.new do |s|
  s.name           = 'MpvPlayer'
  s.version        = '0.0.0'
  s.summary        = 'Expo native video player powered by mpv (libmpv/MPVKit).'
  s.description    = 'A full replacement for AVPlayer and libVLC — direct-plays every codec/container and does fast ffmpeg-estimated HTTP seeks. iOS · iPadOS · tvOS.'
  s.author         = 'ChannelGuide'
  s.homepage       = 'https://github.com/Quixomatic/ChannelGuide'
  s.platforms      = { :ios => '15.1', :tvos => '15.1' }
  s.source         = { git: '' }

  s.dependency 'ExpoModulesCore'

  # ── MPVKit is NOT linked here. ────────────────────────────────────────────
  # Earlier this pod linked the MPVKit Swift Package via React Native's
  # `spm_dependency` macro. That makes CocoaPods MERGE MPVKit's static libs into
  # libMpvPlayer.a — and MoltenVK (force-loaded via its ObjC/Metal `+load`) then
  # exists BOTH inside the pod archive AND as the app-target's MPVKit copy
  # (linked in app.plugin.js, plezy's model), producing ~545 duplicate
  # `_vk*`/`_mvk*` symbols at the final app link. `static_framework` on/off did
  # not change this — the merge is inherent to a pod owning the SPM product.
  #
  # So the app target is the SOLE owner of every MPVKit binary, and this pod
  # compiles COMPILE-ONLY against vendored libmpv public headers: `ios/libmpv/`
  # holds a `module.modulemap` (module `Libmpv`) + `mpv/client.h`, so our Swift's
  # `import Libmpv` resolves at compile time. The pod's undefined mpv_* symbols
  # then link against the app target's single MPVKit copy. client.h is ABI-stable
  # C and every mpv_* call we make predates mpv 0.30, so header/lib skew is a
  # non-issue. Excluded from source_files so it stays a standalone module (not
  # folded into the MpvPlayer module); preserved so CocoaPods keeps it on disk.
  s.exclude_files  = 'libmpv/**/*'
  s.preserve_paths = 'libmpv/**/*'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    'SWIFT_INCLUDE_PATHS' => '$(inherited) "$(PODS_TARGET_SRCROOT)/libmpv"'
  }

  s.source_files = '**/*.{h,m,mm,swift}'
end
