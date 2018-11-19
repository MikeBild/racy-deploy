#!/usr/bin/env node
const argv = require('yargs')
  .usage('Usage: $0 <command>')
  .command('init [dir]', 'Initialze')
  .command('inspect [dir]', 'Inspect')
  .command('publish [dir]', 'Publish')
  .command('deploy [dir]', 'Deploy')
  .command('remove [dir]', 'Remove')
  .help('h')
  .alias('h', 'help')
  .locale('en')
  .strict()
  .demandCommand(1).argv;

const { parse, join, resolve } = require('path');
const { promisify } = require('util');
const { writeJson, pathExists } = require('fs-extra');
const { createInterface } = require('readline-promise').default;
const updateNotifier = require('update-notifier');
const pkg = require('./package.json');

const { build, push } = require('./lib/docker');
const { deploy, remove } = require('./lib/k8s');
const { loadEnv, writeEnv } = require('./lib/env');

const rlp = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

main()
  .then(() => {
    console.log('Finished');
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

async function main() {
  updateNotifier({ pkg }).notify();

  const VERBOSE = process.env.VERBOSE === 'true';

  const WORKINGDIR = Boolean(argv.dir) ? resolve(argv.dir) : process.cwd();
  const ISNODEJS = await pathExists(join(WORKINGDIR, 'package.json'));
  const ISDOCKER = await pathExists(join(WORKINGDIR, 'Dockerfile'));
  const ISSTATIC = await pathExists(join(WORKINGDIR, 'index.html'));

  const PROJECTCONFIG = loadEnv(WORKINGDIR);
  const PROJECTNAME = PROJECTCONFIG.DEPLOY_NAME || parse(WORKINGDIR).base;
  const PROJECTVERSION = PROJECTCONFIG.DEPLOY_VERSION || 'latest';
  const DOMAIN = PROJECTCONFIG.DEPLOY_DOMAIN;
  const IMAGETAGPREFIX = PROJECTCONFIG.DEPLOY_TAGPREFIX || '';
  const USERNAME = PROJECTCONFIG.DEPLOY_USERNAME;
  const PASSWORD = PROJECTCONFIG.DEPLOY_PASSWORD;

  const PROJECTTYPE = ISSTATIC
    ? 'STATIC'
    : ISNODEJS
    ? 'NODEJS'
    : ISDOCKER
    ? 'DOCKER'
    : PROJECTCONFIG.DEPLOY_TYPE
    ? PROJECTCONFIG.DEPLOY_TYPE
    : 'NONE';

  if (VERBOSE)
    console.log({
      argv,
      WORKINGDIR,
      PROJECTTYPE,
      PROJECTNAME,
      PROJECTVERSION,
      IMAGETAGPREFIX,
      DOMAIN,
      USERNAME,
      PASSWORD,
    });

  switch (argv._[0]) {
    case 'inspect':
      console.log(`Working Directory: ${WORKINGDIR}`);
      console.log(`Type             : ${PROJECTTYPE || '-'}`);
      console.log(`Name             : ${PROJECTNAME || '-'}`);
      console.log(`Version          : ${PROJECTVERSION || '-'}`);
      console.log(`Domain           : ${DOMAIN || '-'}`);
      console.log(`Prefix           : ${IMAGETAGPREFIX || '-'}`);
      console.log(`Username         : ${USERNAME || '-'}`);
      console.log(`Password         : ${PASSWORD || '-'}`);
      break;
    case 'init':
      const config = {
        DEPLOY_NAME: PROJECTNAME,
        DEPLOY_VERSION: PROJECTVERSION,
        DEPLOY_TYPE: PROJECTTYPE,
      };
      const isPrivateRepo = await rlp.questionAsync(
        'Deploy to private Docker registry (yes|no)? '
      );
      if (isPrivateRepo === 'yes') {
        config.DEPLOY_TAGPREFIX = await rlp.questionAsync(
          'Enter a image tag prefix? '
        );
        config.DEPLOY_USERNAME = await rlp.questionAsync('Enter username? ');
        config.DEPLOY_PASSWORD = await rlp.questionAsync('Enter password? ');
      }
      config.DEPLOY_DOMAIN = await rlp.questionAsync(
        'Enter domain name (services.example.com)? '
      );

      try {
        await writeEnv(join(WORKINGDIR, '.env.deploy'), config);
      } catch (e) {
        console.log(e);
        console.error('Racy deployment config already exists');
        process.exit(1);
      }
      break;
    case 'publish':
      console.log(`Building ...`);
      const imageTag = await build({
        name: PROJECTNAME,
        version: PROJECTVERSION,
        type: PROJECTTYPE,
        workingDir: WORKINGDIR,
        imageTagPrefix: IMAGETAGPREFIX,
        verbose: VERBOSE,
      });
      console.log(`Docker image ${imageTag} built`);

      if (!IMAGETAGPREFIX)
        return console.log(
          `No tag prefix set. Skip publish image to ${imageTag}`
        );

      console.log(`Publishing ...`);
      await push({
        imageTag,
        username: USERNAME,
        password: PASSWORD,
        verbose: VERBOSE,
      });
      console.log(`Docker image ${imageTag} published`);

      break;
    case 'deploy':
      console.log('Deploying ...');
      const { deployment, service } = await deploy({
        name: PROJECTNAME,
        version: PROJECTVERSION,
        imageTagPrefix: IMAGETAGPREFIX,
        domain: DOMAIN,
      });
      console.log(`Deployed to Kubernetes`);
      break;
    case 'remove':
      console.log('Removing ...');
      await remove({ name: PROJECTNAME });
      console.log(`Deployment removed`);
      break;
  }
}

function tryRequire(module) {
  try {
    return require(module);
  } catch (e) {
    return {};
  }
}
