/// <reference path="./sst.config.d.ts" />

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

    const pythonGenerator = new sst.aws.Service("PythonGenerator", {
      cluster,
      image: {
        context: "./services/python-generator",
        dockerfile: "Dockerfile",
      },
    });

    return {
      cluster: cluster.name,
      service: pythonGenerator.name,
    };
  },
});
