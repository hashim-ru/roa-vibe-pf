import { KNIGHT_MOVES } from '../knight/Knight';
import type { MoveData, MoveSet } from '../../../data/schema/moves.schema';

/**
 * Skirmisher reuses Knight frame data with a global speed scale: less damage,
 * less knockback growth, faster startup. Tinted/scaled at render time so the
 * silhouette reads differently without a second sprite sheet.
 */
function rescaleMove(m: MoveData, opts: { dmg: number; kbg: number; speed: number }): MoveData {
  const speed = opts.speed;
  // Rescale frame numbers, then merge collisions so each original active frame
  // still contributes a hitbox even when two land on the same target frame.
  const rescaledFrames = m.frames.map((f) => ({
    ...f,
    frame: Math.max(0, Math.round(f.frame / speed)),
    hitboxes: f.hitboxes.map((hb) => ({
      ...hb,
      damage: Math.max(1, Math.round(hb.damage * opts.dmg)),
      kbGrowth: Math.max(1, Math.round(hb.kbGrowth * opts.kbg)),
      hitId: `skir_${hb.hitId}`
    }))
  }));

  // De-duplicate by frame: if two source frames collapsed onto the same target
  // frame, keep them distinct by shifting the later one forward by 1 (clamped
  // to totalFrames-1) instead of merging — this preserves the move's "two-tick
  // active window" feel even after rescaling.
  rescaledFrames.sort((a, b) => a.frame - b.frame);
  const totalFrames = Math.max(1, Math.round(m.totalFrames / speed));
  for (let i = 1; i < rescaledFrames.length; i++) {
    if (rescaledFrames[i].frame <= rescaledFrames[i - 1].frame) {
      rescaledFrames[i].frame = Math.min(totalFrames - 1, rescaledFrames[i - 1].frame + 1);
    }
  }

  return {
    ...m,
    totalFrames,
    iasaFrame: m.iasaFrame === null ? null : Math.max(1, Math.round(m.iasaFrame / speed)),
    landingLag: Math.max(0, Math.round(m.landingLag / speed)),
    autoCancelBefore: m.autoCancelBefore === null ? null : Math.round(m.autoCancelBefore / speed),
    autoCancelAfter: m.autoCancelAfter === null ? null : Math.round(m.autoCancelAfter / speed),
    frames: rescaledFrames,
    selfMotion: m.selfMotion?.map((sm) => ({
      ...sm,
      frame: Math.max(0, Math.round(sm.frame / speed))
    }))
  };
}

const RESCALE = { dmg: 0.78, kbg: 0.85, speed: 1.18 };

export const SKIRMISHER_MOVES: MoveSet = Object.fromEntries(
  Object.entries(KNIGHT_MOVES).map(([k, v]) => [k, rescaleMove(v, RESCALE)])
) as MoveSet;
