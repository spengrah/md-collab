import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const sidecarBaselinePath = path.resolve(process.cwd(), 'research/lapce-fork-spike/prototype/sample.comments.json');
const sidecarPath = path.resolve(process.cwd(), 'research/lapce-fork-spike/prototype/.tmp.sample.comments.json');

class EventBus {
  listeners = new Map();
  on(event, fn) {
    const arr = this.listeners.get(event) ?? [];
    arr.push(fn);
    this.listeners.set(event, arr);
  }
  emit(event, payload) {
    for (const fn of this.listeners.get(event) ?? []) fn(payload);
  }
}

class ThreadStore {
  constructor(bus) {
    this.bus = bus;
    this.threads = [];
    this.focusedThreadId = null;
  }

  loadFromSidecar(jsonText, source = 'manual') {
    const parsed = JSON.parse(jsonText);
    this.threads = parsed.threads ?? [];
    this.bus.emit('threads:updated', { source, count: this.threads.length });
  }

  focusThread(threadId, source) {
    const exists = this.threads.some((t) => t.id === threadId);
    if (!exists) return;
    this.focusedThreadId = threadId;
    this.bus.emit('thread:focused', { threadId, source });
  }

  getInlineWidgetsForFile(file) {
    return this.threads
      .filter((t) => t.file === file)
      .map((t) => ({
        threadId: t.id,
        range: {
          startLine: t.startLine,
          startChar: t.startChar,
          endLine: t.endLine,
          endChar: t.endChar,
        },
        chrome: {
          kind: 'inline-thread-widget',
          actionButtons: ['reply', 'resolve', 'jump-to-panel'],
          isFocused: t.id === this.focusedThreadId,
        },
      }));
  }
}

class ThreadPanel {
  constructor(store, bus) {
    this.store = store;
    this.bus = bus;
    this.items = [];
    bus.on('threads:updated', () => {
      this.items = [...store.threads];
      console.log(`[panel] refresh => ${this.items.length} threads`);
    });
    bus.on('thread:focused', ({ threadId, source }) => {
      console.log(`[panel] focused thread ${threadId} (source=${source})`);
    });
  }

  clickThread(threadId) {
    this.store.focusThread(threadId, 'panel');
  }
}

class EditorSurface {
  constructor(store, bus, file) {
    this.store = store;
    this.bus = bus;
    this.file = file;
    bus.on('threads:updated', () => this.renderInlineWidgets());
    bus.on('thread:focused', ({ threadId, source }) => {
      const t = store.threads.find((x) => x.id === threadId);
      if (t && t.file === this.file) {
        console.log(`[editor] reveal ${threadId} @ ${t.startLine}:${t.startChar} (source=${source})`);
      }
      this.renderInlineWidgets();
    });
  }

  clickInlineWidget(threadId) {
    this.store.focusThread(threadId, 'editor-inline-widget');
  }

  renderInlineWidgets() {
    const widgets = this.store.getInlineWidgetsForFile(this.file);
    const summary = widgets
      .map((w) => `${w.threadId}${w.chrome.isFocused ? '*' : ''}@L${w.range.startLine}`)
      .join(', ');
    console.log(`[editor] inline widgets => ${summary}`);
  }
}

function watchSidecar(sidecar, onReload) {
  let last = 0;
  return fs.watch(sidecar, { persistent: false }, () => {
    const now = Date.now();
    if (now - last < 50) return;
    last = now;
    const t0 = performance.now();
    const text = fs.readFileSync(sidecar, 'utf8');
    onReload(text, performance.now() - t0);
  });
}

function runSyncExercise(panel, editor, iterations = 10) {
  const ids = ['t-1', 't-2'];
  for (let i = 0; i < iterations; i++) {
    const id = ids[i % ids.length];
    if (i % 2 === 0) panel.clickThread(id);
    else editor.clickInlineWidget(id);
  }
  console.log(`[sync] completed ${iterations} panel<->editor focus interactions`);
}

function appendSyntheticThread(sidecar) {
  const parsed = JSON.parse(fs.readFileSync(sidecar, 'utf8'));
  parsed.threads.push({
    id: 't-3',
    file: 'docs/notes.md',
    startLine: 44,
    startChar: 2,
    endLine: 44,
    endChar: 22,
    status: 'open',
    summary: 'Synthetic watch/update event',
    messages: [{ id: 'm-3', author: 'bot', text: 'watch trigger' }],
  });
  fs.writeFileSync(sidecar, `${JSON.stringify(parsed, null, 2)}\n`);
}

function main() {
  fs.copyFileSync(sidecarBaselinePath, sidecarPath);

  const bus = new EventBus();
  const store = new ThreadStore(bus);
  const panel = new ThreadPanel(store, bus);
  const editor = new EditorSurface(store, bus, 'docs/notes.md');

  store.loadFromSidecar(fs.readFileSync(sidecarPath, 'utf8'), 'initial-load');
  runSyncExercise(panel, editor, 10);

  const watcher = watchSidecar(sidecarPath, (text, readMs) => {
    const start = performance.now();
    store.loadFromSidecar(text, 'sidecar-watch');
    const total = performance.now() - start + readMs;
    console.log(`[watch] sidecar refresh latency ~${total.toFixed(2)}ms`);
  });

  setTimeout(() => appendSyntheticThread(sidecarPath), 150);
  setTimeout(() => {
    watcher.close();
    fs.rmSync(sidecarPath, { force: true });
    console.log('[done] vertical-slice prototype run complete');
  }, 700);
}

main();
