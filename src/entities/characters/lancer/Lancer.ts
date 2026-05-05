import lancerMovesJson from './lancer.moves.json';
import type { MoveData, MoveSet } from '../../../data/schema/moves.schema';

/**
 * Lancer moveset (Marth/Marcina-class). Phase 0 contains a minimal stub
 * (jab + nair) just so the runtime can resolve attacks. Phase 3 replaces
 * this JSON with the full 16-move set tuned 1:1 against kuroganehammer.com
 * Smash 4 Marth + SmashWiki Melee Marth frame data.
 */
export const LANCER_MOVES: MoveSet = lancerMovesJson as unknown as Record<string, MoveData>;
