import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CocktailGridCard, getSmartCategory } from '../(tabs)/library';
import { useFavorites } from '../../hooks/useFavorites'; 

export default function CategoryScreen() {
  const { name } = useLocalSearchParams();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  
  // Initialize favorites state and toggle function
  const { favorites, toggleFavorite } = useFavorites(); 

  const [recipes, setRecipes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Safely extract the category name from URL parameters
  const categoryName = Array.isArray(name) ? name[0] : (name || '');

  useEffect(() => {
    if (!categoryName) return;
    fetchCategoryRecipes();
  }, [categoryName]);

  const fetchCategoryRecipes = async () => {
    try {
      // TODO: Ensure the IP address matches your local network or production server
      const response = await fetch('https://bobs-special-blend.onrender.com/api/v2/recipes');
      const json = await response.json();
      
      if (json.status === 'success') {
        const filtered = json.data.filter((recipe: any) => getSmartCategory(recipe) === categoryName);
        setRecipes(filtered);
      }
    } catch (error) { 
      console.error("Fetch category recipes failed", error); 
    } finally { 
      setIsLoading(false); 
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{categoryName.toUpperCase()}</Text>
        <View style={{ width: 28 }} /> 
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={recipes}
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
              // Inject favorite state and toggle handler
              isFavorite={favorites.includes(item.id)}
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
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 16, 
    paddingBottom: 15, 
    paddingTop: 10, 
    borderBottomWidth: 1 
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 16, paddingBottom: 60, paddingTop: 20 },
  rowWrapper: { justifyContent: 'space-between', marginBottom: 16 },
});