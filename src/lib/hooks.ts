import { useState, useEffect, useCallback, useRef } from 'react';
import { loadStarredPOs, saveStarredPOs, type CloudbaseAuthUser } from './cloudbaseData';

const STORAGE_KEY = 'starred_po_ids';

export function useStarredPOs(authUser?: CloudbaseAuthUser | null) {
  const [starredIds, setStarredIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to parse starred POs from local storage', e);
    }
    return new Set();
  });

  const cloudLoadedRef = useRef(false);

  // On mount with authUser, load from cloud and merge
  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    loadStarredPOs(authUser)
      .then(cloudIds => {
        if (cancelled) return;
        cloudLoadedRef.current = true;
        setStarredIds(prev => {
          const merged = new Set([...prev, ...cloudIds]);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(merged)));
          } catch {}
          return merged;
        });
      })
      .catch(err => console.warn('Failed to load starred POs from cloud:', err));
    return () => { cancelled = true; };
  }, [authUser?.uid]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setStarredIds(new Set(JSON.parse(e.newValue)));
        } catch (e) {}
      }
    };
    
    const handleCustomChange = (e: Event) => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          setStarredIds(new Set(JSON.parse(stored)));
        }
      } catch (e) {}
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('starred-pos-updated', handleCustomChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('starred-pos-updated', handleCustomChange);
    };
  }, []);

  const toggleStar = useCallback((id: string) => {
    let targetSet: Set<string> | null = null;
    setStarredIds(prev => {
      const newSet = new Set<string>(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      targetSet = newSet;
      return newSet;
    });

    // Run side-effects outside of the setState callback.
    // In React 18, state updater might be called multiple times or during render phase,
    // so it must not have side-effects. Here we defer it to a microtask.
    queueMicrotask(() => {
      if (targetSet) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(targetSet)));
        window.dispatchEvent(new Event('starred-pos-updated'));
        if (authUser && cloudLoadedRef.current) {
          void saveStarredPOs(authUser, Array.from(targetSet)).catch(err =>
            console.warn('Failed to save starred POs to cloud:', err)
          );
        }
      }
    });
  }, [authUser]);

  return { starredIds, toggleStar };
}
