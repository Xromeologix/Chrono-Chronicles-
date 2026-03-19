/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { create } from 'zustand';
import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';

export type GameState = 'menu' | 'playing' | 'gameover';
export type EntityState = 'active' | 'disabled';

export type GameMode = 'nexus' | 'chronos';
export type EnemyType = 'default' | 'executioner' | 'ninja' | 'gunslinger';

export interface EnemyData {
  id: string;
  position: [number, number, number];
  state: EntityState;
  disabledUntil: number;
  type: EnemyType;
  health: number;
}

export interface PlayerData {
  id: string;
  name: string;
  position: [number, number, number];
  rotation: number;
  state: EntityState;
  disabledUntil: number;
  score: number;
  color: string;
}

export interface LaserData {
  id: string;
  start: [number, number, number];
  end: [number, number, number];
  timestamp: number;
  color: string;
}

export interface ParticleData {
  id: string;
  position: [number, number, number];
  timestamp: number;
  color: string;
}

export interface GameEvent {
  id: string;
  message: string;
  timestamp: number;
}

interface GameStore {
  gameMode: GameMode;
  setGameMode: (mode: GameMode) => void;
  gameState: GameState;
  score: number;
  timeLeft: number;
  playerState: EntityState;
  playerHealth: number;
  playerDisabledUntil: number;
  isExecuted: boolean;
  playerHookedBy: { id: string, position: [number, number, number] } | null;
  setPlayerHookedBy: (hookData: { id: string, position: [number, number, number] } | null) => void;
  enemies: EnemyData[];
  lasers: LaserData[];
  particles: ParticleData[];
  events: GameEvent[];
  
  // Multiplayer
  socket: Socket | null;
  otherPlayers: Record<string, PlayerData>;

  startGame: () => void;
  endGame: () => void;
  leaveGame: () => void;
  updateTime: (delta: number) => void;
  hitPlayer: (instantKill?: boolean, damage?: number) => void;
  hitEnemy: (id: string, byPlayer?: boolean, damage?: number) => void;
  addLaser: (start: [number, number, number], end: [number, number, number], color: string) => void;
  addParticles: (position: [number, number, number], color: string) => void;
  addEvent: (message: string) => void;
  updateEnemies: (time: number) => void;
  cleanupEffects: (time: number) => void;
  setPlayerState: (state: EntityState) => void;
  
  // Multiplayer actions
  updatePlayerPosition: (position: [number, number, number], rotation: number) => void;

  // Mobile Controls
  mobileInput: {
    move: { x: number, y: number };
    shooting: boolean;
  };
  lookDeltaX: number;
  lookDeltaY: number;
  addLookDelta: (dx: number, dy: number) => void;
  consumeLookDeltaX: () => number;
  consumeLookDeltaY: () => number;
  setMobileInput: (input: Partial<{
    move: { x: number, y: number };
    shooting: boolean;
  }>) => void;
}

const INITIAL_ENEMIES: EnemyData[] = [
  { id: 'bot-1', position: [40, 1, 40], state: 'active', disabledUntil: 0, type: 'default', health: 100 },
  { id: 'bot-2', position: [-40, 1, 40], state: 'active', disabledUntil: 0, type: 'default', health: 100 },
  { id: 'bot-3', position: [40, 1, -40], state: 'active', disabledUntil: 0, type: 'default', health: 100 },
  { id: 'bot-4', position: [-40, 1, -40], state: 'active', disabledUntil: 0, type: 'default', health: 100 },
  { id: 'bot-5', position: [0, 1, -50], state: 'active', disabledUntil: 0, type: 'default', health: 100 },
  { id: 'bot-6', position: [60, 1, 0], state: 'active', disabledUntil: 0, type: 'default', health: 100 },
  { id: 'bot-7', position: [-60, 1, 0], state: 'active', disabledUntil: 0, type: 'default', health: 100 },
  { id: 'bot-8', position: [0, 1, 50], state: 'active', disabledUntil: 0, type: 'default', health: 100 },
];

const CHRONOS_ENEMIES: EnemyData[] = [
  { id: 'executioner-1', position: [30, 1, 30], state: 'active', disabledUntil: 0, type: 'executioner', health: 100 },
  { id: 'ninja-1', position: [-30, 1, 30], state: 'active', disabledUntil: 0, type: 'ninja', health: 100 },
  { id: 'gunslinger-1', position: [30, 1, -30], state: 'active', disabledUntil: 0, type: 'gunslinger', health: 100 },
  { id: 'ninja-2', position: [-30, 1, -30], state: 'active', disabledUntil: 0, type: 'ninja', health: 100 },
  { id: 'executioner-2', position: [0, 1, -40], state: 'active', disabledUntil: 0, type: 'executioner', health: 100 },
  { id: 'gunslinger-2', position: [50, 1, 0], state: 'active', disabledUntil: 0, type: 'gunslinger', health: 100 },
  { id: 'ninja-3', position: [-50, 1, 0], state: 'active', disabledUntil: 0, type: 'ninja', health: 100 },
  { id: 'gunslinger-3', position: [0, 1, 40], state: 'active', disabledUntil: 0, type: 'gunslinger', health: 100 },
];

export const useGameStore = create<GameStore>((set, get) => ({
  gameMode: 'nexus',
  setGameMode: (mode) => set({ gameMode: mode }),
  gameState: 'menu',
  score: 0,
  timeLeft: 120, // 2 minutes
  playerState: 'active',
  playerHealth: 100,
  playerDisabledUntil: 0,
  isExecuted: false,
  playerHookedBy: null,
  setPlayerHookedBy: (hookData) => set({ playerHookedBy: hookData }),
  enemies: [],
  lasers: [],
  particles: [],
  events: [],
  
  socket: null,
  otherPlayers: {},

  mobileInput: {
    move: { x: 0, y: 0 },
    shooting: false
  },
  lookDeltaX: 0,
  lookDeltaY: 0,
  addLookDelta: (dx, dy) => set((state) => ({ lookDeltaX: state.lookDeltaX + dx, lookDeltaY: state.lookDeltaY + dy })),
  consumeLookDeltaX: () => {
    const delta = get().lookDeltaX;
    set({ lookDeltaX: 0 });
    return delta;
  },
  consumeLookDeltaY: () => {
    const delta = get().lookDeltaY;
    set({ lookDeltaY: 0 });
    return delta;
  },

  setMobileInput: (input) => set((state) => ({
    mobileInput: { ...state.mobileInput, ...input }
  })),

  startGame: () => {
    const { socket } = get();
    
    if (socket) {
      socket.disconnect();
    }

    let newSocket: Socket | null = null;

    // Initialize multiplayer
    newSocket = io(window.location.origin);
    
    newSocket.on('connect', () => {
      newSocket!.emit('joinGame');
    });

    newSocket.on('gameError', (msg: string) => {
      alert(msg);
      get().leaveGame();
    });

    newSocket.on('gameJoined', (players: Record<string, PlayerData>) => {
      const otherPlayers = { ...players };
      delete otherPlayers[newSocket!.id!];
      const enemiesList = get().gameMode === 'chronos' ? CHRONOS_ENEMIES : INITIAL_ENEMIES;
      set({ 
        otherPlayers,
        gameState: 'playing',
        timeLeft: 120,
        score: 0,
        enemies: enemiesList.map(e => ({ ...e, state: 'active', disabledUntil: 0 }))
      });
    });

      newSocket.on('playerJoined', (player: PlayerData) => {
        set(state => ({
          otherPlayers: { ...state.otherPlayers, [player.id]: player },
          events: [...state.events, { id: Math.random().toString(), message: `${player.name} joined`, timestamp: Date.now() }]
        }));
      });

      newSocket.on('playerMoved', (data: { id: string, position: [number, number, number], rotation: number }) => {
        set(state => {
          if (!state.otherPlayers[data.id]) return state;
          return {
            otherPlayers: {
              ...state.otherPlayers,
              [data.id]: {
                ...state.otherPlayers[data.id],
                position: data.position,
                rotation: data.rotation
              }
            }
          };
        });
      });

      newSocket.on('playerShot', (data: { id: string, start: [number, number, number], end: [number, number, number], color: string }) => {
        set(state => ({
          lasers: [...state.lasers, { id: Math.random().toString(36).substr(2, 9), start: data.start, end: data.end, timestamp: Date.now(), color: data.color }],
          particles: [...state.particles, { id: Math.random().toString(36).substr(2, 9), position: data.end, timestamp: Date.now(), color: data.color }]
        }));
      });

      newSocket.on('playerHit', (data: { targetId: string, shooterId: string, targetDisabledUntil: number, shooterScore: number }) => {
        set(state => {
          const now = Date.now();
          const isLocalShooter = data.shooterId === newSocket!.id;
          const isLocalTarget = data.targetId === newSocket!.id;
          
          const shooterName = isLocalShooter ? 'You' : (state.otherPlayers[data.shooterId]?.name || 'Unknown');
          const targetName = isLocalTarget ? 'You' : (state.otherPlayers[data.targetId]?.name || 'Unknown');
          const eventMsg = `${shooterName} tagged ${targetName}`;
          const newEvent = { id: Math.random().toString(), message: eventMsg, timestamp: now };

          let newState: Partial<GameStore> = {
            events: [...state.events, newEvent]
          };

          if (isLocalTarget) {
            newState.playerState = 'disabled';
            newState.playerDisabledUntil = data.targetDisabledUntil;
          }

          if (isLocalShooter) {
            newState.score = data.shooterScore;
          }

          // Update other players' states
          const players = { ...state.otherPlayers };
          let playersChanged = false;

          if (!isLocalTarget && players[data.targetId]) {
            players[data.targetId] = {
              ...players[data.targetId],
              state: 'disabled',
              disabledUntil: data.targetDisabledUntil
            };
            playersChanged = true;
          }

          if (!isLocalShooter && players[data.shooterId]) {
            players[data.shooterId] = {
              ...players[data.shooterId],
              score: data.shooterScore
            };
            playersChanged = true;
          }

          if (playersChanged) {
            newState.otherPlayers = players;
          }

          return newState;
        });
      });

      newSocket.on('playerLeft', (id: string) => {
        set(state => {
          const players = { ...state.otherPlayers };
          const playerName = players[id]?.name || 'Unknown';
          delete players[id];
          return { 
            otherPlayers: players,
            events: [...state.events, { id: Math.random().toString(), message: `${playerName} left`, timestamp: Date.now() }]
          };
        });
      });
    const enemiesList = get().gameMode === 'chronos' ? CHRONOS_ENEMIES : INITIAL_ENEMIES;
    set({
      gameState: 'playing',
      score: 0,
      timeLeft: 120,
      playerState: 'active',
      playerHealth: 100,
      playerDisabledUntil: 0,
      isExecuted: false,
      playerHookedBy: null,
      enemies: enemiesList.map(e => ({ ...e, state: 'active', health: 100, disabledUntil: 0 })),
      lasers: [],
      particles: [],
      events: [],
      socket: newSocket,
      otherPlayers: {},
    });
  },

  endGame: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
    }
    set({ gameState: 'gameover', socket: null });
  },

  leaveGame: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
    }
    set({
      gameState: 'menu',
      socket: null,
      otherPlayers: {},
      enemies: [],
      lasers: [],
      particles: [],
      events: [],
      score: 0,
      timeLeft: 120,
      playerState: 'active',
      playerHealth: 100,
      isExecuted: false,
      playerHookedBy: null
    });
  },

  updateTime: (delta) => set((state) => {
    if (state.gameState !== 'playing') return state;
    const newTime = state.timeLeft - delta;
    if (newTime <= 0) {
      if (state.socket) state.socket.disconnect();
      return { timeLeft: 0, gameState: 'gameover', socket: null, roomId: null };
    }
    return { timeLeft: newTime };
  }),

  hitPlayer: (instantKill = false, damage = 20) => set((state) => {
    if (state.playerState === 'disabled' || state.gameState !== 'playing') return state;
    
    const newHealth = instantKill ? 0 : state.playerHealth - damage;
    
    if (newHealth <= 0) {
      return {
        playerState: 'disabled',
        playerHealth: 0,
        playerDisabledUntil: Date.now() + (instantKill ? 5000 : 3000),
        isExecuted: instantKill,
        score: Math.max(0, state.score - (instantKill ? 100 : 50)), // Penalty for getting hit
      };
    }
    
    return { playerHealth: newHealth };
  }),

  hitEnemy: (id, byPlayer = false, damage = 34) => set((state) => {
    if (state.gameState !== 'playing') return state;
    
    // Check if it's a multiplayer player
    if (state.socket && state.otherPlayers[id]) {
      state.socket.emit('hitPlayer', id);
      return state;
    }

    const enemies = state.enemies.map(e => {
      if (e.id === id && e.state === 'active') {
        const newHealth = e.health - damage;
        if (newHealth <= 0) {
          return { ...e, state: 'disabled' as EntityState, health: 0, disabledUntil: Date.now() + 3000 };
        }
        return { ...e, health: newHealth };
      }
      return e;
    });
    return {
      enemies,
      score: byPlayer ? state.score + 100 : state.score, // Points for hitting enemy
      events: byPlayer ? [...state.events, { id: Math.random().toString(), message: `You tagged ${id}`, timestamp: Date.now() }] : state.events
    };
  }),

  addLaser: (start, end, color) => {
    const { socket } = get();
    if (socket) {
      socket.emit('shoot', { start, end, color });
    }
    set((state) => ({
      lasers: [...state.lasers, { id: Math.random().toString(36).substr(2, 9), start, end, timestamp: Date.now(), color }]
    }));
  },

  addParticles: (position, color) => set((state) => ({
    particles: [...state.particles, { id: Math.random().toString(36).substr(2, 9), position, timestamp: Date.now(), color }]
  })),

  addEvent: (message) => set((state) => ({
    events: [...state.events, { id: Math.random().toString(), message, timestamp: Date.now() }]
  })),

  updateEnemies: (time) => set((state) => {
    let changed = false;
    const enemies = state.enemies.map(e => {
      if (e.state === 'disabled' && time > e.disabledUntil) {
        changed = true;
        return { ...e, state: 'active' as EntityState };
      }
      return e;
    });
    
    // Also update other players' states
    let otherPlayers = state.otherPlayers;
    let playersChanged = false;
    Object.values(state.otherPlayers).forEach(p => {
      if (p.state === 'disabled' && time > p.disabledUntil) {
        if (!playersChanged) {
          otherPlayers = { ...state.otherPlayers };
          playersChanged = true;
        }
        otherPlayers[p.id] = { ...p, state: 'active' };
      }
    });

    if (state.playerState === 'disabled' && time > state.playerDisabledUntil) {
      return { enemies, playerState: 'active', playerHealth: 100, isExecuted: false, otherPlayers: playersChanged ? otherPlayers : state.otherPlayers };
    }
    return changed || playersChanged ? { enemies, otherPlayers } : state;
  }),

  cleanupEffects: (time) => set((state) => {
    const lasers = state.lasers.filter(l => time - l.timestamp < 200); // Lasers last 200ms
    const particles = state.particles.filter(p => time - p.timestamp < 500); // Particles last 500ms
    const events = state.events.filter(e => time - e.timestamp < 5000); // Events last 5s
    if (lasers.length !== state.lasers.length || particles.length !== state.particles.length || events.length !== state.events.length) {
      return { lasers, particles, events };
    }
    return state;
  }),

  setPlayerState: (playerState) => set({ playerState }),

  updatePlayerPosition: (position, rotation) => {
    const { socket } = get();
    if (socket) {
      socket.emit('updatePosition', { position, rotation });
    }
  }
}));
