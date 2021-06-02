const cdk = require("@aws-cdk/core");
const iam = require("@aws-cdk/aws-iam");
const cognito = require("@aws-cdk/aws-cognito");

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
  }
}

module.exports = { GpsTrackingStack };
