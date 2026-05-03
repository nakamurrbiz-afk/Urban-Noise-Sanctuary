/**
 * expo-haptics モック
 *
 * Haptics の各関数をモックし、Jest 上でネイティブ触覚フィードバック
 * なしにテストできるようにする。
 */

export const selectionAsync = jest.fn().mockResolvedValue(undefined);
export const impactAsync = jest.fn().mockResolvedValue(undefined);
export const notificationAsync = jest.fn().mockResolvedValue(undefined);

export const ImpactFeedbackStyle = {
  Light: 'light',
  Medium: 'medium',
  Heavy: 'heavy',
} as const;

export const NotificationFeedbackType = {
  Success: 'success',
  Warning: 'warning',
  Error: 'error',
} as const;
