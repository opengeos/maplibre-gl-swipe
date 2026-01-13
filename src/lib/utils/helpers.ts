/**
 * Clamps a value between a minimum and maximum.
 *
 * @param value - The value to clamp
 * @param min - The minimum allowed value
 * @param max - The maximum allowed value
 * @returns The clamped value
 *
 * @example
 * ```typescript
 * clamp(5, 0, 10);  // returns 5
 * clamp(-5, 0, 10); // returns 0
 * clamp(15, 0, 10); // returns 10
 * ```
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Formats a numeric value with appropriate decimal places based on step size.
 *
 * @param value - The value to format
 * @param step - The step size to determine decimal places
 * @returns The formatted value as a string
 *
 * @example
 * ```typescript
 * formatNumericValue(5, 1);     // returns "5"
 * formatNumericValue(0.5, 0.1); // returns "0.5"
 * formatNumericValue(0.55, 0.01); // returns "0.55"
 * ```
 */
export function formatNumericValue(value: number, step: number): string {
  if (step === 0) return value.toString();
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return value.toFixed(decimals);
}

/**
 * Generates a unique ID string.
 *
 * @param prefix - Optional prefix for the ID
 * @returns A unique ID string
 *
 * @example
 * ```typescript
 * generateId('control'); // returns "control-abc123"
 * generateId();          // returns "abc123"
 * ```
 */
export function generateId(prefix?: string): string {
  const id = Math.random().toString(36).substring(2, 9);
  return prefix ? `${prefix}-${id}` : id;
}

/**
 * Debounces a function call.
 *
 * @param fn - The function to debounce
 * @param delay - The delay in milliseconds
 * @returns A debounced version of the function
 *
 * @example
 * ```typescript
 * const debouncedUpdate = debounce(() => updateMap(), 100);
 * window.addEventListener('resize', debouncedUpdate);
 * ```
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Throttles a function call.
 *
 * @param fn - The function to throttle
 * @param limit - The minimum time between calls in milliseconds
 * @returns A throttled version of the function
 *
 * @example
 * ```typescript
 * const throttledScroll = throttle(() => handleScroll(), 100);
 * window.addEventListener('scroll', throttledScroll);
 * ```
 */
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Creates a CSS class string from an object of class names.
 *
 * @param classes - Object with class names as keys and boolean values
 * @returns A space-separated string of class names
 *
 * @example
 * ```typescript
 * classNames({ active: true, disabled: false, visible: true });
 * // returns "active visible"
 * ```
 */
export function classNames(classes: Record<string, boolean>): string {
  return Object.entries(classes)
    .filter(([, value]) => value)
    .map(([key]) => key)
    .join(' ');
}
