import { describe, it, expect } from 'vitest';
import {
  IMPROVEMENT_STANDARD,
  needsWork,
  strongestAreas,
  priorityAreas,
} from '@/lib/report/improvement';

/**
 * The improvement layer (Natalie, 2026-08-19: "anything below 80 is major room for
 * improvement"). Pure ranking over category scores — no engine thresholds, no I/O.
 *
 * The load-bearing case is the MID-RANGE church: every area in the 50s/60s, so nothing
 * clears the standard. An absolute "how many are strong" question yields 0 there forever,
 * which is why strongestAreas is relative (top 3) and needsWork/priorityAreas are the
 * absolute ones.
 */

const area = (id: string, score: number) => ({ id, score, name: id.toUpperCase() });

/** Mid-range church: all eight areas 49-72, nothing at or above 80. */
const MID_RANGE = [
  area('guest', 72), area('conn', 68), area('disc', 60), area('vol', 58),
  area('gen', 56), area('gov', 53), area('comm', 51), area('sys', 49),
];

/** Healthy church: six areas clear the standard, two do not. */
const MOSTLY_STRONG = [
  area('guest', 92), area('conn', 90), area('disc', 88), area('vol', 86),
  area('gen', 84), area('gov', 82), area('comm', 74), area('sys', 70),
];

/** Every area clears the standard. */
const ALL_STRONG = [
  area('guest', 92), area('conn', 90), area('disc', 88), area('vol', 86),
  area('gen', 84), area('gov', 82), area('comm', 81), area('sys', 80),
];

const ids = (list: ReadonlyArray<{ id: string }>) => list.map((c) => c.id);

describe('IMPROVEMENT_STANDARD', () => {
  it('is 80', () => {
    expect(IMPROVEMENT_STANDARD).toBe(80);
  });
});

describe('needsWork', () => {
  it('returns every area below the standard, worst first, on a mid-range church', () => {
    expect(ids(needsWork(MID_RANGE))).toEqual([
      'sys', 'comm', 'gov', 'gen', 'vol', 'disc', 'conn', 'guest',
    ]);
  });

  it('treats a score exactly at the standard as not needing work', () => {
    expect(ids(needsWork(ALL_STRONG))).toEqual([]);
    expect(ids(needsWork([area('sys', 79), area('gov', 80)]))).toEqual(['sys']);
  });

  it('returns only the sub-standard areas when most areas clear it', () => {
    expect(ids(needsWork(MOSTLY_STRONG))).toEqual(['sys', 'comm']);
  });

  it('breaks score ties by id ascending', () => {
    expect(ids(needsWork([area('sys', 60), area('comm', 60), area('gov', 60)]))).toEqual([
      'comm', 'gov', 'sys',
    ]);
  });

  it('sorts defensively rather than trusting the caller order', () => {
    const scoreAscending = [...MID_RANGE].reverse();
    expect(ids(needsWork(scoreAscending))).toEqual(ids(needsWork(MID_RANGE)));
  });

  it('returns an empty list for no categories', () => {
    expect(needsWork([])).toEqual([]);
  });

  it('does not mutate the caller array', () => {
    const input = [...MID_RANGE];
    needsWork(input);
    expect(ids(input)).toEqual(ids(MID_RANGE));
  });
});

describe('strongestAreas', () => {
  it('names the top three on a mid-range church, best first, so the tile is never zero', () => {
    expect(ids(strongestAreas(MID_RANGE))).toEqual(['guest', 'conn', 'disc']);
  });

  it('names every area at or above the standard when more than three clear it', () => {
    expect(ids(strongestAreas(MOSTLY_STRONG))).toEqual([
      'guest', 'conn', 'disc', 'vol', 'gen', 'gov',
    ]);
  });

  it('names all eight when every area clears the standard', () => {
    expect(ids(strongestAreas(ALL_STRONG))).toHaveLength(8);
  });

  it('unions the standard-clearing areas with the top three when only one clears it', () => {
    const oneStrong = [area('guest', 85), area('conn', 68), area('disc', 60), area('sys', 49)];
    expect(ids(strongestAreas(oneStrong))).toEqual(['guest', 'conn', 'disc']);
  });

  it('breaks score ties by id ascending', () => {
    expect(ids(strongestAreas([area('sys', 60), area('comm', 60), area('gov', 60)]))).toEqual([
      'comm', 'gov', 'sys',
    ]);
  });

  it('returns every area when there are fewer than three', () => {
    expect(ids(strongestAreas([area('sys', 49), area('gov', 53)]))).toEqual(['gov', 'sys']);
  });

  it('returns an empty list for no categories', () => {
    expect(strongestAreas([])).toEqual([]);
  });
});

describe('priorityAreas', () => {
  it('returns the worst three on a mid-range church, worst first', () => {
    expect(ids(priorityAreas(MID_RANGE))).toEqual(['sys', 'comm', 'gov']);
  });

  it('returns nothing when every area clears the standard', () => {
    expect(priorityAreas(ALL_STRONG)).toEqual([]);
  });

  it('never counts an area that clears the standard, even to fill the bottom three', () => {
    expect(ids(priorityAreas(MOSTLY_STRONG))).toEqual(['sys', 'comm']);
  });

  it('breaks score ties by id ascending', () => {
    const tied = [area('sys', 60), area('comm', 60), area('gov', 60), area('vol', 60)];
    expect(ids(priorityAreas(tied))).toEqual(['comm', 'gov', 'sys']);
  });

  it('returns an empty list for no categories', () => {
    expect(priorityAreas([])).toEqual([]);
  });
});

describe('the mid-range church the recalibration exists for', () => {
  it('yields a non-zero count for every tile the dashboard prints', () => {
    expect(MID_RANGE.length).toBe(8);
    expect(strongestAreas(MID_RANGE).length).toBeGreaterThan(0);
    expect(needsWork(MID_RANGE).length).toBeGreaterThan(0);
    expect(priorityAreas(MID_RANGE).length).toBeGreaterThan(0);
  });
});
