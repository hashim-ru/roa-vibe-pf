import skirmisherMovesJson from './skirmisher.moves.json';
import type { MoveData, MoveSet } from '../../../data/schema/moves.schema';

/**
 * Hooded Skirmisher moveset (Sheik-class). Phase 0 contains a minimal stub
 * (jab + nair) just so the runtime can resolve attacks. Phase 3 replaces
 * this JSON with the full 16-move set tuned 1:1 against kuroganehammer.com
 * Smash 4 Sheik + SmashWiki Melee Sheik frame data — including the jab
 * loop, needle storm projectile, vanish teleport, and chain whip.
 */
export const HUNTRESS_MOVES: MoveSet = skirmisherMovesJson as unknown as Record<string, MoveData>;
