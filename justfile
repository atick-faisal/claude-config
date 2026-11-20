default:
    @just --list --unsorted

# Run every check. THE entrypoint after implementing a feature.
verify:
    #!/usr/bin/env bash
    failed=()
    for check in shell python json tracked test node; do
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

# Every Python file in hooks/ and skills/ parses. Ignored stores (skills/synced/, skills/.trash/)
# are skipped: they are not ours to fix.
python:
    git ls-files -z --cached --others --exclude-standard -- ':(glob)hooks/*.py' ':(glob)skills/**/*.py' \
        | xargs -0 python3 -c 'import ast,sys; [ast.parse(open(f).read(), f) for f in sys.argv[1:]]'

# The log unbundler's tests. -B because .gitignore's !skills/** would surface __pycache__/
# as untracked files.
test:
    python3 -B -m unittest discover -s skills/log-experiment

# The deck scaffold's JS parses and its build tests pass. Only build.test.js is named:
# the scaffold's Playwright tests need a deck's node_modules and run in the deck's own verify.
node:
    git ls-files -z --cached --others --exclude-standard -- ':(glob)templates/deck/**/*.js' | xargs -0 -n1 node --check
    node --test templates/deck/test/build.test.js

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
