Pod::Spec.new do |s|
  s.name = 'SessionStore'
  s.version = '0.0.0'
  s.summary = 'Keychain-free persistent session storage for Apple TV.'
  s.author = 'Airwave'
  s.homepage = 'https://github.com/Quixomatic/Airwave'
  s.platforms = { :ios => '15.1', :tvos => '15.1' }
  s.source = { git: '' }
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
  s.resource_bundles = { 'SessionStore_privacy' => ['PrivacyInfo.xcprivacy'] }
end
