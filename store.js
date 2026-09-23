import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useStore = create(
  persist(
    (set, get) => ({
      // NOTE: coins/diamonds/hearts live in CurrencyContext (the single ledger
      // the UI displays). This store keeps collection, levels, and settings.
      collection: [], // Will store item IDs
      equippedSkin: null,
      equippedBlockTheme: null,
      equippedBackground: null,
      currentLevel: { easy: 1, medium: 1, hard: 1, extraHard: 1 },
      levelProgress: { easy: 1, medium: 1, hard: 1, extraHard: 1 },
      activeDifficulty: 'medium',
      // Best star rating (1-3) earned per level: { [difficulty]: { [levelNumber]: stars } }
      starRatings: {},
      settings: {
        bgm: true,
        sfx: true,
        haptics: true,
      },
      _hasHydrated: false, // Internal flag to track hydration

      setHasHydrated: (state) => set({ _hasHydrated: state }),
      
      setActiveDifficulty: (diff) => {
        const validDiff = ['easy', 'medium', 'hard', 'extraHard'].includes(diff) ? diff : 'medium';
        set({ activeDifficulty: validDiff });
        try {
          AsyncStorage.setItem('activeDifficulty', validDiff).catch(() => {});
        } catch (_) {}
      },

      equipItem: (item) => set((state) => {
        if (item.type === 'skin') return { equippedSkin: item.id };
        if (item.type === 'blockTheme') return { equippedBlockTheme: item.id };
        if (item.type === 'background') return { equippedBackground: item.id };
        return {};
      }),
      
      toggleSetting: (key) => set((state) => ({
        settings: { ...state.settings, [key]: !state.settings[key] }
      })),

      levelUp: () => set((state) => {
        const diff = state.activeDifficulty || 'medium';
        const currentProgress = typeof state.currentLevel === 'object' && state.currentLevel !== null
          ? { ...state.currentLevel }
          : { easy: 1, medium: 1, hard: 1, extraHard: 1 };
        
        const curLevel = typeof currentProgress[diff] === 'number' ? currentProgress[diff] : 1;
        const nextLevel = curLevel + 1;
        const nextProgress = {
          ...currentProgress,
          [diff]: nextLevel,
        };

        try {
          AsyncStorage.setItem('levelProgress', JSON.stringify(nextProgress)).catch((e) => {
            console.warn('Failed to persist levelProgress:', e);
          });
          AsyncStorage.setItem('savedLevel', nextLevel.toString()).catch(() => {});
          AsyncStorage.setItem('activeDifficulty', diff).catch(() => {});
        } catch (_) {}

        return { currentLevel: nextProgress, levelProgress: nextProgress };
      }),

      setCurrentLevel: (lvlOrObj) => set((state) => {
        const diff = state.activeDifficulty || 'medium';
        let nextProgress;
        if (typeof lvlOrObj === 'object' && lvlOrObj !== null) {
          nextProgress = { ...state.currentLevel, ...lvlOrObj };
        } else {
          const num = typeof lvlOrObj === 'number' ? lvlOrObj : 1;
          nextProgress = {
            ...(typeof state.currentLevel === 'object' ? state.currentLevel : { easy: 1, medium: 1, hard: 1, extraHard: 1 }),
            [diff]: num,
          };
        }
        try {
          AsyncStorage.setItem('levelProgress', JSON.stringify(nextProgress)).catch(() => {});
        } catch (_) {}
        return { currentLevel: nextProgress, levelProgress: nextProgress };
      }),

      setLevelProgress: (progress) => {
        const clean = {
          easy: typeof progress?.easy === 'number' ? progress.easy : 1,
          medium: typeof progress?.medium === 'number' ? progress.medium : 1,
          hard: typeof progress?.hard === 'number' ? progress.hard : 1,
          extraHard: typeof progress?.extraHard === 'number' ? progress.extraHard : 1,
        };
        set({ currentLevel: clean, levelProgress: clean });
        try {
          AsyncStorage.setItem('levelProgress', JSON.stringify(clean)).catch(() => {});
        } catch (_) {}
      },
      
      addItem: (item) => {
        set((state) => {
          // Avoid duplicate IDs
          if (state.collection.find(i => i.id === item.id)) return state;
          return { collection: [...state.collection, item] };
        });
      },

      // Record a star rating for a completed level; keeps the best score.
      // Persisted automatically by the persist middleware.
      setStarRating: (diff, levelNum, stars) => {
        const validDiffs = ['easy', 'medium', 'hard', 'extraHard'];
        const d = validDiffs.includes(diff) ? diff : 'medium';
        const lvl = Math.floor(Number(levelNum));
        const s = Math.max(1, Math.min(3, Math.floor(Number(stars))));
        if (!Number.isFinite(lvl) || lvl < 1 || !Number.isFinite(s)) return;
        set((state) => {
          const ratings = state.starRatings && typeof state.starRatings === 'object' ? state.starRatings : {};
          const prev = ratings[d]?.[lvl] || 0;
          if (s <= prev) return state; // keep the best
          return {
            starRatings: {
              ...ratings,
              [d]: { ...(ratings[d] || {}), [lvl]: s },
            },
          };
        });
      },

      getStarRating: (diff, levelNum) => {
        const ratings = get().starRatings;
        return ratings?.[diff]?.[levelNum] || 0;
      },
    }),
    {
      name: 'escape-puzzle-storage', // unique name
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persistedState) => {
        if (persistedState && typeof persistedState.currentLevel === 'number') {
          const legacy = persistedState.currentLevel;
          persistedState.currentLevel = {
            easy: 1,
            medium: legacy,
            hard: 1,
            extraHard: 1,
          };
          persistedState.levelProgress = persistedState.currentLevel;
          persistedState.activeDifficulty = persistedState.activeDifficulty || 'medium';
        }
        return persistedState;
      },
      onRehydrateStorage: () => async (state) => {
        if (!state) return;
        try {
          const [savedProgressStr, savedDiffStr, savedLegacyLevelStr] = await Promise.all([
            AsyncStorage.getItem('levelProgress'),
            AsyncStorage.getItem('activeDifficulty'),
            AsyncStorage.getItem('savedLevel'),
          ]);

          let progress = { easy: 1, medium: 1, hard: 1, extraHard: 1 };

          if (state.currentLevel) {
            if (typeof state.currentLevel === 'number') {
              progress.medium = state.currentLevel;
            } else if (typeof state.currentLevel === 'object') {
              progress = { ...progress, ...state.currentLevel };
            }
          }

          if (savedProgressStr) {
            try {
              const parsed = JSON.parse(savedProgressStr);
              if (parsed && typeof parsed === 'object') {
                progress = {
                  easy: typeof parsed.easy === 'number' ? parsed.easy : progress.easy,
                  medium: typeof parsed.medium === 'number' ? parsed.medium : progress.medium,
                  hard: typeof parsed.hard === 'number' ? parsed.hard : progress.hard,
                  extraHard: typeof parsed.extraHard === 'number' ? parsed.extraHard : progress.extraHard,
                };
              }
            } catch (_) {}
          } else if (savedLegacyLevelStr) {
            // Fallback: merge player's old legacy 'currentLevel' integer into the new 'medium' slot
            const legacyNum = parseInt(savedLegacyLevelStr, 10);
            if (!isNaN(legacyNum) && legacyNum > 0) {
              progress.medium = legacyNum;
            }
          }

          let diff = 'medium';
          if (savedDiffStr && ['easy', 'medium', 'hard', 'extraHard'].includes(savedDiffStr)) {
            diff = savedDiffStr;
          } else if (state.activeDifficulty && ['easy', 'medium', 'hard', 'extraHard'].includes(state.activeDifficulty)) {
            diff = state.activeDifficulty;
          }

          AsyncStorage.setItem('levelProgress', JSON.stringify(progress)).catch(() => {});
          AsyncStorage.setItem('activeDifficulty', diff).catch(() => {});

          useStore.setState({
            currentLevel: progress,
            levelProgress: progress,
            activeDifficulty: diff,
          });
        } catch (err) {
          console.warn('[store] Hydration error:', err);
        } finally {
          state.setHasHydrated(true);
        }
      },
    }
  )
);
