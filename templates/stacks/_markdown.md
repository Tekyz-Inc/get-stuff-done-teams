# Markdown Table Standards (Universal — All Projects)

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## Emoji Padding in Markdown Tables

Emoji display as 2 characters wide in terminal/monospace but count as 1 in string length. This causes misaligned columns. **Always add one extra space after emoji in table cells** to compensate:

```
WRONG — misaligned in terminal:
| Channel  | Support |
|----------|---------|
| Discord  | ✅ |
| LINE     | ❌ |

RIGHT — one extra space after emoji:
| Channel  | Support |
|----------|---------|
| Discord  | ✅  |
| LINE     | ❌  |
```

This extra space is invisible in rendered HTML (GitHub, VS Code preview) but restores alignment in terminal views. Apply to all GSD-T-generated docs that use emoji in tables.

Also pad all cell values in a column to the width of the widest value:
```
| iMessage (BlueBubbles) | ✅  |
| Discord                | ✅  |
| QQ                     | ❌  |
```
