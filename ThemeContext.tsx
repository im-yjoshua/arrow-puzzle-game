import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Theme {
  mode: string;
  backgroundColor: string;
  arrowDefaultColor: string;
  arrowSuccessColor: string;
  arrowErrorColor: string;
  arrowHighlightColor: string;
  dotColor: string;
  // Backwards compatibility aliases
  background: string;
  arrow: string;
  dot: string;
  text: string;
  textSecondary: string;
  card: string;
  border: string;
  pillBg: string;
  modalOverlay: string;
}

export const THEMES: Record<string, Theme> = {
  default: {
    mode: 'default',
    backgroundColor: '#FAF8F5',
    arrowDefaultColor: '#4A3B32',
    arrowSuccessColor: '#5CB85C',
    arrowErrorColor: '#D9534F',
    arrowHighlightColor: '#F5A623',
    dotColor: '#C8BCAC',
    background: '#FAF8F5',
    arrow: '#4A3B32',
    dot: '#C8BCAC',
    text: '#261E1A',
    textSecondary: '#7A6E65',
    card: '#FFFDF9',
    border: '#EFE7DC',
    pillBg: '#FFFFFF',
    modalOverlay: 'rgba(20, 15, 12, 0.65)',
  },
  light: {
    mode: 'light',
    backgroundColor: '#FAF8F5',
    arrowDefaultColor: '#4A3B32',
    arrowSuccessColor: '#5CB85C',
    arrowErrorColor: '#D9534F',
    arrowHighlightColor: '#F5A623',
    dotColor: '#C8BCAC',
    background: '#FAF8F5',
    arrow: '#4A3B32',
    dot: '#C8BCAC',
    text: '#261E1A',
    textSecondary: '#7A6E65',
    card: '#FFFDF9',
    border: '#EFE7DC',
    pillBg: '#FFFFFF',
    modalOverlay: 'rgba(20, 15, 12, 0.65)',
  },
  mocha: {
    mode: 'mocha',
    backgroundColor: '#EFE7DC',
    arrowDefaultColor: '#4E3629',
    arrowSuccessColor: '#6B8E23',
    arrowErrorColor: '#C0392B',
    arrowHighlightColor: '#E67E22',
    dotColor: '#C4B5A5',
    background: '#EFE7DC',
    arrow: '#4E3629',
    dot: '#C4B5A5',
    text: '#2C1E16',
    textSecondary: '#6B5446',
    card: '#F7F3EE',
    border: '#D8C9B9',
    pillBg: '#FFFFFF',
    modalOverlay: 'rgba(30, 20, 15, 0.7)',
  },
  midnight: {
    mode: 'midnight',
    backgroundColor: '#1A1817',
    arrowDefaultColor: '#EDE4D8',
    arrowSuccessColor: '#4CAF50',
    arrowErrorColor: '#FF5252',
    arrowHighlightColor: '#FFD700',
    dotColor: '#3E3834',
    background: '#1A1817',
    arrow: '#EDE4D8',
    dot: '#3E3834',
    text: '#EDE4D8',
    textSecondary: '#A99F96',
    card: '#262220',
    border: '#3D3632',
    pillBg: '#2E2926',
    modalOverlay: 'rgba(0, 0, 0, 0.85)',
  },
  dark: {
    mode: 'dark',
    backgroundColor: '#1A1817',
    arrowDefaultColor: '#EDE4D8',
    arrowSuccessColor: '#4CAF50',
    arrowErrorColor: '#FF5252',
    arrowHighlightColor: '#FFD700',
    dotColor: '#3E3834',
    background: '#1A1817',
    arrow: '#EDE4D8',
    dot: '#3E3834',
    text: '#EDE4D8',
    textSecondary: '#A99F96',
    card: '#262220',
    border: '#3D3632',
    pillBg: '#2E2926',
    modalOverlay: 'rgba(0, 0, 0, 0.85)',
  },
};

export const THEME_STORAGE_KEY = '@app_active_theme';

export interface ThemeContextType {
  theme: Theme;
  activeTheme: string;
  themeMode: string;
  isDark: boolean;
  setTheme: (themeName: string) => void;
  toggleTheme: () => void;
  setThemeMode: (mode: string) => void;
  setDarkMode: (enabled: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: THEMES.default,
  activeTheme: 'default',
  themeMode: 'default',
  isDark: false,
  setTheme: () => {},
  toggleTheme: () => {},
  setThemeMode: () => {},
  setDarkMode: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTheme, setActiveThemeState] = useState<string>('default');

  useEffect(() => {
    // Load persisted active theme on mount
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((saved) => {
        if (saved && THEMES[saved]) {
          setActiveThemeState(saved);
        }
      })
      .catch((err) => {
        console.warn('Error loading active theme preference:', err);
      });
  }, []);

  const setTheme = useCallback((themeName: string) => {
    if (THEMES[themeName]) {
      setActiveThemeState(themeName);
      AsyncStorage.setItem(THEME_STORAGE_KEY, themeName).catch((err) => {
        console.warn('Error saving active theme preference:', err);
      });
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const isCurrentlyDark = activeTheme === 'midnight' || activeTheme === 'dark';
    const nextTheme = isCurrentlyDark ? 'light' : 'dark';
    setTheme(nextTheme);
  }, [activeTheme, setTheme]);

  const setDarkMode = useCallback((enabled: boolean) => {
    setTheme(enabled ? 'dark' : 'light');
  }, [setTheme]);

  const setThemeMode = useCallback((mode: string) => {
    setTheme(mode);
  }, [setTheme]);

  const currentTheme = THEMES[activeTheme] || THEMES.default;
  const isDark = activeTheme === 'midnight' || activeTheme === 'dark';

  const value: ThemeContextType = {
    theme: currentTheme,
    activeTheme,
    themeMode: activeTheme,
    isDark,
    setTheme,
    toggleTheme,
    setThemeMode,
    setDarkMode,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => useContext(ThemeContext);
export default ThemeContext;
