Meeting: Requirements call – Acme Logistics fleet dashboard
Date: 12/11/2026
Participants: John Carter (Acme, Ops Director), Lisa Wong (Acme, IT), Anubhav (PSI TPM), Dev Patel (PSI Backend)

Notes
- John wants drivers' daily route completion visible to regional managers.
- Data comes from Acme's existing telematics API; Lisa confirmed REST with OAuth 2.0.
- We agreed that phase 1 covers web only; mobile app is out of scope.
- Concern: telematics API rate limit is 100 requests per minute, which may not cover live refresh.

Action items
- Lisa to share API documentation and sandbox credentials by next Monday
- Dev will prototype the data sync against the sandbox in 2 weeks
- Anubhav to send the draft scope document and change-request process by 18/11/2026
- John: nominate two regional managers for UAT (owner: John Carter)
- Draft the acceptance criteria for the route-completion widget, high priority

Open questions
- Do managers need data older than 90 days?
- Which SSO provider does Acme use? TBC with Lisa.
