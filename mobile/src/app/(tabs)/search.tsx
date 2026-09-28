import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, FlatList, Keyboard } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { DrinkPhoto } from '../../components/DrinkPhoto';
import { RECIPE_INDEX, RecipeSnippet } from '../../data/catalog';

function SearchThumbnail({ drinkName, size = 50, colors }: { drinkName: string, size?: number, colors: any }) {
  return (
    <View style={[styles.thumbnailContainer, { width: size, height: size, backgroundColor: colors.background, borderColor: colors.border }]}>
      <DrinkPhoto name={drinkName} style={{ width: '100%', height: '100%' }} iconColor={colors.subtext} iconSize={size * 0.5} />
    </View>
  );
}

// ==========================================
// Main Search Screen Component
// ==========================================
// Levenshtein distance algorithm for fuzzy searching
const getLevenshteinDistance = (a: string, b: string): number => {
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1], 
          matrix[i][j - 1],     
          matrix[i - 1][j]
        ) + 1;
      }
    }
  }
  return matrix[a.length][b.length];
};

export default function SearchScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  
  const themePrimary = isDark ? colors.primary : '#111111';

  const [searchQuery, setSearchQuery] = useState('');

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) {
      return { type: 'empty', data: [] };
    }

    const query = searchQuery.trim().toLowerCase();
    const exactMatches = RECIPE_INDEX.filter(recipe => recipe.name.toLowerCase().includes(query));

    if (exactMatches.length > 0) {
      return { type: 'exact', data: exactMatches };
    }

    const fuzzyMatches = RECIPE_INDEX.map(recipe => {
      const distance = getLevenshteinDistance(query, recipe.name.toLowerCase());
      return { ...recipe, distance };
    })
    .filter(item => item.distance <= 3) 
    .sort((a, b) => a.distance - b.distance); 

    if (fuzzyMatches.length > 0) {
      return { type: 'fuzzy', data: fuzzyMatches.slice(0, 5) }; 
    }

    return { type: 'not_found', data: [] };
  }, [searchQuery]);

  const handleRecipePress = (id: number) => {
    Keyboard.dismiss();
    router.push(`/recipe/${id}`);
  };

  const renderItem = ({ item }: { item: RecipeSnippet }) => (
    <TouchableOpacity 
      style={[styles.recipeCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => handleRecipePress(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.cardContent}>
        
        <View style={styles.thumbnailWrapper}>
          <SearchThumbnail drinkName={item.name} size={50} colors={colors} />
        </View>

        <View style={styles.textContainer}>
          <Text style={[styles.recipeName, { color: colors.text }]}>{item.name}</Text>
          <Text style={[styles.glassType, { color: colors.subtext }]}>{item.glass_type || 'Standard Glass'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.subtext} opacity={0.5} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
      
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>SEARCH</Text>
        <View style={[styles.searchBarContainer, { backgroundColor: colors.card, borderColor: themePrimary }]}>
          <Ionicons name="search" size={24} color={colors.subtext} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Type a cocktail name..."
            placeholderTextColor={colors.subtext}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <Ionicons name="close-circle" size={20} color={colors.subtext} />
            </TouchableOpacity>
          )}
        </View>
      </View>

        <View style={{ flex: 1 }}>
          
          {searchResults.type === 'empty' && (
            <View style={styles.centerContainer}>
              <Ionicons name="search-outline" size={60} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.subtext }]}>Find your perfect drink</Text>
            </View>
          )}

          {searchResults.type === 'exact' && (
            <FlatList
              data={searchResults.data}
              keyExtractor={(item) => item.id.toString()}
              renderItem={renderItem}
              contentContainerStyle={styles.listContainer}
              keyboardDismissMode="on-drag" 
            />
          )}

          {searchResults.type === 'fuzzy' && (
            <View style={{ flex: 1 }}>
              <View style={[styles.warningBanner, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
                <Text style={[styles.warningText, { color: colors.text }]}>
                  Cannot find "<Text style={{ color: colors.primary, fontWeight: 'bold' }}>{searchQuery}</Text>"
                </Text>
                <Text style={[styles.didYouMeanText, { color: colors.subtext }]}>Did you mean:</Text>
              </View>
              <FlatList
                data={searchResults.data}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderItem}
                contentContainerStyle={styles.listContainer}
                keyboardDismissMode="on-drag"
              />
            </View>
          )}

          {searchResults.type === 'not_found' && (
            <View style={styles.centerContainer}>
              <Text style={{ fontSize: 40, marginBottom: 10 }}>🍸</Text>
              <Text style={[styles.emptyText, { color: colors.text, fontWeight: 'bold' }]}>No match found</Text>
              <Text style={[styles.emptyText, { color: colors.subtext, fontSize: 14 }]}>Maybe you can ask Bob to invent it!</Text>
            </View>
          )}

        </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, marginBottom: 10 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: 1, marginBottom: 15 },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 16,
    paddingHorizontal: 15,
    height: 60,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 18, fontWeight: '600', height: '100%' },
  clearButton: { padding: 5 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { marginTop: 15, fontSize: 16, fontWeight: '600', letterSpacing: 0.5 },
  listContainer: { paddingHorizontal: 20, paddingBottom: 100, paddingTop: 10 },
  recipeCard: {
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
  },
  thumbnailWrapper: {
    marginRight: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  thumbnailContainer: {
    borderRadius: 25,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  textContainer: { flex: 1 },
  recipeName: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  glassType: { fontSize: 13, fontFamily: 'monospace' },
  warningBanner: {
    padding: 20,
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 10,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#f39c12',
  },
  warningText: { fontSize: 16 },
  didYouMeanText: { fontSize: 14, marginTop: 8, fontStyle: 'italic' },
});