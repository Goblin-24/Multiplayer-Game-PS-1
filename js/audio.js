/**
 * ALLEY RATS: SKATE & SPRAY
 * Web Audio API Procedural Sound & Music Manager
 * Zero external asset dependency - 100% synthesized authentic skate & spray audio!
 */

import { Storage } from './storage.js';

class AudioManager {
  constructor() {
    this.ctx = null;
    this.isInitialized = false;
    this.settings = Storage.getSettings();
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    
    // Music state
    this.isMusicPlaying = false;
    this.musicTimer = null;
    this.musicBeat = 0;
    this.bgmAudio = null;
    this.bgmSourceNode = null;
    this.hasExternalSong = false;
    
    // Spray hiss state
    this.activeSprayNode = null;
  }

  /**
   * Lazily initialize Web Audio Context on first user interaction
   */
  init() {
    if (this.isInitialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        console.warn('[Audio] Web Audio API is not supported in this browser.');
        return;
      }
      this.ctx = new AudioCtx();
      
      // Master gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);

      // Music gain
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.masterGain);

      // SFX gain
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.masterGain);

      this.isInitialized = true;
      this.applySettings(this.settings);
    } catch (e) {
      console.warn('[Audio] Failed to initialize AudioContext:', e);
    }
  }

  /**
   * Resume audio context if suspended (browser autoplay policy)
   */
  resumeContext() {
    if (!this.isInitialized) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * Update gain levels based on settings
   */
  applySettings(settings) {
    this.settings = settings;
    if (!this.isInitialized || !this.ctx) return;

    const master = settings.isMuted ? 0 : (settings.masterVolume / 100);
    const music = (settings.musicVolume / 100) * 0.45; // balanced
    const sfx = (settings.sfxVolume / 100) * 0.7;

    const now = this.ctx.currentTime;
    this.masterGain.gain.setValueAtTime(master, now);
    this.musicGain.gain.setValueAtTime(music, now);
    this.sfxGain.gain.setValueAtTime(sfx, now);

    if (this.bgmAudio) {
      this.bgmAudio.volume = settings.isMuted ? 0 : (settings.masterVolume / 100) * (settings.musicVolume / 100);
    }
  }

  /**
   * UI Click / Pop sound
   */
  playClick(pitch = 1.0) {
    this.resumeContext();
    if (!this.ctx || this.settings.isMuted || this.settings.sfxVolume <= 0) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420 * pitch, now);
      osc.frequency.exponentialRampToValueAtTime(140 * pitch, now + 0.06);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.07);
    } catch (e) {
      // ignore
    }
  }

  /**
   * Spray can shake sound (ball bearing rattle clack-clack)
   */
  playSprayCanRattle() {
    this.resumeContext();
    if (!this.ctx || this.settings.isMuted || this.settings.sfxVolume <= 0) return;

    try {
      const now = this.ctx.currentTime;
      // 2 quick sharp metallic clicks
      [0, 0.07].forEach((delay) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(2200, now + delay);
        osc.frequency.exponentialRampToValueAtTime(900, now + delay + 0.025);

        gain.gain.setValueAtTime(0.28, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.025);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now + delay);
        osc.stop(now + delay + 0.03);
      });
    } catch (e) {
      // ignore
    }
  }

  /**
   * Spray can continuous aerosol hiss
   */
  startSprayHiss() {
    this.resumeContext();
    if (!this.ctx || this.activeSprayNode || this.settings.isMuted || this.settings.sfxVolume <= 0) return;

    try {
      const bufferSize = this.ctx.sampleRate * 1;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        // High frequency pink/white noise for aerosol hiss
        data[i] = (Math.random() * 2 - 1) * 0.35;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      // Bandpass filter for realistic pressurized can spray sound
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 3800;
      filter.Q.value = 1.2;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.22, this.ctx.currentTime + 0.05);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      noise.start();
      this.activeSprayNode = { noise, gain };
    } catch (e) {
      // ignore
    }
  }

  /**
   * Stop spray aerosol hiss
   */
  stopSprayHiss() {
    if (!this.activeSprayNode || !this.ctx) return;
    try {
      const { noise, gain } = this.activeSprayNode;
      const now = this.ctx.currentTime;
      gain.gain.linearRampToValueAtTime(0.001, now + 0.05);
      noise.stop(now + 0.06);
    } catch (e) {
      // ignore
    }
    this.activeSprayNode = null;
  }

  /**
   * Skateboard Ollie snap and landing
   */
  playOlliePop() {
    this.resumeContext();
    if (!this.ctx || this.settings.isMuted || this.settings.sfxVolume <= 0) return;

    try {
      const now = this.ctx.currentTime;
      // Wooden pop snap (low pitch thump + quick click)
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.08);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.09);
    } catch (e) {
      // ignore
    }
  }

  /**
   * Skateboard landing sound
   */
  playLandSound() {
    this.resumeContext();
    if (!this.ctx || this.settings.isMuted || this.settings.sfxVolume <= 0) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.09);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.1);
    } catch (e) {
      // ignore
    }
  }

  /**
   * Kickflip / Shuvit trick pop and 360 board whoosh
   */
  playKickflipSound() {
    this.resumeContext();
    if (!this.ctx || this.settings.isMuted || this.settings.sfxVolume <= 0) return;

    try {
      const now = this.ctx.currentTime;
      // High snap
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.13);

      // Whoosh buffer
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.18, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.2;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1800, now);
      filter.frequency.exponentialRampToValueAtTime(600, now + 0.18);
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.2, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.sfxGain);
      noise.start(now);
      noise.stop(now + 0.19);
    } catch {}
  }

  /**
   * Continuous metal skate truck grind sound
   */
  startGrindSound() {
    this.resumeContext();
    if (!this.ctx || this.activeGrindNode || this.settings.isMuted || this.settings.sfxVolume <= 0) return;

    try {
      const bufferSize = this.ctx.sampleRate * 1;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        // Metallic scratch noise
        data[i] = (Math.random() * 2 - 1) * 0.28;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 2400;
      filter.Q.value = 3.5;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.01, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.25, this.ctx.currentTime + 0.04);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      noise.start();
      this.activeGrindNode = { noise, gain };
    } catch {}
  }

  stopGrindSound() {
    if (!this.activeGrindNode || !this.ctx) return;
    try {
      const { noise, gain } = this.activeGrindNode;
      const now = this.ctx.currentTime;
      gain.gain.linearRampToValueAtTime(0.001, now + 0.05);
      noise.stop(now + 0.06);
    } catch {}
    this.activeGrindNode = null;
  }

  /**
   * Pigeon wing flutter sound
   */
  playPigeonFlutter() {
    this.resumeContext();
    if (!this.ctx || this.settings.isMuted || this.settings.sfxVolume <= 0) return;

    try {
      const now = this.ctx.currentTime;
      for (let f = 0; f < 5; f++) {
        const delay = f * 0.05;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(110 + Math.random() * 60, now + delay);
        osc.frequency.exponentialRampToValueAtTime(40, now + delay + 0.04);
        gain.gain.setValueAtTime(0.18, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.04);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now + delay);
        osc.stop(now + delay + 0.05);
      }
    } catch {}
  }

  /**
   * Sticker slap sound
   */
  playStickerSlap() {
    this.resumeContext();
    if (!this.ctx || this.settings.isMuted || this.settings.sfxVolume <= 0) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(750, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.04);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.06);
    } catch {}
  }

  /**
   * Ready Up ping/chime
   */
  playReadyBeep(isReady = true) {
    this.resumeContext();
    if (!this.ctx || this.settings.isMuted || this.settings.sfxVolume <= 0) return;

    try {
      const now = this.ctx.currentTime;
      const freq = isReady ? 880 : 440; // A5 for ready, A4 for unready
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      if (isReady) {
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.15); // Ascending chime
      }

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch (e) {
      // ignore
    }
  }

  /**
   * Countdown horn/beep for race start
   */
  playCountdownBeep(isGo = false) {
    this.resumeContext();
    if (!this.ctx || this.settings.isMuted || this.settings.sfxVolume <= 0) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = isGo ? 'sawtooth' : 'sine';
      const freq = isGo ? 1046.5 : 523.25; // C6 for GO, C5 for countdown
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (isGo ? 0.45 : 0.2));

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + (isGo ? 0.46 : 0.22));
    } catch (e) {
      // ignore
    }
  }

  /**
   * Background Music Player:
   * Supports playing the given background song file (bgm.mp3, song.mp3, audio/bgm.mp3, etc.)
   * with automatic fallback to the authentic synthesized procedural lo-fi skate beat.
   */
  startBackgroundMusic() {
    this.resumeContext();
    if (this.isMusicPlaying) return;
    this.isMusicPlaying = true;

    // Check if background song element is already loaded
    if (this.bgmAudio) {
      try {
        this.bgmAudio.play().catch(() => {
          this._startProceduralMusic();
        });
        return;
      } catch {
        this._startProceduralMusic();
        return;
      }
    }

    // Try finding candidate song files in the project folder
    const songCandidates = ['bgm.mp3', 'song.mp3', 'audio/bgm.mp3', 'music.mp3', 'assets/bgm.mp3'];
    let attempted = 0;

    const tryCandidate = (index) => {
      if (index >= songCandidates.length) {
        // No external audio file found; run procedural synth beat
        this._startProceduralMusic();
        return;
      }

      const audio = new Audio();
      audio.src = songCandidates[index];
      audio.loop = true;
      audio.preload = 'auto';

      audio.addEventListener('canplaythrough', () => {
        if (!this.isMusicPlaying) return;
        this.bgmAudio = audio;
        this.hasExternalSong = true;
        this._stopProceduralMusic();

        try {
          if (this.ctx && this.musicGain && !this.bgmSourceNode) {
            this.bgmSourceNode = this.ctx.createMediaElementSource(audio);
            this.bgmSourceNode.connect(this.musicGain);
          }
          audio.volume = this.settings.isMuted ? 0 : (this.settings.masterVolume / 100) * (this.settings.musicVolume / 100);
          audio.play().catch(() => {});
        } catch {
          audio.volume = this.settings.isMuted ? 0 : (this.settings.masterVolume / 100) * (this.settings.musicVolume / 100);
          audio.play().catch(() => {});
        }
      }, { once: true });

      audio.addEventListener('error', () => {
        tryCandidate(index + 1);
      }, { once: true });

      audio.load();
    };

    tryCandidate(0);
    // Start procedural beat immediately so player has immediate audio while song buffers
    this._startProceduralMusic();
  }

  stopBackgroundMusic() {
    this.isMusicPlaying = false;
    if (this.bgmAudio) {
      try {
        this.bgmAudio.pause();
        this.bgmAudio.currentTime = 0;
      } catch {}
    }
    this._stopProceduralMusic();
  }

  _startProceduralMusic() {
    if (this.musicTimer || !this.ctx) return;
    this.musicBeat = 0;

    const tempo = 88; // 88 BPM boom-bap skate vibe
    const intervalMs = (60 / tempo / 4) * 1000; // 16th notes
    const bassNotes = [73.42, 87.31, 98.0, 130.81];

    this.musicTimer = setInterval(() => {
      if (!this.isMusicPlaying || !this.ctx || this.hasExternalSong || this.settings.isMuted || this.settings.musicVolume <= 0) {
        this.musicBeat = (this.musicBeat + 1) % 16;
        return;
      }

      const step = this.musicBeat % 16;
      const now = this.ctx.currentTime;

      // Kick drum on steps 0, 6, 10
      if (step === 0 || step === 6 || step === 10) {
        this._playDrumKick(now);
      }

      // Snare drum on steps 4, 12
      if (step === 4 || step === 12) {
        this._playDrumSnare(now);
      }

      // Closed hi-hat on every even step (0, 2, 4, 6...)
      if (step % 2 === 0) {
        this._playDrumHiHat(now, step % 4 === 2 ? 0.12 : 0.07);
      }

      // Bass note groove
      if (step === 0 || step === 3 || step === 8 || step === 11) {
        const noteIndex = Math.floor(step / 4);
        this._playBassNote(now, bassNotes[noteIndex % bassNotes.length]);
      }

      this.musicBeat = (this.musicBeat + 1) % 16;
    }, intervalMs);
  }

  _stopProceduralMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  _playDrumKick(time) {
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.frequency.setValueAtTime(140, time);
      osc.frequency.exponentialRampToValueAtTime(38, time + 0.12);

      gain.gain.setValueAtTime(0.4, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

      osc.connect(gain);
      gain.connect(this.musicGain);

      osc.start(time);
      osc.stop(time + 0.16);
    } catch {}
  }

  _playDrumSnare(time) {
    try {
      // Noise component
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.1, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.25;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 1100;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);

      noise.start(time);
      noise.stop(time + 0.13);
    } catch {}
  }

  _playDrumHiHat(time, vol = 0.08) {
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(7500, time);

      gain.gain.setValueAtTime(vol, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.035);

      osc.connect(gain);
      gain.connect(this.musicGain);

      osc.start(time);
      osc.stop(time + 0.04);
    } catch {}
  }

  _playBassNote(time, freq) {
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);

      // Low pass filter for warm funky bass
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(260, time);
      filter.frequency.exponentialRampToValueAtTime(110, time + 0.25);

      gain.gain.setValueAtTime(0.22, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);

      osc.start(time);
      osc.stop(time + 0.3);
    } catch {}
  }
}

export const Sound = new AudioManager();
