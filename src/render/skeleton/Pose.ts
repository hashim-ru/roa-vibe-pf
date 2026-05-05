import type { BoneId } from './Bone';

/**
 * A pose = an assignment of rotations to a subset of bones. Bones not
 * mentioned fall back to their rest rotation. Used to author keyframe
 * poses for each FSM state (idle, walk, attack windups, etc).
 *
 * Rotations are in radians, 0 = forward, π/2 = down.
 */
export type Pose = Partial<Record<BoneId, number>>;

/**
 * Linearly interpolate between two poses, with `t` in [0, 1]. Bones
 * present only in `a` interpolate toward themselves (held), bones only
 * in `b` interpolate from rest. Use `interpPose` with `t = 0` to get a
 * pure copy of `a`, `t = 1` for pure `b`, anything in between blends.
 */
export function interpPose(a: Pose, b: Pose, t: number): Pose {
  const out: Pose = {};
  const keys = new Set<BoneId>([...(Object.keys(a) as BoneId[]), ...(Object.keys(b) as BoneId[])]);
  for (const k of keys) {
    const av = a[k];
    const bv = b[k];
    if (av !== undefined && bv !== undefined) {
      out[k] = av + (bv - av) * t;
    } else if (av !== undefined) {
      out[k] = av;
    } else if (bv !== undefined) {
      out[k] = bv;
    }
  }
  return out;
}

/**
 * Add an offset to specific bones in a pose. Used to layer secondary
 * motion (e.g., breathing offset on the chest) on top of a base pose.
 */
export function addOffset(p: Pose, offsets: Pose): Pose {
  const out: Pose = { ...p };
  for (const k of Object.keys(offsets) as BoneId[]) {
    const o = offsets[k] ?? 0;
    out[k] = (out[k] ?? 0) + o;
  }
  return out;
}

/**
 * Standard easing curves. We expose only a few — most pose interpolations
 * use easeOutCubic for snappy commits or easeInOutQuad for smooth
 * transitions. easeOutBack is for follow-through overshoot.
 */
export const easings = {
  linear: (t: number) => t,
  easeOutCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeOutBack: (t: number, s = 1.7) => {
    const c3 = s + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
  },
  easeInQuint: (t: number) => t * t * t * t * t
};
