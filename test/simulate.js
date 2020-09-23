"use strict";

const aws = require("aws-sdk");
const stack = require("../stack.json");
const endpoint = require("../endpoint.json");
const MqttClient = require("aws-mqtt/lib/NodeClient");

aws.config.region = "us-east-1";

aws.config.credentials = new aws.CognitoIdentityCredentials({
  IdentityPoolId: stack["gps-tracking-dev"].IotIdentityPoolId,
});

const client = new MqttClient({
  clientId: "gps-tracking-simulation",
  region: aws.config.region,
  credentials: aws.config.credentials,
  endpoint: endpoint.endpointAddress,
}).on("connect", () => console.log("CONNECT"))
  .on("offline", () => console.log("OFFLINE"))
  .on("close", () => console.log("CLOSE"))
  .on("error", err => console.error(err))
  .on("outgoingEmpty", () => console.log("OUTGOING EMPTY"))
  .on("reconnect", () => console.log("RECONNECT"))
  .on("packetsend", packet => console.log("PACKET SEND", packet))
  .on("packetreceive", packet => console.log("PACKET RECV", packet));

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function getRandomData(index) {
  return {
    reset: index === 0,
    foo: Math.random(),
    bar: Math.random() * 10,
    speed: Math.random() * 120,
  };
}

async function simulateAsset(id, coordinates) {
  let n = 0;

  while (n++ > -Infinity) {
    const i = n % coordinates.length;
    const point = coordinates[i];
    await pushAssetPoint(id, point, getRandomData(i));
    await sleep(Math.random() * 1000);
  }
}

async function pushAssetPoint(id, coordinates, data) {
  client.publish("asset/ingest", JSON.stringify({ id, coordinates, data }));
}

const data = require("./route.json");

Promise.all(
  data.features.map(async x => await simulateAsset(x.properties.id, x.geometry.coordinates))
).then(process.exit);
