import type { HandGesture, LearningEvent, SessionState, Snapshot, StepAction, Tutorial, TutorialStep } from '../../types/learning';
import { normalizeName } from '../models/modelStructure';

const SLUG = /^[a-z0-9][a-z0-9-]{0,40}$/;
const GESTURES: readonly HandGesture[] = ['pinch', 'point', 'palm', 'fist'];
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim() !== '' && v.length <= max;

function parseAction(raw: unknown): StepAction | string {
  if (raw === undefined) return { type: 'read' };
  const a = raw as Record<string, unknown> | null;
  if (!a || typeof a !== 'object') return 'action must be an object';
  switch (a.type) {
    case 'read': case 'assemble': case 'particles': case 'reconstruct':
      return { type: a.type };
    case 'select':
      if (a.component === undefined) return { type: 'select' };
      return isStr(a.component, 100) ? { type: 'select', component: a.component } : 'select.component must be a node name';
    case 'explode': {
      const min = a.min === undefined ? 0.5 : a.min;
      return typeof min === 'number' && min > 0 && min <= 1 ? { type: 'explode', min } : 'explode.min must be between 0 and 1';
    }
    case 'hand':
      return GESTURES.includes(a.gesture as HandGesture) ? { type: 'hand', gesture: a.gesture as HandGesture } : `hand.gesture must be one of ${GESTURES.join(', ')}`;
    default:
      return 'unknown action type';
  }
}

/** Validates tutorial JSON. An invalid tutorial is dropped and reported, never partly accepted. */
export function parseTutorials(raw: unknown, where = 'tutorials'): { tutorials: Tutorial[]; errors: string[] } {
  const errors: string[] = [];
  const tutorials: Tutorial[] = [];
  if (!Array.isArray(raw)) return { tutorials, errors: [`${where}: must be an array`] };
  const seen = new Set<string>();

  raw.forEach((t, ti) => {
    const w = `${where}[${ti}]`;
    const o = t as Record<string, unknown> | null;
    const fail = (msg: string) => errors.push(`${w}: ${msg}`);
    if (!o || typeof o !== 'object') return fail('not an object');
    if (typeof o.id !== 'string' || !SLUG.test(o.id)) return fail('"id" must be lowercase letters, digits and dashes');
    if (seen.has(o.id)) return fail(`duplicate tutorial id "${o.id}"`);
    if (!isStr(o.title, 120)) return fail('"title" is required (max 120 characters)');
    if (o.summary !== undefined && !isStr(o.summary, 500)) return fail('"summary" must be text (max 500 characters)');
    if (!Array.isArray(o.steps) || o.steps.length === 0 || o.steps.length > 40) return fail('"steps" must hold 1 to 40 steps');

    const steps: TutorialStep[] = [];
    const ids = new Set<string>();
    for (let si = 0; si < o.steps.length; si++) {
      const s = o.steps[si] as Record<string, unknown> | null;
      const sw = `step ${si + 1}`;
      if (!s || typeof s !== 'object') return fail(`${sw} is not an object`);
      if (typeof s.id !== 'string' || !SLUG.test(s.id)) return fail(`${sw}: "id" must be lowercase letters, digits and dashes`);
      if (ids.has(s.id)) return fail(`${sw}: duplicate step id "${s.id}"`);
      if (!isStr(s.title, 120)) return fail(`${sw}: "title" is required (max 120 characters)`);
      if (!isStr(s.text, 2000)) return fail(`${sw}: "text" is required (max 2000 characters)`);
      const action = parseAction(s.action);
      if (typeof action === 'string') return fail(`${sw}: ${action}`);
      ids.add(s.id);
      steps.push({ id: s.id, title: s.title, text: s.text, action });
    }
    seen.add(o.id);
    tutorials.push({
      id: o.id, title: o.title, summary: o.summary as string | undefined, steps,
      requiresComponents: steps.some((s) => ['select', 'explode', 'assemble'].includes(s.action.type)),
      needsCamera: steps.some((s) => s.action.type === 'hand'),
    });
  });
  return { tutorials, errors };
}

// ---------- completion rules ----------

/** Conditions that can already be true when a step starts (state-based). Assemble and reconstruct need a real action. */
export function isSatisfied(a: StepAction, s: Snapshot): boolean {
  switch (a.type) {
    case 'select': return s.selectedNodeName !== null && (!a.component || normalizeName(s.selectedNodeName) === normalizeName(a.component));
    case 'explode': return s.explode >= a.min;
    case 'particles': return s.particles === 'particles';
    default: return false;
  }
}

export function matchesEvent(a: StepAction, e: LearningEvent): boolean {
  switch (a.type) {
    case 'select': return e.type === 'select' && (!a.component || normalizeName(e.nodeName ?? '') === normalizeName(a.component));
    case 'explode': return e.type === 'explode' && e.amount >= a.min;
    case 'assemble': return e.type === 'assemble' || (e.type === 'explode' && e.amount <= 0.01);
    case 'particles': return e.type === 'particles' && e.state === 'particles';
    case 'reconstruct': return e.type === 'particles' && e.state === 'solid';
    case 'hand': return e.type === 'hand' && e.gesture === a.gesture;
    default: return false;
  }
}

// ---------- session (pure, JSON-serialisable) ----------

const settle = (t: Tutorial, s: SessionState, snap?: Snapshot): SessionState => {
  if (!snap || s.finished || s.done[s.index]) return s;
  if (!isSatisfied(t.steps[s.index].action, snap)) return s;
  const done = [...s.done];
  done[s.index] = true;
  return { ...s, done };
};

export function newSession(t: Tutorial, snap?: Snapshot): SessionState {
  const blank = t.steps.map(() => false);
  return settle(t, { tutorialId: t.id, index: 0, done: [...blank], skipped: [...blank], finished: false }, snap);
}

/** Saved progress is only reusable if it still fits the tutorial (it may have been edited since). */
export function isValidSession(t: Tutorial, s: SessionState | undefined): s is SessionState {
  return !!s && s.tutorialId === t.id && s.done.length === t.steps.length && s.skipped.length === t.steps.length && s.index >= 0 && s.index < t.steps.length;
}

export function applyEvent(t: Tutorial, s: SessionState, e: LearningEvent): SessionState {
  if (s.finished || s.done[s.index]) return s;
  if (!matchesEvent(t.steps[s.index].action, e)) return s;
  const done = [...s.done];
  done[s.index] = true;
  return { ...s, done };
}

/** Reading steps can always continue; action steps once the action has been seen. */
export function canAdvance(t: Tutorial, s: SessionState): boolean {
  return !s.finished && (t.steps[s.index].action.type === 'read' || s.done[s.index]);
}

const advance = (t: Tutorial, s: SessionState, done: boolean[], skipped: boolean[], snap?: Snapshot): SessionState =>
  s.index + 1 >= t.steps.length
    ? { ...s, done, skipped, finished: true }
    : settle(t, { ...s, done, skipped, index: s.index + 1 }, snap);

export function nextStep(t: Tutorial, s: SessionState, snap?: Snapshot): SessionState {
  if (!canAdvance(t, s)) return s;
  const done = [...s.done];
  done[s.index] = true;
  return advance(t, s, done, s.skipped, snap);
}

export function skipStep(t: Tutorial, s: SessionState, snap?: Snapshot): SessionState {
  if (s.finished) return s;
  const skipped = [...s.skipped];
  skipped[s.index] = !s.done[s.index];
  return advance(t, s, s.done, skipped, snap);
}

export function backStep(s: SessionState): SessionState {
  if (s.index === 0 && !s.finished) return s;
  return s.finished ? { ...s, finished: false } : { ...s, index: s.index - 1 };
}

export function progressOf(t: Tutorial, s: SessionState) {
  const completed = s.done.filter(Boolean).length;
  return { completed, skipped: s.skipped.filter(Boolean).length, total: t.steps.length, fraction: s.finished ? 1 : completed / t.steps.length };
}

export type TutorialStatus = 'new' | 'in-progress' | 'completed';
export function tutorialStatus(t: Tutorial, s: SessionState | undefined): TutorialStatus {
  if (!isValidSession(t, s)) return 'new';
  if (s.finished) return 'completed';
  return s.index > 0 || s.done.some(Boolean) ? 'in-progress' : 'new';
}
