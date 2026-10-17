/**
 * ALLEY RATS: SKATE & SPRAY
 * Main Menu Controller & Room Creation/Join Modal
 */

import { CONFIG } from './config.js';
import { Sound } from './audio.js';

export class MenuController {
  constructor(callbacks = {}) {
    this.onCreateRoom = callbacks.onCreateRoom || (() => {});
    this.onJoinRoom = callbacks.onJoinRoom || (() => {});
    this.onOpenSettings = callbacks.onOpenSettings || (() => {});
    this.onOpenCustomization = callbacks.onOpenCustomization || (() => {});
    this.onQuitConfirm = callbacks.onQuitConfirm || (() => {});

    this.container = document.getElementById('main-menu-view');
    this.roomModal = document.getElementById('room-modal');
    this.quitModal = document.getElementById('quit-modal');

    this._initButtons();
  }

  _initButtons() {
    // 4 Primary Menu Buttons
    const btnPlay = document.getElementById('btn-menu-play');
    const btnSettings = document.getElementById('btn-menu-settings');
    const btnCustomize = document.getElementById('btn-menu-customize');
    const btnQuit = document.getElementById('btn-menu-quit');

    if (btnPlay) {
      btnPlay.addEventListener('click', () => {
        Sound.playClick(1.1);
        this.openRoomModal();
      });
    }

    if (btnSettings) {
      btnSettings.addEventListener('click', () => {
        Sound.playClick();
        this.onOpenSettings();
      });
    }

    if (btnCustomize) {
      btnCustomize.addEventListener('click', () => {
        Sound.playClick();
        this.onOpenCustomization();
      });
    }

    if (btnQuit) {
      btnQuit.addEventListener('click', () => {
        Sound.playClick(0.9);
        this.openQuitModal();
      });
    }

    // Room Modal tabs & actions
    const tabCreate = document.getElementById('tab-create-room');
    const tabJoin = document.getElementById('tab-join-room');
    const panelCreate = document.getElementById('panel-create-room');
    const panelJoin = document.getElementById('panel-join-room');
    const btnDoCreate = document.getElementById('btn-do-create-room');
    const btnDoJoin = document.getElementById('btn-do-join-room');
    const inputJoinCode = document.getElementById('input-join-code');
    const joinError = document.getElementById('join-room-error');
    const btnCloseRoomModal = document.getElementById('btn-close-room-modal');

    // Switch tabs
    if (tabCreate && tabJoin) {
      tabCreate.addEventListener('click', () => {
        Sound.playClick();
        tabCreate.classList.add('active');
        tabJoin.classList.remove('active');
        panelCreate.classList.remove('hidden');
        panelJoin.classList.add('hidden');
      });

      tabJoin.addEventListener('click', () => {
        Sound.playClick();
        tabJoin.classList.add('active');
        tabCreate.classList.remove('active');
        panelJoin.classList.remove('hidden');
        panelCreate.classList.add('hidden');
        if (inputJoinCode) inputJoinCode.focus();
      });
    }

    if (btnDoCreate) {
      btnDoCreate.addEventListener('click', () => {
        Sound.playSprayCanRattle();
        // Generate secure, readable room ID e.g. "RAT-7482"
        const uniqueId = 'RAT-' + Math.floor(1000 + Math.random() * 9000);
        this.closeRoomModal();
        this.onCreateRoom(uniqueId);
      });
    }

    if (btnDoJoin) {
      btnDoJoin.addEventListener('click', () => {
        let code = inputJoinCode ? inputJoinCode.value.trim() : '';
        if (joinError) joinError.textContent = '';

        if (!code) {
          if (joinError) joinError.textContent = 'Please enter a room code or invite link!';
          return;
        }

        // Extract code if user pasted a full URL query like ?room=RAT-1234
        if (code.includes('?room=')) {
          const match = code.match(/[?&]room=([^&]+)/);
          if (match) code = decodeURIComponent(match[1]);
        } else if (code.includes('room=')) {
          code = code.split('room=')[1];
        }

        code = code.toUpperCase().replace(/[^A-Z0-9_-]/g, '');

        if (code.length < 3) {
          if (joinError) joinError.textContent = 'Invalid room code format. Must be at least 3 characters.';
          return;
        }

        Sound.playClick(1.2);
        this.closeRoomModal();
        this.onJoinRoom(code);
      });
    }

    if (btnCloseRoomModal) {
      btnCloseRoomModal.addEventListener('click', () => {
        Sound.playClick();
        this.closeRoomModal();
      });
    }

    // Quit Modal actions
    const btnCancelQuit = document.getElementById('btn-cancel-quit');
    const btnConfirmQuit = document.getElementById('btn-confirm-quit');

    if (btnCancelQuit) {
      btnCancelQuit.addEventListener('click', () => {
        Sound.playClick();
        this.closeQuitModal();
      });
    }

    if (btnConfirmQuit) {
      btnConfirmQuit.addEventListener('click', () => {
        Sound.playClick(0.8);
        this.closeQuitModal();
        this.onQuitConfirm();
      });
    }

    // Exit Screen back button
    const btnExitBack = document.getElementById('btn-exit-back');
    if (btnExitBack) {
      btnExitBack.addEventListener('click', () => {
        Sound.playClick();
        document.getElementById('exit-screen').classList.add('hidden');
        this.show();
      });
    }
  }

  openRoomModal() {
    if (this.roomModal) {
      this.roomModal.classList.remove('hidden');
      this.roomModal.setAttribute('aria-hidden', 'false');
    }
  }

  closeRoomModal() {
    if (this.roomModal) {
      this.roomModal.classList.add('hidden');
      this.roomModal.setAttribute('aria-hidden', 'true');
    }
  }

  openQuitModal() {
    if (this.quitModal) {
      this.quitModal.classList.remove('hidden');
      this.quitModal.setAttribute('aria-hidden', 'false');
    }
  }

  closeQuitModal() {
    if (this.quitModal) {
      this.quitModal.classList.add('hidden');
      this.quitModal.setAttribute('aria-hidden', 'true');
    }
  }

  show() {
    if (this.container) {
      this.container.classList.remove('hidden');
    }
  }

  hide() {
    if (this.container) {
      this.container.classList.add('hidden');
    }
  }
}
