const fs = require("node:fs");
const path = require("node:path");
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require("expo/config-plugins");

const BACKUP_RULES = "backup_rules";
const EXTRACTION_RULES = "data_extraction_rules";

// Replaces expo-secure-store's own rules (the plugin is run with configureAndroidBackup: false)
// so key and database exclusions live in one place. Only shared preferences are backed up, minus
// the SecureStore file. The include allowlist implicitly excludes databases (ADR 0022).
// Do not add database exclusions: Android lint rejects exclusions outside included paths.
const backupRules = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <include domain="sharedpref" path="."/>
  <exclude domain="sharedpref" path="SecureStore"/>
</full-backup-content>
`;

const extractionRules = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <include domain="sharedpref" path="."/>
    <exclude domain="sharedpref" path="SecureStore"/>
  </cloud-backup>
  <device-transfer>
    <include domain="sharedpref" path="."/>
    <exclude domain="sharedpref" path="SecureStore"/>
  </device-transfer>
</data-extraction-rules>
`;

/** Excludes the local database and the SecureStore key from Android Auto Backup and transfer. */
module.exports = function withLocalDatabaseBackupRules(config) {
  config = withAndroidManifest(config, (c) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    app.$["android:fullBackupContent"] = `@xml/${BACKUP_RULES}`;
    app.$["android:dataExtractionRules"] = `@xml/${EXTRACTION_RULES}`;
    return c;
  });
  return withDangerousMod(config, [
    "android",
    (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, "app/src/main/res/xml");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${BACKUP_RULES}.xml`), backupRules);
      fs.writeFileSync(path.join(dir, `${EXTRACTION_RULES}.xml`), extractionRules);
      return c;
    },
  ]);
};
