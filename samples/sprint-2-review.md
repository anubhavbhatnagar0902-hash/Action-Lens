# Sprint 2 Review – AI Meeting Assistant
Date: 2026-12-04
Attendees: Priya Sharma (PM), Anubhav Bhatnagar (TPM), Ravi Kumar (Backend Lead), Meera Iyer (AI/ML Lead), Karan Mehta (QA Lead), Sana Khan (UI/UX)

## Discussion
- End-to-end slice demoed on staging: a Google Meet call was recorded and transcribed in 7 minutes.
- WER on the evaluation set is 13.4%, above the 12% target. Accented speech is the main gap.
- Zoom Marketplace review has not started yet; this is a risk for the January launch.
- Decision: use the second-ranked ASR provider as a fallback for heavily accented audio.
- Agreed to move email notifications (NOT-1) to Sprint 3.
- Meera will rerun the WER benchmark with diarization tuning by Wednesday.
- Ravi to submit the Zoom Marketplace app by 11 Dec (urgent).
- @Karan add regression tests for the upload flow before sprint planning.
- Sana: share high-fidelity designs for the search page by Friday.
- Priya needs to confirm the 30 consented recordings with the pilot customer tomorrow.
- Pen-test vendor slot is still TBD, follow up with PSI Security.
- Who owns the Slack app review? Open question for next meeting.
- Blocker: staging database is at 85% storage and may delay load testing.
- Anubhav will update the risk register and share the weekly status report EOD.
