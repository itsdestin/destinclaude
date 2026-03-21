// Game server configuration
// In production, these should be set via environment variables or a config file
export const RELAY_URL = (window as any).__CONNECT4_RELAY_URL ?? 'ws://localhost:3002';
export const LEADERBOARD_URL = (window as any).__CONNECT4_LEADERBOARD_URL ?? 'http://localhost:3001';
