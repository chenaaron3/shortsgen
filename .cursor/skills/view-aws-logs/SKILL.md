---
name: view-aws-logs
description: View and tail CloudWatch logs for SST-deployed Lambdas. Use when debugging Lambda failures, inspecting WebSocket connect/disconnect, pipeline errors, or when the user asks to view AWS logs, CloudWatch logs, or Lambda logs.
---

# View AWS Logs (SST)

View CloudWatch logs for shortgen's SST-deployed Lambdas. Log group names include SST-generated suffixes that change between deploys.

## Quick Reference: Log Group Patterns

| Resource | Search pattern | Handler |
|----------|----------------|---------|
| WebSocket $connect | `ShortgenProgressApiRouteConnect` | `functions/ws-connect.handler` |
| WebSocket $disconnect | `ShortgenProgressApiRouteDisconnect` | `functions/ws-disconnect.handler` |
| WebSocket $default | `ShortgenProgressApiRouteDefault` | `functions/ws-default.handler` |
| Initial processing | `ShortgenInitialProcessing` | Python pipeline |
| Update feedback | `ShortgenUpdateFeedback` | Python pipeline |
| Finalize clip | `ShortgenFinalizeClip` | Python pipeline |
| API routes | `ShortgenApiRoute` | trigger-initial-processing, etc. |

## Commands

### List all shortgen log groups

```bash
aws logs describe-log-groups \
  --log-group-name-prefix /aws/lambda \
  --query 'logGroups[?contains(logGroupName, `Shortgen`) || contains(logGroupName, `ShortgenProgress`)].logGroupName' \
  --output text | tr '\t' '\n' | sort
```

### Tail a specific Lambda by pattern

```bash
# Replace PATTERN with e.g. ShortgenProgressApiRouteConnect, ShortgenUpdateFeedback
LOG_GROUP=$(aws logs describe-log-groups \
  --log-group-name-prefix /aws/lambda \
  --query "logGroups[?contains(logGroupName, 'PATTERN')].logGroupName | [0]" \
  --output text)
aws logs tail "$LOG_GROUP" --follow --format short
```

### Tail with time window (no follow)

```bash
aws logs tail /aws/lambda/LOG_GROUP_NAME --since 1h --format short
```

## Existing package.json scripts

- `pnpm logs:ws-connect` — tails WebSocket $connect handler logs

## Adding new log scripts

For frequently debugged Lambdas, add to `package.json`:

```json
"logs:LAMBDA_NAME": "aws logs tail $(aws logs describe-log-groups --log-group-name-prefix /aws/lambda --query \"logGroups[?contains(logGroupName, 'PATTERN')].logGroupName | [0]\" --output text) --follow --format short"
```

Replace `LAMBDA_NAME` and `PATTERN` (e.g. `update-feedback`, `ShortgenUpdateFeedback`).

## Helper script

```bash
.cursor/skills/view-aws-logs/scripts/logs.sh list           # list all shortgen log groups
.cursor/skills/view-aws-logs/scripts/logs.sh ws-connect     # tail WebSocket connect
.cursor/skills/view-aws-logs/scripts/logs.sh update-feedback
.cursor/skills/view-aws-logs/scripts/logs.sh finalize-clip
.cursor/skills/view-aws-logs/scripts/logs.sh initial-processing
```

## Region

Logs are in `us-east-1` (SST default). Add `--region us-east-1` if needed.
