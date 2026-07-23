Pod::Spec.new do |s|
  s.name           = 'MpvPlayer'
  s.version        = '0.0.0'
  s.summary        = 'Expo native video player powered by mpv (libmpv/MPVKit).'
  s.description    = 'A full replacement for AVPlayer and libVLC — direct-plays every codec/container and does fast ffmpeg-estimated HTTP seeks. iOS · iPadOS · tvOS.'
  s.author         = 'ChannelGuide'
  s.homepage       = 'https://github.com/Quixomatic/ChannelGuide'
  s.platforms      = { :ios => '15.1', :tvos => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/C interop for libmpv.
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  # NOTE: The MPVKit Swift Package (github.com/edde746/MPVKit) is added to the app's Xcode target by
  # this module's config plugin (see ../plugin) — the Expo equivalent of plezy's tvos/scripts/wire_mpv.rb.
  # MPVKit is SPM-only (no podspec), so it can't be a `s.dependency` here.

  s.source_files = '**/*.{h,m,mm,swift}'
end
