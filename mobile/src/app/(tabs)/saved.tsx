import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CocktailGridCard } from './library';
import { useFavorites } from '../../hooks/useFavorites';
import { Ionicons } from '@expo/vector-icons';

export default function SavedScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { favorites, toggleFavorite } = useFavorites();

  const [allRecipes, setAllRecipes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch latest recipe menu on mount to compare IDs
  useEffect(() => {
    fetch('https://bobs-special-blend.onrender.com/api/v2/recipes')
      .then(res => res.json())
      .then(json => {
        if (json.status === 'success') setAllRecipes(json.data);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  // Filter saved recipes from the full list
  const savedRecipes = allRecipes.filter(r => favorites.includes(r.id));

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>SAVED</Text>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : savedRecipes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="heart-dislike-outline" size={60} color={colors.border} style={{ marginBottom: 20 }} />
          <Text style={[styles.emptyText, { color: colors.subtext }]}>No saved cocktails yet.</Text>
          <Text style={[styles.emptySubtext, { color: colors.subtext }]}>Tap the heart icon on any recipe to save it here.</Text>
        </View>
      ) : (
        <FlatList
          data={savedRecipes}
          keyExtractor={(item) => item.id.toString()}
          numColumns={2}
          columnWrapperStyle={styles.rowWrapper}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <CocktailGridCard
              item={item}
              onPress={() => router.push(`/recipe/${item.id}`)}
              colors={colors}
              width="48%"
              isFavorite={true} // Always marked as favorite in this view
              onToggleFavorite={() => toggleFavorite(item.id)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, marginBottom: 15 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: 2 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyText: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  emptySubtext: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  listContent: { paddingHorizontal: 16, paddingBottom: 60, paddingTop: 10 },
  rowWrapper: { justifyContent: 'space-between', marginBottom: 16 },
});