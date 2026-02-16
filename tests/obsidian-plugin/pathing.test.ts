import { describe, expect, it } from 'vitest';
import { markdownPathForSidecar, sidecarPathForMarkdown } from '../../obsidian-plugin/src/pathing.js';

describe('obsidian-plugin path mapping', () => {
  it('maps markdown to sidecar path', () => {
    expect(sidecarPathForMarkdown('notes/todo.md')).toBe('notes/todo.comments.json');
  });

  it('maps sidecar to markdown path', () => {
    expect(markdownPathForSidecar('notes/todo.comments.json')).toBe('notes/todo.md');
  });
});
