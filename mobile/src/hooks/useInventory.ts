import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';

export function useInventory() {
  const [inventory, setInventory] = useState<string[]>([]);

  const loadInventory = async () => {
    try {
      const stored = await AsyncStorage.getItem('@cocktail_inventory');
      if (stored) setInventory(JSON.parse(stored));
    } catch (e) {
      console.error("Failed to load inventory", e);
    }
  };

  // Reload inventory data every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadInventory();
    }, [])
  );

  const toggleIngredient = async (name: string) => {
    try {
      const stored = await AsyncStorage.getItem('@cocktail_inventory');
      let current = stored ? JSON.parse(stored) : [];
      
      if (current.includes(name)) {
        current = current.filter((ing: string) => ing !== name); // Remove ingredient from inventory
      } else {
        current.push(name); // Add ingredient to inventory
      }
      
      setInventory(current);
      await AsyncStorage.setItem('@cocktail_inventory', JSON.stringify(current));
    } catch (e) {
      console.error("Failed to save inventory", e);
    }
  };

  const clearInventory = async () => {
    setInventory([]);
    await AsyncStorage.removeItem('@cocktail_inventory');
  };

  return { inventory, toggleIngredient, clearInventory };
}