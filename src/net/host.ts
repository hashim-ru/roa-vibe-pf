/**
 * Standalone WebSocket relay host.
 *
 * Run with `npm run host` on the machine that wants to host. The script
 * binds to 0.0.0.0:<port> so it answers both LAN and Tailscale callers.
 * The first connection becomes "host", the second becomes "guest"; any
 * further callers are politely refused. The relay just forwards every
 * message to the *other* peer — sync logic lives in the browser clients.
 *
 * Tailscale IPs are auto-discovered on darwin/linux via the CLI; if it
 * fails we fall back to the LAN IPv4 list.
 */
import { WebSocketServer, WebSocket } from 'ws';
import { networkInterfaces } from 'node:os';
import { execSync } from 'node:child_process';
import { DEFAULT_PORT, encode, type Msg } from './Protocol.js';

const PORT = Number(process.env.PORT ?? DEFAULT_PORT);

interface Peer {
  ws: WebSocket;
  role: 'host' | 'guest';
}
const peers: Peer[] = [];

const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

wss.on('listening', () => {
  const tail = tailscaleIPs();
  const lan = lanIPs();
  console.log(`\n  KOTV netcode relay listening on port ${PORT}`);
  console.log('  ----------------------------------------');
  if (tail.length) console.log('  Tailscale IPs (share with friend):');
  for (const ip of tail) console.log(`    ws://${ip}:${PORT}`);
  if (lan.length) console.log('  LAN IPs (same Wi-Fi only):');
  for (const ip of lan) console.log(`    ws://${ip}:${PORT}`);
  console.log('  Local:');
  console.log(`    ws://127.0.0.1:${PORT}`);
  console.log('  ----------------------------------------\n');
  console.log('  waiting for 2 players to connect...\n');
});

wss.on('connection', (ws) => {
  if (peers.length >= 2) {
    ws.send(encode({ t: 'bye', reason: 'lobby full' } satisfies Msg));
    ws.close();
    return;
  }
  const role = peers.length === 0 ? 'host' : 'guest';
  const peer: Peer = { ws, role };
  peers.push(peer);
  ws.send(encode({ t: 'hello', v: 1, role } satisfies Msg));
  console.log(`  [+] ${role} connected (${peers.length}/2)`);

  ws.on('message', (data) => relay(peer, data.toString()));
  ws.on('close', () => {
    const idx = peers.indexOf(peer);
    if (idx >= 0) peers.splice(idx, 1);
    console.log(`  [-] ${role} disconnected (${peers.length}/2)`);
    for (const p of peers) p.ws.send(encode({ t: 'bye', reason: 'peer left' } satisfies Msg));
  });
});

function relay(from: Peer, raw: string): void {
  for (const p of peers) {
    if (p === from) continue;
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(raw);
  }
}

function lanIPs(): string[] {
  const out: string[] = [];
  const ifs = networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const addr of ifs[name] ?? []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      // Skip Tailscale CGNAT range — surface those separately.
      if (addr.address.startsWith('100.')) continue;
      out.push(addr.address);
    }
  }
  return out;
}

function tailscaleIPs(): string[] {
  try {
    const raw = execSync('tailscale ip -4', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 1000 })
      .toString()
      .trim();
    return raw.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    // Either Tailscale isn't installed, isn't logged in, or PATH doesn't have it.
    // Caller falls back to LAN IPs in that case.
    const ifs = networkInterfaces();
    const out: string[] = [];
    for (const name of Object.keys(ifs)) {
      for (const addr of ifs[name] ?? []) {
        if (addr.family === 'IPv4' && !addr.internal && addr.address.startsWith('100.')) {
          out.push(addr.address);
        }
      }
    }
    return out;
  }
}
