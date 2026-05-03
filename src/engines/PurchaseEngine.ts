/**
 * UNS Purchase Engine — RevenueCat wrapper
 *
 * Freemium model:
 *   Free  : 30 minutes of Sanctuary per calendar month
 *   Premium: ¥680/月 (unlimited + future features)
 *
 * Setup checklist (one-time, before production build):
 *   1. Create a RevenueCat account: https://app.revenuecat.com
 *   2. Add your iOS app (Bundle ID: com.ryotanakamura.sanctuary)
 *   3. Create a monthly subscription in App Store Connect:
 *        Product ID: sanctuary_monthly
 *        Price: ¥680 (Tier 8 JPY)
 *   4. In RevenueCat dashboard:
 *        a. Create Entitlement: "sanctuary_premium"
 *        b. Create Offering: "default"
 *        c. Create Package (Monthly) → attach sanctuary_monthly product
 *   5. Copy the iOS Public SDK key from RevenueCat → replace REVENUECAT_API_KEY_IOS below
 *
 * Free tier mechanics:
 *   - Consumption tracked via sessionHistory (persisted in Zustand store)
 *   - Counter resets on the 1st of each calendar month (no server needed)
 *   - Premium status cached locally; re-verified from RevenueCat on each launch
 */

import Purchases from 'react-native-purchases';
import type { PurchasesPackage } from 'react-native-purchases';
import { Platform } from 'react-native';
import type { SanctuarySession } from '../types';

// ─── Configuration ────────────────────────────────────────────────────────────
const REVENUECAT_API_KEY_IOS = 'appl_GmtYsZjXKPThtiggAHgESKaAasW';

export const ENTITLEMENT_ID          = 'sanctuary_premium';
export const MONTHLY_FREE_LIMIT_MS   = 30 * 60 * 1000;  // 30 minutes

// ─── Free tier helpers ────────────────────────────────────────────────────────

/**
 * Total Sanctuary duration in the current calendar month (ms).
 * Sessions are attributed to the month of their startedAt timestamp.
 * A session that spans midnight on the last day of the month is fully
 * counted in the starting month — this is intentional (matches billing norms).
 */
export function getThisMonthUsageMs(sessions: SanctuarySession[]): number {
  const now        = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return sessions
    .filter((s) => s.startedAt >= monthStart)
    .reduce((sum, s) => sum + s.durationMs, 0);
}

/** True when monthly usage has reached or exceeded the free limit. */
export function isFreeTierExhausted(sessions: SanctuarySession[]): boolean {
  return getThisMonthUsageMs(sessions) >= MONTHLY_FREE_LIMIT_MS;
}

/** Remaining free minutes this month (0 if exhausted or premium). */
export function remainingFreeMinutes(sessions: SanctuarySession[]): number {
  const usedMs   = getThisMonthUsageMs(sessions);
  const remaining = MONTHLY_FREE_LIMIT_MS - usedMs;
  return Math.max(0, Math.floor(remaining / 60_000));
}

// ─── RevenueCat lifecycle ─────────────────────────────────────────────────────

/**
 * Call once at app startup (RootNavigator).
 * Safe to call even if the API key is a placeholder — configure() is synchronous
 * and will not throw. Network failures are caught in subsequent async calls.
 */
export function initPurchases(): void {
  if (Platform.OS !== 'ios') return;
  try {
    if (__DEV__) {
      Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
    }
    Purchases.configure({ apiKey: REVENUECAT_API_KEY_IOS });
  } catch (err) {
    console.warn('[PurchaseEngine] configure failed:', err);
  }
}

/**
 * Verify premium status from RevenueCat servers.
 * Returns false on network error (fail-open — don't block paying users).
 */
export async function checkIsPremium(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return !!customerInfo.entitlements.active[ENTITLEMENT_ID];
  } catch {
    return false;
  }
}

/**
 * Fetch the current monthly package from RevenueCat offerings.
 * Returns null if offerings are unavailable (network error or misconfigured).
 */
export async function getMonthlyPackage(): Promise<PurchasesPackage | null> {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current?.monthly ?? null;
  } catch {
    return null;
  }
}

/**
 * Purchase the monthly package.
 *
 * @returns true  — purchase succeeded, user is now premium
 * @returns false — user cancelled (not an error, no throw)
 * @throws         on network error or StoreKit failure
 */
export async function purchaseMonthly(pkg: PurchasesPackage): Promise<boolean> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return !!customerInfo.entitlements.active[ENTITLEMENT_ID];
}

/**
 * Restore previous purchases (required by App Store guidelines).
 * Call from Settings → 以前の購入を復元.
 */
export async function restorePurchases(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    return !!customerInfo.entitlements.active[ENTITLEMENT_ID];
  } catch {
    return false;
  }
}
