Pod::Spec.new do |s|
  s.name           = 'VermillionBackup'
  s.version        = '1.0.0'
  s.summary        = 'Excludes the local database directory from iOS backups'
  s.description    = 'Sets isExcludedFromBackup on a directory (ADR 0022).'
  s.license        = 'MIT'
  s.author         = 'vermillion'
  s.homepage       = 'https://example.invalid'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://example.invalid/vermillion.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
