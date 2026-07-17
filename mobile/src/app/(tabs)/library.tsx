import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useFavorites } from '../../hooks/useFavorites'; 

const globalLibraryImageCache: Record<string, string | null> = {};

// Upgraded Card with favorite state and toggle event mapping
export function CocktailGridCard({ item, onPress, colors, width = '48%' as any, isFavorite = false, onToggleFavorite }: { item: any, onPress: () => void, colors: any, width?: any, isFavorite?: boolean, onToggleFavorite?: () => void }) {
  const [imgUrl, setImgUrl] = useState<string | null>(globalLibraryImageCache[item.name] || null);
  const [loading, setLoading] = useState<boolean>(globalLibraryImageCache[item.name] === undefined);

  useEffect(() => {
    if (globalLibraryImageCache[item.name] !== undefined) {
      setImgUrl(globalLibraryImageCache[item.name]);
      setLoading(false);
      return;
    }
    let isMounted = true;
    fetch(`https://www.thecocktaildb.com/api/json/v1/1/search.php?s=${encodeURIComponent(item.name)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.drinks && data.drinks.length > 0) {
          const url = data.drinks[0].strDrinkThumb + '/preview';
          globalLibraryImageCache[item.name] = url;
          if (isMounted) setImgUrl(url);
        } else {
          globalLibraryImageCache[item.name] = null;
          if (isMounted) setImgUrl(null);
        }
      })
      .catch(() => {
        globalLibraryImageCache[item.name] = null;
        if (isMounted) setImgUrl(null);
      })
      .finally(() => { if (isMounted) setLoading(false); });
    return () => { isMounted = false; };
  }, [item.name]);

  return (
    <TouchableOpacity style={[styles.cardContainer, { backgroundColor: colors.card, borderColor: colors.border, width: width }]} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.imageWrapper, { backgroundColor: colors.background }]}>
        
        {/* Floating heart button at top right */}
        {onToggleFavorite && (
          <TouchableOpacity 
            style={styles.heartButton} 
            onPress={(e) => { e.stopPropagation(); onToggleFavorite(); }} // Prevent event bubbling to avoid triggering card navigation
            activeOpacity={0.6}
          >
            <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={24} color={isFavorite ? "#FF3B30" : "#FFFFFF"} />
          </TouchableOpacity>
        )}

        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : imgUrl ? (
          <Image source={{ uri: imgUrl }} style={styles.image} contentFit="cover" cachePolicy="disk" transition={300} />
        ) : (
          <Ionicons name="wine-outline" size={40} color={colors.subtext} opacity={0.3} />
        )}
      </View>
      <View style={styles.textWrapper}>
        <Text style={[styles.drinkName, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{item.name}</Text>
        <Text style={[styles.glassType, { color: colors.subtext }]} numberOfLines={1}>{item.glass_type || 'Standard'}</Text>
      </View>
    </TouchableOpacity>
  );
}

export const getSmartCategory = (recipe: any) => {
  if (recipe.category && recipe.category.trim() !== '') return recipe.category.charAt(0).toUpperCase() + recipe.category.slice(1);
  const name = (recipe.name || '').toLowerCase();
  if (name.match(/colada|tiki|mai tai|zombie|hurricane|painkiller|jungle bird/)) return 'Tiki & Tropical';
  if (name.match(/mojito|caipirinha|julep|smash/)) return 'Muddled & Smashes';
  if (name.match(/mule|buck|dark 'n' stormy|dark and stormy/)) return 'Mules & Bucks';
  if (name.match(/russian|mudslide|alexander|irish coffee|espresso|cream/)) return 'Cream & Dessert';
  if (name.match(/spritz|french 75|bellini|mimosa|champagne/)) return 'Spritzes & Sparklers';
  if (name.match(/highball|collins|fizz|soda|tonic|libre|breeze/)) return 'Highballs & Collins';
  if (name.match(/negroni|boulevardier|americano|campari|aperol/)) return 'Aperitifs & Bitter';
  if (name.match(/margarita|sidecar|white lady|kamikaze/)) return 'Daisies';
  if (name.match(/sour|daiquiri|gimlet|aviation/)) return 'Sours';
  if (name.match(/punch|cup|sangria/)) return 'Punches & Cups';
  if (name.match(/martini|vesper|cosmopolitan|gibson|appletini/)) return 'Martinis & Up Drinks';
  if (name.match(/old fashioned|sazerac|manhattan|rusty nail|godfather/)) return 'Spirit-Forward';
  if (name.match(/shot|shooter|drop|bomb|b-52|slammer/)) return 'Shooters';
  if (name.match(/paper plane|penicillin|naked|famous|pornstar/)) return 'Modern Classics';
  return 'Discoveries';
};

export default function LibraryScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  
  const { favorites, toggleFavorite } = useFavorites();

  const [recipes, setRecipes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { fetchRecipes(); }, []);

  const fetchRecipes = async () => {
    try {
      const response = await fetch('http://192.168.0.237:8000/api/v2/recipes');
      const json = await response.json();
      if (json.status === 'success') setRecipes(json.data);
    } catch (error) { console.error("Fetch library failed", error); } 
    finally { setIsLoading(false); }
  };

  const groupedRecipes = useMemo(() => {
    const groups: Record<string, any[]> = {};
    recipes.forEach(recipe => {
      const cat = getSmartCategory(recipe);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(recipe);
    });
    return Object.keys(groups).map(key => ({ title: key, data: groups[key] })).sort((a, b) => b.data.length - a.data.length);
  }, [recipes]);

  const handleRecipePress = (id: number) => { router.push(`/recipe/${id}`); };
  const handleSeeAll = (categoryTitle: string) => { router.push(`/category/${encodeURIComponent(categoryTitle)}`); };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>THE LIBRARY</Text>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={groupedRecipes}
          keyExtractor={(item) => item.title}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          initialNumToRender={3}
          renderItem={({ item: group }) => (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{group.title}</Text>
                <TouchableOpacity style={styles.seeAllButton} onPress={() => handleSeeAll(group.title)}>
                  <Text style={[styles.seeAllText, { color: colors.subtext }]}>ALL</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.subtext} />
                </TouchableOpacity>
              </View>

              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={group.data}
                keyExtractor={(item) => item.id.toString()}
                initialNumToRender={4}
                contentContainerStyle={{ paddingHorizontal: 20 }}
                renderItem={({ item }) => (
                  <View style={{ marginRight: 16 }}>
                    <CocktailGridCard 
                      item={item} 
                      onPress={() => handleRecipePress(item.id)} 
                      colors={colors} 
                      width={140} 
                      isFavorite={favorites.includes(item.id)}
                      onToggleFavorite={() => toggleFavorite(item.id)}
                    />
                  </View>
                )}
              />
            </View>
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
  sectionContainer: { marginBottom: 30 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 15 },
  sectionTitle: { fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  seeAllButton: { flexDirection: 'row', alignItems: 'center' },
  seeAllText: { fontSize: 12, fontWeight: 'bold', letterSpacing: 1, marginRight: 2 },
  cardContainer: { borderWidth: 1, borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 5, elevation: 3 },
  imageWrapper: { width: '100%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center' },
  
  // Heart button shadow for visibility on light images
  heartButton: {
    position: 'absolute', top: 8, right: 8, zIndex: 10, padding: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 3, elevation: 5,
  },

  image: { width: '100%', height: '100%' },
  textWrapper: { padding: 12, alignItems: 'center', justifyContent: 'center' },
  drinkName: { fontSize: 15, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  glassType: { fontSize: 11, fontFamily: 'monospace', textAlign: 'center', textTransform: 'uppercase' },
});