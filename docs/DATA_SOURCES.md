# Data sources

| Data / asset | Source URL | License / terms | How it's used |
|---|---|---|---|
| IBM/sarama source code and git history | https://github.com/IBM/sarama | MIT | Mined for bug-fix commits. Historical snapshots become training cases. |
| IBM/sarama public pull request and issue text | https://github.com/IBM/sarama/pulls | Public GitHub content, MIT-licensed project | Summarized by Bob into spoiler-free case briefs. Usernames, emails, and avatars are stripped. Only counts and durations are stored. |
| IBM/python-sdk-core source code, git history and public PR/issue text | https://github.com/IBM/python-sdk-core | Apache-2.0 | Second demo repository (Python). Same redaction rules as sarama. |
| google/uuid source code, git history and public PR text | https://github.com/google/uuid | BSD-3-Clause | Third repository, connected from the app's Settings during final testing to prove the pipeline on an unseen repository. Same redaction rules. |
| Sound effects and the three lofi radio stations | Generated in the browser with the Web Audio API (apps/web/src/lib/sound.ts, lofi.ts) | Original code, MIT | No audio files or samples are used. |
