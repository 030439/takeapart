import { describe, expect, it } from 'vitest';
import {
  applyEvent, backStep, canAdvance, isSatisfied, isValidSession, matchesEvent, newSession, nextStep, parseTutorials,
  progressOf, skipStep, tutorialStatus,
} from '../../src/features/learning/tutorial';
import { parentOf, resolveComponentRef, resolveRelated, unresolvedSteps } from '../../src/features/learning/componentRefs';
import { BUILTIN_TUTORIALS } from '../../src/features/learning/builtinTutorials';
import { MODEL_CATALOG } from '../../src/features/models/catalog';
import { parseManifest } from '../../src/features/models/manifest';
import type { ComponentInfo } from '../../src/types/model';
import type { Snapshot, Tutorial } from '../../src/types/learning';

const raw = (steps: unknown[], extra: Record<string, unknown> = {}) => [{ id: 't', title: 'T', steps, ...extra }];
const step = (id: string, action?: unknown) => ({ id, title: id, text: `text ${id}`, ...(action ? { action } : {}) });
const one = (steps: unknown[]): Tutorial => {
  const r = parseTutorials(raw(steps));
  expect(r.errors).toEqual([]);
  return r.tutorials[0];
};
const snap = (p: Partial<Snapshot> = {}): Snapshot => ({ selectedNodeName: null, explode: 0, particles: 'solid', ...p });

describe('parseTutorials', () => {
  it('accepts a valid tutorial, defaults the action to read and the explode threshold to 0.5, and infers flags', () => {
    const t = one([step('a'), step('b', { type: 'explode' }), step('c', { type: 'hand', gesture: 'fist' })]);
    expect(t.steps[0].action).toEqual({ type: 'read' });
    expect(t.steps[1].action).toEqual({ type: 'explode', min: 0.5 });
    expect(t.requiresComponents).toBe(true);
    expect(t.needsCamera).toBe(true);
    const plain = one([step('a'), step('b', { type: 'particles' })]);
    expect(plain.requiresComponents).toBe(false);
    expect(plain.needsCamera).toBe(false);
  });
  it('drops invalid tutorials with a reason and keeps the valid ones', () => {
    const bad: unknown[] = [
      { id: 'Bad Id', title: 'x', steps: [step('a')] },
      { id: 'no-title', steps: [step('a')] },
      { id: 'empty', title: 'x', steps: [] },
      { id: 'dup-step', title: 'x', steps: [step('a'), step('a')] },
      { id: 'bad-action', title: 'x', steps: [step('a', { type: 'teleport' })] },
      { id: 'bad-gesture', title: 'x', steps: [step('a', { type: 'hand', gesture: 'wave' })] },
      { id: 'bad-min', title: 'x', steps: [step('a', { type: 'explode', min: 2 })] },
      { id: 'no-text', title: 'x', steps: [{ id: 'a', title: 'a' }] },
      { id: 'good', title: 'Good', steps: [step('a')] },
      { id: 'good', title: 'Dup', steps: [step('a')] },
    ];
    const r = parseTutorials(bad);
    expect(r.tutorials.map((t) => t.id)).toEqual(['good']);
    expect(r.errors).toHaveLength(9);
    expect(parseTutorials('nope').errors).toHaveLength(1);
  });
});

describe('completion rules', () => {
  it('matches selection by normalised node name, or any part when none is named', () => {
    const a = { type: 'select' as const, component: 'Input Shaft' };
    expect(matchesEvent(a, { type: 'select', componentId: '1', nodeName: 'input_shaft' })).toBe(true);
    expect(matchesEvent(a, { type: 'select', componentId: '1', nodeName: 'Gear' })).toBe(false);
    expect(matchesEvent({ type: 'select' }, { type: 'select', componentId: '1', nodeName: 'Gear' })).toBe(true);
  });
  it('treats returning the explosion to zero as assembling, and requires a real action for assemble', () => {
    expect(matchesEvent({ type: 'assemble' }, { type: 'assemble' })).toBe(true);
    expect(matchesEvent({ type: 'assemble' }, { type: 'explode', amount: 0 })).toBe(true);
    expect(matchesEvent({ type: 'assemble' }, { type: 'explode', amount: 0.5 })).toBe(false);
    expect(isSatisfied({ type: 'assemble' }, snap())).toBe(false);
    expect(isSatisfied({ type: 'reconstruct' }, snap())).toBe(false);
  });
  it('matches particles, reconstruct, explode thresholds and hand gestures', () => {
    expect(matchesEvent({ type: 'particles' }, { type: 'particles', state: 'particles' })).toBe(true);
    expect(matchesEvent({ type: 'particles' }, { type: 'particles', state: 'solid' })).toBe(false);
    expect(matchesEvent({ type: 'reconstruct' }, { type: 'particles', state: 'solid' })).toBe(true);
    expect(matchesEvent({ type: 'explode', min: 0.75 }, { type: 'explode', amount: 0.5 })).toBe(false);
    expect(matchesEvent({ type: 'explode', min: 0.75 }, { type: 'explode', amount: 0.75 })).toBe(true);
    expect(matchesEvent({ type: 'hand', gesture: 'pinch' }, { type: 'hand', gesture: 'pinch' })).toBe(true);
    expect(matchesEvent({ type: 'hand', gesture: 'pinch' }, { type: 'hand', gesture: 'fist' })).toBe(false);
    expect(matchesEvent({ type: 'read' }, { type: 'assemble' })).toBe(false);
  });
  it('lets state-based steps start already satisfied', () => {
    expect(isSatisfied({ type: 'select', component: 'Piston' }, snap({ selectedNodeName: 'piston' }))).toBe(true);
    expect(isSatisfied({ type: 'select', component: 'Piston' }, snap({ selectedNodeName: 'rod' }))).toBe(false);
    expect(isSatisfied({ type: 'explode', min: 0.5 }, snap({ explode: 0.6 }))).toBe(true);
    expect(isSatisfied({ type: 'particles' }, snap({ particles: 'particles' }))).toBe(true);
  });
});

describe('session', () => {
  const t = one([step('read1'), step('pick', { type: 'select', component: 'Piston' }), step('boom', { type: 'explode', min: 0.5 }), step('back', { type: 'assemble' })]);

  it('walks through every step, only advancing action steps once their action is seen', () => {
    let s = newSession(t);
    expect(canAdvance(t, s)).toBe(true); // reading step
    s = nextStep(t, s);
    expect(s.index).toBe(1);
    expect(canAdvance(t, s)).toBe(false);
    expect(nextStep(t, s)).toBe(s); // blocked
    s = applyEvent(t, s, { type: 'select', componentId: 'x', nodeName: 'Rod' });
    expect(s.done[1]).toBe(false); // wrong part
    s = applyEvent(t, s, { type: 'select', componentId: 'x', nodeName: 'piston' });
    expect(s.done[1]).toBe(true);
    s = nextStep(t, s);
    s = applyEvent(t, s, { type: 'explode', amount: 0.9 });
    s = nextStep(t, s);
    expect(s.finished).toBe(false);
    s = applyEvent(t, s, { type: 'assemble' });
    s = nextStep(t, s);
    expect(s.finished).toBe(true);
    expect(progressOf(t, s)).toEqual({ completed: 4, skipped: 0, total: 4, fraction: 1 });
    expect(tutorialStatus(t, s)).toBe('completed');
  });
  it('ignores events once a step is done or the tutorial is finished', () => {
    let s = newSession(t, snap());
    s = nextStep(t, s);
    s = applyEvent(t, s, { type: 'select', componentId: 'x', nodeName: 'piston' });
    expect(applyEvent(t, s, { type: 'select', componentId: 'x', nodeName: 'piston' })).toBe(s);
  });
  it('skipping records the step as skipped, not done, and the tutorial can still finish', () => {
    let s = nextStep(t, newSession(t));
    s = skipStep(t, s);
    s = skipStep(t, s);
    s = skipStep(t, s);
    expect(s.finished).toBe(true);
    expect(s.skipped).toEqual([false, true, true, true]);
    expect(progressOf(t, s).completed).toBe(1);
  });
  it('going back keeps progress, and un-finishes a finished tutorial', () => {
    let s = nextStep(t, newSession(t));
    s = backStep(s);
    expect(s.index).toBe(0);
    expect(s.done[0]).toBe(true);
    expect(backStep(s)).toBe(s);
    const fin = skipStep(t, skipStep(t, skipStep(t, nextStep(t, newSession(t)))));
    fin.finished = true;
    expect(backStep(fin).finished).toBe(false);
  });
  it('settles a state-based step that is already satisfied when it begins', () => {
    const s = nextStep(t, newSession(t), snap({ selectedNodeName: 'Piston' }));
    expect(s.index).toBe(1);
    expect(s.done[1]).toBe(true);
    const unsettled = nextStep(t, newSession(t), snap());
    expect(unsettled.done[1]).toBe(false);
  });
  it('round-trips through JSON and rejects stale saved progress', () => {
    const s = nextStep(t, newSession(t));
    const back = JSON.parse(JSON.stringify(s));
    expect(back).toEqual(s);
    expect(isValidSession(t, back)).toBe(true);
    expect(isValidSession(t, { ...back, done: [true] })).toBe(false);
    expect(isValidSession(t, { ...back, tutorialId: 'other' })).toBe(false);
    expect(isValidSession(t, undefined)).toBe(false);
    expect(tutorialStatus(t, back)).toBe('in-progress');
    expect(tutorialStatus(t, undefined)).toBe('new');
  });
});

describe('built-in and demo tutorials', () => {
  it('are valid, with unique ids and the expected flags', () => {
    expect(new Set(BUILTIN_TUTORIALS.map((t) => t.id)).size).toBe(BUILTIN_TUTORIALS.length);
    const by = (id: string) => BUILTIN_TUTORIALS.find((t) => t.id === id)!;
    expect(by('getting-started').requiresComponents).toBe(true);
    expect(by('particles').requiresComponents).toBe(false);
    expect(by('hand-control').needsCamera).toBe(true);
  });
  it('the piston demo tutorial parses and every named part exists in that demo', () => {
    const piston = MODEL_CATALOG.find((m) => m.id === 'demo-piston-assembly')!;
    const again = parseTutorials(piston.tutorials);
    expect(again.errors).toEqual([]);
    const comps: ComponentInfo[] = piston.components.map((c) => ({ id: c.id, kind: 'part', nodeName: c.id, name: c.name, curated: false }));
    expect(unresolvedSteps(again.tutorials[0], comps)).toEqual([]);
  });
});

describe('component references', () => {
  const comps: ComponentInfo[] = [
    { id: 'g0', kind: 'assembly', nodeName: 'Gearbox', name: 'Gearbox', curated: false },
    { id: '0.1', kind: 'part', nodeName: 'Input_Shaft', name: 'Input shaft', parentId: 'g0', curated: true, related: ['Gear 1', 'Missing Part'] },
    { id: '0.2', kind: 'part', nodeName: 'Gear_1', name: 'First gear', parentId: 'g0', curated: true },
  ];
  it('resolves by node name or display name, ignoring case and punctuation, and never resolves assemblies', () => {
    expect(resolveComponentRef(comps, 'input shaft')?.id).toBe('0.1');
    expect(resolveComponentRef(comps, 'FIRST GEAR')?.id).toBe('0.2');
    expect(resolveComponentRef(comps, 'Gearbox')).toBeNull();
    expect(resolveComponentRef(comps, 'nope')).toBeNull();
  });
  it('splits related components into resolvable links and plain text', () => {
    expect(resolveRelated(comps[1], comps)).toEqual([{ label: 'First gear', id: '0.2' }, { label: 'Missing Part', id: undefined }]);
    expect(resolveRelated(comps[2], comps)).toEqual([]);
  });
  it('finds the parent assembly', () => {
    expect(parentOf(comps[1], comps)?.name).toBe('Gearbox');
    expect(parentOf(comps[0], comps)).toBeUndefined();
  });
  it('lists tutorial steps that name a component the model lacks', () => {
    const t = one([step('a', { type: 'select', component: 'Input_Shaft' }), step('b', { type: 'select', component: 'Flywheel' }), step('c', { type: 'select' })]);
    expect(unresolvedSteps(t, comps)).toEqual([1]);
  });
});

describe('manifest learning fields', () => {
  const base = { id: 'x', name: 'X', category: 'engines', description: 'd', file: 'a.glb' };
  it('keeps overview, sources and valid tutorials, and drops only the invalid tutorial', () => {
    const r = parseManifest({ version: 1, models: [{
      ...base, overview: 'About', sources: ['Manual p. 4'],
      tutorials: [{ id: 'ok', title: 'OK', steps: [step('a')] }, { id: 'bad', title: 'Bad', steps: [] }],
    }] });
    expect(r.models).toHaveLength(1);
    expect(r.models[0].overview).toBe('About');
    expect(r.models[0].sources).toEqual(['Manual p. 4']);
    expect(r.models[0].tutorials?.map((t) => t.id)).toEqual(['ok']);
    expect(r.errors).toHaveLength(1);
  });
  it('rejects an entry with a malformed overview or sources', () => {
    const r = parseManifest({ version: 1, models: [{ ...base, id: 'a', overview: 5 }, { ...base, id: 'b', sources: 'text' }] });
    expect(r.models).toHaveLength(0);
    expect(r.errors).toHaveLength(2);
  });
});
