/**
 * Expo Config Plugin — HealthKit entitlement
 *
 * react-native-health requires the com.apple.developer.healthkit entitlement
 * in the iOS app's .entitlements file. Expo managed workflow doesn't include
 * this by default, so we inject it here at EAS Build time.
 *
 * The permission strings (NSHealthShareUsageDescription, NSHealthUpdateUsageDescription)
 * are already declared in app.json → expo.ios.infoPlist.
 *
 * Reference: https://developer.apple.com/documentation/healthkit/setting_up_healthkit
 */

'use strict';

const { withEntitlementsPlist } = require('@expo/config-plugins');

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 * @returns {import('@expo/config-plugins').ExpoConfig}
 */
const withHealthKit = (config) =>
  withEntitlementsPlist(config, (modConfig) => {
    // Required: enables HealthKit capability in the app target
    modConfig.modResults['com.apple.developer.healthkit'] = true;

    // Required: declares which HealthKit object types the app reads/writes.
    // Empty arrays are valid — react-native-health handles type registration at runtime
    // via initHealthKit(). Apple requires this key when the entitlement is set.
    if (!modConfig.modResults['com.apple.developer.healthkit.access']) {
      modConfig.modResults['com.apple.developer.healthkit.access'] = [];
    }

    console.log('[withHealthKit] HealthKit entitlement added');
    return modConfig;
  });

module.exports = withHealthKit;
