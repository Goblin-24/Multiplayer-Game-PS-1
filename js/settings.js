/**
 * ALLEY RATS: SKATE & SPRAY
 * Settings Controller & UI Modal Manager
 */

import { Storage } from './storage.js';
import { Sound } from './audio.js';

export class SettingsManager {
  constructor(onSettingsChanged = null) {
    this.settings = Storage.getSettings();
    this.draftSettings = Object.assign({}, this.settings);
    this.onSettingsChanged = onSettingsChanged;
    this.modalEl = document.getElementById('settings-modal');
    this._initElements();
  }

  _initElements() {
    this.masterSlider = document.getElementById('setting-master-vol');
    this.musicSlider = document.getElementById('setting-music-vol');
    this.sfxSlider = document.getElementById('setting-sfx-vol');
    this.muteToggle = document.getElementById('setting-mute-toggle');
    this.qualitySelect = document.getElementById('setting-graphics-quality');
    this.screenShakeToggle = document.getElementById('setting-screen-shake');
    this.reducedMotionToggle = document.getElementById('setting-reduced-motion');
    this.cursorStyleSelect = document.getElementById('setting-cursor-style');
    this.nameTagsToggle = document.getElementById('setting-name-tags');
    this.netModeSelect = document.getElementById('setting-net-mode');
    this.customServerInput = document.getElementById('setting-custom-server');

    // Labels for percentage
    this.masterLabel = document.getElementById('val-master-vol');
    this.musicLabel = document.getElementById('val-music-vol');
    this.sfxLabel = document.getElementById('val-sfx-vol');

    this.closeBtn = document.getElementById('btn-close-settings');
    this.saveBtn = document.getElementById('btn-save-settings');
    this.resetBtn = document.getElementById('btn-reset-settings');

    // Populate initial values
    this.syncUI(this.settings);

    // Event listeners - stage in draftSettings only without saving or notifying
    if (this.masterSlider) {
      this.masterSlider.addEventListener('input', (e) => {
        this.draftSettings.masterVolume = parseInt(e.target.value, 10);
        if (this.masterLabel) this.masterLabel.textContent = `${this.draftSettings.masterVolume}%`;
      });
    }

    if (this.musicSlider) {
      this.musicSlider.addEventListener('input', (e) => {
        this.draftSettings.musicVolume = parseInt(e.target.value, 10);
        if (this.musicLabel) this.musicLabel.textContent = `${this.draftSettings.musicVolume}%`;
      });
    }

    if (this.sfxSlider) {
      this.sfxSlider.addEventListener('input', (e) => {
        this.draftSettings.sfxVolume = parseInt(e.target.value, 10);
        if (this.sfxLabel) this.sfxLabel.textContent = `${this.draftSettings.sfxVolume}%`;
      });
    }

    if (this.muteToggle) {
      this.muteToggle.addEventListener('change', (e) => {
        this.draftSettings.isMuted = e.target.checked;
      });
    }

    if (this.cursorStyleSelect) {
      this.cursorStyleSelect.addEventListener('change', (e) => {
        this.draftSettings.cursorStyle = e.target.value;
      });
    }

    if (this.nameTagsToggle) {
      this.nameTagsToggle.addEventListener('change', (e) => {
        this.draftSettings.showNameTags = e.target.checked;
      });
    }

    if (this.qualitySelect) {
      this.qualitySelect.addEventListener('change', (e) => {
        this.draftSettings.graphicsQuality = e.target.value;
      });
    }

    if (this.screenShakeToggle) {
      this.screenShakeToggle.addEventListener('change', (e) => {
        this.draftSettings.screenShake = e.target.checked;
      });
    }

    if (this.reducedMotionToggle) {
      this.reducedMotionToggle.addEventListener('change', (e) => {
        this.draftSettings.reducedMotion = e.target.checked;
      });
    }

    if (this.netModeSelect) {
      this.netModeSelect.addEventListener('change', (e) => {
        this.draftSettings.netMode = e.target.value;
      });
    }

    if (this.customServerInput) {
      this.customServerInput.addEventListener('input', (e) => {
        this.draftSettings.serverUrl = e.target.value.trim();
      });
    }

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => {
        Sound.playClick();
        this.close();
      });
    }

    if (this.saveBtn) {
      this.saveBtn.addEventListener('click', () => {
        Sound.playClick();
        this.save();
        this.close();
      });
    }

    if (this.resetBtn) {
      this.resetBtn.addEventListener('click', () => {
        Sound.playClick();
        this.draftSettings = Storage.getDefaultSettings();
        this.syncUI(this.draftSettings);
      });
    }

    // Apply audio settings at start
    this._applyAudio();
  }

  syncUI(target = this.settings) {
    if (this.masterSlider) this.masterSlider.value = target.masterVolume;
    if (this.musicSlider) this.musicSlider.value = target.musicVolume;
    if (this.sfxSlider) this.sfxSlider.value = target.sfxVolume;
    if (this.muteToggle) this.muteToggle.checked = target.isMuted;
    if (this.qualitySelect) this.qualitySelect.value = target.graphicsQuality;
    if (this.screenShakeToggle) this.screenShakeToggle.checked = target.screenShake;
    if (this.reducedMotionToggle) this.reducedMotionToggle.checked = target.reducedMotion;
    if (this.cursorStyleSelect) this.cursorStyleSelect.value = target.cursorStyle;
    if (this.nameTagsToggle) this.nameTagsToggle.checked = target.showNameTags;
    if (this.netModeSelect) this.netModeSelect.value = target.netMode || 'auto';
    if (this.customServerInput) this.customServerInput.value = target.serverUrl || '';

    if (this.masterLabel) this.masterLabel.textContent = `${target.masterVolume}%`;
    if (this.musicLabel) this.musicLabel.textContent = `${target.musicVolume}%`;
    if (this.sfxLabel) this.sfxLabel.textContent = `${target.sfxVolume}%`;
  }

  _applyAudio() {
    Sound.applySettings(this.settings);
    this._notify();
  }

  _notify() {
    if (this.onSettingsChanged) {
      this.onSettingsChanged(this.settings);
    }
  }

  open() {
    Sound.playClick();
    this.draftSettings = Object.assign({}, this.settings);
    this.syncUI(this.draftSettings);
    if (this.modalEl) {
      this.modalEl.classList.remove('hidden');
      this.modalEl.setAttribute('aria-hidden', 'false');
    }
  }

  close() {
    if (this.modalEl) {
      this.modalEl.classList.add('hidden');
      this.modalEl.setAttribute('aria-hidden', 'true');
    }
    // Revert draft without saving
    this.draftSettings = Object.assign({}, this.settings);
    this.syncUI(this.settings);
  }

  save() {
    this.settings = Object.assign({}, this.draftSettings);
    Storage.saveSettings(this.settings);

    // Save network overrides to localStorage
    try {
      if (this.settings.netMode === 'mock') {
        localStorage.setItem('alley_rats_net_mode', 'mock');
      } else if (this.settings.netMode === 'real') {
        localStorage.setItem('alley_rats_net_mode', 'real');
      } else {
        localStorage.removeItem('alley_rats_net_mode');
      }

      if (this.settings.serverUrl && this.settings.serverUrl.trim()) {
        localStorage.setItem('alley_rats_server_url', this.settings.serverUrl.trim());
      } else {
        localStorage.removeItem('alley_rats_server_url');
      }
    } catch (e) {}

    Sound.applySettings(this.settings);
    this._notify();
  }

  getSettings() {
    return this.settings;
  }
}
