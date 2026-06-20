/**
 * settings.svelte.ts — reactive settings store (§3.6, T0.5).
 *
 * Holds the singleton `Settings` reactively, resolves the effective theme
 * (`system` → light/dark from `prefers-color-scheme`), and APPLIES the resolved
 * theme to the document via `[data-theme]` (consumed by the §T0.6 tokens, which
 * support a `prefers-color-scheme` default + `[data-theme]` override).
 *
 * Public surface is FROZEN by §3.6.
 *   - `setTheme` / `setReviewMode` / `markBackup` / `markOnboarded` persist via the
 *     Store then update the cache.
 *   - `effectiveTheme.value` is the resolved 'light' | 'dark'.
 *   - `backupIsStale(now, days=14)` is pure (no Store access).
 *
 * Theme application is done imperatively (not via `$effect`, which needs an effect
 * root) so it works from plain module code AND tracks live OS theme changes when
 * the user's preference is 'system'.
 */
import type { ReviewMode, Settings, ThemePref } from '../types';
import { DAY_MS } from '../types';
import { getStore } from './_store.svelte';

// Local defaults mirror the Store's first-run defaults so the cache is never a
// half-initialized object before `loadSettings()` resolves.
const DEFAULTS: Settings = {
  id: 'singleton',
  theme: 'system',
  reviewMode: 'shuffle',
  lastBackupAt: null,
  onboardedAt: null,
  schemaVersion: 1
};

let _settings = $state<Settings>({ ...DEFAULTS });
// The OS-level preference, tracked live so `system` resolves correctly.
let _systemDark = $state<boolean>(prefersDark());

export const settings: { value: Settings } = {
  get value() {
    return _settings;
  }
};

export const effectiveTheme: { value: 'light' | 'dark' } = {
  get value() {
    return resolveTheme(_settings.theme, _systemDark);
  }
};

/** Load the persisted settings into the cache and apply the theme. */
export async function loadSettings(): Promise<void> {
  const store = await getStore();
  _settings = await store.getSettings();
  applyTheme();
}

/** Persist + cache a new theme preference, then re-apply `[data-theme]`. */
export async function setTheme(p: ThemePref): Promise<void> {
  const store = await getStore();
  _settings = await store.updateSettings({ theme: p });
  applyTheme();
}

/** Persist + cache a new review mode. */
export async function setReviewMode(m: ReviewMode): Promise<void> {
  const store = await getStore();
  _settings = await store.updateSettings({ reviewMode: m });
}

/** Record the last successful backup timestamp. */
export async function markBackup(ts: number): Promise<void> {
  const store = await getStore();
  _settings = await store.updateSettings({ lastBackupAt: ts });
}

/** Record the first-run onboarding timestamp (idempotency flag — T1.10). */
export async function markOnboarded(ts: number): Promise<void> {
  const store = await getStore();
  _settings = await store.updateSettings({ onboardedAt: ts });
}

/**
 * Pure: is the backup stale? True when never backed up, or older than `days`
 * (default 14) calendar-day-equivalents (rolling 24h windows).
 */
export function backupIsStale(now: number, days = 14): boolean {
  const last = _settings.lastBackupAt;
  return last === null || now - last > days * DAY_MS;
}

// ── theme plumbing ───────────────────────────────────────────────────────────

function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveTheme(pref: ThemePref, systemDark: boolean): 'light' | 'dark' {
  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return pref;
}

/** Write the resolved theme onto <html data-theme="…"> (no-op without a DOM). */
function applyTheme(): void {
  if (typeof document === 'undefined' || !document.documentElement) return;
  document.documentElement.setAttribute('data-theme', effectiveTheme.value);
}

// Track live OS theme changes so a 'system' preference updates without a reload.
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = (e: MediaQueryListEvent): void => {
    _systemDark = e.matches;
    if (_settings.theme === 'system') applyTheme();
  };
  // addEventListener is the modern API; guard for older Safari's addListener.
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', onChange);
  } else if (typeof (mq as unknown as { addListener?: unknown }).addListener === 'function') {
    (mq as unknown as { addListener: (fn: (e: MediaQueryListEvent) => void) => void }).addListener(
      onChange
    );
  }
}

/** Test-only: reset the cached settings + recompute system preference. */
export function _resetSettingsForTests(): void {
  _settings = { ...DEFAULTS };
  _systemDark = prefersDark();
}

/** Test-only: force the resolved OS preference (no real matchMedia in jsdom). */
export function _setSystemDarkForTests(dark: boolean): void {
  _systemDark = dark;
  if (_settings.theme === 'system') applyTheme();
}
