"use strict";

const aws = require("aws-sdk");
const fh = new aws.Firehose({});
const ddb = new aws.DynamoDB.DocumentClient({});

const TTL = 10;

module.exports.handler = async (event, context, callback) => {
  const data = event.Records
    .filter(x => x.kinesis && x.kinesis.data)
    .map(x => {
      const asset = JSON.parse(
        Buffer.from(x.kinesis.data, "base64").toString("utf-8")
      );

      const id = asset.id;
      const data = asset.data;
      const timestamp = new Date() + 0;
      const expiration = new Date() + 60 * TTL;

      const [longitude, latitude] = asset.coordinates;
      delete asset.coordinates;

      return { id, longitude, latitude, timestamp, expiration, ...data };
    });

  for (const x of data) {
    await ddb.put({
      TableName: process.env.ASSETS_TABLE,
      Item: x
    }).promise();

    // await fh.putRecord({
    //   DeliveryStreamName: process.env.DELIVERY_STREAM,
    //   Record: { Data: new Buffer.from(JSON.stringify(x)) },
    // }).promise();

    // TODO: publish data to IoT MQTT channel for frontend real-time update
  }

  callback();
};
