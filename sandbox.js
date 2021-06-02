"use strict";

const aws = require("aws-sdk");

const cognito = new aws.CognitoIdentityServiceProvider({
  region: "us-east-1"
});

async function run() {
  const params = {
    UserPoolId: "us-east-1_veG8ePPyU",
    Username: "david.nadaraia@gmail.com",
  };

  const user = await cognito.adminGetUser(params).promise();
  const groups = await cognito.adminG(params).promise();

  console.log(user, groups);
}

run().then(process.exit);
