import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

// Preset some common basic bar inventory for testing
const COMMON_INGREDIENTS = [
  'Tequila', 'Cointreau', 'Lime Juice', 'Gin', 
  'Campari', 'Sweet Vermouth', 'Vodka', 'Light Rum', 'Simple Syrup'
];

interface MatchResult {
  recipe_id: number;
  recipe_name: string;
  match_rate_percent: number;
  missing_count: number;
  missing_items: string[];
}

export default function InventoryScreen() {
  const { colors } = useTheme();
  
  // User's inventory state
  const [owned, setOwned] = useState<string[]>([]);
  // Number of allowed missing ingredients (tolerance)
  const [allowMissing, setAllowMissing] = useState<number>(1);
  
  // Match result state
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Toggle ingredient selection state
  const toggleIngredient = (ing: string) => {
    setOwned(prev => 
      prev.includes(ing) ? prev.filter(i => i !== ing) : [...prev, ing]
    );
  };

  // Request match algorithm from the backend
  const handleMatch = async () => {
    setLoading(true);
    setHasSearched(true);
    try {
      const response = await fetch('http://192.168.0.237:8000/api/v2/recipes/inventory_match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owned_ingredients: owned,
          allow_missing: allowMissing
        })
      });
      const json = await response.json();
      if (json.status === 'success') {
        setMatches(json.data);
      }
    } catch (error) {
      console.error("Match Engine Failed:", error);
    } finally {
      setLoading(false);
    }
  };

  // Render individual match result card
  const renderMatchCard = ({ item }: { item: MatchResult }) => (
    <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.resultHeader}>
        <Text style={[styles.recipeName, { color: colors.text }]}>{item.recipe_name}</Text>
        <Text style={[styles.matchRate, { color: item.match_rate_percent === 100 ? colors.primary : '#ff9800' }]}>
          {item.match_rate_percent}% Match
        </Text>
      </View>
      
      {item.missing_count > 0 ? (
        <View style={styles.missingContainer}>
          <Text style={[styles.missingLabel, { color: colors.subtext }]}>Missing ({item.missing_count}):</Text>
          <View style={styles.missingTags}>
            {item.missing_items.map((miss, idx) => (
              <Text key={idx} style={styles.missingTagText}>• {miss}</Text>
            ))}
          </View>
        </View>
      ) : (
        <Text style={[styles.readyText, { color: colors.primary }]}>✨ Ready to mix!</Text>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Upper section: Inventory selector */}
      <View style={[styles.inventorySection, { borderBottomColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>YOUR CABINET</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {COMMON_INGREDIENTS.map((ing) => {
            const isSelected = owned.includes(ing);
            return (
              <TouchableOpacity 
                key={ing}
                onPress={() => toggleIngredient(ing)}
                style={[
                  styles.chip, 
                  { 
                    backgroundColor: isSelected ? colors.primary : 'transparent',
                    borderColor: isSelected ? colors.primary : colors.border
                  }
                ]}
              >
                <Text style={{ 
                  color: isSelected ? '#000000' : colors.subtext, 
                  fontWeight: isSelected ? 'bold' : 'normal' 
                }}>
                  {ing}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        
        {/* Control panel: Tolerance and search button */}
        <View style={styles.controlPanel}>
          <TouchableOpacity onPress={() => setAllowMissing(allowMissing === 0 ? 1 : 0)}>
            <Text style={[styles.toleranceText, { color: colors.subtext }]}>
              Tolerance: <Text style={{ color: colors.text }}>Missing {allowMissing}</Text>
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.matchBtn, { backgroundColor: colors.primary }]}
            onPress={handleMatch}
          >
            <Ionicons name="scan" size={18} color="#000" />
            <Text style={styles.matchBtnText}>ANALYZE</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Lower section: Match results list */}
      <View style={styles.resultsSection}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.primary, marginTop: 10 }}>Running algorithms...</Text>
          </View>
        ) : (
          <FlatList
            data={matches}
            keyExtractor={(item) => item.recipe_id.toString()}
            renderItem={renderMatchCard}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={
              hasSearched ? (
                <Text style={[styles.emptyText, { color: colors.subtext }]}>
                  No combinations found. Try adding more ingredients or increasing tolerance.
                </Text>
              ) : (
                <View style={styles.centered}>
                  <Ionicons name="flask-outline" size={48} color={colors.border} />
                  <Text style={[styles.emptyText, { color: colors.subtext }]}>
                    Select ingredients above and press ANALYZE to find recipes.
                  </Text>
                </View>
              )
            }
          />
        )}
      </View>
    </View>
  );
}

// Stylesheet
const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 40 },
  inventorySection: { padding: 16, borderBottomWidth: 1 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', letterSpacing: 1, marginBottom: 12 },
  chipScroll: { flexDirection: 'row', marginBottom: 16 },
  chip: { borderWidth: 1, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16, marginRight: 8, height: 36, justifyContent: 'center' },
  controlPanel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toleranceText: { fontSize: 14 },
  matchBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, gap: 6 },
  matchBtnText: { color: '#000', fontWeight: 'bold', letterSpacing: 0.5 },
  resultsSection: { flex: 1 },
  listContainer: { padding: 16, gap: 12 },
  resultCard: { borderWidth: 1, borderRadius: 12, padding: 16 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  recipeName: { fontSize: 18, fontWeight: 'bold' },
  matchRate: { fontSize: 14, fontWeight: '900', fontFamily: 'monospace' },
  missingContainer: { marginTop: 4 },
  missingLabel: { fontSize: 12, marginBottom: 4 },
  missingTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  missingTagText: { color: '#ff4444', fontSize: 12, fontWeight: '600' },
  readyText: { fontSize: 14, fontWeight: 'bold', marginTop: 4 },
  emptyText: { textAlign: 'center', marginTop: 16, paddingHorizontal: 20 },
});