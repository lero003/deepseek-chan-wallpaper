import art from '@kujira-art';
import { ACTOR_HALF_WIDTH, applyMood, seedFromText } from '../world/world.ts';
import { createGame, advanceGame, command } from '../fighters/game.ts';
import { gamePlan } from '../fighters/render-plan.ts';
import { motesFor } from '../render/scene-plan.ts';
import type { SpriteAtlas } from '../render/atlas.ts';
import { companionLine } from '../companion/companion.ts';
import { parseAtlas } from '../render/atlas.ts';
import { loadImage, SceneRenderer } from '../render/renderer.ts';
import type { SceneImages, VariantImages } from '../render/renderer.ts';
import { AnimationLoop, shouldAnimate, shouldPaintFrame, stopNote } from './playback.ts';
import type { PlaybackConditions } from './playback.ts';
import { loadSettings, localSettingsStorage, readSettingsRaw, saveSettings } from './settings.ts';
import type { PersonalSettings } from './settings.ts';

const { backgroundUrl, characterUrl, atlas: atlasData, manifest } = art;

function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing app element: ${selector}`);
  return found;
}

const scene = element<HTMLElement>('#scene');
const sceneNumber = element<HTMLElement>('.scene-number');
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
const sceneName = element<HTMLElement>('#scene-name');
const backgroundStatic = element<HTMLElement>('#background-static');
const backgroundSetting = element<HTMLSelectElement>('#background-setting');
const faceWrap = element<HTMLElement>('#about-face');
const faceCanvas = element<HTMLCanvasElement>('#face-canvas');
const powerSetting = element<HTMLInputElement>('#power-setting');
const media = window.matchMedia('(prefers-reduced-motion: reduce)');
const controller = new AbortController();
const { signal } = controller;
const seedText = (new URL(window.location.href).searchParams.get('seed') || 'seaside-v01').slice(0, 128);
const game = createGame(seedFromText(seedText), art.scene);
const world = game.world;
const motes = motesFor(world.seed);
// The fighters feature is shelved: this is a quiet wallpaper. Auto-bouts stay off
// (the shared engine and its regression tests remain, but nothing schedules them);
// peaceful visitors are part of the quiet life and keep coming.
command(game, 'frequency', 'off');
// The personal settings this browser remembers, restored before the first
// synchronize; the background waits for its image.
const settingsStorage = localSettingsStorage();
const settingsRaw = readSettingsRaw(settingsStorage);
const settings: PersonalSettings = loadSettings(settingsStorage);
stillSetting.checked = settings.still;
document.documentElement.dataset.art = art.kind;
scene.dataset.artProfile = art.id;
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', art.kind === 'local-design' ? '#1a2030' : '#172c2e');
canvas.setAttribute('aria-label', art.description);
sceneName.textContent = art.label;
backgroundStatic.textContent = art.label;
element<HTMLElement>('.static-scene').style.backgroundImage = `url("${art.matteUrl ?? backgroundUrl}")`;
const conditions: PlaybackConditions = {
  ready: false, paused: false, hidden: document.hidden, suspended: false,
  reducedMotion: media.matches, still: false, dialogOpen: false,
};
let renderer: SceneRenderer | null = null;
let activeAtlas: SpriteAtlas | null = null;
let failed = false;
const sceneThought = element<HTMLElement>('#scene-thought');

// Read-only, explicit metadata. Never interpolate URL text or asset fields into HTML.
// The ?seed= parameter still works for reproducibility; it is no longer displayed.
const credits = element<HTMLDListElement>('#credit-list');
for (const asset of manifest.assets) {
  const title = document.createElement('dt');
  const detail = document.createElement('dd');
  title.textContent = `${asset.id} — ${asset.name}`;
  detail.textContent = `${asset.dimensions} · ${asset.license} · 公開・再配布は未設定`;
  credits.append(title, detail);
}
element<HTMLElement>('#credit-summary').textContent = `素材台帳 · ${manifest.assets.length}点（個別の許諾は未確認）`;

/** The one quiet caption under the scene: the stop reason wins, else the shared
 *  observation line (life, emotes, peaceful visitors). Never aria-live. */
function updateCaption(): void {
  const stop = stopNote(conditions, failed);
  const line = stop ? stop.reason : companionLine(game);
  if (sceneThought.textContent !== line) sceneThought.textContent = line;
}

function draw(reason: 'animation' | 'resize' = 'animation'): void {
  if (shouldPaintFrame(conditions, reason) && activeAtlas && renderer) renderer.drawPlan(gamePlan(game, activeAtlas, renderer.activeAppearance, !conditions.reducedMotion && !conditions.still, 'preview', motes));
  updateCaption();
}

const loop = new AnimationLoop({
  now: () => performance.now(),
  request: (callback, delay) => window.setTimeout(callback, delay),
  cancel: (handle) => window.clearTimeout(handle),
}, (delta) => { advanceGame(game, delta); draw(); });

const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
// A remembered choice wins; only a first visit follows the browser's save-data hint.
powerSetting.checked = settingsRaw === null ? connection?.saveData === true : settings.power;
loop.setFrameRate(powerSetting.checked ? 15 : 30);

function synchronize(): void {
  conditions.hidden = document.hidden;
  conditions.dialogOpen = dialog.open;
  conditions.reducedMotion = media.matches;
  conditions.still = stillSetting.checked;
  const animate = shouldAnimate(conditions);
  loop.setRunning(animate);
  pauseButton.disabled = !conditions.ready || conditions.reducedMotion || conditions.still;
  pauseButton.setAttribute('aria-pressed', String(conditions.paused));
  pauseButton.setAttribute('aria-label', conditions.paused ? '動きを再開' : '動きを一時停止');
  pauseLabel.textContent = conditions.paused ? '再開' : '一時停止';
  motionNote.textContent = conditions.reducedMotion
    ? 'OSの「視差効果を減らす」に合わせて静止表示中です。OS側の設定を変更すると再開できます。'
    : 'OSの「視差効果を減らす」設定にも自動で合わせます。';
  const stop = stopNote(conditions, failed);
  const text = stop ? (stop.guidance ? `${stop.reason} — ${stop.guidance}` : stop.reason)
    : powerSetting.checked ? 'ゆっくり描画 · 15fps'
    : '音のない、小さな世界';
  // Do not repeatedly announce an unchanged status to assistive technology.
  if (status.textContent !== text) status.textContent = text;
  if (!animate) draw();
  updateCaption();
}

function resize(): void {
  if (!renderer || conditions.suspended) return;
  // clientWidth/clientHeight measure the canvas's own CSS box (the padding box).
  // getBoundingClientRect would add the scene's 1px border and break the whole-number
  // device-pixel grid that keeps the pixel art crisp.
  const dpr = window.devicePixelRatio || 1;
  renderer.resize(Math.max(1, Math.round(scene.clientWidth * dpr)), Math.max(1, Math.round(scene.clientHeight * dpr)));
  // Prepare one stable frame after clearing the canvas; never advance the hidden world.
  draw('resize');
}

// Moving the window between displays with different device pixel ratios changes
// neither the CSS size nor the ResizeObserver, so watch the resolution itself.
let dprQuery: MediaQueryList | null = null;
function onDevicePixelRatioChange(): void { resize(); watchDevicePixelRatio(); }
function watchDevicePixelRatio(): void {
  dprQuery?.removeEventListener('change', onDevicePixelRatioChange);
  dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  dprQuery.addEventListener('change', onDevicePixelRatioChange, { signal });
}
watchDevicePixelRatio();

openButton.addEventListener('click', () => {
  if (!dialog.open) dialog.showModal();
  synchronize();
}, { signal });
closeButton.addEventListener('click', () => dialog.close(), { signal });
dialog.addEventListener('close', synchronize, { signal });
// Backdrop-click closes, but a text selection that merely ends on the backdrop must not.
let dialogPressStartedInside = false;
dialog.addEventListener('pointerdown', (event) => { dialogPressStartedInside = event.target !== dialog; }, { signal });
dialog.addEventListener('click', (event) => {
  if (event.target !== dialog || dialogPressStartedInside) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
}, { signal });
pauseButton.addEventListener('click', () => { conditions.paused = !conditions.paused; synchronize(); }, { signal });
stillSetting.addEventListener('change', () => { settings.still = stillSetting.checked; saveSettings(settingsStorage, settings); synchronize(); }, { signal });
powerSetting.addEventListener('change', () => {
  settings.power = powerSetting.checked; saveSettings(settingsStorage, settings);
  loop.setFrameRate(powerSetting.checked ? 15 : 30); synchronize();
}, { signal });
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
    const arenaRequest = art.arenaBackdropUrl ? loadImage(art.arenaBackdropUrl) : Promise.resolve(null);
    const [background, character, matte, boss, arena] = await Promise.allSettled([loadImage(backgroundUrl), loadImage(characterUrl), matteRequest, bossRequest, arenaRequest]);
    if (signal.aborted) return;
    const images: SceneImages & { variants: VariantImages[] } = {
      sprites: {}, bosses: {}, arenas: {},
      background: background.status === 'fulfilled' ? background.value : null,
      character: character.status === 'fulfilled' ? character.value : null,
      boss: boss.status === 'fulfilled' ? boss.value : null,
      // The wide matte is an enhancement: failing to load it falls back to the room-only backdrop.
      matte: matte.status === 'fulfilled' ? matte.value : null,
      // The painted arena backdrop is optional: a failed load falls back to the code stage.
      arena: arena.status === 'fulfilled' ? arena.value : null,
      variants: [] as VariantImages[],
    };
    if (art.lifeUrl) {
      try { images.life = await loadImage(art.lifeUrl); }
      catch { /* Extra gestures are optional; the approved sixteen frames stay available. */ }
    }
    if (art.matteUrl && matte.status === 'rejected') console.error('[kujira] Wallpaper matte failed to load; using the room-only backdrop.', matte.reason);
    if (art.bossUrl && boss.status === 'rejected') console.error('[kujira] Optional rival image failed to load; using the code-only rival.', boss.reason);
    if (art.arenaBackdropUrl && arena.status === 'rejected') console.error('[kujira] Optional arena backdrop failed to load; using the code-drawn terrace.', arena.reason);
    await Promise.all((['combat', 'slime', 'popup'] as const).map(async key => {
      const url = art.spriteUrls?.[key];
      if (!url) return;
      try {
        const image = await loadImage(url);
        if (!signal.aborted) images.sprites![key] = image;
      } catch (error) { console.error('[kujira] Optional combat sheet unavailable; using original drawing.', key, error); }
    }));
    await Promise.all([
      ...Object.entries(art.bossUrls ?? {}).map(async ([key, url]) => {
        try { const image = await loadImage(url); if (!signal.aborted) images.bosses![key as keyof NonNullable<SceneImages['bosses']>] = image; }
        catch { /* One unavailable rival retains its code fallback. */ }
      }),
      ...Object.entries(art.arenaBackdrops ?? {}).map(async ([key, url]) => {
        try { const image = await loadImage(url); if (!signal.aborted) images.arenas![key as keyof NonNullable<SceneImages['arenas']>] = image; }
        catch { /* One unavailable stage retains its code fallback. */ }
      }),
    ]);
    if (signal.aborted) return;
    drawAboutFace(images.character);
    // Additional backgrounds are optional: a failed or mis-sized variant is simply not
    // offered. Load them in parallel (one hung image must not delay the others), but
    // keep the original order so indices and labels stay stable.
    const loadedVariants: { art: NonNullable<typeof art.variants>[number]; background: HTMLImageElement; matte: HTMLImageElement | null }[] = [];
    const variantLoads = await Promise.all((art.variants ?? []).map(async variant => {
      const [variantBackground, variantMatte] = await Promise.allSettled([
        loadImage(variant.backgroundUrl),
        variant.matteUrl ? loadImage(variant.matteUrl) : Promise.resolve(null),
      ]);
      return { variant, variantBackground, variantMatte };
    }));
    if (signal.aborted) return;
    for (const { variant, variantBackground, variantMatte } of variantLoads) {
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
      images.variants.push({ background: backgroundImage, matte: matteImage, appearance: variant.appearance });
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
    // The standard background (index 0) always comes first, then only variants that
    // actually loaded, so the selection can never point at a missing asset.
    const backgroundLabels = [art.label, ...loadedVariants.map(variant => variant.art.label)];
    if (!failed && renderer && loadedVariants.length > 0) {
      backgroundSetting.replaceChildren();
      for (const [index, label] of backgroundLabels.entries()) {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = label;
        backgroundSetting.append(option);
      }
      // Restore the remembered background by id, not index: a variant that failed to
      // load this time simply falls back to the standard room, and the saved id stays
      // for a later visit (the same semantics as the Mac app).
      const savedIndex = settings.background === 'sunset' ? 0
        : loadedVariants.findIndex(variant => variant.art.id === settings.background) + 1;
      if (savedIndex > 0 && savedIndex < renderer.variantCount) {
        renderer.setVariant(savedIndex);
        applyMood(world, renderer.activeAppearance.ambience?.mood);
      }
      backgroundSetting.value = String(renderer.selectedVariant);
      sceneName.textContent = backgroundLabels[renderer.selectedVariant] ?? art.label;
      sceneNumber.textContent = String(renderer.selectedVariant + 1).padStart(2, '0');
      backgroundSetting.hidden = false;
      backgroundStatic.hidden = true;
      backgroundSetting.addEventListener('change', () => {
        if (!renderer) return;
        const index = Number(backgroundSetting.value);
        if (!Number.isInteger(index) || index < 0 || index >= renderer.variantCount) {
          backgroundSetting.value = String(renderer.selectedVariant);
          return;
        }
        renderer.setVariant(index);
        applyMood(world, renderer.activeAppearance.ambience?.mood);
        command(game, 'cancelCall');
        sceneName.textContent = backgroundLabels[index] ?? art.label;
        sceneNumber.textContent = String(index + 1).padStart(2, '0');
        settings.background = index === 0 ? 'sunset' : loadedVariants[index - 1]?.art.id ?? 'sunset';
        saveSettings(settingsStorage, settings);
        draw('resize');
      }, { signal });
    } else {
      // Only the standard background is available: a static label, never an empty select.
      backgroundSetting.hidden = true;
      backgroundStatic.hidden = false;
      backgroundStatic.textContent = art.label;
      sceneNumber.textContent = '01';
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

/** B05: one existing front-facing frame at whole-number 1x; missing art stays hidden. */
function drawAboutFace(character: HTMLImageElement | null): void {
  try {
    const atlas = activeAtlas;
    const frame = atlas?.animations.turn.frames[1];
    const context = faceCanvas.getContext('2d');
    if (!character || !atlas || !context || frame === undefined || !Number.isInteger(frame)
      || frame < 0 || frame >= atlas.columns * atlas.rows) { faceWrap.hidden = true; return; }
    faceCanvas.width = atlas.frameWidth;
    faceCanvas.height = atlas.frameHeight;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, atlas.frameWidth, atlas.frameHeight);
    context.drawImage(character,
      frame % atlas.columns * atlas.frameWidth, Math.floor(frame / atlas.columns) * atlas.frameHeight,
      atlas.frameWidth, atlas.frameHeight, 0, 0, atlas.frameWidth, atlas.frameHeight);
    faceWrap.hidden = false;
  } catch { faceWrap.hidden = true; }
}

synchronize();
void bootstrap();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    controller.abort();
    observer.disconnect();
    loop.dispose();
    dprQuery?.removeEventListener('change', onDevicePixelRatioChange);
    if (dialog.open) dialog.close();
    credits.replaceChildren();
    backgroundSetting.hidden = true;
    backgroundStatic.hidden = false;
    // A hot re-bootstrap starts clean: no stale error banner or half-ready scene.
    errorNote.hidden = true;
    loading.hidden = false;
    scene.setAttribute('aria-busy', 'true');
    scene.dataset.ready = 'false';
  });
}
