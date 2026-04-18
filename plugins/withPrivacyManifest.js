/**
 * Expo Config Plugin — PrivacyInfo.xcprivacy
 *
 * Apple has required privacy manifests for all App Store submissions since May 2024.
 * This plugin writes PrivacyInfo.xcprivacy into the iOS project during EAS Build.
 *
 * Declared API types (required for React Native + expo-av + Zustand):
 *
 *   NSPrivacyAccessedAPICategoryFileTimestamp (C617.1)
 *     → React Native reads file timestamps within the app container for module loading.
 *
 *   NSPrivacyAccessedAPICategoryUserDefaults (CA92.1)
 *     → expo-av and React Native use NSUserDefaults to persist app-own settings.
 *
 *   NSPrivacyAccessedAPICategorySystemBootTime (35F9.1)
 *     → React Native runtime uses mach_absolute_time for elapsed-time measurements.
 *
 * Privacy posture:
 *   NSPrivacyTracking: false            — UNS never tracks users
 *   NSPrivacyTrackingDomains: []        — no tracking domains
 *   NSPrivacyCollectedDataTypes: []     — all processing is on-device only
 */

'use strict';

const { withDangerousMod } = require('@expo/config-plugins');
const fs   = require('fs');
const path = require('path');

const PRIVACY_MANIFEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyTrackingDomains</key>
  <array/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array/>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>C617.1</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>CA92.1</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategorySystemBootTime</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>35F9.1</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
`;

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 * @returns {import('@expo/config-plugins').ExpoConfig}
 */
const withPrivacyManifest = (config) =>
  withDangerousMod(config, [
    'ios',
    (modConfig) => {
      const iosDir     = modConfig.modRequest.platformProjectRoot;
      const projectName = modConfig.modRequest.projectName;
      const targetDir  = path.join(iosDir, projectName);

      // platformProjectRoot is guaranteed to exist at build time
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const dest = path.join(targetDir, 'PrivacyInfo.xcprivacy');
      fs.writeFileSync(dest, PRIVACY_MANIFEST_XML, 'utf-8');
      console.log(`[withPrivacyManifest] Wrote ${dest}`);

      return modConfig;
    },
  ]);

module.exports = withPrivacyManifest;
