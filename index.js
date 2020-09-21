#!/usr/bin/env node

const cdk = require("@aws-cdk/core");
const { GpsTrackingStack } = require("./stack");

const stack = "gps-tracking";
const stage = "dev";

const app = new cdk.App();
new GpsTrackingStack(app, `${stack}-${stage}`, { stack, stage });
