Pod::Spec.new do |s|
  s.name           = 'KeyInput'
  s.version        = '0.0.0'
  s.summary        = 'Hardware-keyboard input source (GameController GCKeyboard) for tv-native.'
  s.description     = 'Emits semantic D-pad / number keys from a physical keyboard or remote so the input dispatcher + zone machine are drivable on iPad/tvOS. No first-responder juggling — reads GCKeyboard app-wide.'
  s.author         = 'ChannelGuide'
  s.homepage       = 'https://github.com/Quixomatic/ChannelGuide'
  s.platforms      = { :ios => '15.1', :tvos => '15.1' }
  s.source         = { git: '' }

  s.dependency 'ExpoModulesCore'
  # System framework — GCKeyboard (iOS/tvOS 14+) delivers hardware key events app-wide.
  s.frameworks     = 'GameController'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,mm,swift}'
end
