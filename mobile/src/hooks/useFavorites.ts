import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';

export function useFavorites() {
  const [favorites, setFavorites] = useState<number[]>([]);

  const loadFavorites = async () => {
    try {
      const stored = await AsyncStorage.getItem('@cocktail_favorites');
      if (stored) setFavorites(JSON.parse(stored));
    } catch (e) {
      console.error("Failed to load favorites", e);
    }
  };

  // Reload favorite data every time the screen comes into focus to ensure cross-tab synchronization
  useFocusEffect(
    useCallback(() => {
      loadFavorites();
    }, [])
  );

  const toggleFavorite = async (id: number) => {
    try {
      const stored = await AsyncStorage.getItem('@cocktail_favorites');
      let current = stored ? JSON.parse(stored) : [];
      
      if (current.includes(id)) {
        current = current.filter((fid: number) => fid !== id); // Remove from favorites
      } else {
        current.push(id); // Add to favorites
      }
      
      setFavorites(current);
      await AsyncStorage.setItem('@cocktail_favorites', JSON.stringify(current));
    } catch (e) {
      console.error("Failed to save favorite", e);
    }
  };

  return { favorites, toggleFavorite };
}