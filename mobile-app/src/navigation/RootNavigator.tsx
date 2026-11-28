import React from 'react';
import { KeyboardAvoidingView, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Briefcase, Compass, FileText, House, LayoutDashboard, LucideIcon, User, Wallet } from 'lucide-react-native';
import T from '../components/T';
import { Tap } from '../components/ui';
import { colors } from '../theme';
import * as A from '../screens/auth';
import * as C from '../screens/client';
import * as X from '../screens/services';
import * as V from '../screens/advocate';
import * as S from '../screens/shared';
import { tr, useLang } from '../i18n';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg } };

const ICONS: Record<string, LucideIcon> = {
  Home: House,
  Explore: Compass,
  Requests: FileText,
  Wallet: Wallet,
  Profile: User,
  Dashboard: LayoutDashboard,
  Cases: Briefcase,
  AdvWallet: Wallet,
  AdvProfile: User,
};
const LABELS: Record<string, string> = {
  Home: 'Home',
  Explore: 'Explore',
  Requests: 'Requests',
  Wallet: 'Wallet',
  Profile: 'Profile',
  Dashboard: 'Dashboard',
  Cases: 'Cases',
  AdvWallet: 'Wallet',
  AdvProfile: 'Profile',
};

/** Flat tab bar with a hairline top border and a gold marker on the active tab (canvas rule 4). */
function TabBar({ state, navigation }: BottomTabBarProps) {
  useLang();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line, paddingBottom: Math.max(insets.bottom, 8) }}>
      {state.routes.map((r, i) => {
        const on = state.index === i;
        const Icon = ICONS[r.name] ?? House;
        return (
          <Tap
            key={r.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tr(LABELS[r.name])}
            onPress={() => {
              const e = navigation.emit({ type: 'tabPress', target: r.key, canPreventDefault: true });
              if (!on && !e.defaultPrevented) navigation.navigate(r.name);
            }}
            style={{ flex: 1, alignItems: 'center', paddingTop: 9, paddingBottom: 4, gap: 3 }}>
            {on ? <View style={{ position: 'absolute', top: 0, width: 28, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: colors.gold }} /> : null}
            <Icon size={22} color={on ? colors.ink : colors.muted} strokeWidth={on ? 2.4 : 2} />
            <T size={11} w={on ? 'bold' : 'medium'} color={on ? colors.ink : colors.muted}>
              {LABELS[r.name]}
            </T>
          </Tap>
        );
      })}
    </View>
  );
}

const renderTabBar = (p: BottomTabBarProps) => <TabBar {...p} />;

function KeyboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      {children}
    </KeyboardAvoidingView>
  );
}

function ClientTabs() {
  return (
    <Tabs.Navigator screenOptions={{ headerShown: false }} tabBar={renderTabBar}>
      <Tabs.Screen name="Home" component={C.ClientHome} />
      <Tabs.Screen name="Explore" component={C.Explore} />
      <Tabs.Screen name="Requests" component={C.Requests} />
      <Tabs.Screen name="Wallet" component={C.ClientWallet} />
      <Tabs.Screen name="Profile" component={C.ClientProfile} />
    </Tabs.Navigator>
  );
}

function AdvTabs() {
  return (
    <Tabs.Navigator screenOptions={{ headerShown: false }} tabBar={renderTabBar}>
      <Tabs.Screen name="Dashboard" component={V.AdvDashboard} />
      <Tabs.Screen name="Cases" component={V.AdvCases} />
      <Tabs.Screen name="AdvWallet" component={V.AdvWallet} />
      <Tabs.Screen name="AdvProfile" component={V.AdvProfile} />
    </Tabs.Navigator>
  );
}

export default function RootNavigator() {
  return (
    <NavigationContainer theme={theme}>
      {/* The app draws edge to edge, so Android does not resize for the keyboard: every screen keeps its bottom bar above it. */}
      <Stack.Navigator
        screenLayout={KeyboardLayout}
        screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="Splash" component={A.Splash} options={{ animation: 'none' }} />
        <Stack.Screen name="Language" component={A.Language} />
        <Stack.Screen name="Intro" component={A.Intro} />
        <Stack.Screen name="Role" component={A.RoleSelect} />
        <Stack.Screen name="Login" component={A.Login} />
        <Stack.Screen name="Otp" component={A.Otp} />

        <Stack.Screen name="ClientSetup" component={C.ClientSetup} />
        <Stack.Screen name="ClientTabs" component={ClientTabs} options={{ animation: 'fade' }} />
        <Stack.Screen name="Categories" component={C.Categories} />
        <Stack.Screen name="RequestNew" component={C.RequestNew} />
        <Stack.Screen name="RequestSubmitted" component={C.RequestSubmitted} options={{ gestureEnabled: false }} />
        <Stack.Screen name="RequestDetail" component={C.RequestDetail} />
        <Stack.Screen name="Checkout" component={C.Checkout} />
        <Stack.Screen name="PaymentDone" component={C.PaymentDone} options={{ gestureEnabled: false }} />
        <Stack.Screen name="Confirm" component={C.Confirm} />
        <Stack.Screen name="Dispute" component={C.Dispute} />
        <Stack.Screen name="AdvocateProfile" component={C.AdvocateProfile} />
        <Stack.Screen name="Offers" component={C.Offers} />
        <Stack.Screen name="Refer" component={C.Refer} />
        <Stack.Screen name="EditClient" component={C.EditClient} />
        <Stack.Screen name="Challan" component={X.Challan} />
        <Stack.Screen name="ChallanReceipt" component={X.ChallanReceipt} />
        <Stack.Screen name="GstFiling" component={X.GstFiling} />
        <Stack.Screen name="GstDetail" component={X.GstDetail} />
        <Stack.Screen name="Invoices" component={S.Invoices} />

        <Stack.Screen name="AdvDetails" component={V.AdvDetails} />
        <Stack.Screen name="AdvPractice" component={V.AdvPractice} />
        <Stack.Screen name="AdvDoc" component={V.AdvDoc} />
        <Stack.Screen name="AdvReview" component={V.AdvReview} />
        <Stack.Screen name="AdvStatus" component={V.AdvStatus} />
        <Stack.Screen name="Plans" component={V.Plans} />
        <Stack.Screen name="MembershipCard" component={V.MembershipCardScreen} />
        <Stack.Screen name="AdvTabs" component={AdvTabs} options={{ animation: 'fade' }} />
        <Stack.Screen name="CaseDetail" component={V.CaseDetail} />
        <Stack.Screen name="SendQuote" component={V.SendQuote} />
        <Stack.Screen name="Withdraw" component={V.Withdraw} />
        <Stack.Screen name="Bank" component={V.Bank} />
        <Stack.Screen name="AdvDocuments" component={V.AdvDocuments} />

        <Stack.Screen name="Chat" component={S.Chat} />
        <Stack.Screen name="Notifications" component={S.Notifications} />
        <Stack.Screen name="Settings" component={S.Settings} />
        <Stack.Screen name="Help" component={S.Help} />
        <Stack.Screen name="NewTicket" component={S.NewTicket} />
        <Stack.Screen name="Ticket" component={S.Ticket} />
        <Stack.Screen name="Legal" component={S.Legal} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
