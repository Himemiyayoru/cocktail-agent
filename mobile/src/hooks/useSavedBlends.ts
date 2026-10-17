import { useCallback, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { parseSavedBlends, upsertSavedBlend, type SavedBlend } from '../lib/recipe';

const STORAGE_KEY = '@cocktail_saved_blends_v1';
// All screen instances share a queue so read-modify-write operations cannot overwrite one another.
let pendingWrite: Promise<unknown> = Promise.resolve();

async function readBlends(): Promise<SavedBlend[]> {
  await pendingWrite.catch(() => undefined);
  return parseSavedBlends(await AsyncStorage.getItem(STORAGE_KEY));
}

function writeBlends(update: (current: SavedBlend[]) => SavedBlend[]): Promise<SavedBlend[]> {
  const task = pendingWrite.catch(() => undefined).then(async () => {
    const current = parseSavedBlends(await AsyncStorage.getItem(STORAGE_KEY));
    const next = update(current);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  });
  pendingWrite = task;
  return task;
}

export function useSavedBlends() {
  const [blends, setBlends] = useState<SavedBlend[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readToken = useRef(0);

  const reload = useCallback(async () => {
    const token = ++readToken.current;
    setError(null);
    try {
      const result = await readBlends();
      if (token === readToken.current) setBlends(result);
    } catch (cause) {
      if (token === readToken.current) setError(cause instanceof Error ? cause.message : 'Could not load your versions. Try again.');
    } finally {
      if (token === readToken.current) setLoaded(true);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void reload();
    return () => { readToken.current += 1; };
  }, [reload]));

  const loadById = useCallback(async (id: string) => (await readBlends()).find(blend => blend.id === id), []);

  const saveBlend = useCallback(async (blend: SavedBlend) => {
    ++readToken.current;
    const next = await writeBlends(current => upsertSavedBlend(current, blend));
    setBlends(next);
    setError(null);
    return blend;
  }, []);

  const removeBlend = useCallback(async (id: string) => {
    ++readToken.current;
    const next = await writeBlends(current => current.filter(blend => blend.id !== id));
    setBlends(next);
    setError(null);
  }, []);

  return { blends, loaded, error, reload, loadById, saveBlend, removeBlend, restoreBlend: saveBlend };
}
