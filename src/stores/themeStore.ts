import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { createIndexedDBStorage } from '@/lib/indexeddb-storage';

/**
 * Theme mode options
 */
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Resolved theme (what's actually displayed)
 */
export type ResolvedTheme = 'light' | 'dark';

/**
 * Theme store state interface
 */
interface ThemeState {
  // User preference
  mode: ThemeMode;

  // Resolved theme (what's actually displayed)
  resolvedTheme: ResolvedTheme;

  // Actions
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

/**
 * Get the system's preferred color scheme
 */
const getSystemTheme = (): ResolvedTheme => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/**
 * Resolve the theme mode to an actual theme
 */
const resolveTheme = (mode: ThemeMode): ResolvedTheme => {
  if (mode === 'system') {
    return getSystemTheme();
  }
  return mode;
};

/**
 * Apply the theme to the document
 */
const applyTheme = (theme: ResolvedTheme) => {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
};

/**
 * Theme store for managing application theme
 */
export const useThemeStore = create<ThemeState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        mode: 'light',
        resolvedTheme: 'light',

        // Set theme mode
        setMode: (mode) => {
          const resolvedTheme = resolveTheme(mode);
          applyTheme(resolvedTheme);
          set({ mode, resolvedTheme });
        },

        // Toggle between light and dark
        toggleTheme: () => {
          const currentMode = get().mode;
          const newMode = currentMode === 'dark' ? 'light' : 'dark';
          const resolvedTheme = resolveTheme(newMode);
          applyTheme(resolvedTheme);
          set({ mode: newMode, resolvedTheme });
        },
      }),
      {
        name: 'theme-storage',
        storage: createJSONStorage(() => createIndexedDBStorage()),
        // Persist only the mode, not the resolved theme
        partialize: (state) => ({ mode: state.mode }),
        // After rehydration, resolve and apply theme
        onRehydrateStorage: () => (state) => {
          if (state) {
            const resolvedTheme = resolveTheme(state.mode);
            applyTheme(resolvedTheme);
            state.resolvedTheme = resolvedTheme;
          }
        },
      }
    ),
    { name: 'ThemeStore' }
  )
);

/**
 * Initialize theme on app start
 * Sets up system preference listener
 */
export const initializeTheme = () => {
  const store = useThemeStore.getState();
  const resolvedTheme = resolveTheme(store.mode);
  applyTheme(resolvedTheme);
  useThemeStore.setState({ resolvedTheme });

  // Listen for system theme changes
  if (typeof window !== 'undefined') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      const currentMode = useThemeStore.getState().mode;
      if (currentMode === 'system') {
        const newResolved = getSystemTheme();
        applyTheme(newResolved);
        useThemeStore.setState({ resolvedTheme: newResolved });
      }
    };

    mediaQuery.addEventListener('change', handleChange);

    // Return cleanup function
    return () => mediaQuery.removeEventListener('change', handleChange);
  }
};
