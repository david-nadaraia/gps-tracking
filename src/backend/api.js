"use strict";

const aws = require("aws-sdk");
const ddb = new aws.DynamoDB.DocumentClient({});

const turf = require("@turf/helpers");

// eslint-disable-next-line no-unused-vars
module.exports.getAll = async event => {
  const features = await ddb.scan({
    TableName: process.env.ASSETS_TABLE
  }).promise()
    .then(data => data.Items.map(item => {
      const { longitude, latitude } = item;
      delete item.longitude;
      delete item.latitude;

      return turf.point([longitude, latitude], item);
    }));

  const featureCollection = turf.featureCollection(features);

  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(featureCollection),
  };
};
