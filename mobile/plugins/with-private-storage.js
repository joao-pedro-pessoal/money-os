const { withAppDelegate, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');
module.exports = function withPrivateStorage(config) {
  config = withAppDelegate(config, config => {
    const marker = '// Money OS: user-controlled backups only';
    if (!config.modResults.contents.includes(marker)) {
      const anchor = /((?:public )?override func application\([\s\S]*?didFinishLaunchingWithOptions[\s\S]*?\) -> Bool \{)/;
      if (!anchor.test(config.modResults.contents)) throw new Error('AppDelegate changed; review the backup exclusion before building.');
      config.modResults.contents = config.modResults.contents.replace(anchor, `$1
    ${marker}
    do {
      var documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      try FileManager.default.createDirectory(at: documents, withIntermediateDirectories: true)
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try documents.setResourceValues(values)
    } catch {
      fatalError("Could not enforce local-only storage")
    }
`);
    }
    return config;
  });
  config = withAndroidManifest(config, config => {
    const app = config.modResults.manifest.application[0].$;
    app['android:allowBackup'] = 'false';
    app['android:fullBackupContent'] = '@xml/moneyos_backup_rules';
    app['android:dataExtractionRules'] = '@xml/moneyos_extraction_rules';
    return config;
  });
  return withDangerousMod(config, ['android', async config => {
    const dir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    await fs.mkdir(dir, { recursive: true });
    const excludes = ['root', 'file', 'database', 'sharedpref', 'external', 'device_root', 'device_file', 'device_database', 'device_sharedpref']
      .map(domain => `<exclude domain="${domain}" path="." />`).join('\n');
    await fs.writeFile(path.join(dir, 'moneyos_backup_rules.xml'), `<full-backup-content>${excludes}</full-backup-content>`);
    await fs.writeFile(path.join(dir, 'moneyos_extraction_rules.xml'), `<data-extraction-rules><cloud-backup>${excludes}</cloud-backup><device-transfer>${excludes}</device-transfer></data-extraction-rules>`);
    return config;
  }]);
};
