# Remotion Lambda Setup

Cloud rendering for the Export flow. Follow these steps once to deploy Remotion Lambda.

## Prerequisites

- AWS CLI configured with credentials
- Node.js and pnpm

## 1. Install @remotion/lambda

```bash
cd apps/remotion
pnpm add @remotion/lambda
```

## 2. Create IAM role and user (one-time)

Follow the [Remotion Lambda setup guide](https://remotion.dev/docs/lambda/setup) steps 2–6:

1. **Role policy**: Run `npx remotion lambda policies role` and create a policy named `remotion-lambda-policy`
2. **Role**: Create role `remotion-lambda-role` with that policy, use case: Lambda
3. **User**: Create user `remotion-user` (no console access)
4. **Access key**: Create access key for the user
5. **User policy**: Run `npx remotion lambda policies user` and add as inline policy to the user

Add credentials to `.env` at project root:

```
REMOTION_AWS_ACCESS_KEY_ID=<Access key ID>
REMOTION_AWS_SECRET_ACCESS_KEY=<Secret access key>
```

## 3. Extend role for Shortgen bucket

Remotion Lambda writes rendered videos to the Shortgen S3 bucket. Add an inline policy to `remotion-lambda-role`:

1. IAM → Roles → `remotion-lambda-role` → Add inline policy → JSON
2. Replace `YOUR_BUCKET_NAME` with your bucket (e.g. from `SHORTGEN_BUCKET_NAME` in .env):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:PutObjectAcl", "s3:GetObject"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    }
  ]
}
```

## 4. Deploy function

```bash
cd apps/remotion
npx remotion lambda functions deploy --region=us-east-1
```

Note the function name (e.g. `remotion-render-xxxxx`). Add to `.env`:

```
REMOTION_LAMBDA_FUNCTION_NAME=remotion-render-xxxxx
REMOTION_LAMBDA_REGION=us-east-1
```

## 5. Deploy site

```bash
cd apps/remotion
npx remotion lambda sites create src/index.ts --site-name=shortgen --region=us-east-1
```

Note the serve URL (e.g. `https://remotionlambda-xxx.s3.us-east-1.amazonaws.com/sites/xxx`). Add to `.env`:

```
REMOTION_LAMBDA_SERVE_URL=https://remotionlambda-xxx.s3.us-east-1.amazonaws.com/sites/xxx
```

## 6. Webhook URL and secret

The webhook must be reachable from AWS. For production, use your deployed app URL:

```
REMOTION_WEBHOOK_URL=https://your-app.vercel.app/api/webhooks/remotion
REMOTION_WEBHOOK_SECRET=<generate a random string, e.g. openssl rand -hex 32>
```

For local dev, use [tunnelmole](https://tunnelmole.com) or [ngrok](https://ngrok.com) to expose your local server.

## 7. Validate

```bash
npx remotion lambda policies validate
```

## Redeploying

After changing Remotion code:

```bash
cd apps/remotion
npx remotion lambda sites create src/index.ts --site-name=shortgen --region=us-east-1
```

Update `REMOTION_LAMBDA_SERVE_URL` in .env if the URL changes.

## Background music (S3)

Background music is loaded from the Shortgen bucket at `assets/background_music.mp3`. Upload once:

```bash
aws s3 cp public/background_music.mp3 s3://YOUR_BUCKET_NAME/assets/background_music.mp3 --acl bucket-owner-full-control
```

Replace `YOUR_BUCKET_NAME` with `SHORTGEN_BUCKET_NAME` from .env. The CDN serves it at `{SHORTGEN_CDN_URL}/assets/background_music.mp3`.
