/**
 * 14-bone humanoid skeleton spec for the FighterRenderer. Bones are
 * stored as parent-relative offsets so the whole rig can be re-anchored
 * by moving `pelvis` and the rest follows.
 *
 * Coordinates are LOCAL to the fighter's anchor (pelvis at origin):
 *   +x = forward (relative to facing — flipped at draw time for facing=-1)
 *   +y = down (screen convention; head sits at -H)
 *   rot = radians, 0 = horizontal forward, π/2 = down
 *
 * Each bone is rendered as a capsule from `parentEnd → end`, where
 * end = parent.end + (cos(rot), sin(rot)) * length. Visualized as:
 *
 *     head
 *      |
 *     neck
 *      |
 *    torso (= chest)
 *    /  |  \
 *   sh-back   sh-front (shoulders attached to torso end)
 *    |          |
 *   elb-back  elb-front
 *    |          |
 *   hand-back hand-front
 *
 *   pelvis (root)
 *    /  \
 *   hip-back  hip-front
 *    |        |
 *   knee-back knee-front
 *    |        |
 *   foot-back foot-front
 */
export type BoneId =
  | 'pelvis'
  | 'torso'
  | 'neck'
  | 'head'
  | 'shoulderBack'
  | 'elbowBack'
  | 'handBack'
  | 'shoulderFront'
  | 'elbowFront'
  | 'handFront'
  | 'hipBack'
  | 'kneeBack'
  | 'footBack'
  | 'hipFront'
  | 'kneeFront'
  | 'footFront';

export interface Bone {
  id: BoneId;
  /** Parent bone — null for root (pelvis). */
  parent: BoneId | null;
  /**
   * Length of the bone's capsule along its rotation. Drawn from parent's
   * end-point to (parent.end + length * direction(rot)).
   */
  length: number;
  /** Capsule thickness (radius). */
  radius: number;
  /**
   * Rest rotation in radians. 0 = pointing forward (+x), π/2 = down,
   * -π/2 = up. Pose system overrides this per-state.
   */
  rest: number;
  /**
   * Local offset from parent's end-point. Used for shoulders/hips that
   * branch off the torso/pelvis at non-trivial offsets, not as direct
   * tip continuations.
   */
  offsetX?: number;
  offsetY?: number;
  /** Z-order: higher = drawn on top. Front limbs > torso > back limbs. */
  z: number;
}

/**
 * Default skeleton — proportions are tuned to read at body height ≈ 60 px.
 * Adjust per-character via SkeletonScale (light chars are ≈ 0.92×).
 */
export function defaultSkeleton(bodyHeight: number, bodyWidth: number): Record<BoneId, Bone> {
  const H = bodyHeight;
  const W = bodyWidth;
  const torsoH = H * 0.34;
  const headR = H * 0.13;
  const armUpper = H * 0.20;
  const armFore = H * 0.18;
  const armR = W * 0.18;
  const legUpper = H * 0.22;
  const legLower = H * 0.20;
  const legR = W * 0.21;
  return {
    pelvis: { id: 'pelvis', parent: null, length: 0, radius: 0, rest: 0, z: 0 },
    torso: { id: 'torso', parent: 'pelvis', length: torsoH, radius: W * 0.45, rest: -Math.PI / 2, z: 5 },
    neck: { id: 'neck', parent: 'torso', length: H * 0.05, radius: W * 0.12, rest: -Math.PI / 2, z: 6 },
    head: { id: 'head', parent: 'neck', length: headR * 1.5, radius: headR, rest: -Math.PI / 2, z: 9 },

    // Back arm — drawn behind torso. Default rest hangs slightly back.
    shoulderBack: {
      id: 'shoulderBack',
      parent: 'torso',
      length: armUpper,
      radius: armR * 0.95,
      rest: 1.05,
      offsetX: -W * 0.18,
      offsetY: H * 0.04,
      z: 2
    },
    elbowBack: { id: 'elbowBack', parent: 'shoulderBack', length: armFore, radius: armR * 0.85, rest: 0.6, z: 3 },
    handBack: { id: 'handBack', parent: 'elbowBack', length: 0, radius: armR * 1.05, rest: 0, z: 4 },

    // Front arm — drawn in front of torso. Holds the weapon.
    shoulderFront: {
      id: 'shoulderFront',
      parent: 'torso',
      length: armUpper,
      radius: armR,
      rest: -0.78,
      offsetX: W * 0.18,
      offsetY: H * 0.04,
      z: 12
    },
    elbowFront: { id: 'elbowFront', parent: 'shoulderFront', length: armFore, radius: armR * 0.9, rest: 0.4, z: 13 },
    handFront: { id: 'handFront', parent: 'elbowFront', length: 0, radius: armR * 1.15, rest: 0, z: 14 },

    // Legs — rest stance is a slight A-frame so the feet aren't stacked.
    hipBack: {
      id: 'hipBack',
      parent: 'pelvis',
      length: legUpper,
      radius: legR,
      rest: Math.PI / 2 + 0.18,
      offsetX: -W * 0.12,
      z: 7
    },
    kneeBack: { id: 'kneeBack', parent: 'hipBack', length: legLower, radius: legR * 0.92, rest: 0, z: 8 },
    footBack: { id: 'footBack', parent: 'kneeBack', length: 0, radius: legR * 1.05, rest: 0, z: 8 },
    hipFront: {
      id: 'hipFront',
      parent: 'pelvis',
      length: legUpper,
      radius: legR,
      rest: Math.PI / 2 - 0.18,
      offsetX: W * 0.12,
      z: 10
    },
    kneeFront: { id: 'kneeFront', parent: 'hipFront', length: legLower, radius: legR * 0.92, rest: 0, z: 11 },
    footFront: { id: 'footFront', parent: 'kneeFront', length: 0, radius: legR * 1.05, rest: 0, z: 11 }
  };
}

/**
 * A snapshot of bone end-points + rotations in fighter-local space, ready
 * to be drawn. Computed by walking the skeleton tree and accumulating
 * parent rotations + offsets.
 */
export interface BoneTransform {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  rot: number;
  radius: number;
  z: number;
}

export function solveSkeleton(
  bones: Record<BoneId, Bone>,
  poseRot: Partial<Record<BoneId, number>>
): Record<BoneId, BoneTransform> {
  const out = {} as Record<BoneId, BoneTransform>;
  // Walk in a fixed order so parents are solved before children.
  const order: BoneId[] = [
    'pelvis',
    'torso',
    'neck',
    'head',
    'shoulderBack',
    'elbowBack',
    'handBack',
    'shoulderFront',
    'elbowFront',
    'handFront',
    'hipBack',
    'kneeBack',
    'footBack',
    'hipFront',
    'kneeFront',
    'footFront'
  ];
  for (const id of order) {
    const bone = bones[id];
    let startX = 0;
    let startY = 0;
    if (bone.parent) {
      const p = out[bone.parent];
      startX = p.endX + (bone.offsetX ?? 0);
      startY = p.endY + (bone.offsetY ?? 0);
    }
    const rot = poseRot[id] ?? bone.rest;
    const endX = startX + Math.cos(rot) * bone.length;
    const endY = startY + Math.sin(rot) * bone.length;
    out[id] = {
      startX,
      startY,
      endX,
      endY,
      rot,
      radius: bone.radius,
      z: bone.z
    };
  }
  return out;
}
