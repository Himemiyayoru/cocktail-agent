import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

interface Recipe {
  id: number;
  name: string;
  method: string;
  tags: string[];
}

export default function ClassicsScreen() {
  const { colors } = useTheme(); // Extract global theme colors
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecipes();
  }, []);

  const fetchRecipes = async () => {
    try {
      const response = await fetch('http://192.168.0.237:8000/api/v2/recipes/featured');
      const json = await response.json();
      if (json.status === 'success') {
        setRecipes(json.data);
      }
    } catch (error) {
      console.error("Database connection failed:", error);
    } finally {
      setLoading(false);
    }
  };

const renderRecipeCard = ({ item }: { item: Recipe }) => (
    <Link href={`/recipe/${item.id}`} asChild>
      {/* 👇 The core is here, must wrap the array with StyleSheet.flatten */}
      <TouchableOpacity 
        style={StyleSheet.flatten([
          styles.card, 
          { 
            backgroundColor: colors.card, 
            borderColor: colors.border,
            boxShadow: `0px 4px 10px ${colors.primary}20` 
          }
        ])}
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.recipeName, { color: colors.text }]}>{item.name}</Text>
          <Ionicons name="flask-outline" size={20} color={colors.primary} />
        </View>

        <View style={styles.tagContainer}>
          <View style={[styles.tag, { borderColor: colors.primary }]}>
            <Text style={[styles.tagText, { color: colors.primary }]}>{item.method.toUpperCase()}</Text>
          </View>
          {(item.tags || []).map((tag, index) => (
            <View key={index} style={[styles.tag, { borderColor: colors.primary }]}>
              <Text style={[styles.tagText, { color: colors.primary }]}>{tag.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      </TouchableOpacity>
    </Link>
  );

  return (
    // Dynamically inject page background color
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderRecipeCard}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: colors.subtext }]}>
              No recipes found. Ensure FastAPI is running and seeded.
            </Text>
          }
        />
      )}
    </View>
  );
}

// Static styles only keep structural properties (flex, margin, padding, etc.)
const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContainer: { padding: 16, gap: 16 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    elevation: 5,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  recipeName: { fontSize: 20, fontWeight: 'bold', letterSpacing: 0.5 },
  tagContainer: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tag: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  tagText: { fontSize: 10, fontWeight: '600' },
  emptyText: { textAlign: 'center', marginTop: 50 },
});