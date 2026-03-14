#!/usr/bin/env bash
# Tail CloudWatch logs for SST Lambdas. Usage:
#   ./logs.sh ws-connect          # tail WebSocket connect
#   ./logs.sh update-feedback     # tail update feedback Lambda
#   ./logs.sh list                # list all shortgen log groups

set -e
PREFIX="/aws/lambda"

case "${1:-list}" in
  list)
    aws logs describe-log-groups \
      --log-group-name-prefix "$PREFIX" \
      --query 'logGroups[?contains(logGroupName, `Shortgen`) || contains(logGroupName, `ShortgenProgress`)].logGroupName' \
      --output text | tr '\t' '\n' | sort
    ;;
  ws-connect|connect)
    PATTERN="ShortgenProgressApiRouteConnect"
    ;;
  ws-disconnect|disconnect)
    PATTERN="ShortgenProgressApiRouteDisconnect"
    ;;
  initial-processing|initial)
    PATTERN="ShortgenInitialProcessing"
    ;;
  update-feedback|feedback)
    PATTERN="ShortgenUpdateFeedback"
    ;;
  finalize-clip|finalize)
    PATTERN="ShortgenFinalizeClip"
    ;;
  *)
    echo "Usage: $0 {list|ws-connect|update-feedback|finalize-clip|initial-processing}" >&2
    exit 1
    ;;
esac

if [[ -n "${PATTERN:-}" ]]; then
  LOG_GROUP=$(aws logs describe-log-groups \
    --log-group-name-prefix "$PREFIX" \
    --query "logGroups[?contains(logGroupName, '$PATTERN')].logGroupName | [0]" \
    --output text)
  if [[ -z "$LOG_GROUP" || "$LOG_GROUP" == "None" ]]; then
    echo "No log group found for pattern: $PATTERN" >&2
    exit 1
  fi
  exec aws logs tail "$LOG_GROUP" --follow --format short
fi
