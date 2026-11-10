import art from '@kujira-art';
import { ACTOR_HALF_WIDTH, seedFromText } from '../world/world.ts';
import { createGame, advanceGame } from '../fighters/game.ts';
import { gamePlan } from '../fighters/render-plan.ts';
import { motesFor } from '../render/scene-plan.ts';
import type { SpriteAtlas } from '../render/atlas.ts';
import { FightersUI } from './fighters-ui.ts';
import { parseAtlas } from '../render/atlas.ts';
import { loadImage, SceneRenderer } from '../render/renderer.ts';
import { viewportFor } from '../render/viewport.ts';
import { AnimationLoop, shouldAnimate, shouldPaintFrame } from './playback.ts';
import type { PlaybackConditions } from './playback.ts';

const { backgroundUrl, characterUrl, atlas: atlasData, manifest } = art;

function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing app element: ${selector}`);
  return found;
}

const scene = element<HTMLElement>('#scene');
const canvas = element<HTMLCanvasElement>('#world');
const dialog = element<HTMLDialogElement>('#about-dialog');
const openButton = element<HTMLButtonElement>('#about-open');
const closeButton = element<HTMLButtonElement>('#about-close');
const pauseButton = element<HTMLButtonElement>('#pause-button');
const pauseLabel = element<HTMLElement>('#pause-label');
const status = element<HTMLElement>('#playback-status');
const loading = element<HTMLElement>('#loading-note');
const errorNote = element<HTMLElement>('#scene-error');
const motionNote = element<HTMLElement>('#motion-note');
const stillSetting = element<HTMLInputElement>('#still-setting');
const powerSetting = element<HTMLInputElement>('#power-setting');
const media = window.matchMedia('(prefers-reduced-motion: reduce)');
const controller = new AbortController();
const { signal } = controller;
const seedText = (new URL(window.location.href).searchParams.get('seed') || 'seaside-v01').slice(0, 128);
const game = createGame(seedFromText(seedText), art.scene);
const world = game.world;
const motes = motesFor(world.seed);
document.documentElement.dataset.art = art.kind;
scene.dataset.artProfile = art.id;
canvas.setAttribute('aria-label', art.description);
element<HTMLElement>('#scene-name').textContent = art.label;
element<HTMLElement>('#art-provenance').textContent = `${art.provenance} 戦闘の敵・小物・左右パネルは、本プロジェクトの仮ピクセル図形です。外部の画像・フォントは読み込みません。`;
element<HTMLElement>('.static-scene').style.backgroundImage = `url("${backgroundUrl}")`;
const conditions: PlaybackConditions = {
  ready: false, paused: false, hidden: document.hidden, suspended: false,
  reducedMotion: media.matches, still: false, dialogOpen: false,
};
let renderer: SceneRenderer | null = null;
let activeAtlas: SpriteAtlas | null = null;
let fightersUI: FightersUI | null = null;
let failed = false;

// Read-only, explicit metadata. Never interpolate URL text or asset fields into HTML.
element<HTMLElement>('#seed-value').textContent = seedText;
const credits = element<HTMLDListElement>('#credit-list');
for (const asset of manifest.assets) {
  const title = document.createElement('dt');
  const detail = document.createElement('dd');
  title.textContent = `${asset.id} — ${asset.name}`;
  detail.textContent = `${asset.dimensions} · ${asset.license} · 公開・再配布は未設定`;
  credits.append(title, detail);
}

function draw(reason: 'animation' | 'resize' = 'animation'): void {
  if (shouldPaintFrame(conditions, reason) && activeAtlas && renderer) renderer.drawPlan(gamePlan(game, activeAtlas, art, !conditions.reducedMotion && !conditions.still, 'preview', motes));
  fightersUI?.sync();
}

const loop = new AnimationLoop({
  now: () => performance.now(),
  request: (callback, delay) => window.setTimeout(callback, delay),
  cancel: (handle) => window.clearTimeout(handle),
}, (delta) => { advanceGame(game, delta); draw(); });

const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
powerSetting.checked = connection?.saveData === true;
loop.setFrameRate(powerSetting.checked ? 15 : 30);

function synchronize(): void {
  conditions.hidden = document.hidden;
  conditions.dialogOpen = dialog.open;
  conditions.reducedMotion = media.matches;
  conditions.still = stillSetting.checked;
  if (!shouldAnimate(conditions)) fightersUI?.release();
  else fightersUI?.input.syncFocus();
  fightersUI?.sync();
  loop.setRunning(shouldAnimate(conditions));
  pauseButton.disabled = !conditions.ready || conditions.reducedMotion || conditions.still;
  pauseButton.setAttribute('aria-pressed', String(conditions.paused));
  pauseButton.setAttribute('aria-label', conditions.paused ? '動きを再開' : '動きを一時停止');
  pauseLabel.textContent = conditions.paused ? '再開' : '一時停止';
  motionNote.textContent = conditions.reducedMotion
    ? 'OSの「視差効果を減らす」に合わせて静止表示中です。OS側の設定を変更すると再開できます。'
    : 'OSの「視差効果を減らす」設定にも自動で合わせます。';
  const text = failed ? '静止背景を表示中'
    : !conditions.ready ? '準備中'
    : conditions.reducedMotion ? 'OS設定により静止中'
    : conditions.still ? '静止画で表示中'
    : conditions.paused ? 'ひと休みしています'
    : conditions.dialogOpen ? '作品についてを表示中'
    : powerSetting.checked ? 'ゆっくり描画 · 15fps'
    : '音のない、小さな世界';
  // Do not repeatedly announce an unchanged status to assistive technology.
  if (status.textContent !== text) status.textContent = text;
  if (!shouldAnimate(conditions)) draw();
}

function resize(): void {
  const bounds = scene.getBoundingClientRect();
  renderer?.resize(viewportFor(bounds.width, bounds.height));
  // Prepare one stable frame after clearing the canvas; never advance the hidden world.
  draw('resize');
}

openButton.addEventListener('click', () => {
  if (!dialog.open) dialog.showModal();
  synchronize();
}, { signal });
closeButton.addEventListener('click', () => dialog.close(), { signal });
dialog.addEventListener('close', synchronize, { signal });
dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
}, { signal });
pauseButton.addEventListener('click', () => { conditions.paused = !conditions.paused; synchronize(); }, { signal });
stillSetting.addEventListener('change', synchronize, { signal });
powerSetting.addEventListener('change', () => { loop.setFrameRate(powerSetting.checked ? 15 : 30); synchronize(); }, { signal });
media.addEventListener('change', synchronize, { signal });
document.addEventListener('visibilitychange', synchronize, { signal });
document.addEventListener('freeze', () => { conditions.suspended = true; synchronize(); }, { signal });
document.addEventListener('resume', () => { conditions.suspended = false; synchronize(); }, { signal });
window.addEventListener('pagehide', () => { conditions.suspended = true; synchronize(); }, { signal });
window.addEventListener('pageshow', () => { conditions.suspended = false; synchronize(); }, { signal });
const observer = new ResizeObserver(resize);
observer.observe(scene);

async function bootstrap(): Promise<void> {
  try {
    const atlas = parseAtlas(atlasData);
    activeAtlas = atlas;
    if ((art.scene.actorHalfWidth ?? ACTOR_HALF_WIDTH) < (atlas.collisionHalfWidth ?? atlas.frameWidth / 2)) {
      throw new Error('Scene collision margins are smaller than the selected sprite.');
    }
    const [background, character] = await Promise.allSettled([loadImage(backgroundUrl), loadImage(characterUrl)]);
    if (signal.aborted) return;
    const images = {
      background: background.status === 'fulfilled' ? background.value : null,
      character: character.status === 'fulfilled' ? character.value : null,
    };
    renderer = new SceneRenderer(canvas, images, atlas, world.seed, art);
    resize();
    scene.dataset.ready = 'true';
    failed = !images.background || !images.character;
    if (failed) {
      errorNote.textContent = '一部の素材を読み込めなかったため、静止した風景を表示しています。ページを再読み込みしてください。';
      errorNote.hidden = false;
      for (const result of [background, character]) if (result.status === 'rejected') console.error('[kujira] Image loading failed.', result.reason);
    }
    conditions.ready = !failed;
  } catch (error) {
    if (signal.aborted) return;
    failed = true;
    errorNote.textContent = '動く風景を準備できませんでした。静止背景を表示しています。ブラウザーを更新してから再読み込みしてください。';
    errorNote.hidden = false;
    console.error('[kujira] Scene initialization failed.', error);
  } finally {
    if (!signal.aborted) {
      loading.hidden = true;
      scene.setAttribute('aria-busy', 'false');
      synchronize();
    }
  }
}

fightersUI = new FightersUI(game, scene,
  () => conditions.ready && !failed && !conditions.paused && !conditions.reducedMotion && !conditions.still && !conditions.hidden && !conditions.suspended && !conditions.dialogOpen,
  () => draw(), signal);
synchronize();
void bootstrap();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    controller.abort();
    observer.disconnect();
    loop.dispose();
    if (dialog.open) dialog.close();
    credits.replaceChildren();
  });
}
