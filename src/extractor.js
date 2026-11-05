/*
 * ActionLens extraction engine
 * Turns free-form meeting notes into action items, decisions, follow-ups and risks.
 * Works in the browser (window.ActionLens) and in Node (require), with no dependencies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ActionLens = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  var WEEKDAY_RE = '(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)';

  var NOT_NAMES = ['we', 'the', 'this', 'that', 'it', 'they', 'need', 'needs', 'please', 'action', 'decision',
    'risk', 'blocker', 'note', 'notes', 'agreed', 'decided', 'todo', 'task', 'follow', 'question', 'open',
    'next', 'all', 'everyone', 'team', 'someone', 'nobody', 'who', 'what', 'when', 'staging', 'production',
    'zoom', 'slack', 'jira', 'google', 'sprint', 'qa', 'ux', 'ui', 'pm', 'tpm', 'end', 'demo', 'pen-test',
    'wer', 'client', 'customer', 'vendor', 'discussion', 'date', 'attendees', 'meeting', 'there', 'our', 'i',
    'you', 'he', 'she', 'if', 'once', 'after', 'before', 'by', 'on', 'for', 'and', 'or', 'also', 'still'];
  var TEAM_WORDS = ['team', 'everyone', 'all', 'both teams', 'engineering', 'qa team', 'design team'];

  // ---------- date helpers ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromISO(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function weekdayIndex(word) {
    var w = word.toLowerCase().slice(0, 3);
    for (var i = 0; i < 7; i++) if (WEEKDAYS[i].slice(0, 3) === w) return i;
    return -1;
  }
  function monthIndex(word) { return MONTHS.indexOf(word.toLowerCase().slice(0, 3)); }
  function validDate(y, m, d) {
    var x = new Date(y, m, d);
    return x.getFullYear() === y && x.getMonth() === m && x.getDate() === d ? x : null;
  }
  // A date with no year is placed in the year that keeps it closest to the meeting date
  function inferYear(m, d, base) {
    var y = base.getFullYear();
    var c = validDate(y, m, d);
    if (c && c < addDays(base, -60)) c = validDate(y + 1, m, d);
    return c;
  }

  /**
   * Find a due date in a line of text, relative to the meeting date.
   * Returns { iso, raw } or null. "raw" is the matched phrase, used to tidy the task text.
   * Conventions: numeric dates are day/month (Indian and UK format); a bare weekday means the
   * next one after the meeting; "next <weekday>" means the one a week after that.
   */
  function parseDue(text, baseDate) {
    var base = baseDate instanceof Date ? baseDate : (fromISO(baseDate) || new Date());
    base = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    var t = text, m, d;

    if ((m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t))) {
      d = validDate(+m[1], +m[2] - 1, +m[3]);
      if (d) return { iso: toISO(d), raw: m[0] };
    }
    if ((m = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+' + MONTH_RE + '\\.?(?:,?\\s+(\\d{4}))?\\b', 'i').exec(t))) {
      d = m[3] ? validDate(+m[3], monthIndex(m[2]), +m[1]) : inferYear(monthIndex(m[2]), +m[1], base);
      if (d) return { iso: toISO(d), raw: m[0] };
    }
    if ((m = new RegExp('\\b' + MONTH_RE + '\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b', 'i').exec(t))) {
      d = m[3] ? validDate(+m[3], monthIndex(m[1]), +m[2]) : inferYear(monthIndex(m[1]), +m[2], base);
      if (d) return { iso: toISO(d), raw: m[0] };
    }
    if ((m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t))) {
      var yy = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null;
      d = yy ? validDate(yy, +m[2] - 1, +m[1]) : inferYear(+m[2] - 1, +m[1], base);
      if (d) return { iso: toISO(d), raw: m[0] };
    }
    if ((m = /\b(today|eod|end of (?:the )?day|cob|close of business|tonight)\b/i.exec(t))) return { iso: toISO(base), raw: m[0] };
    if ((m = /\btomorrow\b/i.exec(t))) return { iso: toISO(addDays(base, 1)), raw: m[0] };
    if ((m = /\bday after tomorrow\b/i.exec(t))) return { iso: toISO(addDays(base, 2)), raw: m[0] };
    if ((m = /\bin (\d+|a|one|two|three) (day|days|week|weeks)\b/i.exec(t))) {
      var words = { a: 1, one: 1, two: 2, three: 3 };
      var n = words[m[1].toLowerCase()] || +m[1];
      return { iso: toISO(addDays(base, /week/i.test(m[2]) ? n * 7 : n)), raw: m[0] };
    }
    if ((m = /\b(end of (?:the |this )?week|eow|this week)\b/i.exec(t))) {
      var toFri = (5 - base.getDay() + 7) % 7;
      return { iso: toISO(addDays(base, toFri)), raw: m[0] };
    }
    if ((m = /\bnext week\b/i.exec(t))) {
      var toMon = ((1 - base.getDay() + 7) % 7) || 7;
      return { iso: toISO(addDays(base, toMon)), raw: m[0] };
    }
    if ((m = /\b(end of (?:the |this )?month|eom)\b/i.exec(t))) {
      return { iso: toISO(new Date(base.getFullYear(), base.getMonth() + 1, 0)), raw: m[0] };
    }
    if ((m = new RegExp('\\b(next\\s+)?' + WEEKDAY_RE + '\\b', 'i').exec(t))) {
      var wd = weekdayIndex(m[2]);
      // "sat"/"sun"/"mar"-style collisions are avoided by requiring a whole word above
      var ahead;
      if (m[1]) {
        // "next Monday" = that weekday in the following Monday-to-Sunday week
        var toNextMon = ((1 - base.getDay() + 7) % 7) || 7;
        ahead = toNextMon + ((wd + 6) % 7);
      } else {
        ahead = ((wd - base.getDay() + 7) % 7) || 7;
      }
      return { iso: toISO(addDays(base, ahead)), raw: m[0] };
    }
    return null;
  }

  // ---------- text helpers ----------
  function cleanLine(line) {
    return line
      .replace(/^\s*(?:[-*•–·]|\d+[.)])\s+/, '')
      .replace(/^\s*\[[ xX]?\]\s*/, '')
      .trim();
  }
  function capitalise(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function tidy(s) {
    return s.replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, '')
      .replace(/\(\s*\)/g, '')
      .replace(/\.+$/, '')
      .trim();
  }

  function detectPriority(text) {
    if (/\b(urgent|asap|critical|p0|high priority|immediately|top priority|blocker)\b/i.test(text)) return 'High';
    if (/\b(p2|low priority|nice to have|when possible|if time permits)\b/i.test(text)) return 'Low';
    return 'Medium';
  }

  // Split on commas or semicolons that are not inside parentheses
  function splitTopLevel(value) {
    var parts = [], depth = 0, cur = '';
    for (var i = 0; i < value.length; i++) {
      var ch = value[i];
      if (ch === '(') depth++;
      if (ch === ')') depth = Math.max(0, depth - 1);
      if ((ch === ',' || ch === ';') && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
    }
    parts.push(cur);
    return parts;
  }
  function parseAttendees(value) {
    return splitTopLevel(value)
      .map(function (s) { return s.replace(/\(.*?\)/g, '').trim(); })
      .filter(function (s) { return s.length > 1; })
      .map(function (s) {
        var roleMatch = /\(([^)]+)\)/.exec(s);
        return { name: s, role: roleMatch ? roleMatch[1] : '' };
      });
  }
  function attendeeRoles(value) {
    var out = {};
    splitTopLevel(value).forEach(function (part) {
      var m = /^\s*([^()]+?)\s*\(([^)]+)\)\s*$/.exec(part);
      if (m) out[m[1].trim()] = m[2].trim();
    });
    return out;
  }

  // Map a detected first name or handle to the full attendee name where possible
  function canonicalOwner(name, attendees) {
    if (!name) return '';
    var lower = name.toLowerCase().replace(/^@/, '');
    if (TEAM_WORDS.indexOf(lower) !== -1) return 'Team';
    for (var i = 0; i < attendees.length; i++) {
      var full = attendees[i].name;
      var first = full.split(/\s+/)[0].toLowerCase();
      if (full.toLowerCase() === lower || first === lower || full.toLowerCase().replace(/\s+/g, '') === lower) return full;
    }
    return capitalise(name.replace(/^@/, ''));
  }

  function looksLikeName(word, attendees) {
    if (!word) return false;
    var lower = word.toLowerCase();
    if (NOT_NAMES.indexOf(lower) !== -1) return false;
    if (TEAM_WORDS.indexOf(lower) !== -1) return true;
    if (attendees.length) {
      return attendees.some(function (a) {
        var parts = a.name.toLowerCase().split(/\s+/);
        return parts.indexOf(lower) !== -1 || a.name.toLowerCase() === lower;
      });
    }
    return /^[A-Z][a-z]+$/.test(word);
  }

  var VERB_AFTER_NAME = '(?:will|to|needs? to|should|must|is going to|shall|owns|takes|agreed to|can|would|has to|plans to)';

  /** Find who owns a line and return { owner, text } with the owner phrase removed. */
  function extractOwner(text, attendees) {
    var m;
    if ((m = /@([A-Za-z][\w.-]*)/.exec(text))) {
      return { owner: canonicalOwner(m[1], attendees), text: text.replace(m[0], '').replace(/^\s*[:,-]\s*/, '') };
    }
    if ((m = /\(?\b(?:owner|assigned to|assignee|responsible)\s*[:\-]?\s*([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\)?/.exec(text))) {
      var rest = text.replace(m[0], '');
      var lead = /^([A-Z][a-z]+)\s*[:\-–]\s+/.exec(rest);
      if (lead && looksLikeName(lead[1], attendees)) rest = rest.slice(lead[0].length);
      return { owner: canonicalOwner(m[1], attendees), text: rest };
    }
    var nameVerb = new RegExp('^([A-Z][a-z]+(?:\\s(?:and|&)\\s[A-Z][a-z]+)?(?:\\s[A-Z][a-z]+)?)\\s+' + VERB_AFTER_NAME + '\\s+', '');
    if ((m = nameVerb.exec(text))) {
      var who = m[1].split(/\s(?:and|&)\s/);
      var firstWord = who[0].split(/\s+/)[0];
      if (looksLikeName(firstWord, attendees)) {
        var owner = who.map(function (w) { return canonicalOwner(w.trim(), attendees); }).join(', ');
        return { owner: owner, text: text.slice(m[0].length) };
      }
    }
    if ((m = /^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*[:\-–]\s+/.exec(text))) {
      if (looksLikeName(m[1].split(/\s+/)[0], attendees)) {
        return { owner: canonicalOwner(m[1], attendees), text: text.slice(m[0].length) };
      }
    }
    if ((m = /\(([A-Z][a-z]+)\)\s*\.?$/.exec(text)) && looksLikeName(m[1], attendees)) {
      return { owner: canonicalOwner(m[1], attendees), text: text.replace(m[0], '') };
    }
    return { owner: '', text: text };
  }

  function stripDue(text, due) {
    if (!due) return text;
    var escaped = due.raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp('\\s*(?:\\(|\\b(?:by|on|before|due|until|no later than)\\s+)?(?:the\\s+)?' + escaped + '\\)?', 'i'), '');
  }

  // ---------- classification ----------
  var PREFIX = {
    decision: /^(decision|decided|agreed|resolution)\s*[:\-–]\s*/i,
    action: /^(action(?: item)?|ai|todo|to-do|task|next step)\s*[:\-–]\s*/i,
    risk: /^(risk|blocker|issue|concern|dependency)\s*[:\-–]\s*/i,
    followup: /^(follow[- ]?up|open question|question|parking lot|tbd)\s*[:\-–]\s*/i
  };
  var SECTION = [
    { type: 'decision', re: /^(?:#+\s*)?(decisions?|agreements?|resolutions?)\s*(?:made)?\s*:?\s*$/i },
    { type: 'action', re: /^(?:#+\s*)?(action items?|actions|next steps|to-?dos?|tasks)\s*:?\s*$/i },
    { type: 'risk', re: /^(?:#+\s*)?(risks?|blockers?|issues?|risks and issues|concerns)\s*:?\s*$/i },
    { type: 'followup', re: /^(?:#+\s*)?(follow[- ]?ups?|open questions?|parking lot)\s*:?\s*$/i },
    { type: 'notes', re: /^(?:#+\s*)?(discussion|notes|agenda|updates?|summary|minutes)\s*:?\s*$/i }
  ];
  var HEURISTIC = {
    decision: /\b(we (?:have )?(?:decided|agreed)|it was (?:decided|agreed)|agreed to|agreed that|decision is|we will go with|go with option|approved|signed off|final call)\b/i,
    followup: /\b(follow[- ]?up|check back|revisit|circle back|next meeting|tbd|to be confirmed|tbc|open question|awaiting|pending confirmation)\b/i,
    risk: /\b(risk|risky|blocked|blocker|blocking|delay|delayed|slip|slipping|concern|at risk|dependency|bottleneck|may not|might miss)\b/i,
    strongRisk: /\b(blocked|blocker|blocking|delay|delayed|slip|slipping|at risk|risk of|may not|might miss)\b/i,
    actionVerb: /\b(will|needs? to|must|should|please|has to|is going to|to (?:send|share|update|prepare|create|review|fix|check|confirm|draft|schedule|book|submit|add|set up|chase|finalise|finalize|write|test|deploy|investigate|rerun|re-run))\b/i
  };

  /**
   * Main entry point.
   * @param {string} notes  meeting notes as plain text or Markdown
   * @param {object} opts   { meetingDate: 'YYYY-MM-DD' } optional; a "Date:" line in the notes is used when absent
   */
  function extract(notes, opts) {
    opts = opts || {};
    var lines = String(notes || '').replace(/\r\n?/g, '\n').split('\n');
    var title = '', dateStr = opts.meetingDate || '', attendees = [], roles = {};
    var section = 'notes';
    var actions = [], decisions = [], followups = [], risks = [];

    // Pass 1: metadata
    lines.forEach(function (raw) {
      var line = raw.trim(), m;
      if (!title && (m = /^#\s+(.+)$/.exec(line))) title = m[1].trim();
      if (!title && (m = /^(?:title|meeting|subject)\s*:\s*(.+)$/i.exec(line))) title = m[1].trim();
      if (!opts.meetingDate && (m = /^date\s*:\s*(.+)$/i.exec(line))) {
        var parsed = parseDue(m[1], new Date());
        if (parsed) dateStr = parsed.iso;
      }
      if ((m = /^(?:attendees|participants|present|invitees)\s*:\s*(.+)$/i.exec(line))) {
        attendees = attendees.concat(parseAttendees(m[1]));
        var r = attendeeRoles(m[1]);
        Object.keys(r).forEach(function (k) { roles[k] = r[k]; });
      }
    });
    attendees.forEach(function (a) { a.role = roles[a.name] || a.role; });
    var base = fromISO(dateStr) || new Date();
    if (!dateStr) dateStr = toISO(base);

    // Pass 2: content
    lines.forEach(function (raw, idx) {
      var trimmed = raw.trim();
      if (!trimmed) return;
      if (/^#\s+/.test(trimmed) && idx === lines.findIndex(function (l) { return /^#\s+/.test(l.trim()); })) return;
      if (/^(?:title|meeting|subject|date|attendees|participants|present|invitees)\s*:/i.test(trimmed)) return;
      for (var s = 0; s < SECTION.length; s++) {
        if (SECTION[s].re.test(trimmed)) { section = SECTION[s].type; return; }
      }
      if (/^#+\s+/.test(trimmed)) { section = 'notes'; return; }

      var line = cleanLine(trimmed);
      if (!line) return;
      var type = null, body = line;
      Object.keys(PREFIX).forEach(function (k) {
        if (!type && PREFIX[k].test(body)) { type = k; body = body.replace(PREFIX[k], ''); }
      });
      if (!type && section !== 'notes') type = section;

      var ownerInfo = extractOwner(body, attendees);
      var due = parseDue(body, base);
      var riskText = body.replace(/\brisk (?:register|log|review|matrix|workshop)\b/gi, '');
      var isRisk = HEURISTIC.risk.test(riskText);

      if (!type) {
        if (HEURISTIC.decision.test(body)) type = 'decision';
        else if (ownerInfo.owner && (HEURISTIC.actionVerb.test(line) || due || /^[A-Z][a-z]+\s*[:\-–]/.test(body) || /@/.test(line))) type = 'action';
        else if (HEURISTIC.followup.test(body) || /\?\s*$/.test(body)) type = 'followup';
        else if (isRisk) type = 'risk';
        else if (ownerInfo.owner && due) type = 'action';
      }
      if (!type) return;

      var source = { line: idx + 1, text: trimmed };
      if (type === 'action') {
        var task = tidy(stripDue(ownerInfo.text, due));
        task = tidy(task
          .replace(/\(\s*(urgent|asap|critical|p[0-2]|high priority|low priority)\s*\)/gi, '')
          .replace(/[,;\s\-–—]+(urgent|asap|critical|high priority|low priority|top priority|nice to have)\s*$/i, ''));
        actions.push({
          id: 'AI-' + pad(actions.length + 1),
          task: capitalise(task),
          owner: ownerInfo.owner || 'Unassigned',
          due: due ? due.iso : '',
          dueRaw: due ? due.raw : '',
          priority: detectPriority(line),
          source: source
        });
        if (isRisk && HEURISTIC.strongRisk.test(riskText)) risks.push({ id: 'R-' + pad(risks.length + 1), text: capitalise(tidy(body)), source: source, linkedAction: 'AI-' + pad(actions.length) });
      } else if (type === 'decision') {
        decisions.push({ id: 'D-' + pad(decisions.length + 1), text: capitalise(tidy(body)), source: source });
      } else if (type === 'followup') {
        followups.push({ id: 'F-' + pad(followups.length + 1), text: capitalise(tidy(body)), owner: ownerInfo.owner || '', due: due ? due.iso : '', source: source });
      } else if (type === 'risk') {
        risks.push({ id: 'R-' + pad(risks.length + 1), text: capitalise(tidy(body)), source: source });
      }
    });

    var result = {
      title: title || 'Untitled meeting',
      meetingDate: dateStr,
      attendees: attendees,
      actions: actions,
      decisions: decisions,
      followups: followups,
      risks: risks
    };
    result.warnings = buildWarnings(result);
    return result;
  }

  function buildWarnings(r) {
    var w = [];
    var noOwner = r.actions.filter(function (a) { return !a.owner || a.owner === 'Unassigned'; }).length;
    var noDue = r.actions.filter(function (a) { return !a.due; }).length;
    if (noOwner) w.push(noOwner + (noOwner === 1 ? ' action has' : ' actions have') + ' no owner');
    if (noDue) w.push(noDue + (noDue === 1 ? ' action has' : ' actions have') + ' no due date');
    var overdue = r.actions.filter(function (a) { return a.due && a.due < r.meetingDate; }).length;
    if (overdue) w.push(overdue + (overdue === 1 ? ' due date is' : ' due dates are') + ' before the meeting date');
    if (!r.actions.length) w.push('No action items found; check that tasks name an owner (for example "Priya to …" or "@Priya")');
    return w;
  }

  function summarise(r) {
    var owners = {};
    r.actions.forEach(function (a) { owners[a.owner] = (owners[a.owner] || 0) + 1; });
    return {
      actions: r.actions.length,
      withOwner: r.actions.filter(function (a) { return a.owner && a.owner !== 'Unassigned'; }).length,
      withDue: r.actions.filter(function (a) { return !!a.due; }).length,
      highPriority: r.actions.filter(function (a) { return a.priority === 'High'; }).length,
      decisions: r.decisions.length,
      followups: r.followups.length,
      risks: r.risks.length,
      owners: owners
    };
  }

  // ---------- exports ----------
  function formatDate(iso) {
    var d = fromISO(iso);
    if (!d) return '';
    return WEEKDAYS[d.getDay()].slice(0, 3).replace(/^./, function (c) { return c.toUpperCase(); }) + ' ' +
      d.getDate() + ' ' + capitalise(MONTHS[d.getMonth()]) + ' ' + d.getFullYear();
  }

  function toMarkdown(r) {
    var out = [];
    out.push('# ' + r.title);
    out.push('');
    out.push('**Date:** ' + formatDate(r.meetingDate));
    if (r.attendees.length) out.push('**Attendees:** ' + r.attendees.map(function (a) { return a.name + (a.role ? ' (' + a.role + ')' : ''); }).join(', '));
    out.push('');
    out.push('## Decisions');
    if (r.decisions.length) r.decisions.forEach(function (d) { out.push('- ' + d.text); }); else out.push('- None recorded');
    out.push('');
    out.push('## Action items');
    out.push('');
    out.push('| ID | Action | Owner | Due | Priority |');
    out.push('| --- | --- | --- | --- | --- |');
    r.actions.forEach(function (a) {
      out.push('| ' + [a.id, a.task.replace(/\|/g, '/'), a.owner, a.due ? formatDate(a.due) : 'TBD', a.priority].join(' | ') + ' |');
    });
    out.push('');
    out.push('## Follow-ups and open questions');
    if (r.followups.length) r.followups.forEach(function (f) { out.push('- ' + f.text + (f.owner ? ' (' + f.owner + ')' : '')); }); else out.push('- None');
    out.push('');
    out.push('## Risks and blockers');
    if (r.risks.length) r.risks.forEach(function (k) { out.push('- ' + k.text); }); else out.push('- None raised');
    return out.join('\n');
  }

  function toSlack(r) {
    var out = [];
    out.push('*' + r.title + '* · ' + formatDate(r.meetingDate));
    if (r.decisions.length) {
      out.push('');
      out.push('*Decisions*');
      r.decisions.forEach(function (d) { out.push('• ' + d.text); });
    }
    out.push('');
    out.push('*Action items*');
    r.actions.forEach(function (a) {
      out.push('• ' + a.task + ' — *' + a.owner + '*' + (a.due ? ', due ' + formatDate(a.due) : '') + (a.priority === 'High' ? ' :rotating_light:' : ''));
    });
    if (r.followups.length) {
      out.push('');
      out.push('*Follow-ups*');
      r.followups.forEach(function (f) { out.push('• ' + f.text); });
    }
    if (r.risks.length) {
      out.push('');
      out.push('*Risks and blockers*');
      r.risks.forEach(function (k) { out.push('• ' + k.text); });
    }
    return out.join('\n');
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /** CSV with the column names Jira's CSV importer maps by default. */
  function toJiraCSV(r, opts) {
    opts = opts || {};
    var label = opts.label || 'meeting-action';
    var rows = [['Summary', 'Assignee', 'Due date', 'Priority', 'Description', 'Labels']];
    r.actions.forEach(function (a) {
      rows.push([
        a.task,
        a.owner === 'Unassigned' ? '' : a.owner,
        a.due,
        a.priority,
        'From "' + r.title + '" on ' + r.meetingDate + '. Source note: ' + a.source.text,
        label
      ]);
    });
    return rows.map(function (row) { return row.map(csvCell).join(','); }).join('\n');
  }

  // ---------- AI mode ----------
  var AI_SYSTEM_PROMPT = [
    'You are a meticulous technical project manager. You turn raw meeting notes into structured minutes.',
    'Rules:',
    '- Only use information present in the notes. Never invent owners, dates or tasks.',
    '- An action item is a concrete task someone has to do. Use the attendee full name as owner when it is clear; otherwise "Unassigned".',
    '- Convert relative due dates (tomorrow, Friday, next week, EOD) to YYYY-MM-DD using the meeting date. Use "" when no date is stated.',
    '- Priority is "High" when the notes say urgent, ASAP, critical, blocker or P0; "Low" when they say nice to have or P2; otherwise "Medium".',
    '- Decisions are things the group agreed or chose. Follow-ups are open questions or items to revisit. Risks are threats to scope, time, quality or cost, including blockers.',
    '- For every item, include "sourceLine": the 1-based line number in the notes that supports it.',
    'Return only JSON, with no prose, in this shape:',
    '{"title": string, "actions": [{"task": string, "owner": string, "due": string, "priority": "High"|"Medium"|"Low", "sourceLine": number}],',
    ' "decisions": [{"text": string, "sourceLine": number}], "followups": [{"text": string, "owner": string, "sourceLine": number}],',
    ' "risks": [{"text": string, "sourceLine": number}]}'
  ].join('\n');

  function buildAIUserPrompt(notes, meetingDate) {
    var numbered = String(notes).replace(/\r\n?/g, '\n').split('\n').map(function (l, i) { return (i + 1) + ': ' + l; }).join('\n');
    return 'Meeting date: ' + meetingDate + '\n\nNotes (line-numbered):\n' + numbered;
  }

  /** Normalise the model's JSON into the same shape the rule engine returns. */
  function fromAIResponse(text, notes, meetingDate) {
    var json = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    var start = json.indexOf('{'), end = json.lastIndexOf('}');
    var data = JSON.parse(json.slice(start, end + 1));
    var base = extract(notes, { meetingDate: meetingDate }); // reuse metadata (attendees, title)
    var lines = String(notes).replace(/\r\n?/g, '\n').split('\n');
    function src(n) { n = +n || 0; return { line: n, text: (lines[n - 1] || '').trim() }; }
    var r = {
      title: data.title || base.title,
      meetingDate: base.meetingDate,
      attendees: base.attendees,
      actions: (data.actions || []).map(function (a, i) {
        return { id: 'AI-' + pad(i + 1), task: a.task, owner: a.owner || 'Unassigned', due: /^\d{4}-\d{2}-\d{2}$/.test(a.due || '') ? a.due : '', dueRaw: '', priority: ['High', 'Medium', 'Low'].indexOf(a.priority) !== -1 ? a.priority : 'Medium', source: src(a.sourceLine) };
      }),
      decisions: (data.decisions || []).map(function (d, i) { return { id: 'D-' + pad(i + 1), text: d.text, source: src(d.sourceLine) }; }),
      followups: (data.followups || []).map(function (f, i) { return { id: 'F-' + pad(i + 1), text: f.text, owner: f.owner || '', due: '', source: src(f.sourceLine) }; }),
      risks: (data.risks || []).map(function (k, i) { return { id: 'R-' + pad(i + 1), text: k.text, source: src(k.sourceLine) }; })
    };
    r.warnings = buildWarnings(r);
    return r;
  }

  return {
    extract: extract,
    parseDue: parseDue,
    extractOwner: extractOwner,
    detectPriority: detectPriority,
    summarise: summarise,
    buildWarnings: buildWarnings,
    toMarkdown: toMarkdown,
    toSlack: toSlack,
    toJiraCSV: toJiraCSV,
    formatDate: formatDate,
    AI_SYSTEM_PROMPT: AI_SYSTEM_PROMPT,
    buildAIUserPrompt: buildAIUserPrompt,
    fromAIResponse: fromAIResponse
  };
});
