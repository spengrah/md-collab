const vscode = acquireVsCodeApi();
let vm;
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

const postIntent = (intent, threadId, suggestionId, body) => vscode.postMessage({ type: 'intent', intent, threadId, suggestionId, body });
const postUi = (type, threadId) => vscode.postMessage({ type, threadId });

const makeButton = (label, intent, threadId, suggestionId, secondary, ariaLabel) => {
  const b = el('button', secondary ? 'secondary' : '', label);
  b.type = 'button';
  b.setAttribute('aria-label', ariaLabel || label);
  b.addEventListener('click', () => postIntent(intent, threadId, suggestionId));
  return b;
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

  const updateFilters = () => vscode.postMessage({
    type: 'setFilters',
    filters: {
      status: status.value,
      ownership: owner.value,
      hasSuggestions: hasSuggestions.checked,
    },
  });
  status.addEventListener('change', updateFilters);
  owner.addEventListener('change', updateFilters);
  hasSuggestions.addEventListener('change', updateFilters);

  const addComment = el('button', '', 'Add comment from selection');
  addComment.type = 'button';
  addComment.setAttribute('aria-label', 'Add comment from current selection');
  addComment.addEventListener('click', () => {
    const body = window.prompt('Comment text');
    if (body === null) return;
    const trimmed = body.trim();
    if (!trimmed) return;
    postIntent('addComment', undefined, undefined, trimmed);
  });

  toolbar.appendChild(status);
  toolbar.appendChild(owner);
  toolbar.appendChild(hasSuggestionsWrap);
  toolbar.appendChild(addComment);
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
    const reply = el('button', '', 'Reply');
    reply.type = 'button';
    reply.setAttribute('aria-label', 'Reply to thread');
    reply.addEventListener('click', () => {
      const body = window.prompt('Reply text');
      if (body === null) return;
      const trimmed = body.trim();
      if (!trimmed) return;
      postIntent('reply', thread.threadId, undefined, trimmed);
    });
    actions.appendChild(reply);
    if (thread.canResolve) actions.appendChild(makeButton('Resolve', 'resolve', thread.threadId, undefined, true, 'Resolve thread'));
    if (thread.canReopen) actions.appendChild(makeButton('Reopen', 'reopen', thread.threadId, undefined, true, 'Reopen thread'));
    actions.appendChild(makeButton('Suggest from Selection', 'suggestFromSelection', thread.threadId, undefined, false, 'Suggest from selection'));
    actions.appendChild(makeButton('Jump to anchor', 'jumpToAnchor', thread.threadId, undefined, true, 'Jump to anchor'));
    if (thread.anchorConfidence === 'broken') {
      actions.appendChild(makeButton('Relink anchor', 'relinkAnchor', thread.threadId, undefined, true, 'Relink anchor'));
    }
    if (thread.suggestions.length > 0) {
      const latestSuggestionId = thread.suggestions[thread.suggestions.length - 1].suggestionId;
      actions.appendChild(makeButton('View base version', 'viewBaseVersion', thread.threadId, latestSuggestionId, true, 'View base version context'));
    }
    body.appendChild(actions);

    thread.messages.forEach((message) => {
      const bubble = el('article', 'bubble ' + (message.kind === 'system' ? 'system' : ''));
      bubble.setAttribute('role', 'article');
      bubble.appendChild(el('div', 'bubbleHead', message.authorLabel + ' · ' + new Date(message.createdAt).toLocaleString()));
      bubble.appendChild(el('div', 'bubbleBody', message.body));
      body.appendChild(bubble);
    });

    thread.suggestions.forEach((suggestion) => {
      const card = el('section', 'suggestion');
      card.setAttribute('aria-label', 'Suggestion status ' + suggestion.status);
      card.appendChild(el('div', 'suggestionHead', '💡 Suggestion · ' + suggestion.status));
      card.appendChild(el('div', '', suggestion.replacementPreview));
      const sa = el('div', 'actions');
      if (suggestion.status === 'proposed') {
        sa.appendChild(makeButton('Apply', 'applySuggestion', thread.threadId, suggestion.suggestionId, false, 'Apply suggestion'));
        sa.appendChild(makeButton('Reject', 'rejectSuggestion', thread.threadId, suggestion.suggestionId, true, 'Reject suggestion'));
      }
      sa.appendChild(makeButton('View base version', 'viewBaseVersion', thread.threadId, suggestion.suggestionId, true, 'View base version'));
      card.appendChild(sa);
      body.appendChild(card);
    });

    card.appendChild(body);
  }

  return card;
};

const render = () => {
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
    if (!event.data || event.data.type !== 'render') return;
    renderBanner(event.data.banner);
    if (event.data.mode === 'patchThread' && vm) {
      patchThread(event.data.group, event.data.threadId, event.data.thread);
      return;
    }
    vm = event.data.vm;
    render();
  }, 'Thread panel failed to render. Try reloading the window.');
});

window.addEventListener('error', () => {
  replaceLoadingWithError('Thread panel failed to initialize. Try reloading the window.');
});

window.addEventListener('unhandledrejection', () => {
  replaceLoadingWithError('Thread panel failed to initialize. Try reloading the window.');
});
