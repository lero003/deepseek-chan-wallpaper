import art from '@kujira-art';
import { ACTOR_HALF_WIDTH, seedFromText } from '../world/world.ts';
import { createGame, advanceGame } from '../fighters/game.ts';
import { gamePlan } from '../fighters/render-plan.ts';
import { motesFor } from '../render/scene-plan.ts';
import type { SpriteAtlas } from '../render/atlas.ts';
import { FightersUI } from './fighters-ui.ts';
import { parseAtlas } from '../render/atlas.ts';
import { loadImage, SceneRenderer } from '../render/renderer.ts';
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
const backgroundRow = element<HTMLElement>('#background-row');
const backgroundSetting = element<HTMLSelectElement>('#background-setting');
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
element<HTMLElement>('#art-provenance').textContent = `${art.provenance} 戦闘の小物・左右パネルと通常の敵は、本プロジェクトの仮ピクセル図形です。綴星リュミエは文章と思考を着想にした非公式のオリジナルライバルで、Claude／Anthropicの公式キャラクター・提携作品ではありません。ローカルボス画像がない場合も独自の仮描画で動きます。外部の画像・フォントは読み込みません。「DeepSeekちゃん（クジラ娘）」の原案・デザインは、これを生み出したファンコミュニティと原案者に帰属します。`;
element<HTMLElement>('.static-scene').style.backgroundImage = `url("${art.matteUrl ?? backgroundUrl}")`;
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
  if (!renderer) return;
  const bounds = scene.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  // Draw into the real device pixels so whole-number art scales stay crisp.
  renderer.resize(Math.max(1, Math.round(bounds.width * dpr)), Math.max(1, Math.round(bounds.height * dpr)));
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
window.addEventListener('resize', resize, { signal });

async function bootstrap(): Promise<void> {
  try {
    const atlas = parseAtlas(atlasData);
    activeAtlas = atlas;
    if ((art.scene.actorHalfWidth ?? ACTOR_HALF_WIDTH) < (atlas.collisionHalfWidth ?? atlas.frameWidth / 2)) {
      throw new Error('Scene collision margins are smaller than the selected sprite.');
    }
    const matteRequest = art.matteUrl ? loadImage(art.matteUrl) : Promise.resolve(null);
    const bossRequest = art.bossUrl ? loadImage(art.bossUrl) : Promise.resolve(null);
    const [background, character, matte, boss] = await Promise.allSettled([loadImage(backgroundUrl), loadImage(characterUrl), matteRequest, bossRequest]);
    if (signal.aborted) return;
    const images = {
      background: background.status === 'fulfilled' ? background.value : null,
      character: character.status === 'fulfilled' ? character.value : null,
      boss: boss.status === 'fulfilled' ? boss.value : null,
      // The wide matte is an enhancement: failing to load it falls back to the room-only backdrop.
      matte: matte.status === 'fulfilled' ? matte.value : null,
      variants: [] as { background: HTMLImageElement; matte: HTMLImageElement | null }[],
    };
    if (art.matteUrl && matte.status === 'rejected') console.error('[kujira] Wallpaper matte failed to load; using the room-only backdrop.', matte.reason);
    if (art.bossUrl && boss.status === 'rejected') console.error('[kujira] Optional rival image failed to load; using the code-only rival.', boss.reason);
    // Additional backgrounds are optional: a failed or mis-sized variant is simply not offered.
    const loadedVariants: { art: NonNullable<typeof art.variants>[number]; background: HTMLImageElement; matte: HTMLImageElement | null }[] = [];
    for (const variant of art.variants ?? []) {
      const [variantBackground, variantMatte] = await Promise.allSettled([
        loadImage(variant.backgroundUrl),
        variant.matteUrl ? loadImage(variant.matteUrl) : Promise.resolve(null),
      ]);
      if (signal.aborted) return;
      if (variantBackground.status !== 'fulfilled') {
        console.error('[kujira] Background variant failed to load; skipping.', variant.id, variantBackground.reason);
        continue;
      }
      const backgroundImage = variantBackground.value;
      const matteImage = variantMatte.status === 'fulfilled' ? variantMatte.value : null;
      const validBackground = backgroundImage.naturalWidth === 480 && backgroundImage.naturalHeight === 270;
      const validMatte = !art.matte || !matteImage
        || (matteImage.naturalWidth === art.matte.width && matteImage.naturalHeight === art.matte.height);
      if (!validBackground || !validMatte) {
        console.error('[kujira] Background variant has unexpected dimensions; skipping.', variant.id);
        continue;
      }
      loadedVariants.push({ art: variant, background: backgroundImage, matte: matteImage });
      images.variants.push({ background: backgroundImage, matte: matteImage });
    }
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
    if (!failed && loadedVariants.length > 0) {
      for (const [index, variant] of loadedVariants.entries()) {
        const option = document.createElement('option');
        option.value = String(index + 1);
        option.textContent = variant.art.label;
        backgroundSetting.append(option);
      }
      backgroundRow.hidden = false;
      backgroundSetting.addEventListener('change', () => {
        renderer?.setVariant(Number(backgroundSetting.value));
        draw('resize');
      }, { signal });
    }
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
