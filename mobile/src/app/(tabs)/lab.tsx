import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, BackHandler } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useInventory } from '../../hooks/useInventory';
import { useRouter, useFocusEffect } from 'expo-router';
import { CocktailGridCard } from './library';
import { useFavorites } from '../../hooks/useFavorites';
import { apiRequest } from '../../lib/api';
import { filterIngredientCategories, inventorySignature, type IngredientCategories } from '../../lib/cabinet';

type Match = {
  id: number;
  name: string;
  glass_type?: string;
  missing_count: number;
  missing_ingredients: string[];
  matched_count?: number;
  total_ingredients?: number;
};
type MatchResponse = { perfect_matches: Match[]; almost_matches: Match[] };
type MatchResults = MatchResponse & { inventory: string[] };

export default function LabScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const themePrimary = isDark ? colors.primary : '#111111';
  const themePrimaryText = isDark ? '#000000' : '#FFFFFF';
  const { inventory, toggleIngredient, clearInventory, replaceInventory, loaded, saving, error: inventoryError, retry: retryInventory } = useInventory();
  const { favorites, toggleFavorite, error: favoritesError, retry: retryFavorites } = useFavorites();

  const [categories, setCategories] = useState<IngredientCategories>({});
  const [isLoading, setIsLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [clearedInventory, setClearedInventory] = useState<string[] | null>(null);
  const [isMatching, setIsMatching] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<MatchResults | null>(null);
  const catalogRequest = useRef<AbortController | null>(null);
  const matchRequest = useRef<AbortController | null>(null);
  const matchGeneration = useRef(0);
  const inventoryKey = inventorySignature(inventory);
  const latestInventoryKey = useRef(inventoryKey);
  latestInventoryKey.current = inventoryKey;

  const visibleCategories = useMemo(
    () => filterIngredientCategories(categories, query, inventory, selectedOnly),
    [categories, query, inventory, selectedOnly],
  );

  const loadIngredients = useCallback(async () => {
    catalogRequest.current?.abort();
    const controller = new AbortController();
    catalogRequest.current = controller;
    setIsLoading(true);
    setCatalogError(null);
    try {
      const json = await apiRequest<{ data: IngredientCategories }>('/api/v2/ingredients', { signal: controller.signal });
      if (controller.signal.aborted || catalogRequest.current !== controller) return;
      if (!json.data || typeof json.data !== 'object' || Array.isArray(json.data) ||
          !Object.values(json.data).every(value => Array.isArray(value) && value.every(item => typeof item === 'string'))) {
        throw new Error('The ingredient list could not be loaded. Please try again.');
      }
      setCategories(json.data);
    } catch (error) {
      if (!controller.signal.aborted) setCatalogError(error instanceof Error ? error.message : 'Could not load ingredients. Please try again.');
    } finally {
      if (catalogRequest.current === controller && !controller.signal.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIngredients();
    return () => {
      catalogRequest.current?.abort();
      matchRequest.current?.abort();
      matchGeneration.current += 1;
    };
  }, [loadIngredients]);

  // The result belongs to the exact cabinet used when the request started.
  useEffect(() => {
    matchRequest.current?.abort();
    matchGeneration.current += 1;
    setIsMatching(false);
    setShowResults(false);
    setResults(null);
    setMatchError(null);
  }, [inventoryKey]);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!showResults) return false;
      setShowResults(false);
      return true;
    });
    return () => subscription.remove();
  }, [showResults]));

  const runMatchEngine = async () => {
    if (!loaded || inventory.length === 0 || isMatching) return;
    matchRequest.current?.abort();
    const controller = new AbortController();
    matchRequest.current = controller;
    const generation = ++matchGeneration.current;
    const requestedInventory = [...inventory];
    const requestedKey = inventorySignature(requestedInventory);
    setIsMatching(true);
    setMatchError(null);
    try {
      const json = await apiRequest<MatchResponse>('/api/v2/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory: requestedInventory }),
        signal: controller.signal,
      });
      if (controller.signal.aborted || generation !== matchGeneration.current || requestedKey !== latestInventoryKey.current) return;
      const validMatch = (item: Match) => item && Number.isSafeInteger(item.id) && typeof item.name === 'string' &&
        Array.isArray(item.missing_ingredients) && item.missing_ingredients.every(name => typeof name === 'string');
      if (!Array.isArray(json.perfect_matches) || !Array.isArray(json.almost_matches) ||
          !json.perfect_matches.every(validMatch) || !json.almost_matches.every(validMatch)) {
        throw new Error('The recipe results could not be loaded. Please try again.');
      }
      setResults({ ...json, inventory: requestedInventory });
      setShowResults(true);
    } catch (error) {
      if (!controller.signal.aborted && generation === matchGeneration.current) {
        setMatchError(error instanceof Error ? error.message : 'Could not find recipes. Please try again.');
      }
    } finally {
      if (generation === matchGeneration.current && !controller.signal.aborted) setIsMatching(false);
    }
  };

  const clearCabinet = () => {
    setClearedInventory([...inventory]);
    void clearInventory();
  };

  const undoClear = () => {
    if (!clearedInventory) return;
    // Preserve any ingredients selected since clearing the cabinet.
    void replaceInventory([...new Set([...inventory, ...clearedInventory])]);
    setClearedInventory(null);
  };

  const renderNotice = (message: string, action: string, onPress: () => void, disabled = false) => (
    <View style={[styles.notice, { borderColor: colors.border, backgroundColor: colors.card }]} accessibilityLiveRegion="polite">
      <Text style={[styles.noticeText, { color: colors.text }]}>{message}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={onPress} disabled={disabled} style={styles.noticeAction}>
        <Text style={{ color: themePrimary, fontWeight: '800', opacity: disabled ? 0.5 : 1 }}>{action}</Text>
      </TouchableOpacity>
    </View>
  );

  const storageNotices = <>
    {inventoryError && renderNotice(inventoryError, 'Retry', () => { void retryInventory(); }, saving)}
    {favoritesError && renderNotice(favoritesError, 'Retry', () => { void retryFavorites(); })}
  </>;

  const renderMatchesGrid = (matches: Match[]) => (
    <View style={styles.matchGrid}>
      {matches.map(item => (
        <View key={item.id} style={styles.matchCell}>
          <CocktailGridCard
            item={item}
            onPress={() => router.push(`/recipe/${item.id}`)}
            colors={colors}
            width="100%"
            isFavorite={favorites.includes(item.id)}
            onToggleFavorite={() => { void toggleFavorite(item.id); }}
          />
          <View style={styles.availability}>
            <Ionicons name={item.missing_ingredients.length ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={15} color={item.missing_ingredients.length ? '#C76A00' : themePrimary} />
            <Text style={[styles.availabilityText, { color: colors.text }]}>
              {item.missing_ingredients.length
                ? `Need ${item.missing_ingredients.length}: ${item.missing_ingredients.join(', ')}`
                : 'All ingredients in your cabinet'}
            </Text>
          </View>
          {item.matched_count !== undefined && item.total_ingredients !== undefined && (
            <Text style={[styles.matchCount, { color: colors.subtext }]}>Have {item.matched_count} of {item.total_ingredients} ingredients</Text>
          )}
        </View>
      ))}
    </View>
  );

  if (showResults && results) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 10 }]}>
        <View style={styles.resultsHeader}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Edit cabinet" onPress={() => setShowResults(false)} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, paddingRight: 48 }}>
            <Text style={[styles.title, { fontSize: 20, letterSpacing: 0.5, color: colors.text }]}>YOUR MATCHES</Text>
            <Text style={[styles.subtitle, { color: colors.subtext }]}>Based on your {results.inventory.length} selected ingredients</Text>
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
          {storageNotices}
          <Text style={[styles.resultNote, { color: colors.subtext }]}>Check quantities and preparation in each recipe.</Text>
          <View style={styles.resultsSection}>
            <Text style={[styles.resultsSectionTitle, { color: colors.text, borderBottomColor: colors.border }]}>Ready to make ({results.perfect_matches.length})</Text>
            {results.perfect_matches.length ? renderMatchesGrid(results.perfect_matches) : (
              <Text style={[styles.emptyMatchText, { color: colors.subtext }]}>No complete recipes yet. Check the missing ingredients below, or update your cabinet.</Text>
            )}
          </View>
          <View style={styles.resultsSection}>
            <Text style={[styles.resultsSectionTitle, { color: colors.text, borderBottomColor: colors.border }]}>A few ingredients away ({results.almost_matches.length})</Text>
            {results.almost_matches.length ? renderMatchesGrid(results.almost_matches) : (
              <Text style={[styles.emptyMatchText, { color: colors.subtext }]}>No close matches with these ingredients. Add other ingredients you already have and try again.</Text>
            )}
          </View>
          <TouchableOpacity accessibilityRole="button" onPress={() => setShowResults(false)} style={[styles.secondaryButton, { borderColor: colors.border }]}>
            <Text style={{ color: themePrimary, fontWeight: '800' }}>Edit my cabinet</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>MY CABINET</Text>
        <Text style={[styles.subtitle, { color: colors.subtext }]}>Select what you have. Find a recipe you can make.</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: matchError ? 220 : 130 }}>
        {storageNotices}
        <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View>
            <Text style={[styles.statsLabel, { color: colors.subtext }]}>SELECTED INGREDIENTS</Text>
            <Text style={[styles.statsValue, { color: themePrimary }]}>{inventory.length}</Text>
          </View>
          {inventory.length > 0 && (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear cabinet" onPress={clearCabinet} disabled={saving} style={styles.clearButton}>
              <Ionicons name="trash-outline" size={16} color={colors.subtext} />
              <Text style={{ color: colors.subtext, fontWeight: '700' }}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
        {clearedInventory && renderNotice('Your removed ingredients can be restored. Undo keeps anything added since.', 'Undo', undoClear, saving)}
        <View style={[styles.searchBar, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Ionicons name="search-outline" size={20} color={colors.subtext} />
          <TextInput
            accessibilityLabel="Search ingredients"
            placeholder="Search ingredients or categories"
            placeholderTextColor={colors.subtext}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {query.length > 0 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} style={styles.searchClear}><Ionicons name="close-circle" size={20} color={colors.subtext} /></TouchableOpacity>}
        </View>
        <View style={styles.filterRow}>
          <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: selectedOnly }} aria-checked={selectedOnly} onPress={() => setSelectedOnly(value => !value)} style={styles.selectedToggle}>
            <Ionicons name={selectedOnly ? 'checkbox' : 'square-outline'} size={22} color={themePrimary} />
            <Text style={{ color: colors.text, fontWeight: '600' }}>Only selected ({inventory.length})</Text>
          </TouchableOpacity>
          {saving && <Text style={{ color: colors.subtext, fontSize: 12 }}>Saving…</Text>}
        </View>

        {isLoading || !loaded ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={themePrimary} />
            <Text style={[styles.loadingText, { color: colors.subtext }]}>Loading your cabinet…</Text>
          </View>
        ) : catalogError ? (
          renderNotice(catalogError, 'Retry', () => { void loadIngredients(); })
        ) : visibleCategories.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{selectedOnly && !inventory.length ? 'Your cabinet is empty' : 'No ingredients found'}</Text>
            <Text style={[styles.emptyText, { color: colors.subtext }]}>{selectedOnly && !inventory.length ? 'Show all ingredients to start adding what you have.' : 'Try a shorter name or show all ingredients.'}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => { setQuery(''); setSelectedOnly(false); }} style={styles.noticeAction}>
              <Text style={{ color: themePrimary, fontWeight: '800' }}>Show all ingredients</Text>
            </TouchableOpacity>
          </View>
        ) : (
          visibleCategories.map(([categoryName, ingredients]) => (
            <View key={categoryName} style={styles.categorySection}>
              <Text style={[styles.categoryTitle, { color: colors.text, borderBottomColor: colors.border }]}>{categoryName}</Text>
              <View style={styles.pillsContainer}>
                {ingredients.map(ingredient => {
                  const selected = inventory.includes(ingredient);
                  return (
                    <TouchableOpacity
                      key={ingredient}
                      accessibilityRole="checkbox"
                      accessibilityLabel={ingredient}
                      accessibilityState={{ checked: selected }}
                      aria-checked={selected}
                      activeOpacity={0.7}
                      onPress={() => { void toggleIngredient(ingredient); }}
                      style={[styles.pill, { backgroundColor: selected ? themePrimary : 'transparent', borderColor: selected ? themePrimary : colors.border }]}
                    >
                      {selected && <Ionicons name="checkmark" size={14} color={themePrimaryText} />}
                      <Text style={[styles.pillText, { color: selected ? themePrimaryText : colors.text }]}>{ingredient}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))
        )}

      </ScrollView>
      <View style={[styles.bottomFloating, { backgroundColor: colors.background, paddingBottom: 12, borderTopColor: colors.border }]}>
        {matchError && <Text accessibilityLiveRegion="polite" style={[styles.matchError, { color: colors.text }]}>{matchError}</Text>}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ disabled: !loaded || !inventory.length || isMatching, busy: isMatching }}
          style={[styles.findButton, { backgroundColor: loaded && inventory.length ? themePrimary : colors.card, borderColor: colors.border }]}
          disabled={!loaded || !inventory.length || isMatching}
          onPress={() => { void runMatchEngine(); }}
        >
          {isMatching ? <ActivityIndicator size="small" color={themePrimaryText} /> : <Ionicons name="flask-outline" size={20} color={inventory.length ? themePrimaryText : colors.subtext} />}
          <Text style={[styles.findButtonText, { color: inventory.length ? themePrimaryText : colors.subtext }]}>{isMatching ? 'Finding recipes…' : inventory.length ? (matchError ? 'Try finding recipes again' : 'Find what I can make') : 'Select ingredients first'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingLeft: 20, paddingRight: 72, marginBottom: 18 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: 1 },
  subtitle: { fontSize: 13, lineHeight: 19, marginTop: 5 },
  statsCard: { marginHorizontal: 20, marginBottom: 16, padding: 16, borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statsLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  statsValue: { fontSize: 28, fontWeight: '900' },
  clearButton: { flexDirection: 'row', gap: 6, alignItems: 'center', padding: 12 },
  notice: { marginHorizontal: 20, marginBottom: 14, borderWidth: 1, borderRadius: 12, padding: 14 },
  noticeText: { fontSize: 13, lineHeight: 19 },
  noticeAction: { paddingVertical: 10, minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  searchBar: { marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingLeft: 12, minHeight: 48 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, minWidth: 0 },
  searchClear: { padding: 12 },
  filterRow: { marginHorizontal: 20, marginVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectedToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  loadingContainer: { padding: 40, alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 13 },
  emptyContainer: { marginHorizontal: 20, paddingVertical: 30 },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  emptyText: { fontSize: 14, lineHeight: 21 },
  categorySection: { marginHorizontal: 20, marginBottom: 24 },
  categoryTitle: { fontSize: 15, fontWeight: '800', marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1 },
  pillsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pill: { paddingHorizontal: 13, paddingVertical: 10, minHeight: 44, borderRadius: 24, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  pillText: { fontSize: 13, fontWeight: '600' },
  matchError: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  bottomFloating: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1 },
  findButton: { flexDirection: 'row', minHeight: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', borderWidth: 1, gap: 10 },
  findButtonText: { fontSize: 16, fontWeight: '800' },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 15 },
  backButton: { padding: 8, marginRight: 6 },
  resultNote: { fontSize: 13, lineHeight: 19, marginHorizontal: 20, marginBottom: 22 },
  resultsSection: { marginBottom: 28 },
  resultsSectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 16, paddingBottom: 8, borderBottomWidth: 1, marginHorizontal: 20 },
  emptyMatchText: { fontSize: 14, lineHeight: 21, marginHorizontal: 20 },
  matchGrid: { paddingHorizontal: 20, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  matchCell: { width: '48%', marginBottom: 20 },
  availability: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 8 },
  availabilityText: { fontSize: 12, lineHeight: 17, flex: 1 },
  matchCount: { fontSize: 11, marginTop: 5, lineHeight: 16 },
  secondaryButton: { marginHorizontal: 20, minHeight: 48, padding: 14, borderWidth: 1, borderRadius: 12, alignItems: 'center' },
});
