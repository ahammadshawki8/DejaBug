---
name: forge-case
description: >
  Instructions and JSON schema for writing a spoiler-free DejaBug training-case Brief.
  Use when generating a Brief JSON object from a fix diff and its PR/issue context.
---

# Forge Case: write a spoiler-free training-case Brief

## 1. Output contract

Respond with **exactly one raw JSON object** and nothing else.
- No prose before or after the JSON.
- No code fences (no triple backticks).
- Every field listed in Section 2 must be present.
- String values must not start or end with whitespace.
- No emojis and no em dashes (use a plain hyphen or a colon instead).

## 2. Brief JSON schema

```
{
  "codename":  string,   // a short evocative name for the case (2-4 words, title-case)
  "symptoms":  string,   // what a user observes, written like a user report (see Section 3)
  "evidence":  string,   // a short excerpt from the test failure output confirming the symptom
  "hints":    [string, string, string],  // exactly 3 strings: nudge, direction, near-answer
  "difficulty": 1 | 2 | 3,              // integer; see Section 5
  "precinct":  string,   // package or subsystem name; see Section 6
  "lesson":    string,   // post-debrief takeaway; may name the fix (shown after solve only)
  "tags":     string[]   // 2-5 short lowercase tags, e.g. ["concurrency","consumer-group"]
}
```

Field rules:

| Field | Rule |
|---|---|
| `codename` | An evocative two-to-four-word detective title (title-case). Must not describe the fix or name any identifier introduced by the fix. Good: "The Phantom Slice", "Silent Threshold". Bad: "32-bit Overflow Guard", "Missing-API-Key". |
| `symptoms` | 1-3 sentences written as a user report. Must not name the fix. See Section 3. |
| `evidence` | 1-3 lines copied or paraphrased from the test failure output. No fix identifiers. |
| `hints[0]` | Nudge - behavioral observation only, no code area or identifier named. |
| `hints[1]` | Direction - names the package or function, but no new identifiers. |
| `hints[2]` | Near-answer - describes the mechanism without writing any code. |
| `difficulty` | Integer 1, 2, or 3. See Section 5. |
| `precinct` | Package or subsystem name, not a file path. See Section 6. |
| `lesson` | The fix explained plainly. May name fix identifiers. Shown only after the player solves. |
| `tags` | 2-5 strings, all lowercase, hyphen-separated if multi-word. |

Every hint must reference the code area, test, or evidence of THIS case. Never reuse wording from this skill.

## 3. Spoiler rules

A spoiler is any identifier or string literal that the fix **introduced**: it appears on the
diff's added lines (`+`) but not on its removed lines (`-`).

Rules that apply to `symptoms`, `evidence`, and all three `hints` (the player-visible fields):

1. **Never name a fix identifier.** If the fix added a function called `resetOffset`, do not
   write "resetOffset" anywhere in symptoms, evidence, or hints.
2. **Never name a fix literal.** If the fix added the string `"unexpected EOF"`, do not quote it.
3. **Describe behavior, not code.** Write "the client reports an error after reconnecting" not
   "ErrUnexpectedEOF is returned".
4. **Test names are not spoilers.** The test function names are already known to the player
   (they run the tests); you may reference them in `evidence` only.
5. **The `lesson` field is exempt.** It is shown only in the debrief after the player solves the
   case, so it may name any identifier.

If you are uncertain whether a word is a fix identifier, omit it and describe the concept instead.

## 4. Hint ladder

Write exactly three hints, in this order:

**hints[0] - Nudge**
One sentence. Describe the incorrect behavior the user observes without naming any code area,
package, function, or identifier. Template: "<observable symptom> when <condition>."

**hints[1] - Direction**
One or two sentences. Point to the specific package or function where the problem lives, but
introduce no new identifiers beyond what is already in the commit subject or PR title.
Template: "Look at <subsystem from THIS case> - <early-exit or lifecycle path observed in the diff>."

**hints[2] - Near-answer**
Two or three sentences. Describe the mechanism of the bug clearly enough that a developer who
knows the codebase could find it, without writing any code or naming any identifier introduced
by the fix. Template: "When <error condition from THIS case> occurs, <resource or state> is not
cleaned up. <Downstream consequence observed in the test output>."

## 5. Difficulty rubric

| Value | Meaning |
|---|---|
| 1 | The failure message alone points to the problem. A developer familiar with the language can find the fix in under 10 minutes. Straightforward pattern match. |
| 2 | Subtle state or timing bug. The failure message is ambiguous or misleading. Requires understanding the data flow or lifecycle, not just the surface error. |
| 3 | Distributed or protocol-level invariant violation. The root cause is non-obvious even with the failing test in hand. Requires understanding the system's concurrency model or wire protocol. |

When in doubt, prefer the higher difficulty.

## 6. Precinct rule

`precinct` must be the **package or subsystem name**, not a file path and not a struct name.

Good: `"consumer-group"`, `"offset-manager"`, `"broker-connection"`
Bad: `"consumer/consumer_group.go"`, `"ConsumerGroup"`, `"sarama"`

Use lowercase and hyphens. Pick the narrowest subsystem that owns the buggy behavior.

## 7. Input you will receive

The user message contains:

- **Commit subject** - the one-line fix commit message.
- **PR title and body** - the pull-request description (personal info redacted).
- **Issue title and body** - the linked issue, if any.
- **Comments** - combined PR and issue comments (personal info redacted).
- **Failing test output** - from the certification run on the pre-fix code.
- **Fix diff** - the unified diff of the fix commit (use this ONLY to understand what changed;
  never copy identifiers from the added lines into the player-visible fields).

Produce the Brief JSON from this information. If the context is thin (no PR, no issue), infer
symptoms and evidence from the test name, test output, and diff alone - do not invent details.
