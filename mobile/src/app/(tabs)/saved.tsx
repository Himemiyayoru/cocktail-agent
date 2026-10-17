import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Modal } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CocktailGridCard } from './library';
import { useFavorites } from '../../hooks/useFavorites';
import { useSavedBlends } from '../../hooks/useSavedBlends';
import { RECIPE_INDEX } from '../../data/catalog';
import { formatVolume, totalVolume, type SavedBlend } from '../../lib/recipe';
import { Ionicons } from '@expo/vector-icons';

export default function SavedScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { favorites, toggleFavorite, loaded } = useFavorites();
  const { blends, loaded: blendsLoaded, error, reload, removeBlend } = useSavedBlends();
  const [deleteTarget, setDeleteTarget] = useState<SavedBlend | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const savedRecipes = RECIPE_INDEX.filter(recipe => favorites.includes(recipe.id));

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await removeBlend(deleteTarget.id);
      setDeleteTarget(null);
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : 'Could not delete this version. Please try again.');
    } finally { setDeleting(false); }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>SAVED</Text>
        <Text style={[styles.description, { color: colors.subtext }]}>Your versions and favorite original recipes.</Text>
      </View>
      {!loaded || !blendsLoaded ? (
        <View style={styles.centerContainer}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Your versions</Text>
          <Text style={[styles.description, { color: colors.subtext, marginBottom: 16 }]}>Saved on this device with your amounts, swaps and glass.</Text>
          {error && <View style={[styles.versionCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={{ color: colors.text }}>{error}</Text>
            <TouchableOpacity onPress={() => void reload()} style={styles.button}><Text style={{ color: colors.primary, fontWeight: 'bold' }}>Try again</Text></TouchableOpacity>
          </View>}
          {!error && blends.length === 0 && <View style={[styles.emptyCard, { borderColor: colors.border }]}>
            <Ionicons name="flask-outline" size={30} color={colors.subtext} />
            <Text style={[styles.description, { color: colors.subtext, textAlign: 'center' }]}>Open a recipe, adjust it, then choose “Save my version.”</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/library')} style={styles.button}><Text style={{ color: colors.primary, fontWeight: 'bold' }}>Browse recipes</Text></TouchableOpacity>
          </View>}
          {blends.map(blend => <View key={blend.id} style={[styles.versionCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open ${blend.name}`} onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: String(blend.recipeId), versionId: blend.id } })}>
              <Text style={[styles.versionTitle, { color: colors.text }]}>{blend.name}</Text>
              <Text style={[styles.description, { color: colors.subtext }]}>Based on {blend.recipe.name}</Text>
              <Text style={[styles.description, { color: colors.text }]}>{formatVolume(totalVolume(blend.volumes))} ml · {blend.selectedGlass} · {blend.isMixedMode ? 'Mixed preview' : 'Layered preview'}</Text>
              <Text numberOfLines={2} style={[styles.description, { color: colors.subtext }]}>{blend.components.filter(component => blend.volumes[component.slotId] > 0).map(component => `${component.ingredient_name} ${formatVolume(blend.volumes[component.slotId])} ml`).join(' · ')}</Text>
            </TouchableOpacity>
            <View style={styles.actions}>
              <TouchableOpacity accessibilityRole="button" onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: String(blend.recipeId), versionId: blend.id } })} style={styles.button}><Text style={{ color: colors.primary, fontWeight: 'bold' }}>Open version</Text></TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Delete ${blend.name}`} onPress={() => { setDeleteTarget(blend); setDeleteError(null); }} style={styles.button}><Text style={{ color: colors.subtext }}>Delete</Text></TouchableOpacity>
            </View>
          </View>)}
          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24 }]}>Favorite originals</Text>
          {savedRecipes.length === 0 ? (
            <Text style={[styles.description, { color: colors.subtext, marginBottom: 24 }]}>Tap the heart on a recipe to keep its original version here.</Text>
          ) : <View style={styles.grid}>{savedRecipes.map(recipe => <CocktailGridCard
            key={recipe.id}
            item={recipe}
            onPress={() => router.push(`/recipe/${recipe.id}`)}
            colors={colors}
            width="48%"
            isFavorite={true}
            onToggleFavorite={() => toggleFavorite(recipe.id)}
          />)}</View>}
        </ScrollView>
      )}
      <Modal visible={deleteTarget !== null} transparent animationType="fade" onRequestClose={() => { if (!deleting) setDeleteTarget(null); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.versionTitle, { color: colors.text }]}>Delete this version?</Text>
            <Text style={[styles.description, { color: colors.subtext }]}>{deleteTarget?.name} will be removed from this device. The original recipe remains available.</Text>
            {deleteError && <Text style={[styles.description, { color: '#FF9500' }]}>{deleteError}</Text>}
            <View style={styles.actions}>
              <TouchableOpacity disabled={deleting} onPress={() => setDeleteTarget(null)} style={styles.button}><Text style={{ color: colors.text }}>Keep version</Text></TouchableOpacity>
              <TouchableOpacity disabled={deleting} onPress={confirmDelete} style={styles.button}><Text style={{ color: '#FF3B30', fontWeight: 'bold' }}>{deleting ? 'Deleting…' : 'Delete version'}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingLeft: 20, paddingRight: 72, marginBottom: 15 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: 2 },
  sectionTitle: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  description: { fontSize: 14, lineHeight: 21, marginTop: 6 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 20, paddingBottom: 70, paddingTop: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16, marginTop: 12 },
  versionCard: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 12 },
  emptyCard: { borderWidth: 1, borderRadius: 12, padding: 20, alignItems: 'center' },
  versionTitle: { fontSize: 18, fontWeight: '800' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  button: { paddingVertical: 12, paddingHorizontal: 8, minHeight: 44, justifyContent: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 440, borderWidth: 1, borderRadius: 16, padding: 20 },
});
