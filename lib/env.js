const NODE_ENV = process.env.NODE_ENV || 'development';

const { resolve } = require('path');
const { writeFile } = require('fs-extra');
const dotenv = require('dotenv');
const variableExpansion = require('dotenv-expand');

module.exports = { loadEnv, writeEnv };

function loadEnv(filepath) {
  const dotenvFiles = [
    `.env.${NODE_ENV}.deploy`,
    `.env.${NODE_ENV}`,
    NODE_ENV !== 'test' && '.env.deploy',
    '.env',
  ].filter(Boolean);

  return dotenvFiles
    .map(dotenvFile => {
      const envPath = resolve(filepath, dotenvFile);
      if (!envPath) return {};

      const envs = dotenv.config({ path: envPath });
      variableExpansion(envs);
      return envs.parsed ? envs.parsed : null;
    })
    .reduce(
      (state, itm) => ({
        ...state,
        ...itm,
      }),
      {}
    );
}

async function writeEnv(filepath, config) {
  const configAsString = Object.keys(config).reduce(
    (state, itm) => (state += `${itm}=${config[itm]}\n`),
    ''
  );
  await writeFile(filepath, configAsString);
}
