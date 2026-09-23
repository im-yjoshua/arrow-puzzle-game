import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CurrencyState {
  coins: number;
  diamonds: number;
  hearts: number;
  unlimitedHearts: boolean;
  hasUnlimitedHearts: boolean;
  hints: number;
}

export interface CurrencyContextType extends CurrencyState {
  addCoins: (amount: number) => void;
  spendCoins: (amount: number) => boolean;
  addDiamonds: (amount: number) => void;
  spendDiamonds: (amount: number) => boolean;
  addHearts: (amount: number) => void;
  /** Deducts one heart (unless unlimited) and returns hearts remaining. */
  useHeart: () => number;
  setUnlimitedHearts: (enabled: boolean) => void;
  refillHearts: (amount?: number) => void;
  addHints: (amount: number) => void;
  useHint: () => boolean;
  isLoaded: boolean;
}

const STORAGE_KEY = '@escape_puzzle_currency';

const DEFAULT_STATE: CurrencyState = {
  coins: 0,
  diamonds: 0,
  hearts: 3,
  unlimitedHearts: false,
  hasUnlimitedHearts: false,
  hints: 0,
};

const CurrencyContext = createContext<CurrencyContextType>({
  ...DEFAULT_STATE,
  addCoins: () => {},
  spendCoins: () => false,
  addDiamonds: () => {},
  spendDiamonds: () => false,
  addHearts: () => {},
  useHeart: () => 0,
  setUnlimitedHearts: () => {},
  refillHearts: () => {},
  addHints: () => {},
  useHint: () => false,
  isLoaded: false,
});

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [coins, setCoins] = useState<number>(DEFAULT_STATE.coins);
  const [diamonds, setDiamonds] = useState<number>(DEFAULT_STATE.diamonds);
  const [hearts, setHearts] = useState<number>(DEFAULT_STATE.hearts);
  const [unlimitedHearts, setUnlimitedHeartsState] = useState<boolean>(DEFAULT_STATE.unlimitedHearts);
  const [hints, setHints] = useState<number>(DEFAULT_STATE.hints);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  const stateRef = React.useRef<CurrencyState>(DEFAULT_STATE);
  // Synchronous mirror of hearts so useHeart can return the remaining count
  // without relying on React's eager updater evaluation.
  const heartsRef = React.useRef<number>(DEFAULT_STATE.hearts);

  // Helper to persist state to AsyncStorage
  const persistState = useCallback((updated: Partial<CurrencyState>) => {
    stateRef.current = { ...stateRef.current, ...updated };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stateRef.current)).catch((err) => {
      console.warn('Failed to persist currency state:', err);
    });
  }, []);

  // Load balances from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((data) => {
        if (data) {
          try {
            const parsed: Partial<CurrencyState> = JSON.parse(data);
            stateRef.current = { ...DEFAULT_STATE, ...parsed };
            if (typeof parsed.coins === 'number') setCoins(parsed.coins);
            if (typeof parsed.diamonds === 'number') setDiamonds(parsed.diamonds);
            if (typeof parsed.hearts === 'number') {
              setHearts(parsed.hearts);
              heartsRef.current = parsed.hearts;
            }
            if (typeof parsed.hasUnlimitedHearts === 'boolean') {
              setUnlimitedHeartsState(parsed.hasUnlimitedHearts);
            } else if (typeof parsed.unlimitedHearts === 'boolean') {
              setUnlimitedHeartsState(parsed.unlimitedHearts);
            }
            if (typeof parsed.hints === 'number') setHints(parsed.hints);
          } catch (e) {
            console.warn('Failed to parse stored currency data:', e);
          }
        }
        setIsLoaded(true);
      })
      .catch((err) => {
        console.warn('Failed to load currency from storage:', err);
        setIsLoaded(true);
      });
  }, []);

  // All balance mutations compute the next value from the synchronous stateRef
  // mirror, then set React state and persist. State updaters stay pure — no
  // side effects (persistState) run inside them, and nothing relies on React's
  // eager updater evaluation.
  const addCoins = useCallback((amount: number) => {
    if (amount <= 0) return;
    const next = stateRef.current.coins + amount;
    setCoins(next);
    persistState({ coins: next });
  }, [persistState]);

  const spendCoins = useCallback((amount: number): boolean => {
    if (amount <= 0) return true;
    if (stateRef.current.coins < amount) return false;
    const next = stateRef.current.coins - amount;
    setCoins(next);
    persistState({ coins: next });
    return true;
  }, [persistState]);

  const addDiamonds = useCallback((amount: number) => {
    if (amount <= 0) return;
    const next = stateRef.current.diamonds + amount;
    setDiamonds(next);
    persistState({ diamonds: next });
  }, [persistState]);

  const spendDiamonds = useCallback((amount: number): boolean => {
    if (amount <= 0) return true;
    if (stateRef.current.diamonds < amount) return false;
    const next = stateRef.current.diamonds - amount;
    setDiamonds(next);
    persistState({ diamonds: next });
    return true;
  }, [persistState]);

  const useHeart = useCallback((): number => {
    if (unlimitedHearts) {
      return heartsRef.current; // Unlimited hearts active, no deduction needed
    }
    const remaining = Math.max(0, heartsRef.current - 1);
    heartsRef.current = remaining;
    setHearts(remaining);
    persistState({ hearts: remaining });
    return remaining;
  }, [unlimitedHearts, persistState]);

  const addHearts = useCallback((amount: number) => {
    if (amount <= 0) return;
    // Hard cap at 5 hearts max
    const next = Math.min(5, heartsRef.current + amount);
    heartsRef.current = next;
    setHearts(next);
    persistState({ hearts: next });
  }, [persistState]);

  const addHints = useCallback((amount: number) => {
    if (amount <= 0) return;
    const next = stateRef.current.hints + amount;
    setHints(next);
    persistState({ hints: next });
  }, [persistState]);

  const useHint = useCallback((): boolean => {
    if (stateRef.current.hints <= 0) return false;
    const next = stateRef.current.hints - 1;
    setHints(next);
    persistState({ hints: next });
    return true;
  }, [persistState]);

  const setUnlimitedHearts = useCallback((enabled: boolean) => {
    setUnlimitedHeartsState(enabled);
    persistState({ unlimitedHearts: enabled, hasUnlimitedHearts: enabled });
  }, [persistState]);

  const refillHearts = useCallback((amount: number = 3) => {
    const capped = Math.min(5, amount);
    heartsRef.current = capped;
    setHearts(capped);
    persistState({ hearts: capped });
  }, [persistState]);

  const value: CurrencyContextType = {
    coins,
    diamonds,
    hearts,
    unlimitedHearts,
    hasUnlimitedHearts: unlimitedHearts,
    hints,
    addCoins,
    spendCoins,
    addDiamonds,
    spendDiamonds,
    addHearts,
    useHeart,
    setUnlimitedHearts,
    refillHearts,
    addHints,
    useHint,
    isLoaded,
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = (): CurrencyContextType => useContext(CurrencyContext);
export default CurrencyContext;
