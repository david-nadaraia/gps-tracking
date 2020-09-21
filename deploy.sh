#!/bin/bash

if [ ! -d "node_modules" ]
then
  npm install
fi

# deploy CDK Toolkint stack to default account/region
# this is one-time step, however calling it on every deployment makes no harm
cdk bootstrap aws://$(aws sts get-caller-identity --output text --query Account)/$(aws configure get region)

# deploy Model stack
cdk deploy --require-approval never --outputs-file stack.json

# write IoT endpoint to file
aws iot describe-endpoint > endpoint.json
