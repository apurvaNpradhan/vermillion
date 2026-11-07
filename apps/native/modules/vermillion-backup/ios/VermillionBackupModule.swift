import ExpoModulesCore

public class VermillionBackupModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VermillionBackup")

    // The attribute on a directory covers everything inside it, including files created later.
    Function("excludeFromBackup") { (path: String) throws in
      var url = URL(fileURLWithPath: path, isDirectory: true)
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try url.setResourceValues(values)
    }
  }
}
