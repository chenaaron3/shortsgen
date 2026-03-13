/* Augment SST Resource with linked resources. Generated types when running `sst dev`. */

declare module "sst" {
  export interface Resource {
    ShortgenConnections: {
      type: "sst.aws.Dynamo";
      name: string;
    };
    ShortgenGenerator: {
      type: "sst.aws.Task";
      cluster: string;
      taskDefinition: string;
      subnets: string[];
      securityGroups: string[];
      assignPublicIp: boolean;
      containers: string[];
    };
    ShortgenAssets: {
      type: "sst.aws.Bucket";
      name: string;
    };
    ShortgenProgressApi: {
      type: "sst.aws.ApiGatewayWebSocket";
      managementEndpoint: string;
    };
  }
}

import "sst";
export {};
