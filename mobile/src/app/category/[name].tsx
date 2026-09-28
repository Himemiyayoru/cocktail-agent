import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CocktailGridCard, getSmartCategory } from '../(tabs)/library';
import { useFavorites } from '../../hooks/useFavorites';
import { RECIPE_INDEX } from '../../data/catalog'; 

export default function CategoryScreen() {
  const { name } = useLocalSearchParams();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  
  // Initialize favorites state and toggle function
  const { favorites, toggleFavorite } = useFavorites(); 

  const categoryName = Array.isArray(name) ? name[0] : (name || '');
  const recipes = useMemo(
    () => RECIPE_INDEX.filter((recipe) => getSmartCategory(recipe) === categoryName),
    [categoryName]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{categoryName.toUpperCase()}</Text>
        <View style={{ width: 28 }} /> 
      </View>

        <FlatList
          data={recipes}
          keyExtractor={(item) => item.id.toString()}
          numColumns={2}
          columnWrapperStyle={styles.rowWrapper}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
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