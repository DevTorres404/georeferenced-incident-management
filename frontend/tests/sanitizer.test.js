import { describe, it, expect } from 'vitest';
import { escapeHtml, escapeAttribute } from '../app/js/shared/sanitizer.js';

describe('escapeHtml', () => {
  it('escapes & to &amp;', () => {
    expect(escapeHtml('&')).toBe('&amp;');
  });

  it('escapes < to &lt;', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes > to &gt;', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('returns empty string for null', () => {
    expect(escapeHtml(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  it('returns string numbers unchanged', () => {
    expect(escapeHtml(42)).toBe('42');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('handles already clean text', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('escapeAttribute', () => {
  it('escapes for use in HTML attributes', () => {
    expect(escapeAttribute('hello "world"')).toBe('hello &quot;world&quot;');
  });
});
