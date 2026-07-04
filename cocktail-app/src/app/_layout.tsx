import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeProvider, useTheme } from '../context/ThemeContext';

// Internal navigation bar component, responsible for dynamic color reading
function RootLayoutNav() {
  const { isDark, colors, toggleTheme } = useTheme();
  const router = useRouter(); 
  
  // 🌟 Safe back logic: prevent freezing on refresh
  const handleSafeBack = () => {
    if (router.canGoBack()) {
      router.back(); // Normally return to the previous page
    } else {
      router.replace('/(tabs)'); // Force redirect to home when history is lost
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
        
        {/* Physics Lab detailed simulation modal */}
        <Stack.Screen 
          name="recipe/[id]" 
          options={{ 
            presentation: 'modal', 
            headerShown: true,
            headerTitle: 'Physics Lab',
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
            // 🌟 Inject safe back function
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

// Root component: wrap ThemeProvider at the outermost layer
export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutNav />
    </ThemeProvider>
  );
}