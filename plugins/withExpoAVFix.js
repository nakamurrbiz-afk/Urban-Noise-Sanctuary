/**
 * withExpoAVFix — EXEventEmitter.h compatibility shim
 *
 * Problem:
 *   expo-av 16.0.x imports <ExpoModulesCore/EXEventEmitter.h> in EXAV.h.
 *   ExpoModulesCore 55 removed this legacy header, causing the Xcode build to fail:
 *     "'ExpoModulesCore/EXEventEmitter.h' file not found"
 *     "could not build Objective-C module 'EXAV'"
 *
 * Fix:
 *   Write a stub EXEventEmitter.h into expo-modules-core/ios/ before pod install.
 *   ExpoModulesCore.podspec includes all ios/ headers via source_files = 'ios/**\/*.h'
 *   and exposes them as <ExpoModulesCore/...>, so the stub is automatically picked up.
 *
 * Can be removed when expo-av is updated to use the new EventEmitter API.
 */

'use strict';

const { withDangerousMod } = require('@expo/config-plugins');
const fs   = require('fs');
const path = require('path');

const STUB_HEADER = `\
// EXEventEmitter.h — generated compatibility stub
// expo-av 16.0.x references this header which was removed in ExpoModulesCore 55.
// See plugins/withExpoAVFix.js for context.
#pragma once

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@protocol EXEventEmitter <NSObject>

/// Returns the list of event names this module can emit.
- (NSArray<NSString *> *)supportedEvents;

/// Called when the first listener is added.
- (void)startObserving;

/// Called when the last listener is removed.
- (void)stopObserving;

@end

NS_ASSUME_NONNULL_END
`;

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 * @returns {import('@expo/config-plugins').ExpoConfig}
 */
const withExpoAVFix = (config) =>
  withDangerousMod(config, [
    'ios',
    (modConfig) => {
      // modRequest.projectRoot = repo root (where node_modules lives)
      const projectRoot = modConfig.modRequest.projectRoot;
      const destDir  = path.join(
        projectRoot,
        'node_modules',
        'expo-modules-core',
        'ios',
      );
      const destFile = path.join(destDir, 'EXEventEmitter.h');

      if (!fs.existsSync(destFile)) {
        fs.writeFileSync(destFile, STUB_HEADER, 'utf-8');
        console.log('[withExpoAVFix] Wrote EXEventEmitter.h stub →', destFile);
      } else {
        console.log('[withExpoAVFix] EXEventEmitter.h already present, skipping.');
      }

      return modConfig;
    },
  ]);

module.exports = withExpoAVFix;
