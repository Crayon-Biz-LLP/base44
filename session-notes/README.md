# Session Notes

Each work session appends a dated markdown file here. The file names follow
the pattern:

```
NN-descriptive-slug.md
```

where `NN` is a sequential number (11, 12, 13…) and the slug is a short
hyphenated description.

## Convention

- **Header:** `# Session NN — Title` + date.
- **Body:** bullet points of what was done, decisions made, bugs fixed, and
  anything the next session should know.
- **Anchor:** after each session, update the "Session Anchored Summary" in
  `AGENTS.md` with a one-line summary + link to this file. When the anchor
  grows past 3 entries, drop the oldest.

## Why this exists

AGENTS.md is the agent's immediate context. It should stay small and current.
Full session-by-session history lives here. The anchor in AGENTS.md gives the
agent a fast scan of recent history; this folder gives full traceability.