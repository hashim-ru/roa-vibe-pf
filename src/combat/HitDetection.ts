import type { Fighter } from '../entities/Fighter';
import { aabbOverlap } from '../physics/Collision';
import { ActiveHitbox, hitboxBounds } from './Hitbox';
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
        for (const active of boxes) {
          const hbId = active.data.hitId;
          if (attacker.hasAlreadyHit(victim.playerIndex, hbId)) continue;
          const hb = hitboxBounds(active);
          const vb = victim.body.bounds();
          if (aabbOverlap(hb.x, hb.y, hb.w, hb.h, vb.x, vb.y, vb.w, vb.h)) {
            candidates.push({ attacker, victim, hb: active });
          }
        }
      }
    }

    if (candidates.length === 0) return;

    const map = new Map<string, PendingHit>();
    for (const c of candidates) {
      const key = `${c.attacker.playerIndex}:${c.victim.playerIndex}`;
      const existing = map.get(key);
      if (
        !existing ||
        c.hb.data.priority > existing.hb.data.priority ||
        (c.hb.data.priority === existing.hb.data.priority && c.hb.data.damage > existing.hb.data.damage)
      ) {
        map.set(key, c);
      }
    }

    for (const hit of map.values()) {
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

    const kb = computeKnockback({
      victimPercent: victim.percent,
      damage: data.damage,
      weight: victim.stats.weight,
      baseKB: data.baseKB,
      kbGrowth: data.kbGrowth,
      fixedKB: data.fixedKB
    });

    victim.percent += data.damage;

    const facing = (attacker.body.x <= victim.body.x ? 1 : -1) as 1 | -1;
    const stick = victim.input.current();
    const angle = applyDI(data.angle === 361 ? (kb < 32 ? 0 : 44) : data.angle, stick.stickX, stick.stickY);
    const lv = launchVector(kb, angle, facing);

    victim.body.vx = lv.vx;
    victim.body.vy = lv.vy;

    const hitstun = hitstunFrames(kb, data.hitstunMul);
    const pause = hitPauseFrames(data.damage);
    hitPause.freeze(attacker, pause, tick);
    hitPause.freeze(victim, pause, tick);

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
