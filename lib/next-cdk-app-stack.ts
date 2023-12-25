import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";

export class NextCdkAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const lambdaFn = new lambda.DockerImageFunction(this, "NextjsFunction", {
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

    //cloudfront distribution with multiple origins
    const cf = new cloudfront.Distribution(this, "myDist", {
      defaultBehavior: { origin: new origins.HttpOrigin(splitFunctionUrl) },
      additionalBehaviors: {
        "/images/*": {
          origin: myNextbucketOrigin,
        },
        "/_next/static/*/*": {
          origin: myNextbucketOrigin,
        },
      },
    });
  }
}
