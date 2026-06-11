# fix-e931abbf49cffde3 — Fix: The prior 'Challenge' entity explicitly states 'reward_type' and does not include 'token' as an enumerated value (the prior only mentions 'points' and 'crypto' implicitly, but the CURRENT_DOC adds 'token' as a third reward type, introducing an element not covered by the upstream specification, 

**Weight:** 0.0000 (share of project budget)
**Reward:** 0 QST

missing: The prior 'Challenge' entity explicitly states 'reward_type' and does not include 'token' as an enumerated value (the prior only mentions 'points' and 'crypto' implicitly, but the CURRENT_DOC adds 'token' as a third reward type, introducing an element not covered by the upstream specification, but the upstream didn't exclude it; however, the upstream 'External Dependencies - Database' explicitly lists 'reward_type' without enumerating values; the missing element is the upstream's 'deadline' column not explicitly mapped.

Severity: medium.