import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './config/game.config';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { ModeSelectScene } from './scenes/ModeSelectScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { StageSelectScene } from './scenes/StageSelectScene';
import { MatchScene } from './scenes/MatchScene';
import { PauseScene } from './scenes/PauseScene';
import { NetHostScene } from './scenes/NetHostScene';
import { NetJoinScene } from './scenes/NetJoinScene';

new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  backgroundColor: '#0a0a14',
  fps: {
    target: 60,
    forceSetTimeOut: false,
    smoothStep: false
  },
  physics: { default: undefined as unknown as string },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  banner: false,
  scene: [BootScene, TitleScene, ModeSelectScene, CharacterSelectScene, StageSelectScene, MatchScene, PauseScene, NetHostScene, NetJoinScene]
});
