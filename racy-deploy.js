#!/usr/bin/env node
const argv = require('yargs')
  .usage('Usage: $0 <command>')
  .command('init [dir]', 'Initialze an App')
  .command('publish [dir]', 'Publish an App')
  .command('deploy [dir]', 'Deploy an App')
  .command('remove [dir]', 'Remove deployment')
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

  const WORKINGDIR = Boolean(argv.dir) ? resolve(argv.dir) : process.cwd();
  const ISNODEJS = await pathExists(join(WORKINGDIR, 'package.json'));
  const ISDOCKER = await pathExists(join(WORKINGDIR, 'Dockerfile'));
  const ISSTATIC = await pathExists(join(WORKINGDIR, 'index.html'));
  const PROJECTNAME = parse(WORKINGDIR).base;
  const PROJECTCONFIG = tryRequire(`${WORKINGDIR}/.racy-deploy.json`);
  const IMAGETAGPREFIX = PROJECTCONFIG.tagPrefix || '';
  const PROJECTVERSION = PROJECTCONFIG.version || 'latest';
  const USERNAME = PROJECTCONFIG.username;
  const PASSWORD = PROJECTCONFIG.password;
  const DOMAIN = PROJECTCONFIG.domain;
  const VERBOSE = Boolean(
    process.env.VERBOSE || PROJECTCONFIG.verbose || false,
  );
  const PROJECTTYPE = ISSTATIC
    ? 'STATIC'
    : ISNODEJS
      ? 'NODEJS'
      : ISDOCKER
        ? 'DOCKER'
        : 'NONE';

  if (VERBOSE)
    console.log({
      WORKINGDIR,
      PROJECTTYPE,
      PROJECTNAME,
      PROJECTVERSION,
      IMAGETAGPREFIX,
      PROJECTCONFIG,
      VERBOSE,
    });

  if (VERBOSE) console.log(argv);

  switch (argv._[0]) {
    case 'init':
      const config = {
        name: PROJECTNAME,
        version: PROJECTVERSION,
        type: PROJECTTYPE,
      };
      config.verbose = Boolean(
        await rlp.questionAsync('Verbose deployment outputs (true|false)? '),
      );
      const isPrivateRepo = await rlp.questionAsync(
        'Deploy to private Docker registry (yes|no)? ',
      );
      if (isPrivateRepo === 'yes') {
        config.tagPrefix = await rlp.questionAsync(
          'Enter a image tag prefix? ',
        );
        config.username = await rlp.questionAsync('Enter username? ');
        config.password = await rlp.questionAsync('Enter password? ');
      }
      config.domain = await rlp.questionAsync(
        'Enter domain name (services.example.com)? ',
      );

      try {
        await writeJson(join(WORKINGDIR, '.racy-deploy.json'), config, {
          spaces: 2,
          flag: 'wx+',
        });
      } catch (e) {
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
          `No tag prefix set. Skip publish image to ${imageTag}`,
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
