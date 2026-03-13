/// <reference path="./sst.config.d.ts" />

import { interpolate } from "@pulumi/pulumi";

export default $config({
  app(input) {
    return {
      name: "shortgen",
      home: "aws",
    };
  },
  async run() {
    const vpc = new sst.aws.Vpc("ShortgenVpc");
    const cluster = new sst.aws.Cluster("ShortgenCluster", { vpc });

    // Private S3 bucket; CloudFront-only access for signed URL delivery
    const bucket = new sst.aws.Bucket("ShortgenAssets", {
      access: "cloudfront",
    });

    // WebSocket connection token -> connectionId mapping (TTL 1hr)
    const connectionsTable = new sst.aws.Dynamo("ShortgenConnections", {
      fields: {
        token: "string",
        connectionId: "string",
        ttl: "number",
      },
      primaryIndex: { hashKey: "token" },
      ttl: "ttl",
    });

    // WebSocket API for live progress updates
    const wsApi = new sst.aws.ApiGatewayWebSocket("ShortgenProgressApi");

    wsApi.route("$connect", "functions/ws-connect.handler", {
      link: [connectionsTable],
    });
    wsApi.route("$disconnect", "functions/ws-disconnect.handler", {
      link: [connectionsTable],
    });
    wsApi.route("$default", "functions/ws-default.handler");

    // Python pipeline Task (on-demand); env passed at runtime by trigger
    const databaseUrl = new sst.Secret("ShortgenDatabaseUrl");
    const generatorTask = new sst.aws.Task("ShortgenGenerator", {
      cluster,
      image: {
        context: "./services/python-generator",
        dockerfile: "Dockerfile",
      },
      link: [bucket, wsApi],
    });

    // Trigger API: Next.js creates Run, then calls this; Lambda runs the Task
    const api = new sst.aws.ApiGatewayV2("ShortgenApi", {
      link: [generatorTask, connectionsTable, bucket, wsApi, databaseUrl],
      routes: {
        "POST /runs/trigger": "functions/trigger-run.handler",
      },
    });

    return {
      triggerUrl: interpolate`${api.url}runs/trigger`,
      cluster: cluster.name,
      service: new sst.aws.Service("PythonGenerator", {
        cluster,
        image: {
          context: "./services/python-generator",
          dockerfile: "Dockerfile",
        },
      }).name,
      bucket: bucket.name,
      wsUrl: wsApi.url,
      wsManagementEndpoint: wsApi.managementEndpoint,
      generatorTask: generatorTask.name,
      connectionsTable: connectionsTable.name,
    };
  },
});
