#!/usr/bin/env bash
set -euo pipefail

IMAGE_TAG="${IMAGE_TAG:-companies-sh-smoke}"

docker build -f Dockerfile.smoke -t "$IMAGE_TAG" .
docker run --rm "$IMAGE_TAG"
