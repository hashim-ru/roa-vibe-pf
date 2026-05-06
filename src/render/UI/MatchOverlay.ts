import Phaser from 'phaser';
import type { Fighter } from '../../entities/Fighter';
import type { World } from '../../physics/World';

/**
 * World-space gameplay cues that read live off the fighter / stage state:
 *  - **Ledge cue** — pulsing ring at the nearest ledge while a fighter is
 *    off-stage; intangibility countdown while hanging.
 *  - **Tech window** — yellow ring around a tumbling fighter just before
 *    impact + green snap on a successful tech.
 *  - **DI hint** — small directional arrow on the victim during hitstun
 *    (debug only — taught us a lot during net testing).
 *  - **Frame data** — `s4 a2 r8` floating tag next to an attacker, with
 *    each segment ticking down so you can *see* the move's frame anatomy.
 *
 * These cues live on the main camera (world-space) so the screen-space
 * HUD stays uncluttered.
 */
export class MatchOverlay {
  private g: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];

  constructor(private scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(2050);
    for (let i = 0; i < 4; i++) {
      const t = scene.add
        .text(0, 0, '', {
          fontFamily: 'ui-monospace, monospace',
          fontSize: '11px',
          color: '#cfd0d6',
          stroke: '#000',
          strokeThickness: 3
        })
        .setOrigin(0.5)
        .setDepth(2051)
        .setVisible(false);
      this.texts.push(t);
    }
  }

  draw(world: World, fighters: Fighter[], tick: number, debug: boolean): void {
    this.g.clear();
    for (const t of this.texts) t.setVisible(false);

    let textCursor = 0;

    for (const f of fighters) {
      // --- Off-stage / ledge guard cue ---
      if (!f.body.grounded && f.fsm.id !== 'LedgeHang' && f.fsm.id !== 'KO') {
        const offstage =
          f.body.x < world.blastZone.left + 280 ||
          f.body.x > world.blastZone.right - 280;
        if (offstage) {
          const nearest = nearestLedge(world, f.body.x);
          if (nearest) {
            const pulse = 0.55 + 0.35 * Math.sin(tick * 0.15);
            this.g.lineStyle(3, 0xff7a55, pulse);
            this.g.strokeCircle(nearest.x, nearest.y, 18);
            this.g.lineStyle(1, 0xff7a55, pulse * 0.5);
            this.g.strokeCircle(nearest.x, nearest.y, 28);
          }
        }
      }

      // --- Ledge intangibility countdown ---
      if (f.fsm.id === 'LedgeHang') {
        const intangFrames = Math.max(0, f.invincibleUntilTick - tick);
        const ledge = nearestLedge(world, f.body.x);
        if (ledge) {
          const pct = Math.min(1, intangFrames / 30);
          this.g.lineStyle(3, 0x9ae0ff, 0.85);
          // Arc representing remaining intangibility.
          this.g.beginPath();
          this.g.arc(ledge.x, ledge.y, 22, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
          this.g.strokePath();
        }
      }

      // --- Tumble tech window cue ---
      // While tumbling and within 6 frames of landing, pulse a yellow
      // ring under the fighter so a player can see "press parry NOW".
      if (f.tumbling && !f.body.grounded && f.body.vy > 0) {
        const distToFloor = nearestFloorBelow(world, f.body.x, f.body.y);
        if (distToFloor !== null && distToFloor < 80) {
          const closeness = 1 - distToFloor / 80;
          this.g.lineStyle(3, 0xffe04d, 0.4 + 0.55 * closeness);
          this.g.strokeEllipse(f.body.x, f.body.y + 4, f.body.w * 1.4, 12);
        }
      }
      // Successful tech snap — first frame of intangibility after a tech.
      if (f.fsm.id === 'Idle' && tick - 1 < f.invincibleUntilTick && f.body.grounded) {
        this.g.lineStyle(3, 0x9aff9a, 0.9);
        this.g.strokeEllipse(f.body.x, f.body.y + 4, f.body.w * 1.6, 14);
      }

      // --- DI hint arrow (debug-only) ---
      if (debug && f.fsm.id === 'Hitstun') {
        const cur = f.input.current();
        const sx = cur.stickX;
        const sy = cur.stickY;
        if (sx !== 0 || sy !== 0) {
          const tipLen = 22;
          const ox = f.body.x;
          const oy = f.body.y - f.body.h * 0.7;
          const dirx = sx === 0 ? 0 : Math.sign(sx);
          const diry = sy === 0 ? 0 : Math.sign(sy);
          const ax = ox + dirx * tipLen;
          const ay = oy + diry * tipLen;
          this.g.lineStyle(2, 0x9aff9a, 0.9);
          this.g.lineBetween(ox, oy, ax, ay);
          this.g.fillStyle(0x9aff9a, 1).fillCircle(ax, ay, 3);
        }
      }

      // --- Live frame data on attacker ---
      // Reads the active move's frame schedule and reports startup
      // (frames until first hitbox), active (consecutive hitbox frames),
      // and recovery (remaining frames). Counts down in-place so you
      // *see* the move's anatomy.
      if (f.fsm.id === 'Attack' && f.pendingMove) {
        const phase = tick - f.pendingMove.startedAtTick;
        const move = f.pendingMove.move;
        const firstActive =
          move.frames.find((fr) => fr.hitboxes.length > 0)?.frame ?? 0;
        const lastActive = lastActiveFrame(move);
        const total = totalFrames(move);
        let label: string;
        let color: string;
        if (phase < firstActive) {
          label = `startup ${firstActive - phase}`;
          color = '#ffe04d';
        } else if (phase <= lastActive) {
          label = `active ${lastActive - phase + 1}`;
          color = '#9aff9a';
        } else {
          label = `recovery ${Math.max(0, total - phase)}`;
          color = '#9bd3a6';
        }
        if (textCursor < this.texts.length) {
          const tx = this.texts[textCursor++];
          tx.setText(`${move.id} · ${label}`)
            .setColor(color)
            .setPosition(f.body.x, f.body.y - f.body.h * 1.05)
            .setVisible(true);
        }
      }
    }
  }
}

function nearestLedge(world: World, x: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (const l of world.ledges) {
    const d = Math.abs(l.x - x);
    if (d < bestDist) {
      bestDist = d;
      best = { x: l.x, y: l.y };
    }
  }
  return best;
}

function nearestFloorBelow(world: World, x: number, y: number): number | null {
  let best: number | null = null;
  for (const p of world.platforms) {
    if (x < p.x || x > p.x + p.w) continue;
    if (p.y < y) continue;
    const d = p.y - y;
    if (best === null || d < best) best = d;
  }
  return best;
}

function lastActiveFrame(move: { frames: Array<{ frame: number; hitboxes: unknown[] }> }): number {
  let last = 0;
  for (const fr of move.frames) {
    if (fr.hitboxes.length > 0 && fr.frame > last) last = fr.frame;
  }
  return last;
}

function totalFrames(move: { frames: Array<{ frame: number }> }): number {
  let last = 0;
  for (const fr of move.frames) if (fr.frame > last) last = fr.frame;
  return last;
}
