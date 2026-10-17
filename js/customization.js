/**
 * ALLEY RATS: SKATE & SPRAY
 * Skater & Skateboard Customization Controller with Live 2D Canvas Preview
 */

import { CONFIG } from './config.js';
import { Storage } from './storage.js';
import { Skater } from './skater.js';
import { Sound } from './audio.js';

export class CustomizationManager {
  constructor(onCustomizationChanged = null) {
    this.customization = Storage.getCustomization();
    this.draftCustomization = Object.assign({}, this.customization);
    this.onCustomizationChanged = onCustomizationChanged;
    this.modalEl = document.getElementById('customization-modal');
    this.previewCanvas = document.getElementById('custom-preview-canvas');
    this.previewSkater = null;
    this.animId = null;

    this._initElements();
    this._initPreviewCanvas();
  }

  _initElements() {
    this.nameInput = document.getElementById('custom-name');
    this.skinPalette = document.getElementById('custom-skin-palette');
    this.headwearSelect = document.getElementById('custom-headwear');
    this.headwearColorInput = document.getElementById('custom-headwear-color');
    this.hoodieColorInput = document.getElementById('custom-hoodie-color');
    this.pantsColorInput = document.getElementById('custom-pants-color');
    this.deckSelect = document.getElementById('custom-deck-graphic');
    this.deckColorInput = document.getElementById('custom-deck-color');
    this.wheelColorInput = document.getElementById('custom-wheel-color');
    this.sprayColorPalette = document.getElementById('custom-spray-palette');
    this.cursorTypeSelect = document.getElementById('custom-cursor-type');

    this.closeBtn = document.getElementById('btn-close-custom');
    this.saveBtn = document.getElementById('btn-save-custom');
    this.randomBtn = document.getElementById('btn-random-custom');

    // Build color swatches
    this._buildSkinToneSwatches();
    this._buildSprayColorSwatches();
    this._buildHeadwearOptions();
    this._buildDeckOptions();

    // Event listeners - stage in draftCustomization without persisting or notifying
    if (this.nameInput) {
      this.nameInput.addEventListener('input', (e) => {
        let val = e.target.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        if (!val) val = 'SK8R_' + Math.floor(1000 + Math.random() * 9000);
        this.draftCustomization.name = val;
        this._updatePreview();
      });
    }

    if (this.headwearSelect) {
      this.headwearSelect.addEventListener('change', (e) => {
        this.draftCustomization.headwear = e.target.value;
        this._updatePreview();
      });
    }

    if (this.headwearColorInput) {
      this.headwearColorInput.addEventListener('input', (e) => {
        this.draftCustomization.headwearColor = e.target.value;
        this._updatePreview();
      });
    }

    if (this.hoodieColorInput) {
      this.hoodieColorInput.addEventListener('input', (e) => {
        this.draftCustomization.hoodieColor = e.target.value;
        this._updatePreview();
      });
    }

    if (this.pantsColorInput) {
      this.pantsColorInput.addEventListener('input', (e) => {
        this.draftCustomization.pantsColor = e.target.value;
        this._updatePreview();
      });
    }

    if (this.deckSelect) {
      this.deckSelect.addEventListener('change', (e) => {
        this.draftCustomization.deckGraphic = e.target.value;
        this._updatePreview();
      });
    }

    if (this.deckColorInput) {
      this.deckColorInput.addEventListener('input', (e) => {
        this.draftCustomization.deckColor = e.target.value;
        this._updatePreview();
      });
    }

    if (this.wheelColorInput) {
      this.wheelColorInput.addEventListener('input', (e) => {
        this.draftCustomization.wheelColor = e.target.value;
        this._updatePreview();
      });
    }

    if (this.cursorTypeSelect) {
      this.cursorTypeSelect.addEventListener('change', (e) => {
        this.draftCustomization.cursorType = e.target.value;
        this._updatePreview();
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
        Sound.playSprayCanRattle();
        this.save();
        this.close();
      });
    }

    if (this.randomBtn) {
      this.randomBtn.addEventListener('click', () => {
        Sound.playClick(1.2);
        this.randomize();
      });
    }

    this.syncUI(this.customization);
  }

  _buildSkinToneSwatches(target = this.draftCustomization) {
    if (!this.skinPalette) return;
    this.skinPalette.innerHTML = '';
    CONFIG.skinTones.forEach((tone) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'color-swatch-btn' + (target.skinTone === tone.hex ? ' active' : '');
      btn.style.backgroundColor = tone.hex;
      btn.title = tone.name;
      btn.addEventListener('click', () => {
        Sound.playClick();
        this.draftCustomization.skinTone = tone.hex;
        this.skinPalette.querySelectorAll('.color-swatch-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._updatePreview();
      });
      this.skinPalette.appendChild(btn);
    });
  }

  _buildSprayColorSwatches(target = this.draftCustomization) {
    if (!this.sprayColorPalette) return;
    this.sprayColorPalette.innerHTML = '';
    CONFIG.sprayPalette.forEach((c) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'color-swatch-btn' + (target.paintColor === c.hex ? ' active' : '');
      btn.style.backgroundColor = c.hex;
      btn.title = c.name;
      btn.addEventListener('click', () => {
        Sound.playSprayCanRattle();
        this.draftCustomization.paintColor = c.hex;
        this.sprayColorPalette.querySelectorAll('.color-swatch-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._updatePreview();
      });
      this.sprayColorPalette.appendChild(btn);
    });
  }

  _buildHeadwearOptions(target = this.draftCustomization) {
    if (!this.headwearSelect) return;
    this.headwearSelect.innerHTML = '';
    CONFIG.headwearOptions.forEach((h) => {
      const opt = document.createElement('option');
      opt.value = h.id;
      opt.textContent = h.name;
      if (target.headwear === h.id) opt.selected = true;
      this.headwearSelect.appendChild(opt);
    });
  }

  _buildDeckOptions(target = this.draftCustomization) {
    if (!this.deckSelect) return;
    this.deckSelect.innerHTML = '';
    CONFIG.deckGraphics.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name;
      if (target.deckGraphic === d.id) opt.selected = true;
      this.deckSelect.appendChild(opt);
    });
  }

  _initPreviewCanvas() {
    if (!this.previewCanvas) return;
    const ctx = this.previewCanvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    this.previewCanvas.width = 320 * dpr;
    this.previewCanvas.height = 360 * dpr;
    ctx.scale(dpr, dpr);

    this.previewSkater = new Skater({
      id: 'preview_skater',
      name: this.customization.name,
      x: 0.5,
      y: 0.72,
      ready: true,
      customization: this.customization
    }, true);

    const renderLoop = () => {
      if (this.modalEl && !this.modalEl.classList.contains('hidden')) {
        ctx.clearRect(0, 0, 320, 360);

        // Subtle studio backdrop
        ctx.fillStyle = '#11141c';
        ctx.fillRect(0, 0, 320, 360);

        // Grid lines
        ctx.strokeStyle = '#1e2433';
        ctx.lineWidth = 1;
        for (let gx = 0; gx < 320; gx += 32) {
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, 360);
          ctx.stroke();
        }
        for (let gy = 0; gy < 360; gy += 32) {
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.lineTo(320, gy);
          ctx.stroke();
        }

        // Spotlight circle
        const rad = ctx.createRadialGradient(160, 260, 20, 160, 260, 120);
        rad.addColorStop(0, 'rgba(57, 255, 20, 0.12)');
        rad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = rad;
        ctx.fillRect(0, 0, 320, 360);

        // Skater
        if (this.previewSkater) {
          this.previewSkater.update(0.016);
          this.previewSkater.render(ctx, 320, 360, false);
        }
      }
      this.animId = requestAnimationFrame(renderLoop);
    };

    renderLoop();
  }

  _updatePreview() {
    if (this.previewSkater) {
      this.previewSkater.updateCustomization(this.draftCustomization);
    }
  }

  syncUI(target = this.draftCustomization) {
    if (this.nameInput) this.nameInput.value = target.name || 'SK8R_VED';
    if (this.headwearSelect) this.headwearSelect.value = target.headwear || 'beanie';
    if (this.headwearColorInput) this.headwearColorInput.value = target.headwearColor || '#ff007f';
    if (this.hoodieColorInput) this.hoodieColorInput.value = target.hoodieColor || '#7c3aed';
    if (this.pantsColorInput) this.pantsColorInput.value = target.pantsColor || '#1e293b';
    if (this.deckSelect) this.deckSelect.value = target.deckGraphic || 'flame';
    if (this.deckColorInput) this.deckColorInput.value = target.deckColor || '#0f172a';
    if (this.wheelColorInput) this.wheelColorInput.value = target.wheelColor || '#39ff14';
    if (this.cursorTypeSelect) this.cursorTypeSelect.value = target.cursorType || 'spray-can';

    this._buildSkinToneSwatches(target);
    this._buildSprayColorSwatches(target);
    this._buildHeadwearOptions(target);
    this._buildDeckOptions(target);
    this._updatePreview();
  }

  randomize() {
    const rTone = CONFIG.skinTones[Math.floor(Math.random() * CONFIG.skinTones.length)].hex;
    const rHead = CONFIG.headwearOptions[Math.floor(Math.random() * CONFIG.headwearOptions.length)].id;
    const rDeck = CONFIG.deckGraphics[Math.floor(Math.random() * CONFIG.deckGraphics.length)].id;
    const rColors = ['#ff007f', '#39ff14', '#00f0ff', '#ffe600', '#ff6b00', '#b026ff', '#f8fafc', '#1e293b'];
    
    this.draftCustomization.skinTone = rTone;
    this.draftCustomization.headwear = rHead;
    this.draftCustomization.deckGraphic = rDeck;
    this.draftCustomization.headwearColor = rColors[Math.floor(Math.random() * rColors.length)];
    this.draftCustomization.hoodieColor = rColors[Math.floor(Math.random() * rColors.length)];
    this.draftCustomization.pantsColor = rColors[Math.floor(Math.random() * rColors.length)];
    this.draftCustomization.deckColor = rColors[Math.floor(Math.random() * rColors.length)];
    this.draftCustomization.wheelColor = rColors[Math.floor(Math.random() * rColors.length)];
    this.draftCustomization.paintColor = rColors[Math.floor(Math.random() * rColors.length)];

    this.syncUI(this.draftCustomization);
  }

  open() {
    Sound.playClick();
    this.draftCustomization = Object.assign({}, this.customization);
    this.syncUI(this.draftCustomization);
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
    // Revert draft changes without saving
    this.draftCustomization = Object.assign({}, this.customization);
    this.syncUI(this.customization);
  }

  save() {
    this.customization = Object.assign({}, this.draftCustomization);
    Storage.saveCustomization(this.customization);
    if (this.onCustomizationChanged) {
      this.onCustomizationChanged(this.customization);
    }
  }

  getCustomization() {
    return this.customization;
  }
}
