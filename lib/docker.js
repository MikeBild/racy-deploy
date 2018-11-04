const { join, resolve } = require('path');
const { Docker } = require('node-docker-api');
const tarStream = require('tar-stream');
const tarFs = require('tar-fs');
const { createWriteStream } = require('fs');
const { generateToken } = require('./gcloud');

module.exports = {
  build,
  push,
};

async function build({
  name,
  version,
  workingDir,
  imageTagPrefix,
  type,
  verbose = false,
}) {
  const IMAGETAG = `${join(imageTagPrefix, name)}:${version}`;
  let dist;

  switch (type) {
    case 'DOCKER':
      dist = tarFs.pack(workingDir);
      break;
    case 'STATIC':
      dist = tarFs.pack(workingDir, {
        finalize: false,
        finish: () => {
          dist.entry(
            { name: 'Dockerfile' },
            `FROM nginx:alpine
            COPY . /usr/share/nginx/html`,
          );
          dist.finalize();
        },
      });
      break;
    case 'NODEJS':
      dist = tarFs.pack(workingDir, {
        finalize: false,
        finish: () => {
          dist.entry(
            { name: 'Dockerfile' },
            `FROM node:8.12.0-alpine
            STOPSIGNAL SIGINT
            RUN apk add --no-cache dumb-init
            RUN mkdir /app
            WORKDIR /app
            COPY package.json /app
            RUN npm install --production
            COPY . /app
            EXPOSE 8080
            CMD ["dumb-init", "npm", "start"]`,
          );
          dist.entry({ name: '.dockerignore' }, `node_modules`);
          dist.finalize();
        },
      });
      break;
    default:
      throw new Error(`Deployment type ${type} not supported.`);
      break;
  }

  const docker = new Docker();
  const imageStream = await docker.image.build(dist, {
    t: IMAGETAG,
  });
  await promisifyStream(imageStream, verbose);
  return await docker.image.get(IMAGETAG).id;
}

async function push({ imageTag, username, password, verbose = false }) {
  const docker = new Docker();

  let auth = {
    username,
    password,
  };

  if (imageTag.includes('gcr.io')) {
    auth = {
      username: 'oauth2accesstoken',
      password: await generateToken(),
      serveraddress: `https://gcr.io`,
    };
  }

  const pushStream = await docker.image.get(imageTag).push(auth);
  await promisifyStream(pushStream, verbose);
  return;
}

function promisifyStream(stream, verbose) {
  return new Promise((resolve, reject) => {
    stream.on('data', data => {
      if (data.includes('errorDetail')) {
        return reject(new Error(JSON.parse(data).errorDetail.message));
      }
      verbose ? console.log(data.toString()) : data.toString();
    });
    stream.on('end', resolve);
    stream.on('error', reject);
  });
}
