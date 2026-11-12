<!-- TEMPLATE — delete this block when instantiating.

     Copy to docs/features/<feature-slug>/decisions.md. Starts empty — entries
     are appended by /write-adr when a real pivot happens, newest at the bottom.

     ID — ADR-01, ADR-02, scoped to this feature directory, same as task IDs.
     Two features both having an ADR-01 is fine and expected; the path
     disambiguates.

     An ADR records a decision that was genuinely forked and would otherwise be
     re-litigated. Added detail is not an ADR — that belongs in plan.md. If you
     cannot name a real alternative that was rejected, it is not an ADR.

     Superseding: never edit or delete a past entry. Set the old one's status to
     `superseded by ADR-NN` and append the new one.

     Entry format:

       ## ADR-01 — Redis for session storage

       **Date:** 2026-09-07
       **Status:** accepted
       **Tasks:** AUTH-ROTATION-03, AUTH-ROTATION-04

       **Context**
       What forced the decision — the constraint or conflict, not the backstory.

       **Decision**
       What was chosen, stated so it can be checked against the code.

       **Alternatives considered**
       - Postgres table — avoids new infra, but no native TTL; expiry becomes a cron
       - In-memory — simplest, but breaks the moment we run more than one instance

       **Consequences**
       - Redis becomes a hard runtime dependency, including in CI
       - Session loss on Redis restart is now an accepted failure mode

     Body placeholder after this block is deleted: <feature-title> only.
-->

# <feature-title> — Decisions
