import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export default function TabLayout() {
  // 提取动态颜色和切换函数
  const { colors, isDark, toggleTheme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.subtext,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        headerStyle: {
          backgroundColor: colors.card,
        },
        headerTintColor: colors.text,
        // 🌟 神奇的日月切换开关，放在导航栏右上角
        headerRight: () => (
          <TouchableOpacity onPress={toggleTheme} style={{ marginRight: 20 }}>
            <Ionicons 
              name={isDark ? "sunny" : "moon"} 
              size={24} 
              color={colors.primary} 
            />
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Classics',
          tabBarIcon: ({ color }) => <Ionicons name="wine" size={24} color={color} />,
          headerTitle: 'Featured Recipes',
        }}
      />
      
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'My Bar',
          tabBarIcon: ({ color }) => <Ionicons name="flask" size={24} color={color} />,
          headerTitle: 'Inventory Matcher',
        }}
      />

      <Tabs.Screen
        name="bob"
        options={{
          title: 'Ask Bob',
          tabBarIcon: ({ color }) => <Ionicons name="chatbubbles" size={24} color={color} />,
          headerTitle: 'Chat with Bob',
        }}
      />
    </Tabs>
  );
}