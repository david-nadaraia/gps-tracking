#!/usr/bin/env node

require("dotenv").config();

const cdk = require("@aws-cdk/core");
const { GpsTrackingStack } = require("./stack");

const stack = "gps-tracking";
const stage = "dev";

const app = new cdk.App();
new GpsTrackingStack(app, `${stack}-${stage}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  stack,
  stage,
});
