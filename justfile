default:
    @just --list --unsorted

# Run every check. THE entrypoint after implementing a feature.
verify:
    #!/usr/bin/env bash
    failed=()
    for check in shell python json tracked; do
        just "$check" || failed+=("$check")
    done
    if (( ${#failed[@]} )); then
        printf '\nFAILED: %s\n' "${failed[*]}"
        exit 1
    fi
    printf '\nAll checks passed.\n'

# Hook shell scripts are clean under shellcheck. Ignored scripts (e.g. herdr's) are
# skipped: they are not ours to fix.
shell:
    git ls-files -z --cached --others --exclude-standard -- ':(glob)hooks/*.sh' | xargs -0 shellcheck

# Hook Python parses. There is no test suite — this catches a broken edit, nothing more.
python:
    python3 -c 'import ast,sys; [ast.parse(open(f).read(), f) for f in sys.argv[1:]]' hooks/*.py

# Every JSON Claude Code reads at startup parses. A broken settings.json fails silently.
json:
    jq -e . settings.json plugins/installed_plugins.json > /dev/null

# No hand-authored file is invisible to git. .gitignore is an allowlist, so a new file
# under these directories is silently untracked until it gets a ! line.
tracked:
    #!/usr/bin/env bash
    stray=$(git ls-files --others --ignored --exclude-standard -- \
        agents commands guidelines hooks skills templates \
        | grep -Ev '^hooks/state/|^hooks/herdr-agent-state\.sh$|^skills/(\.trash|synced)/|(^|/)\.DS_Store$') || true
    if [[ -n "$stray" ]]; then
        echo "Ignored but hand-authored — add a ! line to .gitignore:"
        echo "$stray"
        exit 1
    fi
