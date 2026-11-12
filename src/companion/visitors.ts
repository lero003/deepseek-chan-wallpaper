import type { BossId, FightersGame, VisitGuest, VisitsState } from '../fighters/types.ts';
import { BOSSES } from '../fighters/definitions.ts';

export const VISITS = { firstMinTicks: 75 * 60, firstSpreadTicks: 30 * 60,
  gapMinTicks: 120 * 60, gapSpreadTicks: 60 * 60, stayMinTicks: 45 * 60,
  staySpreadTicks: 15 * 60, maximumTicks: 90 * 60, speed: 18 } as const;

/** An isolated stream: a visitor can never change life, encounters or battle order. */
function choose(state: VisitsState): number {
  let value = state.randomState;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  state.randomState = value >>> 0 || 1;
  return state.randomState / 4294967296;
}
export function createVisits(seed: number): VisitsState {
  const state: VisitsState = { enabled: true, randomState: (seed ^ 0x391bc5e7) >>> 0 || 1,
    idleTicks: 0, nextAt: 0, lastId: null, bag: [], guest: null };
  state.nextAt = VISITS.firstMinTicks + Math.round(choose(state) * VISITS.firstSpreadTicks);
  return state;
}
export function cancelVisit(game: FightersGame): void {
  const state = game.visits;
  if (!state.guest) return;
  state.guest = null;
  state.nextAt = state.idleTicks + VISITS.gapMinTicks + Math.round(choose(state) * VISITS.gapSpreadTicks);
}
export function setVisitsEnabled(game: FightersGame, enabled: boolean): void {
  if (game.visits.enabled === enabled) return;
  cancelVisit(game); game.visits.enabled = enabled;
  if (enabled) game.visits.nextAt = game.visits.idleTicks + VISITS.firstMinTicks
    + Math.round(choose(game.visits) * VISITS.firstSpreadTicks);
}
function pickId(state: VisitsState): BossId {
  if (!state.bag.length) {
    state.bag = Object.keys(BOSSES) as BossId[];
    for (let i = state.bag.length - 1; i > 0; i--) {
      const other = Math.floor(choose(state) * (i + 1));
      [state.bag[i], state.bag[other]] = [state.bag[other]!, state.bag[i]!];
    }
    if (state.bag.length > 1 && state.bag[0] === state.lastId) [state.bag[0], state.bag[1]] = [state.bag[1]!, state.bag[0]!];
  }
  const id = state.bag.shift()!; state.lastId = id; return id;
}
function destination(game: FightersGame, guestX: number): number {
  const { left, right } = game.world.range;
  const state = game.visits;
  const candidates = [left, left + (right - left) * .3, left + (right - left) * .7, right]
    .filter(x => Math.abs(x - game.world.actor.x) >= 64 && Math.abs(x - guestX) >= 28);
  const pool = candidates.length ? candidates : [Math.abs(left - guestX) > Math.abs(right - guestX) ? left : right];
  return pool[Math.floor(choose(state) * pool.length)]!;
}
function move(guest: VisitGuest): boolean {
  const dx = guest.targetX - guest.x;
  if (Math.abs(dx) < VISITS.speed / 60) { guest.x = guest.targetX; return true; }
  guest.facing = dx < 0 ? -1 : 1; guest.x += guest.facing * VISITS.speed / 60;
  return false;
}
/** Only quiet, actively advanced rest time counts. One non-combat guest at most. */
export function advanceVisits(game: FightersGame): void {
  const state = game.visits;
  if (game.mode !== 'auto' || game.phase !== 'rest') { cancelVisit(game); return; }
  if (!state.enabled) return;
  state.idleTicks++;
  if (!state.guest && state.idleTicks >= state.nextAt) {
    const fromLeft = choose(state) < .5, x = fromLeft ? -48 : 528;
    state.guest = { bossId: pickId(state), x, y: Math.min(254, game.world.floorY + 12), facing: fromLeft ? 1 : -1,
      state: 'arriving', age: 0, stateAge: 0, targetX: destination(game, x),
      leaveAt: VISITS.stayMinTicks + Math.round(choose(state) * VISITS.staySpreadTicks),
      pauseUntil: 0, exitX: fromLeft ? -48 : 528 };
  }
  const guest = state.guest;
  if (!guest) return;
  guest.age++; guest.stateAge++;
  if (guest.age >= VISITS.maximumTicks) { cancelVisit(game); return; }
  if (guest.age >= guest.leaveAt && guest.state !== 'leaving') {
    guest.state = 'leaving'; guest.stateAge = 0; guest.targetX = guest.exitX;
  }
  if (guest.state === 'pausing') {
    if (guest.age >= guest.pauseUntil) {
      guest.state = 'wandering'; guest.stateAge = 0; guest.targetX = destination(game, guest.x);
    }
  } else if (move(guest)) {
    if (guest.state === 'leaving') { cancelVisit(game); return; }
    guest.state = 'pausing'; guest.stateAge = 0;
    guest.pauseUntil = guest.age + 150 + Math.round(choose(state) * 210);
    guest.facing = game.world.actor.x < guest.x ? -1 : 1;
  }
}
