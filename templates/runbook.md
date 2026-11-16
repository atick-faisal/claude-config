<!-- TEMPLATE — delete this block when instantiating.

     Copy to runbooks/<YYYY-MM-DD>-<TASK-ID>-<what-runs>.md in the research repo.
     Written by /runbook. runbooks/ is git-ignored, and a runbook is never
     deleted: it is the only record of exactly what was pasted on the server.

     A runbook is PowerShell the human pastes into the Windows GPU server over
     RDP, where only text crosses (guidelines/research.md). Every log the run
     writes comes back in one paste through the Bundle section.

     STEPS — one `## <N>. <step-title>` per step, numbered from 1. Each one:

       - names its log `logs\$D-$TASK-<what-ran>.txt`. The Bundle section
         gathers exactly the `.txt` and `.csv` files in logs\ named
         `<date>-$TASK-*`, so a file named any other way never comes back;
       - wraps its commands in `& { ... } 2>&1 | Tee-Object $log`. The block
         goes in as one paste and everything it prints, errors included,
         lands in the one log;
       - starts with `Write-Provenance -Command`, a function in the server's
         PowerShell profile that every existing runbook uses, and ends with
         the FINISHED line, which gives the record its wall clock;
       - copies a results CSV it wants back into
         `logs\$D-$TASK-<what-ran>.csv`, so the Bundle section carries it.

     Steps that run at once go in separate windows. Each window pastes step 0
     first, and the step says so.

     BUNDLE — copy the section verbatim. Its PowerShell writes the bundle
     format, and skills/log-experiment/unbundle.py reads it. That script's
     docstring is the spec, and `encode` in test_unbundle.py is the same
     writer in Python. Change all three together or none of them.

     Body placeholders after this block is deleted: <what-runs>, <TASK-ID>,
     <yyyy-mm-dd>, <server-repo-path>, <git-sha>, <order>, <run-variables>,
     <N>, <step-title>, <step-notes>, <what-ran>, <command>.
-->

# Runbook — <what-runs> (<TASK-ID>)

**Date:** <yyyy-mm-dd> · **Task:** <TASK-ID> · **Server repo:** `<server-repo-path>`
**Expect:** `git log -1 --oneline` shows `<git-sha>` or later

Paste the blocks into PowerShell on the server. If a window looks stalled, press Enter in it
first: the console can freeze until it gets a key.

**Order:** <order — which steps run one after another, which run at once in separate windows,
and roughly how long each takes. Bundle always runs last.>

---

## 0. Session setup — paste into every new window

On the Mac first: `git push`, so the server can pull `<git-sha>`.

```powershell
cd <server-repo-path>
git pull
git log -1 --oneline        # expect <git-sha> or later

$D    = Get-Date -Format yyyy-MM-dd
$TASK = '<TASK-ID>'
New-Item -ItemType Directory -Force logs | Out-Null
<run-variables — paths, seeds and devices the steps share. Omit the line when there are none.>
```

---

## <N>. <step-title>

<step-notes — what the step does, how long it takes, and what to do if it stops.>

```powershell
$log = "logs\$D-$TASK-<what-ran>.txt"
& {
    Write-Provenance -Command "<command>"
    <command>
    "=== FINISHED $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz') ==="
} 2>&1 | Tee-Object $log
```

---

## Bundle

Run this once every step has printed FINISHED, in any window where step 0 has been pasted. It
joins every dated `$TASK` log and CSV in `logs\` into one block of text, puts the block on the
clipboard, and saves a copy as `logs\$D-$TASK-bundle.txt`.

```powershell
& {
    if (-not $D -or -not $TASK) { throw 'Paste step 0 into this window first: $D and $TASK are not set.' }
    $logs  = (Get-Item logs).FullName   # .NET resolves relative paths against its own directory, not $PWD
    $files = @(Get-ChildItem $logs -File | Where-Object {
        $_.Name -like "????-??-??-$TASK-*" -and $_.Extension -in '.txt', '.csv' -and $_.Name -notlike '*-bundle.txt'
    } | Sort-Object Name)
    if (-not $files) { throw "No logs\????-??-??-$TASK-* files to bundle." }

    $token = [guid]::NewGuid().ToString('N')
    $sha   = [Security.Cryptography.SHA256]::Create()
    $out   = @("=== BUNDLE v1 $token files=$($files.Count) ===")
    foreach ($f in $files) {
        # ReadAllText honours a byte-order mark and reads UTF-8 otherwise. Get-Content on
        # PowerShell 5.1 would read a BOM-less UTF-8 CSV as ANSI, and Tee-Object there writes UTF-16.
        $text  = [IO.File]::ReadAllText($f.FullName).Replace("`r`n", "`n")
        $lines = $text.Length - $text.Replace("`n", '').Length
        $hash  = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text))).Replace('-', '').ToLowerInvariant()
        $out  += "--- BEGIN $token lines=$lines sha256=$hash $($f.Name) ---"
        $out  += $text
        $out  += "--- END $token ---"
        '{0,8} lines  {1}' -f $lines, $f.Name
    }
    $out   += "=== END BUNDLE $token ==="
    $bundle = ($out -join "`n") + "`n"

    [IO.File]::WriteAllText("$logs\$D-$TASK-bundle.txt", $bundle, [Text.UTF8Encoding]::new($false))
    Set-Clipboard -Value $bundle
    ''
    "Copied $($files.Count) files. On the Mac, from the repo root:"
    "  pbpaste > logs/$D-$TASK-bundle.txt"
    "then in Claude Code: /log-experiment logs/$D-$TASK-bundle.txt"
}
```

On the Mac, run the two lines it printed. `/log-experiment` checks every file against its line
count and checksum, writes them into `logs/`, and deletes the bundle file. If it refuses the
bundle, it keeps the file and says why. Copy the bundle again on the server and save it again:

```powershell
Set-Clipboard -Value ([IO.File]::ReadAllText((Get-Item "logs\$D-$TASK-bundle.txt").FullName))
```
