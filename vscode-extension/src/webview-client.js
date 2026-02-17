const vscode = acquireVsCodeApi();
const persisted = vscode.getState() || {};
let vm;
let drafts = persisted.drafts || {};
let collapsedSuggestionById = persisted.collapsedSuggestionById || {};
let pendingByRequestId = persisted.pendingByRequestId || {};
let inlineErrorByThreadId = persisted.inlineErrorByThreadId || {};

const root = document.getElementById('root');
const toolbar = document.getElementById('toolbar');
const banner = document.getElementById('banner');

const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const persistUi = () => vscode.setState({ drafts, collapsedSuggestionById, pendingByRequestId, inlineErrorByThreadId });
const requestId = () => `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const threadDraftKey = (threadId) => `reply:${threadId}`;
const addCommentDraftKey = 'comment:new';

const replaceLoadingWithError = (message) => {
  if (!root) return;
  root.className = 'empty';
  root.textContent = message;
};

const guard = (fn, fallbackMessage) => {
  try {
    fn();
  } catch (error) {
    console.error('[md-collab.threadChat] webview error', error);
    replaceLoadingWithError(fallbackMessage);
  }
};

const postIntent = (intent, threadId, suggestionId, body, reqId) =>
  vscode.postMessage({ type: 'intent', intent, threadId, suggestionId, body, requestId: reqId });
const postUi = (type, threadId) => vscode.postMessage({ type, threadId });

const makeButton = (label, intent, threadId, suggestionId, secondary, ariaLabel) => {
  const b = el('button', secondary ? 'secondary' : '', label);
  b.type = 'button';
  b.setAttribute('aria-label', ariaLabel || label);
  b.addEventListener('click', () => {
    inlineErrorByThreadId[threadId || 'root'] = '';
    const reqId = requestId();
    pendingByRequestId[reqId] = {
      threadId,
      body: '',
      intent,
      ts: new Date().toISOString(),
    };
    postIntent(intent, threadId, suggestionId, undefined, reqId);
    persistUi();
    render();
  });
  return b;
};

const diffToken = (token) => {
  const span = el('span', token.changed ? 'token changed' : 'token', token.text);
  if (token.changed) span.setAttribute('aria-label', 'changed text');
  return span;
};

const diffLine = (line) => {
  const row = el('div', `diffLine ${line.kind}`);
  row.appendChild(el('span', 'diffLabel', line.kind === 'before' ? '−' : '+'));
  const body = el('span', 'diffBody');
  body.appendChild(el('strong', 'diffHumanLabel', `${line.label}: `));
  line.tokens.forEach((token) => body.appendChild(diffToken(token)));
  row.appendChild(body);
  return row;
};

const renderBanner = (payload) => {
  clear(banner);
  if (!payload) {
    banner.style.display = 'none';
    return;
  }
  banner.style.display = 'flex';
  banner.className = payload.kind === 'warning' ? 'banner warning' : 'banner';
  banner.appendChild(el('span', '', payload.message));
  const actions = el('div', 'bannerActions');
  (payload.actions || []).forEach((action) => {
    actions.appendChild(makeButton(action.label, action.intent, undefined, undefined, true, action.label));
  });
  banner.appendChild(actions);
};

const submitComposer = ({ intent, threadId, body, draftKey }) => {
  const trimmed = body.trim();
  if (!trimmed) return;
  inlineErrorByThreadId[threadId || 'root'] = '';
  const reqId = requestId();
  pendingByRequestId[reqId] = { threadId, body: trimmed, intent, ts: new Date().toISOString() };
  postIntent(intent, threadId, undefined, trimmed, reqId);
  drafts[draftKey] = '';
  if (threadId) postUi('setActiveThread', threadId);
  persistUi();
  render();
};

const attachComposerKeybind = (textarea, onSubmit) => {
  textarea.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      onSubmit();
    }
  });
};

const renderToolbar = () => {
  clear(toolbar);
  if (!vm) return;
  const status = el('select');
  status.setAttribute('aria-label', 'Filter by status');
  ['all', 'open', 'resolved'].forEach((value) => {
    const option = el('option', '', value);
    option.value = value;
    if (vm.ui.filters.status === value) option.selected = true;
    status.appendChild(option);
  });
  const owner = el('select');
  owner.setAttribute('aria-label', 'Filter by ownership');
  ['all', 'mine'].forEach((value) => {
    const option = el('option', '', value);
    option.value = value;
    if (vm.ui.filters.ownership === value) option.selected = true;
    owner.appendChild(option);
  });
  const hasSuggestionsWrap = el('label', 'checkboxWrap');
  const hasSuggestions = el('input');
  hasSuggestions.type = 'checkbox';
  hasSuggestions.checked = vm.ui.filters.hasSuggestions;
  hasSuggestions.setAttribute('aria-label', 'Only show threads with suggestions');
  hasSuggestionsWrap.appendChild(hasSuggestions);
  hasSuggestionsWrap.appendChild(el('span', '', 'With suggestions'));

  const suggestionStateWrap = el('label', 'checkboxWrap');
  const suggestionState = el('input');
  suggestionState.type = 'checkbox';
  suggestionState.checked = vm.ui.filters.suggestionState === 'all';
  suggestionState.setAttribute('aria-label', 'Show applied and rejected suggestions');
  suggestionStateWrap.appendChild(suggestionState);
  suggestionStateWrap.appendChild(el('span', '', 'Show applied/rejected'));

  const updateFilters = () => vscode.postMessage({
    type: 'setFilters',
    filters: {
      status: status.value,
      ownership: owner.value,
      hasSuggestions: hasSuggestions.checked,
      suggestionState: suggestionState.checked ? 'all' : 'proposedOnly',
    },
  });
  status.addEventListener('change', updateFilters);
  owner.addEventListener('change', updateFilters);
  hasSuggestions.addEventListener('change', updateFilters);
  suggestionState.addEventListener('change', updateFilters);

  const addCommentWrap = el('div', 'composerWrap');
  const addCommentBody = el('textarea', 'composer');
  addCommentBody.placeholder = 'Add comment from current selection…';
  addCommentBody.value = drafts[addCommentDraftKey] || '';
  addCommentBody.setAttribute('aria-label', 'Add comment from current selection text');
  addCommentBody.addEventListener('input', () => {
    drafts[addCommentDraftKey] = addCommentBody.value;
    persistUi();
  });

  const addCommentSubmit = el('button', '', 'Add comment from selection');
  addCommentSubmit.type = 'button';
  addCommentSubmit.setAttribute('aria-label', 'Add comment from current selection');
  const onSubmitComment = () => submitComposer({ intent: 'addComment', body: addCommentBody.value, draftKey: addCommentDraftKey });
  addCommentSubmit.addEventListener('click', onSubmitComment);
  attachComposerKeybind(addCommentBody, onSubmitComment);

  addCommentWrap.appendChild(addCommentBody);
  addCommentWrap.appendChild(addCommentSubmit);

  const rootError = inlineErrorByThreadId.root;
  if (rootError) {
    const errorRow = el('div', 'inlineError', rootError);
    const reload = makeButton('Reload sidecar', 'reloadSidecar', undefined, undefined, true, 'Reload sidecar');
    errorRow.appendChild(reload);
    addCommentWrap.appendChild(errorRow);
  }

  toolbar.appendChild(status);
  toolbar.appendChild(owner);
  toolbar.appendChild(hasSuggestionsWrap);
  toolbar.appendChild(suggestionStateWrap);
  toolbar.appendChild(addCommentWrap);
};

const optimisticMessageBubble = (pending) => {
  const bubble = el('article', 'bubble pending');
  bubble.setAttribute('role', 'article');
  bubble.appendChild(el('div', 'bubbleHead', 'You · sending…'));
  bubble.appendChild(el('div', 'bubbleBody', pending.body));
  return bubble;
};

const renderThread = (thread) => {
  const expanded = vm.ui.expandedThreadIds.includes(thread.threadId);
  const card = el('section', 'thread');
  card.setAttribute('data-thread-id', thread.threadId);

  const header = el('header', 'threadHeader');
  header.tabIndex = 0;
  header.setAttribute('role', 'button');
  header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  header.setAttribute('aria-label', 'Toggle thread ' + thread.latestSnippet);
  header.addEventListener('click', () => postUi('toggleThread', thread.threadId));
  header.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      postUi('toggleThread', thread.threadId);
    }
  });

  const titleWrap = el('div');
  titleWrap.appendChild(el('div', '', thread.latestSnippet));
  const badges = el('div', 'badges');
  [thread.status, thread.relevanceState, thread.timelineKind, thread.anchorConfidence].forEach((text) => {
    badges.appendChild(el('span', 'badge', text));
  });
  titleWrap.appendChild(badges);
  header.appendChild(titleWrap);
  card.appendChild(header);

  if (expanded) {
    const body = el('div', 'threadBody');
    const actions = el('div', 'actions');
    if (thread.canResolve) actions.appendChild(makeButton('Resolve', 'resolve', thread.threadId, undefined, true, 'Resolve thread'));
    if (thread.canReopen) actions.appendChild(makeButton('Reopen', 'reopen', thread.threadId, undefined, true, 'Reopen thread'));
    actions.appendChild(makeButton('Suggest from Selection', 'suggestFromSelection', thread.threadId, undefined, false, 'Suggest from selection'));
    actions.appendChild(makeButton('Jump to anchor', 'jumpToAnchor', thread.threadId, undefined, true, 'Jump to anchor'));
    if (thread.anchorConfidence === 'broken') {
      actions.appendChild(makeButton('Relink anchor', 'relinkAnchor', thread.threadId, undefined, true, 'Relink anchor'));
    }
    body.appendChild(actions);

    const inlineError = inlineErrorByThreadId[thread.threadId];
    if (inlineError) {
      const errorRow = el('div', 'inlineError', inlineError);
      const reload = makeButton('Reload sidecar', 'reloadSidecar', undefined, undefined, true, 'Reload sidecar');
      errorRow.appendChild(reload);
      body.appendChild(errorRow);
    }

    thread.messages.forEach((message) => {
      const bubble = el('article', 'bubble ' + (message.kind === 'system' ? 'system' : ''));
      bubble.setAttribute('role', 'article');
      bubble.appendChild(el('div', 'bubbleHead', message.authorLabel + ' · ' + new Date(message.createdAt).toLocaleString()));
      bubble.appendChild(el('div', 'bubbleBody', message.body));
      body.appendChild(bubble);
    });

    Object.values(pendingByRequestId)
      .filter((pending) => pending.threadId === thread.threadId && pending.intent === 'reply')
      .forEach((pending) => body.appendChild(optimisticMessageBubble(pending)));

    thread.suggestions.forEach((suggestion) => {
      const sCard = el('section', 'suggestion');
      sCard.setAttribute('aria-label', 'Suggestion status ' + suggestion.status);
      sCard.appendChild(el('div', 'suggestionHead', '💡 Suggestion · ' + suggestion.status));

      const diff = el('div', 'diffWrap');
      const collapsed = collapsedSuggestionById[suggestion.suggestionId] ?? suggestion.collapsedByDefault;
      if (suggestion.isLongDiff) {
        const toggle = el('button', 'secondary', collapsed ? 'Expand diff' : 'Collapse diff');
        toggle.type = 'button';
        toggle.addEventListener('click', () => {
          collapsedSuggestionById[suggestion.suggestionId] = !collapsed;
          persistUi();
          render();
        });
        diff.appendChild(toggle);
      }
      if (!collapsed) suggestion.lines.forEach((line) => diff.appendChild(diffLine(line)));
      else diff.appendChild(el('div', 'diffCollapsed', 'Long diff collapsed. Expand to view changes.'));
      sCard.appendChild(diff);

      const sa = el('div', 'actions');
      if (suggestion.status === 'proposed') {
        sa.appendChild(makeButton('Apply', 'applySuggestion', thread.threadId, suggestion.suggestionId, false, 'Apply suggestion'));
        sa.appendChild(makeButton('Reject', 'rejectSuggestion', thread.threadId, suggestion.suggestionId, true, 'Reject suggestion'));
      }
      sa.appendChild(makeButton('View base version', 'viewBaseVersion', thread.threadId, suggestion.suggestionId, true, 'View base version'));
      sCard.appendChild(sa);
      body.appendChild(sCard);
    });

    const composerWrap = el('div', 'composerWrap');
    const replyBody = el('textarea', 'composer');
    const key = threadDraftKey(thread.threadId);
    replyBody.value = drafts[key] || '';
    replyBody.placeholder = 'Reply…';
    replyBody.setAttribute('aria-label', 'Reply to thread');
    replyBody.addEventListener('input', () => {
      drafts[key] = replyBody.value;
      persistUi();
    });

    const submit = el('button', '', 'Reply');
    submit.type = 'button';
    const onSubmit = () => submitComposer({ intent: 'reply', threadId: thread.threadId, body: replyBody.value, draftKey: key });
    submit.addEventListener('click', onSubmit);
    attachComposerKeybind(replyBody, onSubmit);

    const cancel = el('button', 'secondary', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => {
      drafts[key] = '';
      persistUi();
      render();
    });

    composerWrap.appendChild(replyBody);
    composerWrap.appendChild(submit);
    composerWrap.appendChild(cancel);
    body.appendChild(composerWrap);

    card.appendChild(body);
  }

  return card;
};

const purgeStaleRequests = () => {
  const cutoff = Date.now() - 15000;
  for (const [reqId, entry] of Object.entries(pendingByRequestId)) {
    if (new Date(entry.ts).getTime() < cutoff) delete pendingByRequestId[reqId];
  }
};

const render = () => {
  purgeStaleRequests();
  const scrollEl = document.documentElement;
  const scrollTop = scrollEl.scrollTop;
  clear(root);
  renderToolbar();
  if (!vm) {
    root.className = 'empty';
    root.textContent = 'No thread data loaded.';
    return;
  }
  root.className = '';

  const mkGroup = (name, threads, groupName) => {
    const group = el('section', 'group');
    group.setAttribute('data-group', groupName);
    group.appendChild(el('h3', 'groupTitle', name + ' (' + threads.length + ')'));
    threads.forEach((thread) => group.appendChild(renderThread(thread)));
    return group;
  };

  root.appendChild(mkGroup('Open', vm.groups.open, 'open'));
  root.appendChild(mkGroup('Resolved', vm.groups.resolved, 'resolved'));
  scrollEl.scrollTop = scrollTop;
};

const patchThread = (groupName, threadId, thread) => {
  if (!vm) return;
  vm.groups[groupName] = vm.groups[groupName].map((candidate) => candidate.threadId === threadId ? thread : candidate);
  const group = root.querySelector('[data-group="' + groupName + '"]');
  if (!group) return render();
  const prior = group.querySelector('[data-thread-id="' + threadId + '"]');
  const next = renderThread(thread);
  if (prior) group.replaceChild(next, prior);
};

window.addEventListener('message', (event) => {
  guard(() => {
    if (!event.data) return;
    if (event.data.type === 'intentResult') {
      const pending = pendingByRequestId[event.data.requestId];
      const targetThreadId = pending?.threadId || event.data.threadId;
      if (pending) {
        if (!event.data.ok) {
          if (event.data.kind === 'conflict') {
            inlineErrorByThreadId[targetThreadId || 'root'] =
              'Submit failed due to conflict after one auto-retry. Reload sidecar and retry.';
          } else if ((targetThreadId || 'root') === 'root' && (event.data.kind === 'selection' || pending.intent === 'addComment')) {
            inlineErrorByThreadId.root =
              'Could not add comment from selection. Select the target text in the editor, then retry. If the document changed, reload sidecar and try again.';
          } else {
            inlineErrorByThreadId[targetThreadId || 'root'] = event.data.message || 'Action failed. Please retry.';
          }
          if (pending.body) {
            drafts[pending.threadId ? threadDraftKey(pending.threadId) : addCommentDraftKey] = pending.body;
          }
        }
        delete pendingByRequestId[event.data.requestId];
      } else if (!event.data.ok && targetThreadId) {
        inlineErrorByThreadId[targetThreadId] = event.data.message || 'Action failed. Please retry.';
      }
      persistUi();
      render();
      return;
    }
    if (event.data.type !== 'render') return;
    renderBanner(event.data.banner);
    if (event.data.mode === 'patchThread' && vm) {
      patchThread(event.data.group, event.data.threadId, event.data.thread);
      return;
    }
    vm = event.data.vm;
    render();
  }, 'Thread panel failed to render. Try reloading the window.');
});

purgeStaleRequests();
persistUi();
vscode.postMessage({ type: 'ready' });

window.addEventListener('error', () => {
  replaceLoadingWithError('Thread panel failed to initialize. Try reloading the window.');
});

window.addEventListener('unhandledrejection', () => {
  replaceLoadingWithError('Thread panel failed to initialize. Try reloading the window.');
});
