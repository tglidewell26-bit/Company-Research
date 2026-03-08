#!/usr/bin/env bash

set -e

export NODE_ENV=production
export NODE_OPTIONS="--max-old-space-size=4096"

INNGEST_CONFIG=".config/inngest/inngest.yaml"

if [[ ! -f "${INNGEST_CONFIG}" ]]; then
    mkdir -p "$(dirname "${INNGEST_CONFIG}")"
    if [[ -n "${DATABASE_URL}" ]]; then
        printf 'postgres-uri: "%s"' "${DATABASE_URL}" > "${INNGEST_CONFIG}"
    else
        printf 'sqlite-dir: "/home/runner/workspace/.local/share/inngest"' > "${INNGEST_CONFIG}"
    fi
fi

inngest-cli dev -u http://localhost:5000/api/inngest --host 127.0.0.1 --port 3000 --config "${INNGEST_CONFIG}" &

exec node .mastra/output/index.mjs
