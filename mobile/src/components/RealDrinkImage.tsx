import { View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { DrinkPhoto } from './DrinkPhoto';
import { drinkImageUrl } from '../data/catalog';

interface RealDrinkImageProps {
  drinkName: string;
  size?: number;
}

export default function RealDrinkImage({ drinkName, size = 150 }: RealDrinkImageProps) {
  const { colors } = useTheme();
  const imageUrl = drinkImageUrl(drinkName);

  if (imageUrl) {
    return (
      <DrinkPhoto
        name={drinkName}
        preview={false}
        style={[styles.container, { width: size, height: size, borderColor: colors.border }]}
        iconColor={colors.subtext}
        iconSize={size * 0.3}
      />
    );
  }

  return (
    <View style={[styles.container, { width: size, height: size, backgroundColor: colors.card, borderColor: colors.border }]}>
      <Ionicons name="image-outline" size={size * 0.3} color={colors.subtext} />
      <Text style={{ color: colors.subtext, fontSize: size * 0.08, marginTop: 5, textAlign: 'center' }}>
        No Photo
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
});
