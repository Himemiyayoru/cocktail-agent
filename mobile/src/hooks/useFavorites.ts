import { useCallback, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { createPersistentListStore } from '../lib/persistentListStore';

const store = createPersistentListStore<number>(
  AsyncStorage,
  '@cocktail_favorites',
  (value): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
  'saved cocktails',
);

export function useFavorites() {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useFocusEffect(useCallback(() => { void store.load(); }, []));
  return {
    favorites: state.items,
    toggleFavorite: store.toggle,
    loaded: state.loaded,
    saving: state.saving,
    error: state.error,
    retry: store.retry,
  };
}
