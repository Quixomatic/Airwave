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

  # The MPVKit Swift Package (github.com/edde746/MPVKit — the fork with the iOS/tvOS `avfoundation` VO
  # + HDR/Dolby-Vision that plezy proves). Linked to THIS pod (not the app target) via React Native's
  # `spm_dependency` macro, so the module is visible where our Swift compiles. Linking the `MPVKit`
  # product also makes the bundled `Libmpv` binary target importable (how plezy uses the raw C API).
  spm_dependency(s,
    url: 'https://github.com/edde746/MPVKit',
    requirement: {
      kind: 'upToNextMajorVersion',
      minimumVersion: '1.0.13'
    },
    products: ['MPVKit']
  )

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,mm,swift}'
end
