import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as ssm from "aws-cdk-lib/aws-ssm";

export class NextCdkAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const featureBranch = false;
    const branchName = "main";
    const lambdaFnName = `NextjsFunction${branchName}`;
    const lambdaFn = new lambda.DockerImageFunction(this, lambdaFnName, {
      code: lambda.DockerImageCode.fromImageAsset(
        path.join(__dirname, "..", "next-app")
      ),
    });
    const fnUrl = lambdaFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });
    //split the func url as it throws an error
    const splitFunctionUrl = cdk.Fn.select(2, cdk.Fn.split("/", fnUrl.url));

    const myNextbucket = new s3.Bucket(this, "NextBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      accessControl: s3.BucketAccessControl.PRIVATE,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: true,
    });

    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      "CloudfrontAccess",
      {
        comment: `OriginAccessIdentity for ${myNextbucket.bucketName}`,
      }
    );

    myNextbucket.grantRead(originAccessIdentity);

    const deployment = new BucketDeployment(
      this,
      "NextPublicBucketDeployment",
      {
        destinationBucket: myNextbucket,
        sources: [
          Source.asset(path.join(__dirname, "..", "next-app", "public")),
        ],
        destinationKeyPrefix: `images`,
      }
    );
    new BucketDeployment(this, "NextStaticBucketDeployment", {
      destinationBucket: myNextbucket,
      sources: [
        Source.asset(path.join(__dirname, "..", "next-app", ".next", "static")),
      ],
      destinationKeyPrefix: `_next/static`,
    });
    // deployment.addSource(
    //   Source.asset(path.join(__dirname, "..", "next-app", ".next", "static"))
    // );

    const myNextbucketOrigin = new origins.S3Origin(myNextbucket);
    const viewerRequestFn = new cloudfront.experimental.EdgeFunction(
      this,
      "viewerRequestFn",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "viewerRequest.handler",
        code: lambda.Code.fromAsset(path.join(__dirname, "..", "edgelambda")),
      }
    );
     const originRequestFn = new cloudfront.experimental.EdgeFunction(
       this,
       "originRequesFunc",
       {
         runtime: lambda.Runtime.NODEJS_18_X,
         handler: "originRequest.handler",
         code: lambda.Code.fromAsset(path.join(__dirname, "..", "edgelambda")),
       }
     );
    if (branchName === "main") {
      //cloudfront distribution with multiple origins
      const cf = new cloudfront.Distribution(this, "myNextDist", {
        defaultBehavior: {
          origin: new origins.HttpOrigin(splitFunctionUrl),
          edgeLambdas: [
            {
              functionVersion: originRequestFn.currentVersion,
              eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
            },
            {
              functionVersion: viewerRequestFn.currentVersion,
              eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
            },
          ],
        },
        additionalBehaviors: {
          "/images/*": {
            origin: myNextbucketOrigin,
          },
          "/_next/static/*/*": {
            origin: myNextbucketOrigin,
          },
        },
      });
      const appName = "nxcdk";
      new ssm.StringParameter(this, "DistributionId", {
        parameterName: `/${appName}/distribution-id`,
        stringValue: cf.distributionId,
      });

      new ssm.StringParameter(this, "DistributionDomainName", {
        parameterName: `/${appName}/distribution-domain-name`,
        stringValue: cf.distributionDomainName,
      });
      new cdk.CfnOutput(this, "FunctionUrl", { value: fnUrl.url });
    }
  }
}
