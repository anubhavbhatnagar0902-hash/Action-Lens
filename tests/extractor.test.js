// Run with: npm test   (uses Node's built-in test runner, Node 18+)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../src/extractor.js');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'samples', f), 'utf8');

test('due dates are resolved relative to the meeting date', () => {
  const base = '2026-12-04'; // a Friday
  const cases = {
    'by Wednesday': '2026-12-09',
    'by Friday': '2026-12-11',
    'next Monday': '2026-12-07',
    'tomorrow': '2026-12-05',
    'EOD': '2026-12-04',
    'end of week': '2026-12-04',
    'next week': '2026-12-07',
    'in 2 weeks': '2026-12-18',
    'by 11 Dec': '2026-12-11',
    'on Jan 15': '2027-01-15',
    'by 18/01/2027': '2027-01-18',
    'due 2027-01-28': '2027-01-28',
    'end of month': '2026-12-31'
  };
  for (const [phrase, iso] of Object.entries(cases)) {
    assert.equal(A.parseDue('Ship it ' + phrase, base)?.iso, iso, phrase);
  }
  assert.equal(A.parseDue('No date here', base), null);
});

test('"next Monday" from a Thursday is the Monday of the following week', () => {
  assert.equal(A.parseDue('next Monday', '2026-11-12').iso, '2026-11-16');
});

test('owners are found in common note-taking styles', () => {
  const people = [{ name: 'Priya Sharma' }, { name: 'Ravi Kumar' }];
  assert.equal(A.extractOwner('Priya to send the deck', people).owner, 'Priya Sharma');
  assert.equal(A.extractOwner('@ravi fix the login bug', people).owner, 'Ravi Kumar');
  assert.equal(A.extractOwner('Ravi: book the pen test', people).owner, 'Ravi Kumar');
  assert.equal(A.extractOwner('Book the room (owner: Priya)', people).owner, 'Priya Sharma');
  assert.equal(A.extractOwner('Priya and Ravi will review the PRD', people).owner, 'Priya Sharma, Ravi Kumar');
  assert.equal(A.extractOwner('We will review the PRD', people).owner, '');
});

test('priority keywords are detected', () => {
  assert.equal(A.detectPriority('Fix this ASAP'), 'High');
  assert.equal(A.detectPriority('Nice to have: dark mode'), 'Low');
  assert.equal(A.detectPriority('Update the docs'), 'Medium');
});

test('sprint review sample produces the expected minutes', () => {
  const r = A.extract(read('sprint-2-review.md'));
  assert.equal(r.title, 'Sprint 2 Review – AI Meeting Assistant');
  assert.equal(r.meetingDate, '2026-12-04');
  assert.equal(r.attendees.length, 6);
  assert.equal(r.actions.length, 6);
  assert.equal(r.decisions.length, 2);
  assert.equal(r.followups.length, 2);
  assert.equal(r.risks.length, 2);
  const zoom = r.actions.find((a) => /Zoom/.test(a.task));
  assert.deepEqual([zoom.owner, zoom.due, zoom.priority], ['Ravi Kumar', '2026-12-11', 'High']);
  assert.ok(!r.risks.some((k) => /risk register/i.test(k.text)), 'risk register is not a risk');
});

test('client call sample handles sections, dd/mm dates and missing owners', () => {
  const r = A.extract(read('client-requirements-call.md'));
  assert.equal(r.meetingDate, '2026-11-12');
  assert.equal(r.attendees[0].role, 'Acme, Ops Director');
  assert.equal(r.actions.length, 5);
  assert.equal(r.actions.find((a) => /scope document/.test(a.task)).due, '2026-11-18');
  assert.equal(r.actions.find((a) => /acceptance criteria/.test(a.task)).owner, 'Unassigned');
  assert.ok(r.warnings.some((w) => /no owner/.test(w)));
});

test('exports are well formed', () => {
  const r = A.extract(read('sprint-2-review.md'));
  const csv = A.toJiraCSV(r).split('\n');
  assert.equal(csv[0], 'Summary,Assignee,Due date,Priority,Description,Labels');
  assert.equal(csv.length, r.actions.length + 1);
  assert.match(A.toMarkdown(r), /\| AI-02 \| Submit the Zoom Marketplace app \| Ravi Kumar \| Fri 11 Dec 2026 \| High \|/);
  assert.match(A.toSlack(r), /\*Action items\*/);
});

test('AI responses are normalised into the same shape', () => {
  const notes = read('sprint-2-review.md');
  const ai = '```json\n{"title":"Sprint 2 Review","actions":[{"task":"Submit Zoom app","owner":"Ravi Kumar","due":"2026-12-11","priority":"High","sourceLine":12}],"decisions":[],"followups":[],"risks":[]}\n```';
  const r = A.fromAIResponse(ai, notes, '2026-12-04');
  assert.equal(r.actions[0].id, 'AI-01');
  assert.match(r.actions[0].source.text, /Zoom Marketplace app/);
});
