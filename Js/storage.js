/**
 * ALLEY RATS: SKATE & SPRAY
 * Local Storage & State Persistence Manager
 */

import { CONFIG } from './config.js';

const SETTINGS_KEY = 'alley_rats_settings_v1';
const CUSTOMIZATION_KEY = 'alley_rats_customization_v1';
const LAST_ROOM_KEY = 'alley_rats_last_room_v1';

export const Storage = {
  /**
   * Load saved settings or fallback to defaults
   */
  getSettings() {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        return Object.assign({}, this.getDefaultSettings(), JSON.parse(stored));
      }
    } catch (e) {
      console.warn('[Storage] Could not read settings from localStorage:', e);
    }
    return this.getDefaultSettings();
  },

  /**
   * Save settings
   */
  saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('[Storage] Could not save settings to localStorage:', e);
    }
  },

  /**
   * Default settings schema
   */
  getDefaultSettings() {
    return {
      masterVolume: 80,
      musicVolume: 65,
      sfxVolume: 85,
      isMuted: false,
      graphicsQuality: 'high', // low, medium, high
      screenShake: true,
      reducedMotion: false,
      cursorStyle: 'spray-can', // spray-can, pointer, brush, marker
      showNameTags: true,
      bgMusicTrack: 'skate_beat_lofi'
    };
  },

  /**
   * Load saved skater customization or fallback to defaults
   */
  getCustomization() {
    try {
      const stored = localStorage.getItem(CUSTOMIZATION_KEY);
      if (stored) {
        return Object.assign({}, CONFIG.defaultCustomization, JSON.parse(stored));
      }
    } catch (e) {
      console.warn('[Storage] Could not read customization from localStorage:', e);
    }
    return Object.assign({}, CONFIG.defaultCustomization);
  },

  /**
   * Save skater customization
   */
  saveCustomization(customization) {
    try {
      localStorage.setItem(CUSTOMIZATION_KEY, JSON.stringify(customization));
    } catch (e) {
      console.warn('[Storage] Could not save customization to localStorage:', e);
    }
  },

  /**
   * Last visited room
   */
  getLastRoom() {
    try {
      return localStorage.getItem(LAST_ROOM_KEY) || '';
    } catch {
      return '';
    }
  },

  saveLastRoom(roomId) {
    try {
      if (roomId) {
        localStorage.setItem(LAST_ROOM_KEY, roomId);
      } else {
        localStorage.removeItem(LAST_ROOM_KEY);
      }
    } catch {
      // ignore
    }
  }
};
