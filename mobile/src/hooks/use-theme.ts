import { Colors } from '../constants/theme';
import { useTheme as useAppTheme } from '../context/ThemeContext';

export function useTheme() {
  const { isDark } = useAppTheme();
  return Colors[isDark ? 'dark' : 'light'];
}
