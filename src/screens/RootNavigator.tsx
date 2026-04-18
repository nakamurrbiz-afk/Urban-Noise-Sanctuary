import React, { useEffect } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, AppState, AppStateStatus } from 'react-native';

import SanctuaryScreen from './SanctuaryScreen';
import WeeklySummaryScreen from './WeeklySummaryScreen';
import SettingsScreen from './SettingsScreen';
import OnboardingScreen from './OnboardingScreen';

import { useUNSStore } from '../store';
import { COLORS, TYPOGRAPHY } from '../constants/theme';
import { hrvEngine } from '../engines/HRVEngine';
import { sanctuaryOrchestrator } from '../engines/SanctuaryOrchestrator';
import { getNextEventTitle } from '../engines/ContextEngine';
import { initPurchases, checkIsPremium } from '../engines/PurchaseEngine';

const Tab = createBottomTabNavigator();

const UNSTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: COLORS.bg,
    card: COLORS.bgSecondary,
    border: COLORS.bgCard,
    text: COLORS.textPrimary,
    primary: COLORS.shieldCore,
    notification: COLORS.shieldCore,
  },
};

function TabIcon({ symbol, focused, color }: { symbol: string; focused: boolean; color: string }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: focused ? 18 : 15, color }}>{symbol}</Text>
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: {
          backgroundColor: COLORS.bgSecondary,
          borderTopColor: COLORS.bgCard,
          borderTopWidth: 0.5,
          height: 80,
          paddingBottom: 20,
        },
        tabBarActiveTintColor: COLORS.shieldCore,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarLabelStyle: { ...TYPOGRAPHY.caption, letterSpacing: 0.5 },
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Sanctuary"
        component={SanctuaryScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabIcon symbol="◉" focused={focused} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="週次レポート"
        component={WeeklySummaryScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabIcon symbol="⟡" focused={focused} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="設定"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabIcon symbol="⚙" focused={focused} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// ─── Engine orchestrator ─────────────────────────────────────────────────────
// Requests HealthKit permissions and refreshes HRV after onboarding completes.
// HRV is refreshed every time the app comes to foreground (AppState change)
// so condition scores stay fresh without draining battery in background.
function useEngineOrchestrator(onboardingComplete: boolean) {
  useEffect(() => {
    if (!onboardingComplete) return;

    // Initialize RevenueCat (synchronous) and verify premium status
    initPurchases();
    checkIsPremium().then((premium) => {
      useUNSStore.getState().setIsPremium(premium);
    });

    // Request HealthKit permissions and do initial HRV refresh
    const initHRV = async () => {
      await hrvEngine.requestPermissions();
      const { count } = await getNextEventTitle();
      await hrvEngine.refresh(count);
    };
    initHRV();

    // Start Mind Weather golden-window monitoring
    sanctuaryOrchestrator.start();

    // Re-fetch HRV + re-verify premium on every app foreground
    const handleAppState = async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const { count } = await getNextEventTitle();
        await hrvEngine.refresh(count);
        // Re-check premium in case user subscribed/cancelled outside the app
        const premium = await checkIsPremium();
        useUNSStore.getState().setIsPremium(premium);
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);

    return () => {
      sub.remove();
      sanctuaryOrchestrator.stop();
    };
  }, [onboardingComplete]);
}

export default function RootNavigator() {
  const { onboardingComplete, _hasHydrated } = useUNSStore();

  useEngineOrchestrator(onboardingComplete);

  // Show blank dark screen while AsyncStorage is loading persisted state.
  // This prevents the onboarding-flash bug (showing OnboardingScreen for ~50ms
  // before the store discovers onboardingComplete === true from storage).
  if (!_hasHydrated) {
    return <View style={{ flex: 1, backgroundColor: COLORS.bg }} />;
  }

  return (
    <NavigationContainer theme={UNSTheme}>
      {onboardingComplete ? <MainTabs /> : <OnboardingScreen />}
    </NavigationContainer>
  );
}
