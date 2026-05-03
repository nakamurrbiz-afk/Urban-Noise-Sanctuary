/**
 * patch-expo-av.js — postinstall script
 *
 * expo-av@16.0.x references several legacy headers/functions that were removed
 * in expo-modules-core@55. This script patches each affected file directly.
 *
 * Replace patches (swap old import for inline definition):
 *   1. expo-av/ios/EXAV/EXAV.h
 *      EXEventEmitter.h → inline @protocol EXEventEmitter
 *   2. expo-av/ios/EXAV/Video/EXVideoView.h
 *      EXLegacyExpoViewProtocol.h → inline @protocol EXLegacyExpoViewProtocol
 *   3. expo-av/ios/EXAV/EXAV.m
 *      EXEventEmitterService.h → inline @protocol EXEventEmitterService
 *   4. expo-av/ios/EXAV/EXAVTV.m
 *      EXEventEmitterService.h → inline @protocol EXEventEmitterService
 *
 * Append patch (add missing functions to expo-modules-core header):
 *   5. expo-modules-core/ios/EXDefines.h
 *      Appends static inline EXErrorWithMessage() + EXFatal()
 *      (used by EXAV.m, EXAVTV.m, EXAVPlayerData.m, EXAudioRecordingPermissionRequester.m)
 *
 * Can be removed when expo-av is updated to use the new EventEmitter API.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const EXAV_ROOT = path.join(__dirname, '..', 'node_modules', 'expo-av', 'ios', 'EXAV');
const EMC_ROOT  = path.join(__dirname, '..', 'node_modules', 'expo-modules-core', 'ios');

// ---------------------------------------------------------------------------
// Replace patches: swap OLD import string for NEW inline definition
// ---------------------------------------------------------------------------

const REPLACE_PATCHES = [
  {
    file: path.join(EXAV_ROOT, 'EXAV.h'),
    old: '#import <ExpoModulesCore/EXEventEmitter.h>',
    new: [
      '// EXEventEmitter.h was removed in ExpoModulesCore 55.',
      '// Protocol defined inline by scripts/patch-expo-av.js',
      '@protocol EXEventEmitter <NSObject>',
      '- (NSArray<NSString *> *)supportedEvents;',
      '- (void)startObserving;',
      '- (void)stopObserving;',
      '@end',
    ].join('\n'),
  },
  {
    file: path.join(EXAV_ROOT, 'Video', 'EXVideoView.h'),
    old: '#import <ExpoModulesCore/EXLegacyExpoViewProtocol.h>',
    new: [
      '// EXLegacyExpoViewProtocol.h was removed in ExpoModulesCore 55.',
      '// Protocol defined inline by scripts/patch-expo-av.js',
      '@protocol EXLegacyExpoViewProtocol <NSObject>',
      '@optional',
      '@property (nonatomic, weak) id appContext;',
      '- (instancetype)initWithAppContext:(id)appContext;',
      '@end',
    ].join('\n'),
  },
  {
    file: path.join(EXAV_ROOT, 'EXAV.m'),
    old: '#import <ExpoModulesCore/EXEventEmitterService.h>',
    new: [
      '// EXEventEmitterService.h was removed in ExpoModulesCore 55.',
      '// Protocol defined inline by scripts/patch-expo-av.js',
      '@protocol EXEventEmitterService <NSObject>',
      '- (void)sendEventWithName:(NSString * _Nonnull)eventName body:(id _Nullable)body;',
      '@end',
    ].join('\n'),
  },
  {
    file: path.join(EXAV_ROOT, 'EXAVTV.m'),
    old: '#import <ExpoModulesCore/EXEventEmitterService.h>',
    new: [
      '// EXEventEmitterService.h was removed in ExpoModulesCore 55.',
      '// Protocol defined inline by scripts/patch-expo-av.js',
      '@protocol EXEventEmitterService <NSObject>',
      '- (void)sendEventWithName:(NSString * _Nonnull)eventName body:(id _Nullable)body;',
      '@end',
    ].join('\n'),
  },
];

// ---------------------------------------------------------------------------
// Append patches: add content to end of file if marker is absent
// ---------------------------------------------------------------------------

const APPEND_PATCHES = [
  {
    file: path.join(EMC_ROOT, 'EXDefines.h'),
    // Unique marker to detect if already patched
    marker: '// patch-expo-av: EXFatal/EXErrorWithMessage shims',
    content: [
      '',
      '// patch-expo-av: EXFatal/EXErrorWithMessage shims',
      '// EXFatal and EXErrorWithMessage were removed in ExpoModulesCore 55.',
      '// expo-av 16.0.x still calls them; these static inlines restore compatibility.',
      '#import <Foundation/Foundation.h>',
      'static inline NSError *EXErrorWithMessage(NSString *message) {',
      '  return [NSError errorWithDomain:@"EXCore" code:0',
      '                       userInfo:@{NSLocalizedDescriptionKey: message}];',
      '}',
      'static inline void EXFatal(NSError *error) {',
      '  NSLog(@"[expo-av] Fatal: %@", error.localizedDescription);',
      '}',
    ].join('\n'),
  },
  {
    file: path.join(EMC_ROOT, 'EXDefines.h'),
    // Unique marker to detect if already patched
    marker: '// patch-expo-av: EXLog shims',
    content: [
      '',
      '// patch-expo-av: EXLog shims',
      '// EXLogInfo/EXLogWarn/EXLogError were removed in ExpoModulesCore 55.',
      '// expo-av 16.0.x (EXAVPlayerData.m) still calls them.',
      '#ifndef EXLogInfo',
      '#define EXLogInfo(format, ...)  NSLog(@"[expo:info] "  format, ##__VA_ARGS__)',
      '#endif',
      '#ifndef EXLogWarn',
      '#define EXLogWarn(format, ...)  NSLog(@"[expo:warn] "  format, ##__VA_ARGS__)',
      '#endif',
      '#ifndef EXLogError',
      '#define EXLogError(format, ...) NSLog(@"[expo:error] " format, ##__VA_ARGS__)',
      '#endif',
    ].join('\n'),
  },
  {
    file: path.join(EMC_ROOT, 'EXDefines.h'),
    // Unique marker to detect if already patched
    marker: '// patch-expo-av: UMPromise typedefs',
    content: [
      '',
      '// patch-expo-av: UMPromise typedefs',
      '// UMPromiseResolveBlock/UMPromiseRejectBlock are the old unimodules names.',
      '// expo-av 16.0.x (EXAV.m, EXAVTV.m) still uses them; alias to the EX versions.',
      '#ifndef UMPromiseResolveBlock',
      'typedef EXPromiseResolveBlock UMPromiseResolveBlock;',
      '#endif',
      '#ifndef UMPromiseRejectBlock',
      'typedef EXPromiseRejectBlock UMPromiseRejectBlock;',
      '#endif',
    ].join('\n'),
  },
];

// ---------------------------------------------------------------------------
// Apply replace patches
// ---------------------------------------------------------------------------

let anyMissing = false;

for (const patch of REPLACE_PATCHES) {
  const label = path.relative(path.join(__dirname, '..', 'node_modules'), patch.file);

  if (!fs.existsSync(patch.file)) {
    console.warn(`[patch-expo-av] ${label} not found — skipping.`);
    anyMissing = true;
    continue;
  }

  let content = fs.readFileSync(patch.file, 'utf-8');

  if (content.includes(patch.new.split('\n')[0])) {
    console.log(`[patch-expo-av] ${label} already patched, skipping.`);
    continue;
  }

  if (!content.includes(patch.old)) {
    console.log(`[patch-expo-av] ${label}: expected import not found — may already be patched.`);
    continue;
  }

  content = content.replace(patch.old, patch.new);
  fs.writeFileSync(patch.file, content, 'utf-8');
  console.log(`[patch-expo-av] Patched ${label}`);
}

// ---------------------------------------------------------------------------
// Apply append patches
// ---------------------------------------------------------------------------

for (const patch of APPEND_PATCHES) {
  const label = path.relative(path.join(__dirname, '..', 'node_modules'), patch.file);

  if (!fs.existsSync(patch.file)) {
    console.warn(`[patch-expo-av] ${label} not found — skipping.`);
    anyMissing = true;
    continue;
  }

  const content = fs.readFileSync(patch.file, 'utf-8');

  if (content.includes(patch.marker)) {
    console.log(`[patch-expo-av] ${label} already patched, skipping.`);
    continue;
  }

  fs.writeFileSync(patch.file, content + patch.content, 'utf-8');
  console.log(`[patch-expo-av] Appended shims to ${label}`);
}

if (anyMissing) {
  console.warn('[patch-expo-av] Some files were missing — expo-av package structure may have changed.');
}
