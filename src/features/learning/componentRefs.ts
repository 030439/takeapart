import type { ComponentInfo } from '../../types/model';
import type { Tutorial } from '../../types/learning';
import { normalizeName } from '../models/modelStructure';

/** Finds a part by node name or curated display name, ignoring case, spaces and punctuation GLTFLoader strips. */
export function resolveComponentRef(components: ComponentInfo[], ref: string): ComponentInfo | null {
  const n = normalizeName(ref);
  return (
    components.find((c) => c.kind === 'part' && normalizeName(c.nodeName) === n) ??
    components.find((c) => c.kind === 'part' && normalizeName(c.name) === n) ??
    null
  );
}

export interface RelatedLink { label: string; /** Present when the related part exists in this model. */ id?: string }

export function resolveRelated(c: ComponentInfo, components: ComponentInfo[]): RelatedLink[] {
  return (c.related ?? []).map((ref) => {
    const hit = resolveComponentRef(components, ref);
    return { label: hit?.name ?? ref, id: hit?.id };
  });
}

export const parentOf = (c: ComponentInfo, components: ComponentInfo[]): ComponentInfo | undefined =>
  c.parentId ? components.find((x) => x.id === c.parentId) : undefined;

/** Indices of steps that name a component this model does not have. */
export function unresolvedSteps(t: Tutorial, components: ComponentInfo[]): number[] {
  const out: number[] = [];
  t.steps.forEach((s, i) => {
    if (s.action.type === 'select' && s.action.component && !resolveComponentRef(components, s.action.component)) out.push(i);
  });
  return out;
}
