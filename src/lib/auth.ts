/**
 * Temporary local auth helper.
 * Intentionally minimal: returns a fixed demo user for local API reads.
 */

export function getCurrentUserEmail(): string {
  return "demo@mulify.local";
}

