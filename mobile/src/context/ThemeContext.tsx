import React, { createContext, useState, useContext } from 'react';
import { useColorScheme } from 'react-native';

// Define the color dictionary for the theme
type ThemeColors = {
  background: string;
  card: string;
  text: string;
  primary: string;
  border: string;
  subtext: string;
};

// Define the Context type
type ThemeContextType = {
  isDark: boolean;
  toggleTheme: () => void;
  colors: ThemeColors;
};

// Create the Theme Context
export const ThemeContext = createContext<ThemeContextType>({} as ThemeContextType);

// Create the Provider wrapper
export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  // Fetch the system's default color scheme
  const systemColorScheme = useColorScheme();
  
  // Allow users to manually override the system setting
  const [isDark, setIsDark] = useState<boolean>(systemColorScheme === 'dark');

  const toggleTheme = () => setIsDark(!isDark);

  // Cyberpunk Dark vs. Clinical Light palettes
  const colors: ThemeColors = isDark ? {
    background: '#0a0a0a',
    card: '#121212',
    text: '#ffffff',
    primary: '#00ffcc', // Fluorescent Cyan
    border: '#222222',
    subtext: '#888888',
  } : {
    background: '#f8f9fa',
    card: '#ffffff',
    text: '#1a1a1a',
    primary: '#000000',
    border: '#e0e0e0',
    subtext: '#6c757d',
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

// Export a custom hook for easy color extraction across screens
export const useTheme = () => useContext(ThemeContext);