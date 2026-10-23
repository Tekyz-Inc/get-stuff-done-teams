# Talk Mode

Talk out loud with the Claude session in the tab you are facing: hold Ctrl+Option+Space to speak or to cut Claude off, release to send, hear the answer through the speakers, and end with "we're done, pass it on" or "we're done, ignore".

```text
A GSD-T session starts
  Record which terminal it runs in (its tab)
    It has no terminal (talk's own copies, scripted runs): record nothing
  Is the shared talk program running:
    Yes: Leave it
    No:  Start it in the background — it stays idle, nothing loaded

You hold Ctrl+Option+Space (in the dictation app)
  The dictation app plays the talk start sound (different from normal dictation's)
  It tells talk "hush"
    Talk stops speaking at once and drops the rest of that answer
    A step Claude is in the middle of still finishes (no half-done edits)
    The voice starts loading, so it is ready when you finish speaking
  The dictation app listens and shows your words, as it does today

You release the keys
  The dictation app plays the talk stop sound and sends your words to talk
  Which session are you facing (the active tab, as tmux reports it):
    No GSD-T session is running there:
      Talk says "No Claude session is running in this window"
      The panel shows the reason in red; your words stay there to copy
    Found: Go on
  Do your words say "we're done":
    With "pass it on":
      Talk says "Summarizing for the session"
      The copy writes a short summary (decisions and the points that matter)
      Save the summary in the transcript, marked "passed on"
      Close the copy; talk goes idle for that session
      The dictation app pastes "Claude Voice Session: <summary> Full transcript: <file>" into the tab
        You read it and press Enter to send it, or edit it first
    With "ignore":
      The copy writes the summary; save it, marked "ignored"
      Close the copy; talk says "Saved. Going quiet"
    Neither:
      Talk asks "Pass it on, or ignore?"
    There is no conversation to end:
      Talk says so
  Otherwise, is a conversation with this session already open:
    No: Start one
      Make a copy of the session (it knows your conversation; the session itself is untouched)
      Give it the summaries of this project's last five talk conversations
      Open a new transcript file in the project's talk folder
    Yes: Use it
  Is Claude still finishing an earlier step:
    Yes: Your words wait, then go next
    No:  Your words go now
  Write your words to the transcript
  Claude answers
    Each tool step is logged; the first one in a turn is spoken as "One moment"
    The answer is spoken sentence by sentence as it arrives:
      The GSD-T date and version line: not spoken
      Tables and code: not spoken — talk says they are in the transcript
      Everything else: spoken
    Write the answer to the transcript
  The voice fails mid-answer:
    Logged in red; the answer is still in the transcript
  The copy of the session stops unexpectedly:
    Talk says "Claude stopped. The conversation so far is saved"
```

---

## What it does today

```text
You dictate with Ctrl+Space
  The dictation app pastes your words into whatever window has focus
Claude answers in text only
  The only spoken option tried (claude-voice) listens all the time
    With speakers, it hears its own voice and cuts itself off
    So it needs headphones
```

It got this way because Claude Code's own voice mode only turns speech into a prompt; nothing speaks the answer.

## What changes

```text
The dictation app gets a second hold-to-talk key, Ctrl+Option+Space
  Pressing it hushes talk; releasing it sends the words to talk
  A "pass it on" reply comes back with text to paste into the tab
  Ctrl+Space keeps working exactly as before
Every GSD-T session registers its terminal at start
  The first one also starts the shared talk program
Talk talks with the session in the tab you face
  Each conversation is a copy of that session, saved to the project as it goes
The microphone is only open while you hold the keys
  So it never hears Claude's voice, and speakers work
```

## The rules

- [RULE] mic-open-only-while-keys-held — the dictation app is the only listener; talk never opens the microphone.
- [RULE] hush-stops-speech-never-work — a hush stops the voice and drops unspoken sentences; it never kills Claude mid-step.
- [RULE] one-talk-program — one shared program for every session; a second one halts.
- [RULE] talk-session-by-terminal — the session is the one registered on tmux's active pane; none there is said out loud, never guessed.
- [RULE] transcript-written-as-it-happens — every exchange is appended to the project's `.gsd-t/talk/` file at once; a transcript is never overwritten.
- [RULE] talk-door-local-and-keyed — the port listens on this Mac only and refuses any request without the handoff file's secret key.
- [RULE] talk-never-drops-words-silently — a send that fails leaves the words in the dictation panel with a red reason.
- [RULE] no-fallback-voice — a failed voice is reported; it never swaps to a different voice on its own.
- [RULE] speak-for-decisions — the answer or decision first; at most three options with trade-offs; a recommendation; about seventy words; no narration of the work.
- [RULE] talk-turns-matched-by-echo — a copy can run turns of its own (the original session's queued notices arrive first); only the turn that follows the echo of our message is the answer. Its own turns are logged, never spoken, and the copy is told to leave the original's unfinished work alone.
- [RULE] talk-restarts-twice-then-halts — every crash is logged with its full error and talk restarts. A restart has failed when the restarted talk crashes within a minute; after two failed restarts in a row it stops with a notification and a "crashed" status. Approved fallback `talk-supervisor-restart`.
- [RULE] talk-copies-read-only — a copy gets only Read, Grep, Glob, WebSearch, WebFetch, no connected services, nothing saved; it cannot edit, run commands, start work or reach any session. Work reaches a session only through the paste the user sends. (ATOS-V2, 11:24–11:57: a copy committed, pushed and launched a build beside the real window.)
- [RULE] talk-working-sounds — subtle alternating dings from the moment the keys are released (and while the closing summary is written) until it speaks; a low-medium-high pattern while it runs tools; both stop when it speaks or the keys are pressed.
- [RULE] talk-no-preamble — no header, date, version, recap, or explanation of how talk works unless asked; "done" gets only "Okay".
- [RULE] talk-runs-the-installed-version — the start hook replaces a talk running an older version (6.2.14 shipped while 6.2.13 kept running).
- [RULE] talk-copy-never-restarts-talk — a copy runs the session-start hooks too; it carries a marker and talk's start hook does nothing there (6.2.18: the first copy after an upgrade restarted talk and dropped the answer).
- [RULE] talk-esc-stops-instantly — Esc while talk is speaking or answering ends every open conversation at once: no sound, no summary, no paste; the transcript ends "Outcome: stopped".
- [RULE] talk-copy-gets-voice-rules-only — a copy skips the per-prompt clock, Reader Contract and wrong-app check; the voice rules say they override CLAUDE.md reply formats; the date-and-version line is dropped in any spelling.
- [RULE] end-phrases-understood — "done" / "we're done" end and paste; "ignore" ends without pasting; a short closing-sounding remark is judged by Haiku with Claude's last reply (after a question, "that's good" means yes).

## What I confirmed with you

- The dictation app (WindowsVoiceTranscription) is the voice input, so speakers work without headphones.
- Hotkey Ctrl+Option+Space with its own start and stop sounds; Ctrl+Space stays as normal dictation.
- A quick press and release just stops the talking; the conversation stays open.
- Talk is always on — no command to start or stop it — and idle until you speak.
- One shared talk program, with transcripts kept apart per project and per session.
- "Pass it on" pastes the summary into the session as a prompt you send yourself, prefixed "Claude Voice Session:"; no extra hook.
- Voice: Kokoro by default, Google as an option.

## Why this shape

- **Objective:** a spoken back-and-forth with any session you are facing, that you can cut off, using the speakers, remembered across conversations.
- **Reuse:** the dictation app already captures, transcribes and pastes; the copy of the session comes from Claude Code's own `--fork-session`; the tab you face comes from tmux, which follows iTerm's tab (tested: switching to ATOS-V2 and back was seen within a second).
- **Simplicity:** one handoff file, two local requests (hush, say), one record per terminal. The paste reuses the dictation app's paste, so no hook is needed to reach the session.
- **Conflict:** a project's startup-only hooks (GSD-T's own repo runs a resume command on fresh sessions) never fire for a copy, because a copy is a resumed session.
- **Risk:** the local door is reachable by other programs on this Mac, so it takes the secret key from a file only you can read. A copy can edit files, like any session you run.
- **No fallback:** every failure (no session in the tab, bad key, voice down, Claude down) is spoken or shown red; words are never dropped or sent elsewhere.
- **Verified by:** tests that drive talk with real requests, a stub Claude and a fake voice; a live run against a real session.

## Where it lives

- `scripts/gsd-t-talk-register.js` — SessionStart hook: walks up to the `claude` process, records `{ sessionId, cwd, tty, claudePid }` in `~/.claude/gsd-t-talk/sessions/<tty>.json`, starts `bin/gsd-t-talk.cjs` detached (log `~/.claude/gsd-t-talk/talk.log`).
- `bin/gsd-t-talk.cjs` — the program; `gsd-t talk [status | stop]`.
- `bin/gsd-t-talk-kokoro.py` — the Kokoro voice worker (`uv run`), model in `~/.claude/gsd-t-voice/`.
- `bin/gsd-t.js` — `talk` subcommand; `installTalkRegister` (hook marker `gsd-t-talk-register`).
- Transcripts: `<project>/.gsd-t/talk/<YYYY-MM-DD-HHMM>-<session8>[-n].md` — `**You:**` / `**Claude:**` lines, then `## Summary` and `Outcome:`.

### The contract with the dictation app

```text
Handoff file: ~/.claude/.gsd-t-talk.json = { port, token, pid, startedAt }, mode 600
Header on every request: Authorization: Bearer <token>
POST /hush            → 200 { ok: true }                         (timeout 2 s)
POST /say { text }    → 200 { ok: true, queued: <bool> }          a question
                      → 200 { ok: true, ended: "pass", paste: "<text>" }   paste it into the focused window, no Enter
                      → 200 { ok: true, ended: "ignore" }
                      → 200 { ok: true, ended: "none" }            nothing was open
                      → 200 { ok: true, asked: "pass it on or ignore" }
                      → 409 { ok: false, reason }                 no session in the focused tab
                      → 200 { ok: true, ended: "stopped" }         Esc ended it while the summary was being written
                      → 401 / 400 / 404 / 500 { ok: false, reason }
POST /stop            → 200 { ok: true, stopped: <n> }            Esc: every conversation ends now, silently
POST /state           → 200 { ok: true, active: <bool>, open: <n> }  active = speaking or answering
  A /say that ends a conversation waits for the summary: allow 90 s and show "summarizing…" in the panel.
```
