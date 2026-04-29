import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/globals.css';
import { migrateLocalStorageToIndexedDB } from './lib/storage-migration';
import { flushPendingWritesToLocalStorage, isPersistSuppressed } from './lib/indexeddb-storage';
import { setupNetworkStoreCrossTabSync, useNetworkStore } from './stores/networkStore';
import { setupEventStoreCrossTabSync } from './stores/eventStore';
import { setupServiceStoreCrossTabSync } from './stores/serviceStore';
import { setupSettingsStoreCrossTabSync } from './stores/settingsStore';
import { initializeTheme } from './stores/themeStore';
import { useUIStore } from './stores/uiStore';

/**
 * Bootstrap the application.
 * Migration runs first (async) so IndexedDB has data before stores rehydrate.
 */
async function bootstrap() {
  // Step 1: Migrate localStorage data to IndexedDB (one-time)
  const migrationResult = await migrateLocalStorageToIndexedDB();

  // Step 2: Initialize cross-tab synchronization for stores
  setupNetworkStoreCrossTabSync();
  setupEventStoreCrossTabSync();
  setupServiceStoreCrossTabSync();
  setupSettingsStoreCrossTabSync();

  // Step 3: Initialize theme (applies persisted theme preference)
  initializeTheme();

  // Step 4: Seed undo/redo history with initial topology state so first action is undoable.
  // Must wait for async IndexedDB rehydration to complete — otherwise we'd seed history
  // with the empty default topology, then persist it, overwriting saved data.
  useNetworkStore.persist.onFinishHydration(() => {
    useNetworkStore.getState().initializeHistory();
  });
  // If already hydrated (e.g. synchronous localStorage fallback), run immediately
  if (useNetworkStore.persist.hasHydrated()) {
    useNetworkStore.getState().initializeHistory();
  }

  // Step 5: Listen for storage error events and show warning toasts
  window.addEventListener('localStorage-quota-exceeded', ((event: CustomEvent) => {
    const sizeKB = event.detail?.sizeBytes
      ? Math.round(event.detail.sizeBytes / 1024)
      : 'unknown';
    useUIStore.getState().addToast({
      type: 'warning',
      title: 'Storage quota exceeded',
      message: `Topology too large to persist (${sizeKB} KB). Changes will be lost on page reload. Export your work to save it.`,
      duration: 10000,
    });
  }) as EventListener);

  // Listen for IndexedDB write errors — fallback to localStorage has already occurred
  window.addEventListener('indexeddb-write-error', (() => {
    useUIStore.getState().addToast({
      type: 'warning',
      title: 'IndexedDB write failed',
      message: 'Switched to localStorage fallback. Your data is still being saved, but with reduced capacity.',
      duration: 8000,
    });
  }) as EventListener);

  // Step 6: Safety net — flush pending debounced writes to localStorage on page unload
  // Skip if persist is suppressed (e.g. during storage backend switch) to avoid
  // overwriting just-transferred data
  window.addEventListener('beforeunload', () => {
    if (!isPersistSuppressed()) {
      flushPendingWritesToLocalStorage();
    }
  });

  // Step 6.5: Expose stores on window for E2E tests (DEV only)
  if (import.meta.env.DEV) {
    const { useServiceStore } = await import('./stores/serviceStore');
    // @ts-expect-error — debug bridge for E2E tests
    window.__ATLAS_STORES__ = {
      network: useNetworkStore,
      service: useServiceStore,
      ui: useUIStore,
    };
  }

  // Step 7: Render the app
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );

  // Step 8: Show one-time migration toast (after render so toast system is available)
  if (migrationResult === 'migrated') {
    // Slight delay to let stores rehydrate and toast system mount
    setTimeout(() => {
      useUIStore.getState().addToast({
        type: 'info',
        title: 'Storage upgraded',
        message: 'Your data has been migrated to IndexedDB for better performance and larger capacity.',
        duration: 5000,
      });
    }, 1000);
  }
}

bootstrap();
