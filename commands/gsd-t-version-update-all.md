# GSD-T: Version Update All — Update GSD-T and All Registered Projects

You are updating the GSD-T package to the latest version from npm and applying it to the global installation and all registered projects.

## Step 1: Update

`gsd-t update` installs the latest release from npm, then updates the global install and every registered project. It halts if npm fails.

```bash
gsd-t update
```

## Step 2: Report

Show the user what version was installed, how many projects were updated, and confirm success.

If the update fails (e.g., permissions issue), suggest running with `sudo` on macOS/Linux or using an Administrator terminal on Windows.

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
