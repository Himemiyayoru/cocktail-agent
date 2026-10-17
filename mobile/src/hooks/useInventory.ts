import { useCallback, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { createPersistentListStore } from '../lib/persistentListStore';

const store = createPersistentListStore<string>(
  AsyncStorage,
  '@cocktail_inventory',
  (value): value is string => typeof value === 'string' && value.trim().length > 0,
  'cabinet',
);

export function useInventory() {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useFocusEffect(useCallback(() => { void store.load(); }, []));
  return {
    inventory: state.items,
    loaded: state.loaded,
    saving: state.saving,
    error: state.error,
    toggleIngredient: store.toggle,
    clearInventory: store.clear,
    replaceInventory: store.replace,
    retry: store.retry,
  };
}
