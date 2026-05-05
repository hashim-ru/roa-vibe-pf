import knightMovesJson from './knight.moves.json';
import type { MoveData, MoveSet } from '../../../data/schema/moves.schema';

export const KNIGHT_MOVES: MoveSet = knightMovesJson as unknown as Record<string, MoveData>;
