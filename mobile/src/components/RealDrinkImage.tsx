import React, { useState, useEffect } from 'react';
import { View, Image, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext'; // Corrected relative path

interface RealDrinkImageProps {
  drinkName: string;
  size?: number;
}

export default function RealDrinkImage({ drinkName, size = 150 }: RealDrinkImageProps) {
  const { colors, isDark } = useTheme();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Early exit if no drink name is provided
    if (!drinkName) {
      setLoading(false);
      return;
    }

    const fetchRealImage = async () => {
      try {
        // Fetch real image from TheCocktailDB public API
        const response = await fetch(`https://www.thecocktaildb.com/api/json/v1/1/search.php?s=${encodeURIComponent(drinkName)}`);
        const data = await response.json();

        // Extract high-resolution image URL (strDrinkThumb) if found
        if (data && data.drinks && data.drinks.length > 0) {
          setImageUrl(data.drinks[0].strDrinkThumb);
        } else {
          setImageUrl(null); // Fallback for custom or obscure recipes
        }
      } catch (error) {
        console.error("Failed to fetch real image:", error);
        setImageUrl(null);
      } finally {
        setLoading(false);
      }
    };

    fetchRealImage();
  }, [drinkName]);

  // 1. Loading State
  if (loading) {
    return (
      <View style={[styles.container, { width: size, height: size, backgroundColor: colors.card, borderColor: colors.border }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // 2. Success State: Image Found
  if (imageUrl) {
    return (
      <Image 
        source={{ uri: imageUrl }} 
        style={[styles.container, { width: size, height: size, borderColor: colors.border }]} 
      />
    );
  }

  // 3. Fallback State: Graceful degradation for missing assets
  return (
    <View style={[styles.container, { width: size, height: size, backgroundColor: colors.card, borderColor: colors.border }]}>
      <Ionicons name="image-outline" size={size * 0.3} color={colors.subtext} opacity={0.5} />
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