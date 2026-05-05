import type { MoveSet, MoveData } from '../../../data/schema/moves.schema';

/**
 * Wetlands Boss moveset: a slower, harder-hitting kit with reach. Two attack
 * sheets (10f and 9f) cover the basic offense. Without a dedicated jump/fall
 * sprite, the renderer falls back to walk frames; gameplay still works
 * because the FSM doesn't care about visuals.
 */
const wetlands_attack1_dur = 24;
const wetlands_attack2_dur = 28;

export const WETLANDS_MOVES: MoveSet = {
  jab: {
    id: 'jab',
    category: 'ground',
    totalFrames: 18,
    iasaFrame: 14,
    lCancelable: false,
    landingLag: 0,
    autoCancelBefore: null,
    autoCancelAfter: null,
    frames: [
      {
        frame: 8,
        hitboxes: [
          {
            id: 0,
            ox: 60,
            oy: -36,
            w: 70,
            h: 50,
            damage: 5,
            baseKB: 22,
            kbGrowth: 28,
            angle: 70,
            hitstunMul: 0.4,
            priority: 1,
            hitId: 'wet_jab',
            sfxKey: 'hit_med'
          }
        ]
      }
    ]
  },
  ftilt: makeAttack('wet_ftilt', wetlands_attack1_dur, 11, 64, -36, 90, 60, 11, 28, 70, 'launch', 361, 'hit_heavy'),
  utilt: makeAttack('wet_utilt', wetlands_attack1_dur, 11, 10, -90, 70, 80, 9, 24, 80, undefined, 100, 'hit_med'),
  dtilt: makeAttack('wet_dtilt', wetlands_attack1_dur, 11, 60, -16, 80, 30, 8, 22, 60, undefined, 30, 'hit_med'),
  fsmash: makeAttack('wet_fsmash', wetlands_attack2_dur, 13, 80, -36, 100, 60, 19, 32, 100, 'launch', 361, 'hit_heavy'),
  usmash: makeAttack('wet_usmash', wetlands_attack2_dur, 13, 8, -110, 90, 100, 17, 30, 105, undefined, 95, 'hit_heavy'),
  dsmash: makeAttack('wet_dsmash', wetlands_attack2_dur, 13, 70, -16, 90, 36, 15, 28, 90, undefined, 30, 'hit_heavy'),
  nair: makeAerial('wet_nair', 28, 22, 8, 0, -36, 90, 80, 11, 18, 75),
  fair: makeAerial('wet_fair', 30, 24, 11, 60, -36, 80, 50, 13, 22, 80),
  bair: makeAerial('wet_bair', 24, 19, 9, -60, -32, 70, 46, 13, 24, 85),
  uair: makeAerial('wet_uair', 24, 19, 8, 0, -90, 70, 60, 10, 16, 80),
  dair: makeAerial('wet_dair', 32, 26, 13, 4, 26, 70, 56, 15, 24, 70, 'spike', 270),
  neutralB: makeAttack('wet_neutB', 26, 12, 50, -32, 80, 50, 8, 26, 35, undefined, 60, 'hit_heavy'),
  sideB: makeAttack('wet_sideB', 32, 14, 70, -28, 80, 50, 14, 30, 75, 'launch', 361, 'hit_heavy'),
  upB: makeUpB(),
  downB: makeAttack('wet_dB', 24, 12, 60, -28, 80, 50, 13, 28, 78, 'launch', 50, 'hit_heavy')
};

function makeAttack(
  hitId: string,
  totalFrames: number,
  hitFrame: number,
  ox: number,
  oy: number,
  w: number,
  h: number,
  damage: number,
  baseKB: number,
  kbGrowth: number,
  effect: 'launch' | 'spike' | undefined,
  angle: number,
  sfxKey: string
): MoveData {
  return {
    id: hitId,
    category: 'ground',
    totalFrames,
    iasaFrame: totalFrames - 4,
    lCancelable: false,
    landingLag: 0,
    autoCancelBefore: null,
    autoCancelAfter: null,
    frames: [
      {
        frame: hitFrame,
        hitboxes: [
          {
            id: 0,
            ox,
            oy,
            w,
            h,
            damage,
            baseKB,
            kbGrowth,
            angle,
            hitstunMul: 0.4,
            priority: 3,
            hitId,
            effect,
            sfxKey
          }
        ]
      },
      {
        frame: hitFrame + 1,
        hitboxes: [
          {
            id: 0,
            ox,
            oy,
            w,
            h,
            damage,
            baseKB,
            kbGrowth,
            angle,
            hitstunMul: 0.4,
            priority: 3,
            hitId,
            effect,
            sfxKey
          }
        ]
      }
    ]
  };
}

function makeAerial(
  hitId: string,
  totalFrames: number,
  iasaFrame: number,
  hitFrame: number,
  ox: number,
  oy: number,
  w: number,
  h: number,
  damage: number,
  baseKB: number,
  kbGrowth: number,
  effect: 'launch' | 'spike' | undefined = 'launch',
  angle = 50
): MoveData {
  return {
    id: hitId,
    category: 'aerial',
    totalFrames,
    iasaFrame,
    lCancelable: true,
    landingLag: 14,
    autoCancelBefore: 4,
    autoCancelAfter: totalFrames - 4,
    frames: [
      { frame: hitFrame, hitboxes: [{ id: 0, ox, oy, w, h, damage, baseKB, kbGrowth, angle, hitstunMul: 0.4, priority: 2, hitId, effect, sfxKey: 'hit_med' }] },
      { frame: hitFrame + 1, hitboxes: [{ id: 0, ox, oy, w, h, damage, baseKB, kbGrowth, angle, hitstunMul: 0.4, priority: 2, hitId, effect, sfxKey: 'hit_med' }] }
    ]
  };
}

function makeUpB(): MoveData {
  return {
    id: 'wet_upB',
    category: 'special',
    totalFrames: 30,
    iasaFrame: 26,
    lCancelable: false,
    landingLag: 0,
    autoCancelBefore: null,
    autoCancelAfter: null,
    frames: [
      { frame: 10, hitboxes: [{ id: 0, ox: 0, oy: -70, w: 80, h: 90, damage: 9, baseKB: 18, kbGrowth: 65, angle: 100, hitstunMul: 0.4, priority: 2, hitId: 'wet_upB', sfxKey: 'hit_med' }] }
    ],
    selfMotion: [
      { frame: 4, vy: -14 },
      { frame: 5, vy: -12 }
    ]
  };
}
