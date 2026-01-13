import { describe, it, expect } from 'vitest';
import {
  clamp,
  formatNumericValue,
  generateId,
  classNames,
} from '../src/lib/utils/helpers';

describe('clamp', () => {
  it('should return value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('should return min when value is below range', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('should return max when value is above range', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('should handle equal min and max', () => {
    expect(clamp(5, 5, 5)).toBe(5);
  });

  it('should handle negative ranges', () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(-15, -10, -1)).toBe(-10);
    expect(clamp(0, -10, -1)).toBe(-1);
  });

  it('should handle decimal values', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(1.5, 0, 1)).toBe(1);
    expect(clamp(-0.5, 0, 1)).toBe(0);
  });

  it('should clamp position values (0-100)', () => {
    expect(clamp(50, 0, 100)).toBe(50);
    expect(clamp(-10, 0, 100)).toBe(0);
    expect(clamp(150, 0, 100)).toBe(100);
  });
});

describe('formatNumericValue', () => {
  it('should format whole numbers with step 1', () => {
    expect(formatNumericValue(5, 1)).toBe('5');
  });

  it('should format decimal with step 0.1', () => {
    expect(formatNumericValue(0.5, 0.1)).toBe('0.5');
  });

  it('should format decimal with step 0.01', () => {
    expect(formatNumericValue(0.55, 0.01)).toBe('0.55');
  });

  it('should handle step of 0', () => {
    expect(formatNumericValue(5.5, 0)).toBe('5.5');
  });

  it('should round to correct decimal places', () => {
    // Note: toFixed uses "round half to even" (banker's rounding) in some cases
    expect(formatNumericValue(5.556, 0.01)).toBe('5.56');
  });

  it('should format percentage values', () => {
    expect(formatNumericValue(50, 1)).toBe('50');
    expect(formatNumericValue(50.5, 0.1)).toBe('50.5');
  });
});

describe('generateId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it('should apply prefix when provided', () => {
    const id = generateId('control');
    expect(id.startsWith('control-')).toBe(true);
  });

  it('should generate ID without prefix', () => {
    const id = generateId();
    expect(id).not.toContain('-');
    expect(id.length).toBeGreaterThan(0);
  });

  it('should generate alphanumeric IDs', () => {
    const id = generateId();
    expect(/^[a-z0-9]+$/i.test(id)).toBe(true);
  });
});

describe('classNames', () => {
  it('should join active classes', () => {
    expect(classNames({ active: true, disabled: false, visible: true })).toBe(
      'active visible'
    );
  });

  it('should return empty string when no classes are active', () => {
    expect(classNames({ active: false, disabled: false })).toBe('');
  });

  it('should handle all active classes', () => {
    expect(classNames({ a: true, b: true, c: true })).toBe('a b c');
  });

  it('should handle single active class', () => {
    expect(classNames({ active: true })).toBe('active');
  });

  it('should handle empty object', () => {
    expect(classNames({})).toBe('');
  });

  it('should handle swipe control classes', () => {
    expect(
      classNames({
        'swipe-slider': true,
        'swipe-slider-vertical': true,
        dragging: false,
      })
    ).toBe('swipe-slider swipe-slider-vertical');
  });
});
