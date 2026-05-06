import type { Fighter } from '../entities/Fighter';
import { ActiveHitbox, hitboxOverlapsAABB } from './Hitbox';
import { applyDI, computeKnockback, hitPauseFrames, hitstunFrames, launchVector } from './Knockback';
import { hitPause } from './HitPause';
import { bus } from '../core/EventBus';

export interface PendingHit {
  attacker: Fighter;
  victim: Fighter;
  hb: ActiveHitbox;
}

export class HitDetection {
  /**
   * For each attacker's active hitboxes, find overlapping victim hurtboxes.
   * Resolve simultaneous hits per (attacker→victim) pair by priority/damage.
   * Apply damage, knockback, hitstun, hit pause; flag the hit so the same
   * `hitId` cannot connect with the same victim twice within one move.
   */
  run(fighters: Fighter[], tick: number): void {
    const candidates: PendingHit[] = [];

    for (const attacker of fighters) {
      const boxes = attacker.getActiveHitboxes(tick);
      if (boxes.length === 0) continue;
      for (const victim of fighters) {
        if (victim === attacker) continue;
        if (victim.hurtbox.state === 'intangible') continue;
        if (victim.fsm.is('KO')) continue;
        const vb = victim.body.bounds();
        for (const active of boxes) {
          const hbId = active.data.hitId;
          if (attacker.hasAlreadyHit(victim.playerIndex, hbId)) continue;
          // Shape-aware overlap test (rect / circle / arc) replaces the
          // old AABB-only path. Hurtbox stays a rect (player body bounds).
          if (hitboxOverlapsAABB(active, vb)) {
            candidates.push({ attacker, victim, hb: active });
          }
        }
      }
    }

    if (candidates.length === 0) return;

    // Reduce to one PendingHit per (attacker → victim) ordered pair using
    // priority + damage as tiebreaker. Transcendent hitboxes always win
    // their slot vs non-transcendent hitboxes from the same attacker.
    const map = new Map<string, PendingHit>();
    for (const c of candidates) {
      const key = `${c.attacker.playerIndex}:${c.victim.playerIndex}`;
      const existing = map.get(key);
      const cT = c.hb.data.transcendent === true;
      const eT = existing?.hb.data.transcendent === true;
      const winsByPriority =
        !existing ||
        (cT && !eT) ||
        c.hb.data.priority > existing.hb.data.priority ||
        (c.hb.data.priority === existing.hb.data.priority && c.hb.data.damage > existing.hb.data.damage);
      if (winsByPriority) map.set(key, c);
    }

    // Clank detection: if the two pairs (A→B) and (B→A) both exist and
    // both hits are non-transcendent and damage delta ≤ 9 (Smash 4 clank
    // window — Melee uses ≤ 8), neither hit lands. Both attackers enter
    // a brief clank stagger so the spacing read stays meaningful.
    const consumed = new Set<string>();
    for (const [key, hit] of map) {
      if (consumed.has(key)) continue;
      const reverseKey = `${hit.victim.playerIndex}:${hit.attacker.playerIndex}`;
      const reverse = map.get(reverseKey);
      if (!reverse || consumed.has(reverseKey)) continue;
      const aT = hit.hb.data.transcendent === true;
      const bT = reverse.hb.data.transcendent === true;
      if (aT || bT) continue;
      const dmgDelta = Math.abs(hit.hb.data.damage - reverse.hb.data.damage);
      if (dmgDelta > 9) continue;
      // Both clank.
      hit.attacker.clankUntilTick = tick + 12;
      reverse.attacker.clankUntilTick = tick + 12;
      hitPause.freeze(hit.attacker, 8, tick);
      hitPause.freeze(reverse.attacker, 8, tick);
      bus.emit('clank', {
        aId: hit.attacker.playerIndex,
        bId: reverse.attacker.playerIndex
      });
      consumed.add(key);
      consumed.add(reverseKey);
    }

    for (const [key, hit] of map.entries()) {
      if (consumed.has(key)) continue;
      this.applyHit(hit, tick);
    }
  }

  private applyHit(hit: PendingHit, tick: number): void {
    const { attacker, victim, hb } = hit;
    const data = hb.data;

    if (victim.hurtbox.state === 'invincible' || victim.isInvincible(tick)) return;

    if (victim.parryActive(tick)) {
      this.applyParry(attacker, victim, tick);
      return;
    }

    attacker.markHit(victim.playerIndex, data.hitId);

    // Stale-move scaling — last 9 hits are tracked, repeated move IDs lose
    // 5% damage per occurrence (Smash 4 staling).
    const staleMul = attacker.pushStaleMove(data.hitId);
    const effectiveDamage = data.damage * staleMul;

    let kb = computeKnockback({
      victimPercent: victim.percent,
      damage: effectiveDamage,
      weight: victim.stats.weight,
      baseKB: data.baseKB,
      kbGrowth: data.kbGrowth,
      fixedKB: data.fixedKB
    });

    // Crouch cancel — Melee canon. On low-KB hits while crouching: scale
    // the launch magnitude by 0.85 *and* compress the vertical component
    // of the launch angle so the victim sticks to the ground rather than
    // popping up. This kills vertical combo strings the way Melee
    // ASDI-down + CC do; the defender just slides instead of being juggled.
    const ccActive = victim.fsm.is('Crouch') && kb < 80 && data.fixedKB === undefined;
    if (ccActive) {
      kb *= 0.85;
    }

    victim.percent += effectiveDamage;

    const facing = (attacker.body.x <= victim.body.x ? 1 : -1) as 1 | -1;
    const stick = victim.input.current();
    let angle = applyDI(data.angle === 361 ? (kb < 32 ? 0 : 44) : data.angle, stick.stickX, stick.stickY);
    if (ccActive) {
      // Cap absolute launch angle at 30° from horizontal while CC'd.
      // Sign-preserving so left/right launches stay on the same side.
      const cap = 30;
      if (angle > cap) angle = cap;
      else if (angle < -cap) angle = -cap;
    }
    const lv = launchVector(kb, angle, facing);

    victim.body.vx = lv.vx;
    victim.body.vy = lv.vy;

    const hitstun = hitstunFrames(kb, data.hitstunMul);
    const pause = hitPauseFrames(effectiveDamage, { electric: data.electric });
    hitPause.freeze(attacker, pause, tick);
    hitPause.freeze(victim, pause, tick);
    // Reset SDI accumulator so the new pause window's pulses are tracked.
    victim.sdiAccumX = 0;
    victim.sdiAccumY = 0;
    victim.lastSDIDirX = 0;
    victim.lastSDIDirY = 0;

    victim.enterHitstun(hitstun, tick, kb);
    bus.emit('hit', {
      attackerId: attacker.playerIndex,
      victimId: victim.playerIndex,
      damage: data.damage
    });
  }

  private applyParry(attacker: Fighter, victim: Fighter, tick: number): void {
    hitPause.freeze(attacker, 24, tick);
    victim.onParrySuccess(tick);
    bus.emit('parry', { defenderId: victim.playerIndex, attackerId: attacker.playerIndex });
  }
}

export const hitDetection = new HitDetection();
