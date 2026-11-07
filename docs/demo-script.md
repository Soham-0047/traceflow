# Demo script (about 5 minutes)

Story: **"Your most knowledgeable engineer just left. What did they take with them?"**

Two versions of the video are possible. The *sample-data* version can be recorded today from the demo site. The *Forge* version needs TF-01 and TF-05 (the app on a seeded dev site); lines marked **[needs Forge]** or **[needs TF-04]** cannot be shown until then. Record the Forge version for the submission.

Wording to keep (see `DESIGN.md`): "audit-ready evidence", "decision traceability", "sole contributor". Never "SOC 2 proof", never "sole knowledge holder", never a claim of unlimited $0.

| Time | Screen | Say and do |
| --- | --- | --- |
| 0:00 to 0:40 | Title, then People | "A senior engineer leaves. The organization knows their assigned tickets, but not what only they understand." Open **People**. Alex Rivera is already at the top with **63 of 100, High risk**. |
| 0:40 to 1:40 | Handover ledger | "Every point is checkable." Read the ledger: 7 pages where Alex is the only recorded contributor, 4 open issues, 2 open pull requests, 2 decisions waiting on Alex. Point at the footer: records × weight = points, summed to 63. |
| 1:40 to 2:30 | Evidence card | Click **open pull requests**. "Why was this flagged, which records support it, how sure are we, what do we do." Show confidence, the record list, the suggested actions. Click a page finding and point out the caveat: sole contributor is not sole knowledge holder. |
| 2:30 to 3:40 | Epics, lineage | Open **PAY-1 Payments reliability**. "From recorded intent to code." Click an issue: unrelated records dim, linked ones stay. Open the gaps: a decision still marked proposed already has finished work; a finished issue has no pull request. Switch to **ONB-1**: "no linked specification". |
| 3:40 to 4:15 | Decisions | Open **queue vs cron for retries**. Linked work, the people involved, and who is still holding up the decision. "We name a delegate before the handover date." |
| 4:15 to 4:45 | Rovo **[needs TF-04]** | Ask the agent: "What are the five biggest knowledge-continuity risks in this project?" It answers from the same evidence, with links. |
| 4:45 to 5:00 | Close | "TraceFlow does not just show what your team is working on. It shows what your organization depends on, before those dependencies become problems." Show the install link and the demo URL. |

## Recording checklist
- Use the Forge app on the seeded dev site **[needs Forge]**; fall back to the demo site only if Forge slips.
- 1280 by 720 or larger, browser zoom 100%, no bookmarks bar, notifications off.
- Narrate over the real UI; do not add invented statistics, logos or testimonials.
- Show the Forge allowance and "runs on Atlassian" only if both are true when you record.
- Upload to YouTube (unlisted or public) and link it from Devpost and the site (TF-08).
