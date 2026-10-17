/**
 * ALLEY RATS: SKATE & SPRAY
 * Global Game Configuration
 */

export const CONFIG = {
  appName: 'Alley Rats: Skate & Spray',
  version: '1.0.0-PROD',
  subtitle: 'SKATE. SPRAY. SEND IT.',
  tagline: 'An urban skateboarding playground.',
  
  // Multiplayer mode configuration
  // mockMode: false connects to the real multiplayer server via multiplayer-adapter
  // mockMode: true uses local simulated players, bots, and local broadcast
  mockMode: false,
  serverUrl: (typeof window !== 'undefined' && window.location && window.location.origin && !window.location.origin.startsWith('file'))
    ? window.location.origin
    : 'http://localhost:3000',
  
  // Room settings
  maxPlayers: 8,
  minPlayersToRace: 2,
  
  // Network throttling (ms)
  cursorUpdateInterval: 40, // 25 fps cursor broadcasts
  paintUpdateInterval: 45,  // batch paint strokes
  
  // Canvas virtual resolution
  virtualWidth: 1600,
  virtualHeight: 900,
  
  // Graffiti wall boundary (normalized 0..1 coordinates)
  wallBounds: {
    minX: 0.02,
    maxX: 0.98,
    minY: 0.08,
    maxY: 0.72
  },
  
  // Pavement boundary for skaters
  groundY: 0.82,
  pavementMinY: 0.72,
  pavementMaxY: 0.96,
  
  // Default customization presets
  defaultCustomization: {
    name: 'SK8R_' + Math.floor(1000 + Math.random() * 9000),
    skinTone: '#ffd1a4', // light, tan, dark, alien
    headwear: 'beanie', // beanie, cap_back, bucket, punk, afro, bandana, none
    headwearColor: '#ff007f', // hot pink
    hairColor: '#1e1b18',
    hoodieColor: '#7c3aed', // royal purple
    hoodieGraphic: 'rat', // rat, spray, skull, plain
    pantsColor: '#1e293b', // dark navy / charcoal
    shoesColor: '#f8fafc', // white skate kicks with black stripes
    deckGraphic: 'flame', // flame, checker, rat, toxic, lightning, hazard
    deckColor: '#0f172a',
    wheelColor: '#39ff14', // toxic neon lime
    cursorType: 'spray-can', // spray-can, pointer, brush, marker
    paintColor: '#39ff14', // toxic lime
    brushSize: 12,
  },

  // Color palettes aligned with UK/US skate alley art direction
  sprayPalette: [
    { name: 'Neon Green', hex: '#8CFF57' },
    { name: 'Cyan Blast', hex: '#35D7FF' },
    { name: 'Street Purple', hex: '#A970FF' },
    { name: 'Vivid Orange', hex: '#FF8A3D' },
    { name: 'Hot Pink', hex: '#ff007f' },
    { name: 'Acid Yellow', hex: '#ffe600' },
    { name: 'Cream White', hex: '#F3E8D0' },
    { name: 'Dark Asphalt', hex: '#25272B' }
  ],

  // Sticker stamp options for graffiti wall
  stickers: [
    { id: 'rat_crown', name: 'King Rat', emoji: '👑' },
    { id: 'skull_cross', name: 'Skate Skull', emoji: '💀' },
    { id: 'toxic_ooze', name: 'Radioactive', emoji: '☣️' },
    { id: 'anarchy', name: 'Anarchy Star', emoji: '⭐' },
    { id: 'fire_flame', name: 'Hellfire', emoji: '🔥' }
  ],

  deckGraphics: [
    { id: 'flame', name: 'Hellfire Rat' },
    { id: 'toxic', name: 'Toxic Ooze' },
    { id: 'checker', name: 'Ska Checkers' },
    { id: 'rat', name: 'King Rat King' },
    { id: 'lightning', name: 'Volt Strike' },
    { id: 'hazard', name: 'Hazard Alley' },
    { id: 'plain', name: 'Raw Maple' }
  ],

  headwearOptions: [
    { id: 'beanie', name: 'Street Beanie' },
    { id: 'cap_back', name: 'Backwards Snapback' },
    { id: 'bucket', name: '90s Bucket Hat' },
    { id: 'punk', name: 'Liberty Spikes' },
    { id: 'afro', name: 'Fresh Afro' },
    { id: 'bandana', name: 'Bandana Wrap' },
    { id: 'none', name: 'No Headwear' }
  ],

  skinTones: [
    { name: 'Peach', hex: '#ffd1a4' },
    { name: 'Honey', hex: '#e0ac69' },
    { name: 'Caramel', hex: '#c68642' },
    { name: 'Chestnut', hex: '#8d5524' },
    { name: 'Espresso', hex: '#492812' },
    { name: 'Mutant Lime', hex: '#88e060' }
  ]
};
