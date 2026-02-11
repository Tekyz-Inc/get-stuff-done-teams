# Check in updated files to GitHub

Automatically stage, commit, and push all updated files to GitHub with automatic version bumping.

## Instructions

1. Run `git status` to see what files have changed
2. If there are no changes, inform the user and stop
3. Run `git diff` to review the changes
4. Run the **Pre-Commit Gate** checklist from CLAUDE.md — update any docs before proceeding

### Version Bump (Automatic)

5. Determine the version bump type from the nature of the changes:
   - **patch** (default): Bug fixes, doc updates, refactors, minor improvements, cleanup
   - **minor**: New features, new commands, new capabilities
   - **major**: Breaking changes, major rework, incompatible API changes
6. Read the current version from `package.json`
7. Bump the version according to the determined type (e.g., `2.3.0` → `2.3.1` for patch)
8. Update the version in `package.json`
9. If `.gsd-t/progress.md` exists, check for a `## Version` line and update it (or add one after the `## Date` line)

### Release Notes

10. If `CHANGELOG.md` exists in the project root, prepend an entry for this version:
    - Use the format: `## [X.Y.Z] - YYYY-MM-DD` followed by `### Added`, `### Changed`, `### Fixed`, or `### Removed` subsections as appropriate
    - Summarize the changes in 1-3 bullet points per subsection
    - Place the new entry directly after the file header (before any existing version entries)

### Commit and Push

11. Stage all changes (including the version bump and changelog) with `git add -A`
12. Create a commit with a descriptive message summarizing the changes. Include `(vX.Y.Z)` at the end of the first line. Example: `fix: resolve branch guard edge case (v2.3.1)`
13. Push to origin with `git push`
14. Confirm success to the user, including the old → new version

Use the standard commit message format with Co-Authored-By line.
