# Racy Deploy

> A blazing fast zero-configuration deployment toolbelt.

`yarn global add racy-deploy`

## Initialize

`racy-deploy init ./path-to-project`

## Publish

`racy-deploy publish ./path-to-project`

## Deploy

`racy-deploy deploy ./path-to-project`

## Remove a deployment

`racy-deploy remove ./path-to-project`

## More `.racy-deploy.json` example configs

```json
{
  "username": "example",
  "password": "secret",
  "tagPrefix": "example",
  "verbose": false
}
```

```json
{
  "name": "example",
  "version": "latest",
  "type": "NODEJS",
  "verbose": false,
  "tagPrefix": "gcr.io/examples",
  "domain": "examples.com"
}
```
