/**
 * Escapes user input so it is matched literally inside a RegExp.
 * Prevents regex injection / ReDoS through the search box.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Builds a case-insensitive "contains" regex from untrusted input. */
export function containsRegex(input: string): RegExp {
  return new RegExp(escapeRegex(input.trim()), 'i');
}
