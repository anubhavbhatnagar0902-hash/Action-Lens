# ActionLens

**Turn meeting notes into a clear action list — owners, due dates, decisions and risks — ready to share in Slack, Jira or email.**

ActionLens is a browser tool for project managers and team leads. Paste your notes (or open a `.txt` / `.md` file) and it produces:

- an **action list** with task, owner, due date, priority and the line in your notes it came from
- **decisions**, **follow-ups / open questions** and **risks / blockers**
- a **warning banner** for actions without an owner or a due date
- **Who has what**: how many actions each person owns
- ready-to-paste **meeting minutes**, a **Slack message**, a **Jira import (CSV)** and **JSON**

Everything is editable, and every export updates as you edit.

New users: read the **[User Guide](docs/USER_GUIDE.md)**, or open the app and choose **Take the 1-minute guided tour**.

---

## Why it exists

After every stand-up, sprint review or client call, someone spends 15–30 minutes turning notes into tracked work: finding the actions, working out owners, turning "by Friday" into a date, creating Jira tickets and posting a recap. It is repetitive and error-prone — actions get lost and owners stay vague.

ActionLens cuts this to about a minute and flags gaps before the minutes go out.

| Manual step | With ActionLens |
| --- | --- |
| Re-read notes and pick out tasks | Found automatically, each linked to its line in the notes |
| Work out owners from "Priya to…", "@Ravi", "Sana:" | Matched to the attendee list, full names used |
| Convert "Friday", "EOD", "next Monday", "11 Dec" | Turned into real dates from the meeting date |
| Create Jira tickets one by one | Import all actions at once from the CSV |
| Write the Slack recap | Copy a ready-formatted message |

---

## Getting started

No installation is needed to use it.

**Option 1 — open the file.** Download `dist/actionlens.html` and open it in Chrome, Edge, Firefox or Safari.

**Option 2 — run from the repository.**

```bash
git clone https://github.com/<your-username>/actionlens.git
cd actionlens
npm start            # serves the app on http://localhost:5173
```

Or simply open `index.html` in a browser.

**Option 3 — GitHub Pages.** Push the repository to GitHub, then go to *Settings → Pages → Build and deployment → Source: GitHub Actions*. The included workflow runs the tests and publishes the site on every push to `main`.

Development needs Node.js 18 or later (only for tests and the build script). The app itself has no dependencies.

---

## How it works — in three steps

The progress bar at the top of the app always shows which step you are on and what to do next.

1. **Add notes.** Paste or type them, choose **Load example…**, or **Open file**. Your notes are saved in the browser as you type.
2. **Review results.** Choose **Extract actions** (or Ctrl + Enter).
   - The notes switch to the **Highlighted** view: every line that produced an item is coloured and labelled. Click a line to open its item; click **Line n** on an item to jump back.
   - A yellow banner lists actions without an owner or due date. **Show me** filters the list to those.
   - Click any task, owner, date or priority to change it. Remove a row with the bin icon (with **Undo**), or **Add an action**.
3. **Share.** Choose **Share**, pick **Meeting minutes**, **Slack message**, **Jira import** or **JSON**, then **Copy** or **Download file**.

**Help** in the top bar opens the in-app guide and can replay the guided tour.

### What the reader recognises

| In your notes | Result |
| --- | --- |
| `Priya to send the deck by Friday` · `Ravi will fix login` · `Meera needs to rerun…` | Action, owner from the name |
| `@Karan add regression tests` · `Sana: share designs` · `(owner: John Carter)` | Action, owner from the handle, prefix or tag |
| `Action:` / `TODO:` prefixes, or lines under an `Action items` heading | Action (flagged if no owner is named) |
| `Decision:` · `We agreed…` · `We will go with…` · `Approved` | Decision |
| `Follow up…` · `TBD` · `TBC` · `Open question` · a line ending in `?` | Follow-up |
| `Risk:` · `Blocker:` · `delay` · `at risk` · `blocked` | Risk or blocker |
| `urgent` · `ASAP` · `critical` · `P0` / `nice to have` · `P2` | High / Low priority (Medium otherwise) |
| `Attendees:` line, with roles in brackets | Used to match first names to full names |

**Dates** are worked out from the meeting date: `today`, `EOD`, `tomorrow`, a weekday (`Friday` = the next Friday), `next Monday` (Monday of the following week), `end of week`, `next week`, `in 2 weeks`, `end of month`, `11 Dec`, `Jan 15`, `2027-01-15` and `18/01/2027` (day/month).

---

## Two modes

| | Standard mode (default) | AI mode |
| --- | --- | --- |
| Setup | None | Your own Anthropic API key |
| Privacy | Notes never leave the browser | Notes are sent to the Anthropic API |
| Best for | Notes that name an owner for each task | Free-form, conversational notes |
| Traceability | Line number for every item | The model must cite a line number for every item |

AI mode uses a strict prompt (`AI_SYSTEM_PROMPT` in `src/extractor.js`): use only what is in the notes, never invent owners or dates, return JSON and cite the source line of each item. The response goes through the same checks and screens as Standard mode. The key is held only in the open tab and sent only to `api.anthropic.com`.

> AI mode calls the API directly from the browser, so use it from a local copy or GitHub Pages. Pages that block outside network calls show a clear message; Standard mode still works there.

---

## Project structure

```
actionlens/
├── index.html                 App entry (loads files from src/)
├── dist/actionlens.html       Single self-contained file (generated)
├── src/
│   ├── extractor.js           Extraction engine and exports (browser and Node, no dependencies)
│   ├── app.js                 Interface: welcome, review, sharing, help, guided tour
│   ├── styles.css             Styles, light and dark themes
│   ├── body.html              Page markup
│   └── samples.js             Example notes (generated from samples/)
├── samples/                   Example meeting notes
├── tests/extractor.test.js    Unit tests (Node's built-in test runner)
├── scripts/build-single-file.js
├── docs/USER_GUIDE.md         Step-by-step user manual
├── docs/AI_WORKFLOW.md        How the tool was specified, built and reviewed
└── .github/workflows/ci.yml   Tests and GitHub Pages deployment
```

## Development

```bash
npm test        # dates, owners, priority, both samples, exports, AI response handling
npm run build   # regenerates src/samples.js, index.html and dist/actionlens.html
```

Edit files in `src/`, then run `npm run build`. To add an example, put a `.md` file in `samples/` and list it in `scripts/build-single-file.js`.

## Known limitations

- Standard mode needs a named owner (or an action heading or prefix) to detect a task; vague lines such as "someone should look at this" become follow-ups.
- English notes only.
- Ambiguous dates follow the conventions above (day/month order; "next Monday" = following week). Always check dates before sharing.
- Only the current notes are kept between visits; copy or download the results to keep them.

## Roadmap

1. Post actions straight to Jira and Slack through their APIs.
2. Recurring-meeting view that carries open actions forward and flags overdue ones.
3. Hindi and mixed Hindi-English notes.

## Licence

MIT — see `LICENSE`.
