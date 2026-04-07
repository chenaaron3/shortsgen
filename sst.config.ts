/// <reference path="./sst.config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "shortgen",
      home: "aws",
    };
  },
  async run() {
    // Private S3 bucket; CloudFront-only access for signed URL delivery
    const bucket = new sst.aws.Bucket("ShortgenAssets", {
      access: "cloudfront",
      cors: {
        allowOrigins: ["*"],
        // PUT: browser presigned uploads (e.g. brand avatar). GET/HEAD: CDN reads.
        allowMethods: ["GET", "HEAD", "PUT"],
        allowHeaders: ["*"],
      },
    });

    // CDN in front of bucket for cheap reads via presigned URLs
    const assetsRouter = new sst.aws.Router("ShortgenAssetsRouter");
    assetsRouter.routeBucket("/", bucket);

    // WebSocket runId -> connectionId mapping (1:1, overwrite on connect, TTL 1hr)
    const connectionsTable = new sst.aws.Dynamo("ShortgenConnections", {
      fields: {
        runId: "string",
        connectionId: "string",
      },
      primaryIndex: { hashKey: "runId" },
      globalIndexes: {
        ConnectionIdIndex: { hashKey: "connectionId" },
      },
      ttl: "ttl",
    });

    // WebSocket API for live progress updates
    const wsApi = new sst.aws.ApiGatewayWebSocket("ShortgenProgressApi");

    wsApi.route("$connect", {
      handler: "functions/ws-connect.handler",
      link: [connectionsTable],
      environment: {
        CONNECTIONS_TABLE_NAME: connectionsTable.name,
      },
    });
    wsApi.route("$disconnect", {
      handler: "functions/ws-disconnect.handler",
      link: [connectionsTable],
      environment: {
        CONNECTIONS_TABLE_NAME: connectionsTable.name,
      },
    });
    wsApi.route("$default", "functions/ws-default.handler");

    const databaseUrl = new sst.Secret("ShortgenDatabaseUrl");
    const apiSecret = new sst.Secret("ShortgenApiSecret");
    const openaiApiKey = new sst.Secret("ShortgenOpenaiApiKey");
    const replicateApiToken = new sst.Secret("ShortgenReplicateApiToken");
    const elevenlabsApiKey = new sst.Secret("ShortgenElevenlabsApiKey");
    const anthropicApiKey = new sst.Secret("ShortgenAnthropicApiKey");

    // Shared env for all Python Lambdas (from linked resources + API keys)
    const pythonEnv = {
      CONNECTIONS_TABLE_NAME: connectionsTable.name,
      WEBSOCKET_ENDPOINT: wsApi.managementEndpoint,
      BUCKET_NAME: bucket.name,
      SHORTGEN_CDN_URL: assetsRouter.url,
      DATABASE_URL: databaseUrl.value,
      OPENAI_API_KEY: openaiApiKey.value,
      REPLICATE_API_TOKEN: replicateApiToken.value,
      ELEVENLABS_API_KEY: elevenlabsApiKey.value,
      ANTHROPIC_API_KEY: anthropicApiKey.value,
      // Baked-in Whisper models from Docker build (no cold-start download)
      HF_HOME: "/var/task/whisper-models",
      HF_HUB_CACHE: "/var/task/whisper-models/hub",
      XDG_CACHE_HOME: "/var/task/whisper-models",
      // uv needs a writable cache dir; /var/task is read-only in Lambda
      UV_CACHE_DIR: "/tmp/uv-cache",
    };

    // Python pipeline Lambdas (container image, 15min timeout)
    // Note: container must be bool; object form { cache: false } causes ion parse error
    // dev: false = run in deployed container (not Live); avoids SST Python handler path bugs
    //
    // bundle = uv project root so Docker build context includes pyproject.toml + scripts/
    // at the context root (required by Dockerfile COPY). Handlers are relative to bundle.
    const pythonBase = {
      runtime: "python3.12" as const,
      timeout: "15 minutes",
      memory: "3008 MB",
      bundle: "./services/python-generator",
      python: { container: true } as const,
      dev: false,
      environment: pythonEnv,
    };

    // For container images, SST derives imageConfig.commands from the handler path; we
    // override to handlers.<module>.handler. PYTHONPATH=generation/scripts matches COPY layout.
    const initialProcessing = new sst.aws.Function(
      "ShortgenInitialProcessing",
      {
        ...pythonBase,
        handler: "scripts/handlers/initial_processing.handler",
        link: [
          connectionsTable,
          bucket,
          wsApi,
          databaseUrl,
          openaiApiKey,
          replicateApiToken,
          elevenlabsApiKey,
          anthropicApiKey,
        ],
        transform: {
          function: (args) => {
            if (args.imageConfig != null) {
              args.imageConfig = {
                ...args.imageConfig,
                commands: ["handlers.initial_processing.handler"],
              };
            }
          },
        },
      },
    );

    const updateImagery = new sst.aws.Function("ShortgenUpdateImagery", {
      ...pythonBase,
      handler: "scripts/handlers/update_imagery.handler",
      link: [
        connectionsTable,
        bucket,
        wsApi,
        databaseUrl,
        openaiApiKey,
        replicateApiToken,
        elevenlabsApiKey,
        anthropicApiKey,
      ],
      transform: {
        function: (args) => {
          if (args.imageConfig != null) {
            args.imageConfig = {
              ...args.imageConfig,
              commands: ["handlers.update_imagery.handler"],
            };
          }
        },
      },
    });

    const updateFeedback = new sst.aws.Function("ShortgenUpdateFeedback", {
      ...pythonBase,
      handler: "scripts/handlers/update_feedback.handler",
      link: [
        connectionsTable,
        wsApi,
        databaseUrl,
        openaiApiKey,
        replicateApiToken,
        elevenlabsApiKey,
        anthropicApiKey,
      ],
      transform: {
        function: (args) => {
          if (args.imageConfig != null) {
            args.imageConfig = {
              ...args.imageConfig,
              commands: ["handlers.update_feedback.handler"],
            };
          }
        },
      },
    });

    const finalizeClip = new sst.aws.Function("ShortgenFinalizeClip", {
      ...pythonBase,
      handler: "scripts/handlers/finalize_clip.handler",
      link: [
        connectionsTable,
        bucket,
        wsApi,
        databaseUrl,
        openaiApiKey,
        replicateApiToken,
        elevenlabsApiKey,
        anthropicApiKey,
      ],
      transform: {
        function: (args) => {
          if (args.imageConfig != null) {
            args.imageConfig = {
              ...args.imageConfig,
              commands: ["handlers.finalize_clip.handler"],
            };
          }
        },
      },
    });

    // ECR lifecycle policy: expire untagged images after 1 day (build artifacts); keep all tagged (Lambdas need them)
    const ecrLifecyclePolicy = JSON.stringify({
      rules: [
        {
          rulePriority: 1,
          description: "Expire untagged images older than 1 day",
          selection: {
            tagStatus: "untagged",
            countType: "sinceImagePushed",
            countUnit: "days",
            countNumber: 1,
          },
          action: { type: "expire" },
        },
      ],
    });
    new aws.ecr.LifecyclePolicy("ShortgenEcrLifecycle", {
      repository: "sst-asset",
      policy: ecrLifecyclePolicy,
    });

    const finalizeAllStateMachine = new sst.aws.StepFunctions(
      "ShortgenFinalizeAllStateMachine",
      {
        definition: (() => {
          const finalizeClipInvoke = sst.aws.StepFunctions.lambdaInvoke({
            name: "FinalizeClip",
            function: finalizeClip,
            // Pipe Map iteration input (runId, videoId) to Lambda; without this, Lambda receives empty event
            payload: "{% $states.input %}",
          });
          const done = sst.aws.StepFunctions.succeed({ name: "Done" });
          const map = sst.aws.StepFunctions.map({
            name: "FinalizeAllVideos",
            processor: finalizeClipInvoke,
            items: "{% $states.input.items %}",
          });
          return map.next(done);
        })(),
      },
    );

    // Trigger API: Next.js tRPC server only (protected by shared secret). Node Lambdas invoke Python Lambdas.
    const api = new sst.aws.ApiGatewayV2("ShortgenApi", {
      accessLog: { retention: "1 month" },
      transform: {
        stage: (args) => {
          // Include authorizer/integration error vars for debugging 500s
          if (args.accessLogSettings) {
            args.accessLogSettings.format =
              '{"requestTime":"$context.requestTime","requestId":"$context.requestId","httpMethod":"$context.httpMethod","path":"$context.path","routeKey":"$context.routeKey","status":"$context.status","responseLatency":"$context.responseLatency","integrationRequestId":"$context.integration.requestId","integrationStatus":"$context.integration.status","integrationLatency":"$context.integration.latency","authorizerError":"$context.authorizer.error","integrationError":"$context.integrationErrorMessage"}';
          }
        },
      },
      link: [
        initialProcessing,
        updateImagery,
        updateFeedback,
        finalizeClip,
        finalizeAllStateMachine,
        connectionsTable,
        bucket,
        wsApi,
        databaseUrl,
        apiSecret,
      ],
    });

    api.route(
      "POST /runs/initial-processing",
      "functions/trigger-initial-processing.handler",
      {
        link: [initialProcessing, apiSecret],
      },
    );
    api.route(
      "POST /runs/update-feedback",
      "functions/trigger-update-feedback.handler",
      {
        link: [updateFeedback, apiSecret],
      },
    );
    api.route(
      "POST /runs/update-imagery",
      "functions/trigger-update-imagery.handler",
      {
        link: [updateImagery, apiSecret],
      },
    );
    api.route(
      "POST /runs/finalize-all",
      "functions/trigger-finalize-all.handler",
      {
        link: [finalizeAllStateMachine, apiSecret],
      },
    );

    return {
      apiUrl: api.url,
      bucket: bucket.name,
      assetsCdnUrl: assetsRouter.url,
      wsUrl: wsApi.url,
      wsManagementEndpoint: wsApi.managementEndpoint,
      connectionsTable: connectionsTable.name,
      initialProcessing,
      updateFeedback,
      finalizeClip,
    };
  },
});
