# How ActionLens Was Built

This file records how the tool was specified, built with AI-assisted development, and reviewed, so reviewers can see the problem-solving approach as well as the result.

## 1. Choosing the problem

The repetitive tasks a project manager does after each meeting were listed and compared by frequency, time taken and the cost of mistakes. Turning notes into tracked actions (owners, due dates, Jira tickets, Slack recap) was chosen: it happens several times a day, has a clear input and output, and lost or ownerless actions are expensive.

The tool was designed to work fully offline with a rules engine, with an AI model as an optional upgrade rather than a dependency.

## 2. Specification first

Requirements were written as user stories with acceptance criteria before any code, in the same format as the sprint plan.

| ID | Story | Key acceptance criteria |
| --- | --- | --- |
| US-1 | As a PM, I paste notes and get an action list | Each action has ID, task, owner, due date, priority and source line |
| US-2 | As a PM, I want relative dates converted | "Friday", "EOD", "next Monday", "11 Dec", dd/mm/yyyy resolved from the meeting date; unit tests |
| US-3 | As a PM, I want gaps flagged | Banner when an action has no owner or no date, with a one-click filter |
| US-4 | As a PM, I want to fix results before sharing | Task, owner, date and priority editable; exports update instantly; undo for deletes |
| US-5 | As a PM, I want to share in one click | Minutes, Slack, Jira CSV (standard field names) and JSON |
| US-6 | As a PM handling confidential client notes | Default mode runs fully in the browser; AI mode is opt-in |
| US-7 | As a first-time user, I want to learn the tool without help | Welcome screen, 3-step progress bar with next-step hint, guided tour, in-app guide |

## 3. AI-assisted development

An AI coding assistant was given each story with its acceptance criteria as the prompt, for example:

> Write a dependency-free JavaScript module that extracts action items, decisions, follow-ups and risks from meeting notes. Owners come from patterns like "Name to/will/needs to", "@handle", "Name:", "(owner: Name)", matched to an Attendees line. Resolve due dates relative to the meeting date. Keep the source line number for every item. Add exports to Markdown, Slack and a Jira CSV with standard column names.

Every output was treated like a pull request from a new team member: run, tested against sample notes, reviewed and corrected.

## 4. Review findings and fixes

| Issue found in review | Fix |
| --- | --- |
| "Update the risk register" was classified as a risk | Excluded "risk register/log/review"; action lines need strong risk words |
| Attendee roles such as "(Acme, Ops Director)" split at the comma | Split attendees only on commas outside brackets |
| A leading "John:" was left in the task text when an `(owner: …)` tag was also present | Strip the name prefix after tag-based owner detection |
| Trailing "high priority" and full stops left in task text | Clean priority words and trailing punctuation |
| "next Monday" from a Thursday gave the Monday 11 days later | Changed to Monday of the following week; test added |
| Page scrolled sideways on phones | Grid children allowed to shrink; tables scroll inside their own container |
| First-time users did not know where to start or what to do next | Added a welcome screen, a 3-step progress bar with a hint for the next step, a guided tour, an in-app user guide, plain labels and empty-state guidance |

All unit tests pass (`npm test`).

## 5. Lessons

- **A precise specification makes AI-assisted coding fast.** Stories with acceptance criteria produced usable code first time.
- **Tests are the contract.** Date rules are easy to get subtly wrong; tests caught the "next Monday" ambiguity.
- **Keep a deterministic fallback.** The rules engine is predictable, private and free; AI is an upgrade.
- **Traceability builds trust.** Linking every item to its line lets a reader verify the output in seconds.
- **Design for the first visit.** A tool that needs explaining will not be adopted; the interface must teach itself.
