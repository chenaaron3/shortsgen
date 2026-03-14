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
    });

    // WebSocket runId -> connectionId mapping (TTL 1hr)
    const connectionsTable = new sst.aws.Dynamo("ShortgenConnections", {
      fields: {
        runId: "string",
        connectionId: "string",
      },
      primaryIndex: { hashKey: "runId", rangeKey: "connectionId" },
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
    wsApi.route("$disconnect", "functions/ws-disconnect.handler", {
      link: [connectionsTable],
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
      DATABASE_URL: databaseUrl.value,
      OPENAI_API_KEY: openaiApiKey.value,
      REPLICATE_API_TOKEN: replicateApiToken.value,
      ELEVENLABS_API_KEY: elevenlabsApiKey.value,
      ANTHROPIC_API_KEY: anthropicApiKey.value,
    };

    // Python pipeline Lambdas (container image, 15min timeout)
    const pythonBase = {
      runtime: "python3.12" as const,
      timeout: "15 minutes",
      memory: "3008 MB",
      python: { container: true } as const,
      environment: pythonEnv,
    };

    // Handler path is used by SST to find the file. For container images, SST sets
    // imageConfig.commands from the handler path (services.python-generator...), but
    // the Dockerfile uses PYTHONPATH=generation/scripts so the correct module is
    // handlers.initial_processing. Override imageConfig to fix the import path.
    const initialProcessing = new sst.aws.Function(
      "ShortgenInitialProcessing",
      {
        ...pythonBase,
        handler:
          "./services/python-generator/scripts/handlers/initial_processing.handler",
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
            args.imageConfig = {
              ...(args.imageConfig ?? {}),
              commands: ["handlers.initial_processing.handler"],
            };
          },
        },
      },
    );

    const updateFeedback = new sst.aws.Function("ShortgenUpdateFeedback", {
      ...pythonBase,
      handler:
        "./services/python-generator/scripts/handlers/update_feedback.handler",
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
          args.imageConfig = {
            ...(args.imageConfig ?? {}),
            commands: ["handlers.update_feedback.handler"],
          };
        },
      },
    });

    const finalizeClip = new sst.aws.Function("ShortgenFinalizeClip", {
      ...pythonBase,
      handler:
        "./services/python-generator/scripts/handlers/finalize_clip.handler",
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
          args.imageConfig = {
            ...(args.imageConfig ?? {}),
            commands: ["handlers.finalize_clip.handler"],
          };
        },
      },
    });

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
        updateFeedback,
        finalizeClip,
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
      "POST /runs/finalize-clip",
      "functions/trigger-finalize-clip.handler",
      {
        link: [finalizeClip, apiSecret],
      },
    );

    return {
      apiUrl: api.url,
      bucket: bucket.name,
      wsUrl: wsApi.url,
      wsManagementEndpoint: wsApi.managementEndpoint,
      connectionsTable: connectionsTable.name,
      initialProcessing,
      updateFeedback,
      finalizeClip,
    };
  },
});
