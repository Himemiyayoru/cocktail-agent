import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import * as SplashScreen from 'expo-splash-screen'; 
import { useCallback, useState } from 'react';
import { StartupSplash } from '../components/StartupSplash';

// Prevent the splash screen from auto-hiding until manually triggered
void SplashScreen.preventAutoHideAsync().catch(() => {});

function RootLayoutNav() {
  const { isDark, colors, toggleTheme } = useTheme();
  const router = useRouter(); 
  
  // Safe back navigation: prevents application freeze if navigation history is empty
  const handleSafeBack = () => {
    if (router.canGoBack()) {
      router.back(); 
    } else {
      router.replace('/(tabs)/library');
    }
  };

  return (
    <>
      <Stack 
        screenOptions={{ 
          headerShown: false,
          contentStyle: { backgroundColor: colors.background } 
        }}
      >
        <Stack.Screen name="(tabs)" />
        
        {/* Physics Lab Modal Configuration */}
        <Stack.Screen 
          name="recipe/[id]" 
          options={{ 
            presentation: 'modal', 
            headerShown: true,
            headerTitle: 'Recipe Studio',
            headerStyle: { backgroundColor: colors.card },
            headerTintColor: colors.primary,
            headerRight: () => (
              <TouchableOpacity onPress={toggleTheme} style={{ marginRight: 15 }}>
                <Ionicons 
                  name={isDark ? "sunny" : "moon"} 
                  size={24} 
                  color={colors.primary} 
                />
              </TouchableOpacity>
            ),
            headerLeft: () => (
              <TouchableOpacity onPress={handleSafeBack} style={{ marginLeft: 15, flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="chevron-back" size={24} color={colors.primary} />
              </TouchableOpacity>
            ),
          }} 
        />
      </Stack>
      <StatusBar style={isDark ? "light" : "dark"} />
    </>
  );
}

export default function RootLayout() {
  const [appReady, setAppReady] = useState(false);
  const [startupComplete, setStartupComplete] = useState(false);
  const finishStartup = useCallback(() => setStartupComplete(true), []);

  return (
    <ThemeProvider>
      <View style={{ flex: 1 }} onLayout={() => setAppReady(true)}>
        <RootLayoutNav />
        {!startupComplete && <StartupSplash ready={appReady} onFinish={finishStartup} />}
      </View>
    </ThemeProvider>
  );
}
