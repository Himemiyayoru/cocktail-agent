import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, BackHandler } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useInventory } from '../../hooks/useInventory';
import { useRouter, useFocusEffect } from 'expo-router'; 
import { CocktailGridCard } from './library';
import { useFavorites } from '../../hooks/useFavorites';

// API Base URL (Broken string avoids unwanted markdown linking in environments)
const API_BASE = 'http://' + '192.168.0.237:8000';

export default function LabScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  
  const themePrimary = isDark ? colors.primary : '#111111';
  const themePrimaryText = isDark ? '#000000' : '#FFFFFF';

  const { inventory, toggleIngredient, clearInventory } = useInventory();
  const { favorites, toggleFavorite } = useFavorites(); 
  
  const [categories, setCategories] = useState<Record<string, string[]>>({});
  const [totalIngredients, setTotalIngredients] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const [isMatching, setIsMatching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [perfectMatches, setPerfectMatches] = useState<any[]>([]);
  const [almostMatches, setAlmostMatches] = useState<any[]>([]);

  // Proper cleanup for BackHandler subscription in newer React Native versions
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (showResults) {
          setShowResults(false);
          return true; // Prevent default OS back behavior
        }
        return false;
      };

      const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => backHandler.remove();
    }, [showResults]) 
  );

  useEffect(() => {
    fetch(`${API_BASE}/api/v2/ingredients`)
      .then(res => res.json())
      .then(json => {
        if (json.status === 'success') {
          setCategories(json.data);
          setTotalIngredients(json.total);
        }
      })
      .catch(err => console.error("Failed to fetch ingredients", err))
      .finally(() => setIsLoading(false));
  }, []);

  const runMatchEngine = async () => {
    setIsMatching(true);
    try {
      const response = await fetch(`${API_BASE}/api/v2/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory: inventory })
      });
      const json = await response.json();
      
      if (json.status === 'success') {
        setPerfectMatches(json.perfect_matches);
        setAlmostMatches(json.almost_matches);
        setShowResults(true);
      }
    } catch (err) {
      console.error("Match engine failed", err);
    } finally {
      setIsMatching(false);
    }
  };

  const renderMatchesGrid = (matches: any[]) => {
    const rows = [];
    for (let i = 0; i < matches.length; i += 2) {
      rows.push(matches.slice(i, i + 2));
    }
    return (
      <View style={{ paddingHorizontal: 20 }}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.rowWrapper}>
            {row.map((item) => (
              <View key={item.id} style={{ width: '48%', marginBottom: 15 }}>
                <CocktailGridCard 
                  item={item} 
                  onPress={() => router.push(`/recipe/${item.id}`)} 
                  colors={colors} 
                  width="100%" 
                  isFavorite={favorites.includes(item.id)}
                  onToggleFavorite={() => toggleFavorite(item.id)}
                />
                
                {item.missing_count > 0 && (
                  <View style={styles.missingWarning}>
                    <Ionicons name="alert-circle" size={12} color="#FF9500" />
                    <Text style={[styles.missingText, { color: '#FF9500' }]} numberOfLines={2}>
                      Missing: {item.missing_ingredients.join(', ')}
                    </Text>
                  </View>
                )}
              </View>
            ))}
            {row.length === 1 && <View style={{ width: '48%' }} />}
          </View>
        ))}
      </View>
    );
  };

  if (showResults) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 10 }]}>
        <View style={styles.resultsHeader}>
          <TouchableOpacity onPress={() => setShowResults(false)} style={{ padding: 4, marginRight: 10 }}>
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </TouchableOpacity>
          <View>
            <Text style={[styles.title, { fontSize: 22, letterSpacing: 1, color: colors.text }]}>MATCH RESULTS</Text>
            <Text style={[styles.subtitle, { color: colors.subtext, marginTop: 0 }]}>Based on {inventory.length} ingredients</Text>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
          <View style={styles.resultsSection}>
            <Text style={[styles.resultsSectionTitle, { color: colors.text, borderBottomColor: colors.border }]}>
              ✨ PERFECT MATCHES ({perfectMatches.length})
            </Text>
            {perfectMatches.length > 0 ? (
              renderMatchesGrid(perfectMatches)
            ) : (
              <Text style={[styles.emptyMatchText, { color: colors.subtext }]}>
                Add more ingredients to unlock perfect cocktails!
              </Text>
            )}
          </View>

          <View style={styles.resultsSection}>
            <Text style={[styles.resultsSectionTitle, { color: colors.text, borderBottomColor: colors.border }]}>
              🚀 ALMOST THERE ({almostMatches.length})
            </Text>
            {almostMatches.length > 0 ? (
              renderMatchesGrid(almostMatches)
            ) : (
              <Text style={[styles.emptyMatchText, { color: colors.subtext }]}>
                No close matches found.
              </Text>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
      
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>THE LAB</Text>
        <Text style={[styles.subtitle, { color: colors.subtext }]}>MY INVENTORY</Text>
      </View>

      <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.statsLeft}>
          <Text style={[styles.statsLabel, { color: colors.subtext }]}>YOU OWN</Text>
          <Text style={[styles.statsValue, { color: themePrimary }]}>
            {inventory.length} <Text style={[styles.statsTotal, { color: colors.subtext }]}>/ {totalIngredients}</Text>
          </Text>
        </View>
        
        {inventory.length > 0 && (
          <TouchableOpacity style={styles.clearBtn} onPress={clearInventory}>
            <Ionicons name="trash-outline" size={16} color={colors.subtext} />
            <Text style={[styles.clearText, { color: colors.subtext }]}>CLEAR</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themePrimary} />
          <Text style={[styles.loadingText, { color: colors.subtext }]}>Scanning Bar...</Text>
        </View>
      ) : (
        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }} 
        >
          {Object.entries(categories).sort().map(([categoryName, ingredients]) => (
            <View key={categoryName} style={styles.categorySection}>
              <Text style={[styles.categoryTitle, { color: colors.text, borderBottomColor: colors.border }]}>
                {categoryName.toUpperCase()}
              </Text>
              
              <View style={styles.pillsContainer}>
                {ingredients.map((ing) => {
                  const isSelected = inventory.includes(ing);
                  return (
                    <TouchableOpacity
                      key={ing}
                      activeOpacity={0.7}
                      onPress={() => toggleIngredient(ing)}
                      style={[
                        styles.pill,
                        { 
                          backgroundColor: isSelected ? themePrimary : 'transparent',
                          borderColor: isSelected ? themePrimary : colors.border
                        }
                      ]}
                    >
                      <Text style={[styles.pillText, { color: isSelected ? themePrimaryText : colors.text }]}>
                        {ing}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {!isLoading && (
        <View style={[styles.bottomFloating, { paddingBottom: insets.bottom || 20 }]}>
          <TouchableOpacity 
            style={[styles.findButton, { backgroundColor: inventory.length > 0 ? themePrimary : colors.card, borderColor: colors.border }]}
            disabled={inventory.length === 0 || isMatching}
            onPress={runMatchEngine} 
          >
            {isMatching ? (
               <ActivityIndicator size="small" color={themePrimaryText} />
            ) : (
              <>
                <Ionicons name="flask" size={20} color={inventory.length > 0 ? themePrimaryText : colors.subtext} />
                <Text style={[styles.findButtonText, { color: inventory.length > 0 ? themePrimaryText : colors.subtext }]}>
                  {inventory.length > 0 ? "FIND WHAT I CAN MAKE" : "SELECT INGREDIENTS FIRST"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, marginBottom: 15 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: 2 },
  subtitle: { fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: 4 },
  
  statsCard: { marginHorizontal: 20, marginBottom: 20, padding: 16, borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statsLeft: { flexDirection: 'column' },
  statsLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  statsValue: { fontSize: 24, fontWeight: '900', fontFamily: 'monospace' },
  statsTotal: { fontSize: 14, fontWeight: '500' },
  
  clearBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.05)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  clearText: { fontSize: 10, fontWeight: 'bold', marginLeft: 4, letterSpacing: 0.5 },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },

  categorySection: { marginBottom: 24 },
  categoryTitle: { fontSize: 14, fontWeight: 'bold', letterSpacing: 1, marginBottom: 12, paddingBottom: 6, borderBottomWidth: 1 },
  pillsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  pillText: { fontSize: 13, fontWeight: '600' },

  bottomFloating: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 15, backgroundColor: 'rgba(0,0,0,0.0)' }, 
  findButton: { flexDirection: 'row', height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 5 },
  findButtonText: { fontSize: 15, fontWeight: '900', letterSpacing: 1, marginLeft: 8 },

  resultsHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 15 },
  resultsSection: { marginBottom: 30 },
  resultsSectionTitle: { fontSize: 14, fontWeight: 'bold', letterSpacing: 1, marginBottom: 16, paddingBottom: 8, borderBottomWidth: 1, marginHorizontal: 20 },
  emptyMatchText: { fontSize: 14, fontStyle: 'italic', marginHorizontal: 20, textAlign: 'center', marginTop: 10 },
  rowWrapper: { flexDirection: 'row', justifyContent: 'space-between' },
  
  missingWarning: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 6, paddingHorizontal: 4 },
  missingText: { fontSize: 10, fontWeight: '600', marginLeft: 4, flex: 1 },
});