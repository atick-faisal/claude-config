# Phone notifications — Tasks

| ID | Description | Complexity | Suggested Model | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| PHONE-NOTIFICATIONS-01 | Spike: start a session with `--remote-control`, send a test `PushNotification`, confirm it reaches the phone, and record what works in `plan.md` | small | sonnet | done | needs the human's phone; may reshape -02 and -03 |
| PHONE-NOTIFICATIONS-02 | Add a "ping the human" instruction to each STOP condition and to task completion in `skills/implement/SKILL.md` | small | sonnet | done | blocked by -01; message leads with what the human must act on |
| PHONE-NOTIFICATIONS-03 | Document how to start a pingable session (`--remote-control` launch and `agentPushNotifEnabled`) | trivial | haiku | done | blocked by -01; location decided after the spike |
