import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../context/ThemeContext'; // Import theme engine

interface PhysicsBaseline { abv: number; brix: number; opacity: number; color_rgb: number[]; }
interface Component { ingredient_name: string; category: string; volume_ml: number; physics_baseline: PhysicsBaseline; }
interface RecipeDetail { id: number; name: string; method: string; components: Component[]; instructions?: string; glass_type?: string; }

export default function RecipeLabScreen() {
  const { id } = useLocalSearchParams(); 
  const { colors } = useTheme(); // Get dynamic colors
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchRecipeDetail(); }, [id]);

  const fetchRecipeDetail = async () => {
    try {
      const response = await fetch(`http://192.168.0.237:8000/api/v2/recipes/${id}`);
      const json = await response.json();
      if (json.status === 'success') setRecipe(json.data);
    } catch (error) {
      console.error("Fetch failed:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.primary }]}>Analyzing molecular data...</Text>
      </View>
    );
  }

  if (!recipe) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <Text style={styles.errorText}>Unable to load recipe data.</Text>
      </View>
    );
  }

  let totalVolume = 0; let totalAlcohol = 0; let totalBrixMass = 0;
  (recipe.components || []).forEach((comp) => {
    const vol = comp.volume_ml || 0;
    const physics = comp.physics_baseline || { abv: 0, brix: 0 };
    totalVolume += vol;
    totalAlcohol += vol * (physics.abv || 0); 
    totalBrixMass += vol * (physics.brix || 0); 
  });

  const finalAbv = totalVolume > 0 ? (totalAlcohol / totalVolume) * 100 : 0;
  const finalBrix = totalVolume > 0 ? (totalBrixMass / totalVolume) : 0;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.scrollContent}>
      
      {/* Header: Cocktail name and method */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{recipe.name}</Text>
        <Text style={[styles.methodTag, { color: colors.subtext }]}>
          {recipe.method?.toUpperCase() || 'UNKNOWN'} {recipe.glass_type ? `• ${recipe.glass_type}` : ''}
        </Text>
      </View>

      {/* Core feature: Physics engine data panel */}
      <View style={[styles.physicsPanel, { backgroundColor: colors.card, borderColor: colors.primary, boxShadow: `0px 0px 15px ${colors.primary}25` }]}>
        <Text style={[styles.panelTitle, { color: colors.primary }]}>⚡ REAL-TIME FLUID PHYSICS</Text>
        <View style={styles.metricsRow}>
          <View style={styles.metricBox}>
            <Text style={[styles.metricLabel, { color: colors.subtext }]}>ABV</Text>
            <Text style={[styles.metricValue, { color: colors.text }]}>{finalAbv.toFixed(1)}%</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={[styles.metricLabel, { color: colors.subtext }]}>BRIX</Text>
            <Text style={[styles.metricValue, { color: colors.text }]}>{finalBrix.toFixed(1)}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={[styles.metricLabel, { color: colors.subtext }]}>VOLUME</Text>
            <Text style={[styles.metricValue, { color: colors.text }]}>{Math.round(totalVolume)}ml</Text>
          </View>
        </View>
      </View>

      {/* Ingredients list */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text, borderBottomColor: colors.border }]}>🧪 MOLECULAR STRUCTURE</Text>
        <View style={[styles.ingredientsList, { backgroundColor: colors.card }]}>
          {(recipe.components || []).map((comp, index) => (
            <View key={index} style={[styles.ingredientRow, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.ingredientName, { color: colors.text }]}>{comp?.ingredient_name || 'Unknown Ingredient'}</Text>
                <Text style={[styles.ingredientCategory, { color: colors.subtext }]}>{comp?.category}</Text>
              </View>
              <Text style={[styles.ingredientAmount, { color: colors.primary }]}>{comp?.volume_ml || 0} ml</Text>
            </View>
          ))}
          
          {(!recipe.components || recipe.components.length === 0) && (
            <Text style={[styles.emptyText, { color: colors.subtext }]}>Scanning... (No ingredients data)</Text>
          )}
        </View>
      </View>

      {/* Mixing instructions */}
      {recipe.instructions && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, borderBottomColor: colors.border }]}>🛠️ BUILD PROTOCOL</Text>
          <Text style={[styles.instructions, { color: colors.subtext }]}>{recipe.instructions}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center', flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  loadingText: { marginTop: 10, fontFamily: 'monospace' },
  errorText: { color: '#ff4444', fontSize: 16 },
  header: { marginBottom: 24 },
  title: { fontSize: 32, fontWeight: '900', letterSpacing: 1 },
  methodTag: { fontSize: 14, marginTop: 4, letterSpacing: 2 },
  physicsPanel: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 24 },
  panelTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 16 },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metricBox: { alignItems: 'center' },
  metricLabel: { fontSize: 10, textTransform: 'uppercase', marginBottom: 4 },
  metricValue: { fontSize: 20, fontWeight: '700', fontFamily: 'monospace' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, borderBottomWidth: 1, paddingBottom: 8 },
  ingredientsList: { borderRadius: 8, padding: 12 },
  ingredientRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  ingredientName: { fontSize: 16, fontWeight: '500' },
  ingredientCategory: { fontSize: 12, marginTop: 2 },
  ingredientAmount: { fontSize: 16, fontWeight: '600' },
  instructions: { fontSize: 15, lineHeight: 24 },
  emptyText: { textAlign: 'center', paddingVertical: 10, fontSize: 12 },
});