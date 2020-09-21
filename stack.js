const cdk = require("@aws-cdk/core");
const iam = require("@aws-cdk/aws-iam");
const s3 = require("@aws-cdk/aws-s3");
const iot = require("@aws-cdk/aws-iot");
const ddb = require("@aws-cdk/aws-dynamodb");
const apig = require("@aws-cdk/aws-apigateway");
const cognito = require("@aws-cdk/aws-cognito");
const lambda = require("@aws-cdk/aws-lambda");
const kinesis = require("@aws-cdk/aws-kinesis");
const firehose = require("@aws-cdk/aws-kinesisfirehose");
const events = require("@aws-cdk/aws-lambda-event-sources");

class GpsTrackingStack extends cdk.Stack {

  constructor(scope, id, props) {
    super(scope, id, props);

    console.log("STACK:", props.stack);
    console.log("STAGE:", props.stage);

    // #region Identity

    this.iotIdentityPool = new cognito.CfnIdentityPool(this, "IotIdentityPool", {
      allowUnauthenticatedIdentities: true,
    });

    this.iotAuthenticatedRole = new iam.Role(this, "IotAuthenticatedRole", {
      assumedBy: new iam.FederatedPrincipal("cognito-identity.amazonaws.com", {
        "StringEquals": { "cognito-identity.amazonaws.com:aud": this.iotIdentityPool.ref },
        "ForAnyValue:StringLike": { "cognito-identity.amazonaws.com:amr": "authenticated" },
      }, "sts:AssumeRoleWithWebIdentity"),
      inlinePolicies: {
        root: new iam.PolicyDocument({
          statements: [new iam.PolicyStatement({
            effect: "Allow",
            actions: ["iot:*"],
            resources: ["*"],
          })],
        })
      }
    });

    this.iotUnauthenticatedRole = new iam.Role(this, "IotUnauthenticatedRole", {
      assumedBy: new iam.FederatedPrincipal("cognito-identity.amazonaws.com", {
        "StringEquals": { "cognito-identity.amazonaws.com:aud": this.iotIdentityPool.ref },
        "ForAnyValue:StringLike": { "cognito-identity.amazonaws.com:amr": "unauthenticated" },
      }, "sts:AssumeRoleWithWebIdentity"),
      inlinePolicies: {
        root: new iam.PolicyDocument({
          statements: [new iam.PolicyStatement({
            effect: "Allow",
            actions: ["*"],
            resources: ["*"],
          })],
        })
      }
    });

    this.roleAttachment = new cognito.CfnIdentityPoolRoleAttachment(this, "IotIdentityPoolRoleAttachment", {
      identityPoolId: this.iotIdentityPool.ref,
      roles: {
        authenticated: this.iotAuthenticatedRole.roleArn,
        unauthenticated: this.iotUnauthenticatedRole.roleArn,
      },
    });

    // #endregion

    // #region Database + API

    this.assetsTable = new ddb.Table(this, "AssetsTable", {
      tableName: `${props.stack}-assets-${props.stage}`,
      partitionKey: { name: "id", type: "N" },
      timeToLiveAttribute: "expiration",
      billingMode: "PAY_PER_REQUEST",
    });

    this.getAllAssetsLambda = new lambda.Function(this, "GetAllAssets", {
      code: new lambda.AssetCode("src/backend"),
      handler: "api.getAll",
      runtime: lambda.Runtime.NODEJS_12_X,
      environment: {
        ASSETS_TABLE: this.assetsTable.tableName,
      },
    });

    this.assetsTable.grantReadWriteData(this.getAllAssetsLambda);

    this.api = new apig.LambdaRestApi(this, "RestApi", {
      restApiName: `${props.stack}-api-${props.stage}`,
      endpointExportName: "restApiBaseUrl",
      handler: this.getAllAssetsLambda,
      proxy: false,
      defaultCorsPreflightOptions: {
        allowOrigins: ["*"],
        allowMethods: ["GET", "PUT", "POST", "PATCH", "DELETE", "OPTIONS", "HEAD"],
        allowHeaders: ["Content-Type", "Authorization", "X-Api-Key", "X-Amz-Date", "X-Requested-With"],
      },
    });

    this.endpoint = this.api.root.addMethod("GET", new apig.LambdaIntegration(this.getAllAssetsLambda), { });

    // #endregion

    // #region Delivery Stream

    this.dataBucket = new s3.Bucket(this, "DataBucket", {});

    this.ingesterFirehoseRole = new iam.Role(this, "IngesterFirehoseRole", {
      assumedBy: new iam.ServicePrincipal("firehose.amazonaws.com"),
    });

    this.dataBucket.grantReadWrite(this.ingesterFirehoseRole);

    this.ingesterFirehose = new firehose.CfnDeliveryStream(this, "IngesterFirehose", {
      extendedS3DestinationConfiguration: {
        bucketArn: this.dataBucket.bucketArn,
        roleArn: this.ingesterFirehoseRole.roleArn,
        bufferingHints: {
          intervalInSeconds: 120,
          sizeInMBs: 5,
        }
      }
    });

    // #endregion

    // #region Ingester Stream

    this.ingestStream = new kinesis.Stream(this, "IngestStream", {
      shardCount: 1,
      retentionPeriod: cdk.Duration.hours(72),
    });

    this.ingestRole = new iam.Role(this, "IngestRole", {
      assumedBy: new iam.ServicePrincipal("iot.amazonaws.com"),
    });

    this.ingestStream.grantReadWrite(this.ingestRole);

    this.iotTopicRule = new iot.CfnTopicRule(this, "IotTopicRule", {
      ruleName: "asset_ingest_topic_rule",
      topicRulePayload: {
        sql: "SELECT * FROM 'asset/ingest'",
        awsIotSqlVersion: "2016-03-23",
        ruleDisabled: false,
        actions: [{
          kinesis: {
            streamName: this.ingestStream.streamName,
            roleArn: this.ingestRole.roleArn,
            partitionKey: "id",
          },
        }],
      }
    });

    this.ingestLambdaEvent = new events.KinesisEventSource(this.ingestStream, {
      batchSize: 25,
      startingPosition: "LATEST",
    });

    this.ingestLambda = new lambda.Function(this, "IngestAssetData", {
      code: new lambda.AssetCode("src/backend"),
      handler: "ingest.handler",
      runtime: lambda.Runtime.NODEJS_12_X,
      environment: {
        ASSETS_TABLE: this.assetsTable.tableName,
        DELIVERY_STREAM: this.ingesterFirehose.ref,
      },
    });

    this.ingestLambda.addEventSource(this.ingestLambdaEvent);
    this.assetsTable.grantReadWriteData(this.ingestLambda);

    this.ingestLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: "Allow",
      actions: ["firehose:*"],
      resources: ["*"],
    }));

    // #endregion

    // #region Write outputs

    new cdk.CfnOutput(this, "IotIdentityPoolId", {
      exportName: "iotIdentityPoolId",
      value: this.iotIdentityPool.ref,
    });

    // #endregion
  }
}

module.exports = { GpsTrackingStack };
