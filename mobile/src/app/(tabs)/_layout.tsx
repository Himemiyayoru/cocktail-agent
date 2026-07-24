import { Tabs } from 'expo-router';
import { View, TouchableOpacity } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// ==========================================
// Geometric Heart Icon (Exclusive to SAVED tab)
// ==========================================
const MolecularHeartIcon = ({ color, focused }: { color: string; focused: boolean }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill={focused ? color : "none"}>
    <Path
      d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

// ==========================================
// High-quality Custom SVG Icons (Other Tabs)
// ==========================================
const SvgIcon = ({ name, color, size = 24 }: { name: string, color: string, size?: number }) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {name === 'library' && (
        <>
          <Rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <Path d="M3 9h18 M9 22V9" />
        </>
      )}
      {name === 'lab' && (
        <>
          <Path d="M9 3h6 M10 3v5l-4 8a2 2 0 001.7 3h10.6a2 2 0 001.7-3l-4-8V3" />
        </>
      )}
      {name === 'search' && (
        <>
          <Circle cx="11" cy="11" r="8" />
          <Path d="M21 21l-4.3-4.3" />
        </>
      )}
      {name === 'bob' && (
        <>
          <Rect x="3" y="11" width="18" height="10" rx="2" />
          <Circle cx="9" cy="15" r="1" fill={color} />
          <Circle cx="15" cy="15" r="1" fill={color} />
          <Path d="M12 11V7a2 2 0 00-2-2H8" />
        </>
      )}
    </Svg>
  );
};

// ==========================================
// Bottom Tab Navigator Configuration
// ==========================================
export default function TabLayout() {
  const { colors, isDark, toggleTheme } = useTheme();
  const themePrimary = isDark ? colors.primary : '#111111';
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: themePrimary,
          tabBarInactiveTintColor: colors.subtext,
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            height: 65 + insets.bottom,
            paddingBottom: 10 + insets.bottom,
            paddingTop: 10,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: 'bold',
            letterSpacing: 0.5,
            marginTop: 4,
            fontFamily: 'monospace',
          }
        }}
      >
        <Tabs.Screen name="library" options={{ title: 'LIBRARY', tabBarIcon: ({ color }) => <SvgIcon name="library" color={color} /> }} />
        <Tabs.Screen name="lab" options={{ title: 'MY CABINET', tabBarIcon: ({ color }) => <SvgIcon name="lab" color={color} /> }} />
        <Tabs.Screen name="search" options={{ title: 'SEARCH', tabBarIcon: ({ color }) => <SvgIcon name="search" color={color} /> }} />
        <Tabs.Screen name="bob" options={{ title: 'ASK BOB', tabBarIcon: ({ color }) => <SvgIcon name="bob" color={color} /> }} />
        
        <Tabs.Screen 
          name="saved" 
          options={{ 
            title: 'SAVED', 
            tabBarIcon: ({ color, focused }) => <MolecularHeartIcon color={color} focused={focused} /> 
          }} 
        />
      </Tabs>

      {/* Floating Global Theme Toggle Button */}
      <TouchableOpacity
        style={{
          position: 'absolute',
          top: insets.top + 10,
          right: 20,
          zIndex: 999,
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.card,
          justifyContent: 'center',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 3,
          elevation: 3
        }}
        onPress={toggleTheme}
      >
        <Ionicons name={isDark ? "sunny" : "moon"} size={20} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}