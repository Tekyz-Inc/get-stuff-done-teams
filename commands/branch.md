# Create a New Branch

Create and switch to a new branch.

## Instructions

1. Ask the user for the branch name if not provided as an argument: $ARGUMENTS
2. Run `git status` to check for uncommitted changes - warn if any exist
3. Run `git fetch origin` to ensure we have latest remote state
4. Create and switch to the new branch from main: `git checkout -b <branch-name> origin/main`
5. Confirm the new branch was created and is now active
