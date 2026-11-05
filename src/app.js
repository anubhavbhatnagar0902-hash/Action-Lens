/* ActionLens — interface: welcome screen, notes editor, review workspace, sharing, help and guided tour. */
(function () {
  'use strict';
  var A = window.ActionLens;
  var SAMPLES = window.ACTIONLENS_SAMPLES || [];
  var DEFAULT_MODEL = 'claude-sonnet-5-5';
  var $ = function (id) { return document.getElementById(id); };
  var state = {
    result: null, notesText: '', tab: 'actions', fmt: 'markdown',
    ownerFilter: '', attnOnly: false, mode: 'edit', engine: 'rules', view: 'workspace'
  };
  var TYPES = { actions: 'action', decisions: 'decision', followups: 'followup', risks: 'risk' };
  var TYPE_LABEL = { action: 'Action', decision: 'Decision', followup: 'Follow-up', risk: 'Risk' };

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    } catch (e) { return null; }
  }
  function initials(name) {
    if (!name || name === 'Unassigned') return '?';
    var parts = name.replace(/[^A-Za-z\s,]/g, '').split(/[\s,]+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  function hue(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return 'h' + (h % 6);
  }
  function avatar(name, cls) {
    var none = !name || name === 'Unassigned';
    return '<span class="avatar ' + (cls || '') + ' ' + (none ? 'none' : hue(name)) + '" title="' + esc(none ? 'No owner yet' : name) + '">' + esc(initials(name)) + '</span>';
  }
  function shortDate(iso) {
    var s = A.formatDate(iso);
    return s ? s.replace(/^(\w{3}) (\d+ \w{3}) \d{4}$/, '$1, $2') : '';
  }
  function longDate(iso) {
    var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!d) return '';
    return new Date(+d[1], +d[2] - 1, +d[3]).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  function isMissingOwner(a) { return !a.owner || a.owner === 'Unassigned'; }
  function needsAttention(a) { return isMissingOwner(a) || !a.due; }
  function renumber() { state.result.actions.forEach(function (a, i) { a.id = 'AI-' + (i < 9 ? '0' : '') + (i + 1); }); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  var ICON = {
    cal: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    trash: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    note: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 2.5h5.5L12 5v8.5H4z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    warn: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 2l6.5 11.5h-13z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6.5v3.2M8 11.6v.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    ok: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.3 8.2l1.8 1.8 3.6-3.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  // ---------- toast ----------
  var toastTimer;
  function toast(msg, actionLabel, onAction) {
    $('toastMsg').textContent = msg;
    var btn = $('toastAction');
    btn.hidden = !actionLabel;
    btn.textContent = actionLabel || '';
    btn.onclick = function () { $('toast').hidden = true; if (onAction) onAction(); };
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $('toast').hidden = true; }, actionLabel ? 7000 : 3500);
  }

  // ---------- views & steps ----------
  function showView(view) {
    state.view = view;
    $('welcome').hidden = view !== 'welcome';
    $('workspace').hidden = view !== 'workspace';
    $('stepbar').hidden = view !== 'workspace';
    if (view === 'welcome') window.scrollTo(0, 0);
  }
  function currentStep() {
    if ($('shareDialog').open) return 3;
    return state.result ? 2 : 1;
  }
  function updateSteps() {
    var step = currentStep();
    [1, 2, 3].forEach(function (n) {
      var li = $('st' + n);
      li.classList.toggle('current', n === step);
      li.classList.toggle('done', n < step);
      li.querySelector('button').setAttribute('aria-current', n === step ? 'step' : 'false');
    });
    document.querySelectorAll('.st-line').forEach(function (l, i) { l.classList.toggle('done', i + 1 < step); });
    var hint;
    if (step === 1) {
      hint = $('notes').value.trim()
        ? 'Notes added. Choose Extract actions to find tasks, owners and due dates.'
        : 'Paste or type your meeting notes on the left — or choose Load example… to practise.';
    } else if (step === 2) {
      var n = state.result.actions.filter(needsAttention).length;
      hint = n
        ? 'Check the results. ' + plural(n, 'action is', 'actions are') + ' missing an owner or due date — click the yellow chips to fix them.'
        : 'All actions have an owner and a due date. Choose Share when you are ready.';
      if (state.result && $('notes').value !== state.notesText) hint = 'Your notes changed. Choose Extract actions again to update the results.';
    } else {
      hint = 'Pick a format and choose Copy, then paste it into email, Slack or Jira.';
    }
    $('stepHint').textContent = hint;
  }

  // ---------- notes input ----------
  function updateNotesMeta() {
    var t = $('notes').value;
    var lines = t ? t.split('\n').length : 0;
    $('notesCount').textContent = t.trim() ? plural(lines, 'line', 'lines') + ' · ' + t.length.toLocaleString('en-US') + ' characters' : 'No notes yet';
    $('staleNote').hidden = !(state.result && t !== state.notesText);
    updateSteps();
  }
  var saveTimer;
  function onNotesInput() {
    updateNotesMeta();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { store('actionlens-draft', $('notes').value); }, 400);
  }
  function setNotes(text) {
    $('notes').value = text;
    $('meetingDate').value = '';
    store('actionlens-draft', text || null);
    updateNotesMeta();
  }
  function loadSample(i, quiet) {
    var s = SAMPLES[i];
    if (!s) return;
    showView('workspace');
    setNotes(s.text);
    run(quiet);
  }
  function setMode(mode) {
    if (mode === 'source' && !state.result) return;
    state.mode = mode;
    $('notes').hidden = mode !== 'edit';
    $('sourcePanel').hidden = mode !== 'source';
    $('modeEdit').setAttribute('aria-selected', String(mode === 'edit'));
    $('modeSource').setAttribute('aria-selected', String(mode === 'source'));
  }
  function resetResults() {
    state.result = null;
    state.notesText = '';
    $('results').hidden = true;
    $('emptyState').hidden = false;
    $('shareBtn').disabled = true;
    $('shareBtn').title = 'Extract actions first';
    $('modeSource').disabled = true;
    $('crumbTitle').textContent = 'New meeting';
    setMode('edit');
    updateNotesMeta();
  }
  function newMeeting() {
    var prevNotes = $('notes').value, prevResult = state.result, prevText = state.notesText;
    showView('workspace');
    setNotes('');
    resetResults();
    $('tips').open = true;
    $('notes').focus();
    if (prevNotes.trim()) {
      toast('Started a new meeting', 'Undo', function () {
        setNotes(prevNotes);
        if (prevResult) { state.result = prevResult; state.notesText = prevText; $('modeSource').disabled = false; setMode('source'); render(); }
      });
    }
  }

  // ---------- extraction ----------
  function showError(msg) { $('runError').textContent = msg || ''; $('runError').hidden = !msg; }

  async function run(quiet) {
    var notes = $('notes').value;
    showError('');
    if (!notes.trim()) { showError('There are no notes yet. Paste or type your meeting notes first, or choose Load example….'); setMode('edit'); $('notes').focus(); return; }
    var opts = $('meetingDate').value ? { meetingDate: $('meetingDate').value } : {};
    var result;
    if (state.engine === 'rules') {
      result = A.extract(notes, opts);
    } else {
      var key = $('apiKey').value.trim();
      var model = $('model').value.trim() || DEFAULT_MODEL;
      if (!key) { showError('AI mode needs an Anthropic API key. Add it in the mode settings, or switch to Standard mode.'); openSettings(); return; }
      var meetingDate = opts.meetingDate || A.extract(notes).meetingDate;
      $('run').disabled = true;
      $('run').lastChild.textContent = ' Reading your notes…';
      try {
        var res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: model, max_tokens: 4000, system: A.AI_SYSTEM_PROMPT, messages: [{ role: 'user', content: A.buildAIUserPrompt(notes, meetingDate) }] })
        });
        var data = await res.json();
        if (!res.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status));
        var text = (data.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
        result = A.fromAIResponse(text, notes, meetingDate);
      } catch (err) {
        var blocked = /Failed to fetch|NetworkError|Load failed/i.test(String(err.message));
        showError(blocked
          ? 'Couldn’t connect to the AI service from this page. Open ActionLens from your own copy or website, or switch to Standard mode.'
          : 'The AI service returned an error: ' + err.message);
        return;
      } finally {
        $('run').disabled = false;
        $('run').lastChild.textContent = ' Extract actions';
      }
    }
    state.result = result;
    state.notesText = notes;
    state.ownerFilter = '';
    state.attnOnly = false;
    state.tab = 'actions';
    $('meetingDate').value = result.meetingDate;
    $('modeSource').disabled = false;
    $('modeSource').title = '';
    setMode('source');
    render();
    if (!quiet) {
      var r = result;
      toast('Found ' + plural(r.actions.length, 'action', 'actions') + ', ' + plural(r.decisions.length, 'decision', 'decisions') + ', ' +
        plural(r.followups.length, 'follow-up', 'follow-ups') + ' and ' + plural(r.risks.length, 'risk', 'risks'));
      if (window.matchMedia('(max-width: 960px)').matches) $('resultsPane').scrollIntoView({ behavior: 'smooth' });
    }
  }

  // ---------- render ----------
  function render() {
    var r = state.result;
    if (!r) return;
    var active = document.activeElement && document.activeElement.id;
    $('emptyState').hidden = true;
    $('results').hidden = false;
    $('shareBtn').disabled = false;
    $('shareBtn').title = 'Share the results';
    $('crumbTitle').textContent = r.title;
    $('resultTitle').textContent = r.title;
    $('resultDate').textContent = longDate(r.meetingDate);
    var shown = r.attendees.slice(0, 7);
    $('attendees').innerHTML = shown.map(function (a) { return avatar(a.name); }).join('') +
      (r.attendees.length > 7 ? '<span class="avatar more">+' + (r.attendees.length - 7) + '</span>' : '');
    $('attendees').title = 'Attendees: ' + r.attendees.map(function (a) { return a.name + (a.role ? ' (' + a.role + ')' : ''); }).join(', ');

    renderAttention();
    renderTabs();
    renderActions();
    renderItems('decisions');
    renderItems('followups');
    renderItems('risks');
    renderWorkload();
    renderSource();
    updateNotesMeta();
    if ($('shareDialog').open) renderExport();
    if (active && $(active) && document.activeElement !== $(active)) $(active).focus();
  }

  function renderAttention() {
    var acts = state.result.actions;
    var noOwner = acts.filter(isMissingOwner).length;
    var noDue = acts.filter(function (a) { return !a.due; }).length;
    var n = acts.filter(needsAttention).length;
    var el = $('attention');
    if (!acts.length) {
      el.className = 'callout warn';
      el.innerHTML = ICON.warn + '<span>No action items were found. Tasks are picked up when a line names who will do them, for example “Priya to send the deck” or “@Ravi fix login”. Open <b>How to write notes</b> on the left for more examples.</span>';
      return;
    }
    if (!n) {
      el.className = 'callout ok';
      el.innerHTML = ICON.ok + '<span><b>Looks complete.</b> Every action has an owner and a due date.</span>';
      return;
    }
    var parts = [];
    if (noOwner) parts.push(plural(noOwner, 'has no owner', 'have no owner'));
    if (noDue) parts.push(plural(noDue, 'has no due date', 'have no due date'));
    var showingOnly = state.attnOnly && state.tab === 'actions';
    el.className = 'callout warn';
    el.innerHTML = ICON.warn + '<span><b>' + plural(n, 'action needs', 'actions need') + ' your attention:</b> ' + esc(parts.join(' and ')) + '.</span>' +
      '<button type="button" class="btn-callout" id="showAttn">' + (showingOnly ? 'Show all actions' : 'Show me') + '</button>';
    $('showAttn').onclick = function () {
      state.attnOnly = !showingOnly;
      state.tab = 'actions';
      render();
    };
  }

  function renderTabs() {
    var r = state.result;
    Object.keys(TYPES).forEach(function (k) {
      $('cnt-' + k).textContent = r[k].length;
      $('panel-' + k).hidden = state.tab !== k;
    });
    document.querySelectorAll('#statTabs button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === state.tab)); });
  }

  function renderActions() {
    var r = state.result;
    var owners = [];
    r.actions.forEach(function (a) { var o = isMissingOwner(a) ? 'Unassigned' : a.owner; if (owners.indexOf(o) === -1) owners.push(o); });
    if (state.ownerFilter && owners.indexOf(state.ownerFilter) === -1) state.ownerFilter = '';
    $('ownerFilter').innerHTML = '<option value="">Everyone’s actions</option>' + owners.map(function (o) {
      return '<option' + (o === state.ownerFilter ? ' selected' : '') + ' value="' + esc(o) + '">' + esc(o === 'Unassigned' ? 'No owner yet' : o) + '</option>';
    }).join('');
    $('attnOnly').checked = state.attnOnly;
    $('ownerList').innerHTML = r.attendees.map(function (a) { return '<option value="' + esc(a.name) + '"></option>'; }).join('') + '<option value="Team"></option>';

    var rows = r.actions.map(function (a, i) { return { a: a, i: i }; }).filter(function (x) {
      var o = isMissingOwner(x.a) ? 'Unassigned' : x.a.owner;
      return (!state.ownerFilter || o === state.ownerFilter) && (!state.attnOnly || needsAttention(x.a));
    });
    $('listCount').textContent = rows.length === r.actions.length ? '' : 'Showing ' + rows.length + ' of ' + r.actions.length;

    if (!rows.length) {
      $('actionList').innerHTML = '<li class="list-empty">' + (r.actions.length
        ? (state.attnOnly ? 'Nothing needs attention. Every action has an owner and a due date.' : 'No actions match this filter.')
        : 'No actions yet. Use “Add an action” below to add one yourself.') + '</li>';
      return;
    }
    $('actionList').innerHTML = rows.map(function (x) {
      var a = x.a, i = x.i, missing = isMissingOwner(a);
      return '<li class="act-row' + (needsAttention(a) ? ' needs' : '') + '" data-i="' + i + '" data-line="' + esc(a.source.line) + '">' +
        '<span class="aid">' + esc(a.id) + '</span>' +
        '<div class="a-main">' +
          '<textarea class="a-task" id="task-' + i + '" data-f="task" rows="1" placeholder="Describe the action" aria-label="Task ' + esc(a.id) + '" title="Click to edit the task">' + esc(a.task) + '</textarea>' +
          '<div class="a-meta">' +
            '<label class="chip owner' + (missing ? ' missing' : '') + '" title="Who will do this? Click to choose or type a name">' + avatar(missing ? '' : a.owner, 'sm') +
              '<input id="owner-' + i + '" data-f="owner" list="ownerList" placeholder="Add owner" value="' + esc(missing ? '' : a.owner) + '" aria-label="Owner of ' + esc(a.id) + '"></label>' +
            '<label class="chip due' + (a.due ? '' : ' missing') + '" title="' + esc(a.dueRaw ? 'Due date — the notes said “' + a.dueRaw + '”. Click to change.' : 'Click to pick a due date') + '">' + ICON.cal +
              '<span>' + esc(a.due ? shortDate(a.due) : 'Add due date') + '</span>' + (a.dueRaw ? '<span class="from">· “' + esc(a.dueRaw) + '”</span>' : '') +
              '<input id="due-' + i + '" type="date" data-f="due" value="' + esc(a.due) + '" aria-label="Due date of ' + esc(a.id) + '"></label>' +
            '<select id="prio-' + i + '" data-f="priority" class="prio ' + esc(a.priority) + '" aria-label="Priority of ' + esc(a.id) + '" title="Priority — click to change">' +
              ['High', 'Medium', 'Low'].map(function (p) { return '<option' + (p === a.priority ? ' selected' : '') + '>' + p + '</option>'; }).join('') +
            '</select>' +
            (a.source.line ? '<button type="button" class="src-link" data-goto="' + a.source.line + '" title="Show this line in your notes: ' + esc(a.source.text) + '">' + ICON.note + 'Line ' + a.source.line + '</button>' : '<span class="muted">Added by you</span>') +
          '</div>' +
        '</div>' +
        '<button type="button" class="icon-btn row-del" data-del="' + i + '" aria-label="Remove ' + esc(a.id) + '" title="Remove this action">' + ICON.trash + '</button>' +
      '</li>';
    }).join('');
    autosize();
    document.querySelectorAll('.chip.owner input').forEach(sizeOwner);
  }

  function sizeOwner(input) { input.style.width = Math.max(4, (input.value || input.placeholder).length) + 1 + 'ch'; }
  function autosize() {
    document.querySelectorAll('.a-task').forEach(function (t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; });
  }

  function renderItems(key) {
    var items = state.result[key];
    var type = TYPES[key];
    var empty = { decisions: 'No decisions were recorded in these notes. Lines starting with “Decision:” or saying “we agreed” appear here.', followups: 'No open questions or follow-ups. Lines with “follow up”, “TBD” or a question mark appear here.', risks: 'No risks or blockers were raised. Lines starting with “Risk:” or “Blocker:” appear here.' }[key];
    $(key).innerHTML = items.length ? items.map(function (x) {
      return '<li class="item ' + type + '" id="item-' + esc(x.id) + '">' +
        '<span class="aid">' + esc(x.id) + '</span>' +
        '<div><div class="text">' + esc(x.text) + '</div>' +
          (x.owner ? '<div class="who">' + avatar(x.owner, 'sm') + esc(x.owner) + '</div>' : '') + '</div>' +
        (x.source && x.source.line ? '<button type="button" class="src-link" data-goto="' + x.source.line + '" title="Show this line in your notes">' + ICON.note + 'Line ' + x.source.line + '</button>' : '<span></span>') +
      '</li>';
    }).join('') : '<li class="list-empty">' + empty + '</li>';
  }

  function renderWorkload() {
    var s = A.summarise(state.result);
    var entries = Object.keys(s.owners).map(function (k) { return [k, s.owners[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    var max = entries.length ? entries[0][1] : 1;
    $('load').innerHTML = entries.length ? entries.map(function (e) {
      var none = e[0] === 'Unassigned';
      return '<div class="load-row">' + avatar(none ? '' : e[0], 'sm') + '<span class="name">' + esc(none ? 'No owner yet' : e[0]) + '</span>' +
        '<span class="track"><span class="fill' + (none ? ' none' : '') + '" style="width:' + Math.round(e[1] / max * 100) + '%"></span></span><span class="n">' + e[1] + '</span></div>';
    }).join('') : '<p class="muted">People appear here once actions have owners.</p>';
  }

  function sourceMap() {
    var map = {};
    var r = state.result;
    Object.keys(TYPES).forEach(function (k) {
      r[k].forEach(function (x) {
        var n = x.source && x.source.line;
        if (!n) return;
        (map[n] = map[n] || []).push({ type: TYPES[k], key: k, id: x.id });
      });
    });
    return map;
  }

  function renderSource() {
    var map = sourceMap();
    var lines = state.notesText.replace(/\r\n?/g, '\n').split('\n');
    $('sourceView').innerHTML = lines.map(function (t, idx) {
      var n = idx + 1, items = map[n] || [];
      if (!t.trim()) return '<div class="ln blank" id="ln-' + n + '"></div>';
      var cls = 'ln' + (items.length ? ' marked t-' + items[0].type : '') + (/^\s*#/.test(t) ? ' heading' : '');
      var tags = items.map(function (x) { return '<span class="tag ' + x.type + '">' + esc(x.id) + '</span>'; }).join('');
      var title = items.length ? ' title="' + esc(items.map(function (x) { return TYPE_LABEL[x.type] + ' ' + x.id; }).join(', ')) + ' — click to open"' : '';
      return '<div class="' + cls + '" id="ln-' + n + '" data-line="' + n + '"' + (items.length ? ' data-key="' + items[0].key + '" data-id="' + esc(items[0].id) + '" tabindex="0" role="button"' : '') + title + '>' +
        '<span class="num">' + n + '</span><span class="txt">' + esc(t) + '</span><span class="tags">' + tags + '</span></div>';
    }).join('');
  }

  // ---------- cross-linking ----------
  function flash(el) {
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }
  function goToLine(n) {
    setMode('source');
    var el = $('ln-' + n);
    if (!el) return;
    if (window.matchMedia('(max-width: 960px)').matches) $('notesPane').scrollIntoView({ behavior: 'smooth' });
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    flash(el);
  }
  function openItem(key, id) {
    state.tab = key;
    if (key === 'actions') { state.ownerFilter = ''; state.attnOnly = false; }
    render();
    var el = key === 'actions'
      ? document.querySelector('.act-row[data-i="' + state.result.actions.findIndex(function (a) { return a.id === id; }) + '"]')
      : $('item-' + id);
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); flash(el); }
  }
  function highlightLine(n, on) {
    document.querySelectorAll('.ln.hl').forEach(function (e) { e.classList.remove('hl'); });
    if (on && n && state.mode === 'source') { var el = $('ln-' + n); if (el) el.classList.add('hl'); }
  }

  // ---------- editing ----------
  function onEdit(e) {
    var row = e.target.closest('.act-row');
    var f = e.target.dataset.f;
    if (!row || !f) return;
    var a = state.result.actions[+row.dataset.i];
    var v = e.target.value;
    if (f === 'owner') { a.owner = v.trim() || 'Unassigned'; sizeOwner(e.target); }
    else if (f === 'due') { a.due = v; a.dueRaw = ''; }
    else a[f] = v;
    if (e.target.tagName === 'TEXTAREA') autosize();
    if (e.type === 'change' || f === 'due' || f === 'priority') render();
  }
  function removeAction(i) {
    var removed = state.result.actions.splice(i, 1)[0];
    renumber();
    render();
    toast('Action removed', 'Undo', function () {
      state.result.actions.splice(i, 0, removed);
      renumber();
      render();
    });
  }
  function addAction() {
    var acts = state.result.actions;
    acts.push({ id: '', task: '', owner: 'Unassigned', due: '', dueRaw: '', priority: 'Medium', source: { line: 0, text: 'Added manually' } });
    renumber();
    state.tab = 'actions'; state.ownerFilter = ''; state.attnOnly = false;
    render();
    var t = $('task-' + (acts.length - 1));
    if (t) { t.focus(); t.scrollIntoView({ block: 'center' }); }
  }

  // ---------- share ----------
  var HINTS = {
    markdown: 'Formatted minutes with decisions, an action table, follow-ups and risks. Paste into an email, Confluence or Notion.',
    slack: 'A short summary for your project channel. Slack keeps the bold text and bullets when you paste.',
    csv: 'Creates one Jira issue per action. Choose Download file (or copy into a .csv file), then in Jira go to Filters → Import issues from CSV.',
    json: 'Structured data for developers and other tools.'
  };
  function exportText() {
    var r = state.result;
    return {
      markdown: A.toMarkdown(r), slack: A.toSlack(r), csv: A.toJiraCSV(r),
      json: JSON.stringify({ title: r.title, meetingDate: r.meetingDate, actions: r.actions, decisions: r.decisions, followups: r.followups, risks: r.risks }, null, 2)
    }[state.fmt];
  }
  function renderExport() {
    $('exportOut').textContent = exportText();
    $('exportHint').textContent = HINTS[state.fmt];
    document.querySelectorAll('[data-fmt]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.fmt === state.fmt)); });
    var missing = state.result.actions.filter(needsAttention).length;
    $('shareWarn').hidden = !missing;
    $('shareWarn').innerHTML = missing ? ICON.warn + '<span>' + plural(missing, 'action is', 'actions are') + ' still missing an owner or due date. You can share now or close this window to fix them first.</span>' : '';
  }
  function openShare() {
    if (!state.result) return;
    renderExport();
    $('shareDialog').showModal();
    updateSteps();
  }
  function copyExport() {
    var text = exportText();
    var label = { markdown: 'Meeting minutes', slack: 'Slack message', csv: 'Jira import', json: 'JSON' }[state.fmt];
    var fallback = function () {
      var range = document.createRange();
      range.selectNodeContents($('exportOut'));
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      toast('Copying isn’t allowed here. The text is selected — press Ctrl+C (or ⌘+C) to copy it.');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(label + ' copied. Paste it where your team works.'); }, fallback);
    } else fallback();
  }
  function downloadExport() {
    var ext = { markdown: 'md', slack: 'txt', csv: 'csv', json: 'json' }[state.fmt];
    var blob = new Blob([exportText()], { type: 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (state.result.title || 'meeting').replace(/[^\w-]+/g, '-').replace(/-+$/, '').toLowerCase() + '-actions.' + ext;
    document.body.appendChild(a); a.click(); a.remove();
    toast('Saved ' + a.download + ' to your downloads');
  }

  // ---------- settings ----------
  function openSettings() {
    document.querySelectorAll('input[name="engine"]').forEach(function (r) { r.checked = r.value === state.engine; });
    $('aiSettings').hidden = state.engine !== 'ai';
    $('settingsDialog').showModal();
  }
  function applyEngine() {
    var ai = state.engine === 'ai';
    $('engineLabel').textContent = ai ? 'AI mode' : 'Standard mode';
    $('engineDot').classList.toggle('ai', ai);
  }

  // ---------- help ----------
  function openHelp() { $('helpDialog').showModal(); }

  // ---------- guided tour ----------
  var TOUR = [
    { el: function () { return $('notesPane'); }, title: 'This is where your notes go',
      text: 'Paste or type your meeting notes here. You can also open a .txt or .md file, or choose “Load example…” to practise with sample notes.',
      before: function () { setMode('edit'); } },
    { el: function () { return $('run'); }, title: 'Extract the actions',
      text: 'Choose Extract actions (or press Ctrl+Enter). ActionLens reads every line and finds tasks, who owns them and when they are due.' },
    { el: function () { return $('sourcePanel'); }, title: 'See where each item came from',
      text: 'After extracting, the Highlighted view colours each line that produced an item: blue for actions, green for decisions, amber for follow-ups and red for risks. Click a coloured line to open its item.',
      before: function () { setMode('source'); } },
    { el: function () { return $('attention'); }, title: 'Fix anything that’s missing',
      text: 'This banner tells you which actions have no owner or no due date. Choose “Show me” to list only those actions.' },
    { el: function () { return $('statTabs'); }, title: 'Switch between results',
      text: 'These cards show how many action items, decisions, follow-ups and risks were found. Click a card to see that list.',
      before: function () { if (state.tab !== 'actions') { state.tab = 'actions'; render(); } } },
    { el: function () { return document.querySelector('.act-row'); }, title: 'Edit any action',
      text: 'Click the task text, the owner, the date or the priority to change it. Dashed yellow chips mean something is missing. The bin icon removes a row, and you can undo it.' },
    { el: function () { return $('shareBtn'); }, title: 'Share with your team',
      text: 'When you’re happy, choose Share to copy meeting minutes, a Slack message or a Jira import file.' },
    { el: function () { return $('helpBtn'); }, title: 'Help is always here',
      text: 'Open Help at any time for the user guide, writing tips and shortcuts, or to replay this tour.' }
  ];
  var tourIdx = -1;
  function startTour() {
    showView('workspace');
    if (!state.result) loadSample(0, true);
    store('actionlens-seen', '1');
    tourIdx = 0;
    $('tour').hidden = false;
    $('tourDots').innerHTML = TOUR.map(function () { return '<i></i>'; }).join('');
    showTourStep();
    document.addEventListener('keydown', tourKeys);
    window.addEventListener('resize', placeTour);
    window.addEventListener('scroll', placeTour, true);
  }
  function endTour(done) {
    tourIdx = -1;
    $('tour').hidden = true;
    document.removeEventListener('keydown', tourKeys);
    window.removeEventListener('resize', placeTour);
    window.removeEventListener('scroll', placeTour, true);
    toast(done ? 'You’re all set. Open Help at any time to see the guide again.' : 'Tour closed. You can replay it from Help.');
  }
  function tourKeys(e) {
    if (e.key === 'Escape') { e.preventDefault(); endTour(false); }
    else if (e.key === 'ArrowRight') tourGo(1);
    else if (e.key === 'ArrowLeft') tourGo(-1);
  }
  function tourGo(d) {
    var next = tourIdx + d;
    if (next < 0) return;
    if (next >= TOUR.length) { endTour(true); return; }
    tourIdx = next;
    showTourStep();
  }
  function showTourStep() {
    var s = TOUR[tourIdx];
    if (s.before) s.before();
    $('tourStep').textContent = 'Step ' + (tourIdx + 1) + ' of ' + TOUR.length;
    $('tourTitle').textContent = s.title;
    $('tourText').textContent = s.text;
    $('tourBack').hidden = tourIdx === 0;
    $('tourNext').textContent = tourIdx === TOUR.length - 1 ? 'Finish' : 'Next';
    document.querySelectorAll('#tourDots i').forEach(function (d, i) { d.classList.toggle('on', i === tourIdx); });
    var el = s.el();
    if (el) el.scrollIntoView({ block: 'center', behavior: 'auto' });
    requestAnimationFrame(placeTour);
    $('tourNext').focus();
  }
  function placeTour() {
    if (tourIdx < 0) return;
    var el = TOUR[tourIdx].el();
    var spot = $('tourSpot'), card = $('tourCard');
    var vw = window.innerWidth, vh = window.innerHeight;
    if (!el) { spot.style.cssText = 'left:50%;top:50%;width:0;height:0'; card.style.left = (vw - card.offsetWidth) / 2 + 'px'; card.style.top = (vh - card.offsetHeight) / 2 + 'px'; return; }
    var r = el.getBoundingClientRect(), pad = 6;
    var top = Math.max(r.top - pad, 4), bottom = Math.min(r.bottom + pad, vh - 4);
    spot.style.left = (r.left - pad) + 'px';
    spot.style.top = top + 'px';
    spot.style.width = (r.width + pad * 2) + 'px';
    spot.style.height = Math.max(0, bottom - top) + 'px';
    var cw = card.offsetWidth, ch = card.offsetHeight, gap = 14, y;
    if (bottom + gap + ch <= vh - 12) y = bottom + gap;
    else if (top - gap - ch >= 12) y = top - gap - ch;
    else y = vh - ch - 16;
    var x = Math.min(Math.max(16, r.left + r.width / 2 - cw / 2), vw - cw - 16);
    if (y === vh - ch - 16 && r.width < vw - cw - 48) x = r.right + gap + cw <= vw - 16 ? r.right + gap : Math.max(16, r.left - gap - cw);
    card.style.left = x + 'px';
    card.style.top = Math.max(12, y) + 'px';
  }

  // ---------- wiring ----------
  function init() {
    $('sample').innerHTML = '<option value="">Load example…</option>' + SAMPLES.map(function (s, i) { return '<option value="' + i + '">' + esc(s.label) + '</option>'; }).join('');
    $('sample').addEventListener('change', function () { var v = $('sample').value; $('sample').value = ''; if (v !== '') loadSample(+v); });

    // welcome
    $('startExample').addEventListener('click', function () { store('actionlens-seen', '1'); loadSample(0); });
    $('startOwn').addEventListener('click', function () { store('actionlens-seen', '1'); showView('workspace'); $('tips').open = true; setMode('edit'); $('notes').focus(); });
    $('startTour').addEventListener('click', startTour);
    $('brandLink').addEventListener('click', function (e) { e.preventDefault(); showView('welcome'); });

    // header
    $('newBtn').addEventListener('click', newMeeting);
    $('helpBtn').addEventListener('click', openHelp);
    $('footHelp').addEventListener('click', openHelp);
    $('helpTour').addEventListener('click', function () { $('helpDialog').close(); startTour(); });
    $('helpWelcome').addEventListener('click', function () { $('helpDialog').close(); showView('welcome'); });

    // steps
    document.querySelectorAll('.steps button').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = +b.dataset.step;
        if (s === 1) { setMode('edit'); $('notes').focus(); }
        else if (s === 2) { if (state.result) $('resultsPane').scrollIntoView({ behavior: 'smooth' }); else toast('Add notes and choose Extract actions first'); }
        else if (s === 3) { if (state.result) openShare(); else toast('Extract actions first, then you can share them'); }
      });
    });

    // notes
    $('notes').addEventListener('input', onNotesInput);
    $('meetingDate').addEventListener('change', updateSteps);
    $('run').addEventListener('click', function () { run(); });
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !document.querySelector('dialog[open]') && tourIdx < 0) { e.preventDefault(); run(); }
    });
    $('modeEdit').addEventListener('click', function () { setMode('edit'); $('notes').focus(); });
    $('modeSource').addEventListener('click', function () { setMode('source'); });
    $('emptyExample').addEventListener('click', function () { loadSample(0); });
    $('clear').addEventListener('click', function () {
      var prev = $('notes').value;
      if (!prev) return;
      setNotes('');
      setMode('edit');
      toast('Notes cleared', 'Undo', function () { setNotes(prev); });
    });
    $('file').addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () { setNotes(String(reader.result)); run(); };
      reader.readAsText(f);
      e.target.value = '';
    });

    // highlighted notes → items
    $('sourceView').addEventListener('click', function (e) {
      var ln = e.target.closest('.ln.marked');
      if (ln) openItem(ln.dataset.key, ln.dataset.id);
    });
    $('sourceView').addEventListener('keydown', function (e) {
      var ln = e.target.closest('.ln.marked');
      if (ln && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openItem(ln.dataset.key, ln.dataset.id); }
    });

    // result cards and filters
    document.querySelectorAll('#statTabs button').forEach(function (b) {
      b.addEventListener('click', function () { state.tab = b.dataset.tab; render(); });
    });
    $('ownerFilter').addEventListener('change', function () { state.ownerFilter = $('ownerFilter').value; render(); });
    $('attnOnly').addEventListener('change', function () { state.attnOnly = $('attnOnly').checked; render(); });

    // action list
    var list = $('actionList');
    list.addEventListener('input', onEdit);
    list.addEventListener('change', onEdit);
    list.addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (del) removeAction(+del.dataset.del);
    });
    list.addEventListener('mouseover', function (e) { var row = e.target.closest('.act-row'); highlightLine(row && row.dataset.line, !!row); });
    list.addEventListener('mouseleave', function () { highlightLine(null, false); });
    $('results').addEventListener('click', function (e) {
      var go = e.target.closest('[data-goto]');
      if (go) goToLine(+go.dataset.goto);
    });
    $('addAction').addEventListener('click', addAction);

    // share
    $('shareBtn').addEventListener('click', openShare);
    $('shareBtn2').addEventListener('click', openShare);
    document.querySelectorAll('[data-fmt]').forEach(function (b) { b.addEventListener('click', function () { state.fmt = b.dataset.fmt; renderExport(); }); });
    $('copy').addEventListener('click', copyExport);
    $('download').addEventListener('click', downloadExport);
    $('shareDialog').addEventListener('close', updateSteps);

    // settings
    $('settingsBtn').addEventListener('click', openSettings);
    document.querySelectorAll('input[name="engine"]').forEach(function (r) {
      r.addEventListener('change', function () { $('aiSettings').hidden = !(r.value === 'ai' && r.checked); });
    });
    $('saveSettings').addEventListener('click', function () {
      var picked = document.querySelector('input[name="engine"]:checked').value;
      if (picked === 'ai' && !$('apiKey').value.trim()) { $('apiKey').focus(); toast('Enter your Anthropic API key to use AI mode, or choose Standard mode'); return; }
      state.engine = picked;
      store('actionlens-engine', picked);
      store('actionlens-model', $('model').value.trim() || null);
      applyEngine();
      $('settingsDialog').close();
      toast(picked === 'ai' ? 'AI mode is on for the next extraction' : 'Standard mode is on');
    });

    // dialogs close on × and on a click outside
    document.querySelectorAll('dialog').forEach(function (d) {
      d.addEventListener('click', function (e) {
        if (e.target === d || e.target.closest('[data-close]')) d.close();
      });
    });
    $('tourNext').addEventListener('click', function () { tourGo(1); });
    $('tourBack').addEventListener('click', function () { tourGo(-1); });
    $('tourSkip').addEventListener('click', function () { endTour(false); });

    // restore preferences (the API key is never stored)
    var savedModel = store('actionlens-model');
    if (savedModel) $('model').value = savedModel;
    if (store('actionlens-engine') === 'ai') state.engine = 'ai';
    applyEngine();

    var draft = store('actionlens-draft');
    if (!store('actionlens-seen') && !(draft && draft.trim())) {
      showView('welcome');
      updateNotesMeta();
      return;
    }
    showView('workspace');
    if (draft && draft.trim()) {
      $('notes').value = draft;
      updateNotesMeta();
      if (state.engine === 'rules') run(true);
    } else {
      resetResults();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
