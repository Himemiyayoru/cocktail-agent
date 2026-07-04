import React, { createContext, useState, useContext } from 'react';
import { useColorScheme } from 'react-native';

// 定义主题的颜色字典
type ThemeColors = {
  background: string;
  card: string;
  text: string;
  primary: string;
  border: string;
  subtext: string;
};

// 定义 Context 的类型
type ThemeContextType = {
  isDark: boolean;
  toggleTheme: () => void;
  colors: ThemeColors;
};

// 创建 Context
export const ThemeContext = createContext<ThemeContextType>({} as ThemeContextType);

// 创建 Provider 容器
export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  // 获取手机系统的默认主题
  const systemColorScheme = useColorScheme();
  // 允许用户手动覆盖系统设置
  const [isDark, setIsDark] = useState<boolean>(systemColorScheme === 'dark');

  const toggleTheme = () => setIsDark(!isDark);

  // 极客暗黑 (Cyberpunk Dark) vs 临床亮白 (Clinical Light)
  const colors: ThemeColors = isDark ? {
    background: '#0a0a0a',
    card: '#121212',
    text: '#ffffff',
    primary: '#00ffcc', // 荧光青
    border: '#222222',
    subtext: '#888888',
  } : {
    background: '#f8f9fa',
    card: '#ffffff',
    text: '#1a1a1a',
    primary: '#007aff', // 科技蓝
    border: '#e0e0e0',
    subtext: '#6c757d',
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

// 暴露一个 Hook 供所有页面方便地提取颜色
export const useTheme = () => useContext(ThemeContext);