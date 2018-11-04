const { join } = require('path');
const kubernetes = require('kubernetes-client');

module.exports = {
  deploy,
  remove,
};

async function deploy({ name, version, imageTagPrefix, domain }) {
  const imageTag = `${join(imageTagPrefix, name)}:${version}`;
  const Client = kubernetes.Client;
  const config = kubernetes.config;
  const client = new Client({
    config: config.fromKubeconfig(),
    version: '1.9',
  });

  const deployments = await client.apis.apps.v1
    .namespaces('default')
    .deployments.get();
  const hasDeployed = deployments.body.items.find(
    x => x.metadata.name === name,
  );
  const deployment = !hasDeployed
    ? await client.apis.apps.v1.namespaces('default').deployments.post({
        body: deployTemplate({ name, version, imageTag }),
      })
    : await client.apis.apps.v1
        .namespaces('default')
        .deployments(name)
        .put({ body: deployTemplate({ name, version, imageTag }) });

  const services = await client.apis.v1.namespaces('default').services.get();
  const hasService = (services || {}).body.items.find(
    x => x.metadata.name === name,
  );

  const service = !hasService
    ? await client.apis.v1.namespaces('default').services.post({
        body: serviceTemplate({
          name,
          domain,
        }),
      })
    : await client.apis.v1
        .namespaces('default')
        .services(name)
        .put({
          body: serviceTemplate({
            name,
            domain,
            clusterIP: hasService.spec.clusterIP,
            resourceVersion: hasService.metadata.resourceVersion,
          }),
        });

  return { deployment: deployment.body, service: service.body };
}

async function remove({ name }) {
  const Client = kubernetes.Client;
  const config = kubernetes.config;
  const client = new Client({
    config: config.fromKubeconfig(),
    version: '1.9',
  });

  const deployments = await client.apis.apps.v1
    .namespaces('default')
    .deployments.get();
  const hasDeployment = deployments.body.items.find(
    x => x.metadata.name === name,
  );
  const services = await client.apis.v1.namespaces('default').services.get();
  const hasService = (services || {}).body.items.find(
    x => x.metadata.name === name,
  );

  if (hasDeployment)
    await client.apis.apps.v1
      .namespaces('default')
      .deployments(name)
      .delete();

  if (hasService)
    await client.apis.v1
      .namespaces('default')
      .services(name)
      .delete();
}

function deployTemplate({ name, imageTag, port = 80, env = [], replicas = 1 }) {
  return {
    kind: 'Deployment',
    apiVersion: 'apps/v1',
    metadata: {
      labels: {
        app: name,
      },
      name,
    },
    spec: {
      replicas,
      template: {
        metadata: {
          labels: {
            app: name,
          },
        },
        spec: {
          containers: [
            {
              image: imageTag,
              name,
              ports: [
                {
                  containerPort: port,
                },
              ],
              env,
            },
          ],
        },
      },
      selector: {
        matchLabels: {
          app: name,
        },
      },
    },
  };
}

function serviceTemplate({
  name,
  domain,
  resourceVersion,
  clusterIP,
  port = 80,
  targetPort = 80,
}) {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      resourceVersion,
      name,
      labels: {
        app: name,
      },
      annotations: {
        'external-dns.alpha.kubernetes.io/hostname': `${name}.${domain}.`,
      },
    },
    spec: {
      selector: {
        app: name,
      },
      type: 'LoadBalancer',
      clusterIP,
      ports: [
        {
          port,
          targetPort,
        },
      ],
    },
  };
}
