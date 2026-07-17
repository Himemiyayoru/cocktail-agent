import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Keyboard } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';

// ==========================================
// Global memory cache to prevent redundant API calls during scroll
// ==========================================
const globalImageCache: Record<string, string | null> = {};

// ==========================================
// Optimized list thumbnail component (Disk cache enabled)
// ==========================================
function SearchThumbnail({ drinkName, size = 50, colors }: { drinkName: string, size?: number, colors: any }) {
  const [imgUrl, setImgUrl] = useState<string | null>(globalImageCache[drinkName] || null);
  const [loading, setLoading] = useState<boolean>(globalImageCache[drinkName] === undefined);

  useEffect(() => {
    if (globalImageCache[drinkName] !== undefined) {
      setImgUrl(globalImageCache[drinkName]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    
    fetch(`https://www.thecocktaildb.com/api/json/v1/1/search.php?s=${encodeURIComponent(drinkName)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.drinks && data.drinks.length > 0) {
          const url = data.drinks[0].strDrinkThumb + '/preview';
          globalImageCache[drinkName] = url;
          if (isMounted) setImgUrl(url);
        } else {
          globalImageCache[drinkName] = null;
          if (isMounted) setImgUrl(null);
        }
      })
      .catch(() => {
        globalImageCache[drinkName] = null;
        if (isMounted) setImgUrl(null);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [drinkName]);

  if (loading) {
    return (
      <View style={[styles.thumbnailContainer, { width: size, height: size, backgroundColor: colors.background, borderColor: colors.border }]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (imgUrl) {
    return (
      <Image 
        source={{ uri: imgUrl }} 
        style={[styles.thumbnailContainer, { width: size, height: size, borderColor: colors.border }]} 
        contentFit="cover"
        cachePolicy="disk"
        transition={200}
      />
    );
  }

  return (
    <View style={[styles.thumbnailContainer, { width: size, height: size, backgroundColor: colors.background, borderColor: colors.border }]}>
      <Ionicons name="wine-outline" size={size * 0.5} color={colors.subtext} />
    </View>
  );
}

// ==========================================
// Main Search Screen Component
// ==========================================
interface RecipeSnippet {
  id: number;
  name: string;
  glass_type: string;
}

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
  const [allRecipes, setAllRecipes] = useState<RecipeSnippet[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchRecipes();
  }, []);

  const fetchRecipes = async () => {
    try {
      // TODO: Ensure the IP address matches your local network or production server
      const response = await fetch('http://192.168.0.237:8000/api/v2/recipes');
      const json = await response.json();
      if (json.status === 'success') {
        setAllRecipes(json.data);
      }
    } catch (error) {
      console.error("Fetch recipes failed", error);
    } finally {
      setIsLoading(false);
    }
  };

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) {
      return { type: 'empty', data: [] };
    }

    const query = searchQuery.trim().toLowerCase();
    const exactMatches = allRecipes.filter(recipe => recipe.name.toLowerCase().includes(query));

    if (exactMatches.length > 0) {
      return { type: 'exact', data: exactMatches };
    }

    const fuzzyMatches = allRecipes.map(recipe => {
      const distance = getLevenshteinDistance(query, recipe.name.toLowerCase());
      return { ...recipe, distance };
    })
    .filter(item => item.distance <= 3) 
    .sort((a, b) => a.distance - b.distance); 

    if (fuzzyMatches.length > 0) {
      return { type: 'fuzzy', data: fuzzyMatches.slice(0, 5) }; 
    }

    return { type: 'not_found', data: [] };
  }, [searchQuery, allRecipes]);

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

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={themePrimary} />
        </View>
      ) : (
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
      )}
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