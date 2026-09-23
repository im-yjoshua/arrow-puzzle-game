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
  useHeart: () => boolean;
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
  useHeart: () => false,
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
            if (typeof parsed.hearts === 'number') setHearts(parsed.hearts);
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

  const addCoins = useCallback((amount: number) => {
    if (amount <= 0) return;
    setCoins((prev) => {
      const next = prev + amount;
      persistState({ coins: next });
      return next;
    });
  }, [persistState]);

  const spendCoins = useCallback((amount: number): boolean => {
    if (amount <= 0) return true;
    let success = false;
    setCoins((prev) => {
      if (prev < amount) {
        success = false;
        return prev;
      }
      success = true;
      const next = prev - amount;
      persistState({ coins: next });
      return next;
    });
    return success;
  }, [persistState]);

  const addDiamonds = useCallback((amount: number) => {
    if (amount <= 0) return;
    setDiamonds((prev) => {
      const next = prev + amount;
      persistState({ diamonds: next });
      return next;
    });
  }, [persistState]);

  const spendDiamonds = useCallback((amount: number): boolean => {
    if (amount <= 0) return true;
    let success = false;
    setDiamonds((prev) => {
      if (prev < amount) {
        success = false;
        return prev;
      }
      success = true;
      const next = prev - amount;
      persistState({ diamonds: next });
      return next;
    });
    return success;
  }, [persistState]);

  const useHeart = useCallback((): boolean => {
    if (unlimitedHearts) {
      return true; // Unlimited hearts active, no deduction needed
    }
    let success = false;
    setHearts((prev) => {
      if (prev <= 0) {
        success = false;
        return 0;
      }
      success = true;
      const next = prev - 1;
      persistState({ hearts: next });
      return next;
    });
    return success;
  }, [unlimitedHearts, persistState]);

  const addHearts = useCallback((amount: number) => {
    if (amount <= 0) return;
    setHearts((prev) => {
      // Hard cap at 5 hearts max
      const next = Math.min(5, prev + amount);
      persistState({ hearts: next });
      return next;
    });
  }, [persistState]);

  const addHints = useCallback((amount: number) => {
    if (amount <= 0) return;
    setHints((prev) => {
      const next = prev + amount;
      persistState({ hints: next });
      return next;
    });
  }, [persistState]);

  const useHint = useCallback((): boolean => {
    let success = false;
    setHints((prev) => {
      if (prev <= 0) {
        success = false;
        return 0;
      }
      success = true;
      const next = prev - 1;
      persistState({ hints: next });
      return next;
    });
    return success;
  }, [persistState]);

  const setUnlimitedHearts = useCallback((enabled: boolean) => {
    setUnlimitedHeartsState(enabled);
    persistState({ unlimitedHearts: enabled, hasUnlimitedHearts: enabled });
  }, [persistState]);

  const refillHearts = useCallback((amount: number = 3) => {
    const capped = Math.min(5, amount);
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
