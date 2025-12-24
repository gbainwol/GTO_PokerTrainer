// Feature flag client with local overrides, query param controls, and a stubbed remote fetch.
// Flags are persisted in localStorage to keep selections sticky across refreshes.

const DEFAULT_FLAGS = {
  newLayout: false,
  enhancedOptions: false,
  experimentHarness: true,
};

class FeatureFlagClient {
  constructor(defaultFlags = {}) {
    this.flags = { ...defaultFlags };
    this.remoteSnapshot = {};
  }

  async initialize() {
    await this.refreshRemoteConfig();
    this.applyPersistedOverrides();
    this.applyQueryOverrides();
    this.persistFlags();
    return this.flags;
  }

  isEnabled(flagName) {
    return Boolean(this.flags[flagName]);
  }

  setFlag(flagName, value) {
    this.flags[flagName] = Boolean(value);
    this.persistFlags();
  }

  async refreshRemoteConfig() {
    const remoteConfig = await this.fetchRemoteConfig();
    if (remoteConfig && typeof remoteConfig === 'object') {
      this.remoteSnapshot = remoteConfig;
      this.flags = { ...this.flags, ...remoteConfig };
    }
  }

  async fetchRemoteConfig() {
    // Placeholder for remote retrieval. Reads from localStorage to simulate a round trip.
    const storedConfig = window.localStorage.getItem('remoteFeatureFlags');
    if (!storedConfig) return {};

    try {
      return JSON.parse(storedConfig);
    } catch (error) {
      console.warn('Unable to parse stored remote flags', error);
      return {};
    }
  }

  applyPersistedOverrides() {
    const stored = window.localStorage.getItem('localFeatureFlags');
    if (!stored) return;

    try {
      const overrides = JSON.parse(stored);
      this.flags = { ...this.flags, ...overrides };
    } catch (error) {
      console.warn('Unable to parse persisted feature flags', error);
    }
  }

  applyQueryOverrides() {
    const params = new URLSearchParams(window.location.search);
    params.forEach((value, key) => {
      if (key.startsWith('flag_')) {
        this.flags[key.replace('flag_', '')] = value === 'true';
      }
    });
  }

  persistFlags() {
    window.localStorage.setItem('localFeatureFlags', JSON.stringify(this.flags));
  }
}

export function getVariantFromQuery(defaultVariant = 'control') {
  const params = new URLSearchParams(window.location.search);
  const variant = params.get('variant');
  return variant || defaultVariant;
}

export const featureFlagClient = new FeatureFlagClient(DEFAULT_FLAGS);
export const defaultFlags = DEFAULT_FLAGS;
