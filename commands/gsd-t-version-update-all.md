# GSD-T: Version Update All — Update GSD-T and All Registered Projects

You are updating the GSD-T package to the latest version from npm and applying it to the global installation and all registered projects.

## Step 1: Update the npm package

```bash
npm update -g @tekyzinc/gsd-t
```

## Step 2: Apply to global install and all projects

```bash
gsd-t update-all
```

## Step 3: Report

Show the user what version was installed, how many projects were updated, and confirm success.

If the update fails (e.g., permissions issue), suggest running with `sudo` on macOS/Linux or using an Administrator terminal on Windows.

$ARGUMENTS
