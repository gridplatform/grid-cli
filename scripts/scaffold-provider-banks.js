#!/usr/bin/env node
/**
 * Scaffold / expand coming-soon provider module banks under grid-terraform/.
 * Idempotent: skips files that already exist.
 *
 * Module lists are aligned to Terraform Registry provider surfaces
 * (OCI, IBM, Alicloud, Tencent, Huawei, OVH, OTC, CloudStack/OpenStack, Rancher2, RHCS).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../grid-terraform');

/** @param {string[]} names */
function uniqModules(names) {
  return [...new Set(names)];
}

/** @typedef {{ id: string, label: string, tfProvider: string, tfSource: string, note: string, modules: string[] }} CloudSpec */

/** @type {CloudSpec[]} */
const CLOUDS = [
  {
    id: 'oracle',
    label: 'Oracle Cloud Infrastructure (OCI)',
    tfProvider: 'oci',
    tfSource: 'oracle/oci',
    note: 'Hyperscaler via oracle/oci. Cover every TF-manageable service as a Grid module scaffold.',
    modules: uniqModules([
      'network', 'security-list', 'nsg', 'nat-gateway', 'internet-gateway', 'drg',
      'compute-instance', 'instance-pool', 'autoscaling', 'block-volume', 'file-storage',
      'oke', 'container-instances', 'object-storage', 'autonomous-database', 'mysql', 'postgresql',
      'nosql', 'redis', 'streaming', 'functions', 'api-gateway', 'load-balancer', 'network-load-balancer',
      'waf', 'vault', 'kms', 'identity', 'dns', 'email', 'notifications', 'events', 'monitoring',
      'logging', 'bastion', 'devops', 'data-science', 'ai-language', 'queue',
      'data-flow', 'data-catalog', 'data-integration', 'analytics', 'golden-gate', 'exadata', 'db-system',
      'heatwave', 'ocir', 'service-mesh', 'certificates', 'fastconnect', 'service-gateway',
      'local-peering', 'remote-peering', 'cluster-network', 'compute-cluster', 'gpu-instance',
      'gpu-node-pool', 'nvidia-gpu-operator', 'vllm', 'kserve', 'kuberay', 'milvus', 'qdrant',
      'resource-manager', 'cloud-guard', 'security-zones', 'audit', 'budget',
      'generative-ai', 'generative-ai-agent', 'vision', 'speech', 'language', 'anomaly-detection',
      'document-understanding', 'media-flow', 'integration', 'digital-assistant', 'health-checks',
      'certificates-management', 'stack-monitoring', 'ops-insights', 'vulnerability-scanning',
      'email-delivery', 'queue-builder', 'process-automation', 'container-engine', 'blockchain-platform',
      'data-safe', 'cloud-migration', 'full-stack-disaster-recovery', 'network-firewall',
      'web-application-firewall', 'certificates-authority', 'marketplace', 'registry',
    ]),
  },
  {
    id: 'ibm',
    label: 'IBM Cloud',
    tfProvider: 'ibm',
    tfSource: 'IBM-Cloud/ibm',
    note: 'IBM-Cloud/ibm provider. Includes VPC, ROKS (OpenShift), Power VS, Code Engine, Event Streams.',
    modules: uniqModules([
      'network', 'subnet', 'security-group', 'public-gateway', 'vpn', 'transit-gateway',
      'compute-instance', 'bare-metal', 'power-vs', 'roks', 'iks', 'code-engine',
      'object-storage', 'file-storage', 'block-storage',
      'databases-postgresql', 'databases-mysql', 'databases-redis', 'databases-mongodb',
      'load-balancer', 'dns', 'cdn',
      'iam', 'key-protect', 'secrets-manager', 'certificate-manager',
      'event-streams', 'mq', 'appid', 'cloud-functions', 'schematics', 'monitoring', 'logging',
      'container-registry', 'sysdig', 'activity-tracker',
      'watsonx', 'watson-assistant', 'watson-discovery', 'satellite', 'app-config',
      'continuous-delivery', 'toolchain', 'hyper-protect', 'quantum', 'event-notifications',
      'internet-services', 'direct-link', 'is-vpc', 'cognos-dashboard', 'data-stage',
      'data-refinery', 'cloud-pak-for-data', 'cloudant', 'cloud-databases', 'backup-recovery',
      'security-advisor', 'information-architect', 'match-360', 'openshift-on-ibm',
      'gpu-instance', 'gpu-node-pool', 'vllm', 'kserve',
    ]),
  },
  {
    id: 'alibaba',
    label: 'Alibaba Cloud',
    tfProvider: 'alicloud',
    tfSource: 'aliyun/alicloud',
    note: 'aliyun/alicloud — large resource surface (VPC/ECS/ACK/OSS/RDS/…/FC/CDN/WAF).',
    modules: uniqModules([
      'network', 'vpc', 'vswitch', 'security-group', 'nat', 'eip', 'vpn', 'vpn-gateway', 'cen',
      'compute-instance', 'ecs', 'ess', 'ess-autoscaling', 'disk', 'nas',
      'ack', 'ack-node-pool', 'container-registry',
      'object-storage', 'oss-bucket', 'oss',
      'rds', 'polar-db', 'redis', 'mongodb', 'elasticsearch', 'kafka',
      'load-balancer', 'slb', 'alb', 'nlb',
      'function-compute', 'fc', 'api-gateway', 'cdn', 'waf', 'kms', 'ram', 'dns',
      'log', 'actiontrail', 'mse', 'sae', 'rocketmq', 'ots', 'ots-table-store',
      'maxcompute', 'dataworks', 'holo', 'analyticdb', 'clickhouse', 'flink', 'emr', 'pai', 'eas',
      'ack-serverless', 'ack-edge', 'arms', 'privatelink', 'express-connect', 'ga', 'ddos',
      'cloud-firewall', 'bastionhost', 'sas', 'config', 'cloud-config', 'dms', 'dts', 'hbr',
      'ssl-certificate', 'cms', 'resource-manager',
      'smart-hosting', 'cloud-phone', 'live', 'vod', 'imm', 'nlp',
      'gpu-instance', 'gpu-node-pool', 'vllm', 'kserve', 'milvus',
    ]),
  },
  {
    id: 'tencent',
    label: 'Tencent Cloud',
    tfProvider: 'tencentcloud',
    tfSource: 'tencentcloudstack/tencentcloud',
    note: 'tencentcloudstack/tencentcloud — VPC/CVM/TKE/COS/CDB/CLB/SCF/CDN/WAF/…',
    modules: uniqModules([
      'network', 'subnet', 'security-group', 'nat', 'eip', 'vpn', 'ccn',
      'compute-instance', 'as-autoscaling', 'cbs', 'cfs',
      'tke', 'tke-node-pool', 'tcr',
      'object-storage', 'cos-bucket',
      'cdb', 'postgresql', 'redis', 'mongodb', 'elasticsearch', 'ckafka',
      'load-balancer', 'clb',
      'scf', 'api-gateway', 'cdn', 'waf', 'kms', 'cam', 'dns',
      'cls', 'monitor', 'cynosdb', 'tdmq', 'tsf',
      'privatelink', 'ga', 'dayu', 'cfw', 'tat', 'tem', 'tiia', 'tiems', 'emr', 'cdw', 'dlc', 'oceanus',
      'vpc-endpoint', 'dc', 'vpn-connection', 'ssl', 'live', 'vod', 'tse', 'tcm', 'tcb',
      'gpu-instance', 'gpu-node-pool', 'vllm', 'kserve',
    ]),
  },
  {
    id: 'huawei',
    label: 'Huawei Cloud',
    tfProvider: 'huaweicloud',
    tfSource: 'huaweicloud/huaweicloud',
    note: 'huaweicloud/huaweicloud — 90+ services / 800+ resources. Scaffold maps major TF services.',
    modules: uniqModules([
      'network', 'subnet', 'security-group', 'network-acl', 'nat', 'private-nat', 'eip', 'peering',
      'vpn', 'vpn-gateway', 'vpc-endpoint', 'er', 'dc', 'cc', 'ga',
      'load-balancer', 'elb',
      'compute-instance', 'bms', 'deh', 'ims', 'as-autoscaling', 'evs', 'sfs', 'sfs-turbo',
      'cce', 'cce-node-pool', 'swr',
      'object-storage', 'obs-bucket', 'cbr',
      'rds', 'rds-mysql', 'gaussdb', 'gaussdb-mysql', 'gaussdb-cassandra', 'gaussdb-opengauss', 'gaussdb-redis',
      'geminidb', 'dcs', 'dcs-redis', 'dds', 'dds-mongodb',
      'dms', 'dms-kafka', 'dms-rabbitmq', 'kafka', 'rocketmq', 'rabbitmq',
      'css', 'mrs', 'dws', 'dli', 'dis', 'cloudtable', 'cdm', 'dayu', 'lakeformation',
      'dataarts', 'codearts', 'codearts-pipeline', 'servicecomb',
      'roma', 'apig', 'smn', 'functiongraph',
      'modelarts', 'hilens', 'iotda',
      'workspace', 'meeting',
      'iam', 'identity-center', 'kms', 'dew', 'waf', 'waf-dedicated',
      'cfw', 'antiddos', 'antiddos-advanced', 'hss', 'dbss', 'cbh', 'secmaster', 'ssl-certificate', 'scm',
      'dns', 'cdn', 'lts', 'cts', 'ces-monitoring', 'aom', 'apm',
      'config', 'organizations', 'enterprise-project', 'tms', 'billing', 'ccm',
      'sms', 'cph', 'live', 'vod',
      'gpu-instance', 'gpu-node-pool', 'vllm', 'kserve', 'milvus',
    ]),
  },
  {
    id: 'ovh',
    label: 'OVHcloud',
    tfProvider: 'ovh',
    tfSource: 'ovh/ovh',
    note: 'ovh/ovh — Public Cloud (OpenStack-backed), Managed Kubernetes, DB as a Service, DNS, vRack, dedicated.',
    modules: uniqModules([
      'cloud-project', 'network', 'private-network', 'subnet', 'gateway',
      'compute-instance', 'instance-snapshot', 'kubernetes', 'kubernetes-node-pool',
      'object-storage', 'block-storage',
      'database', 'database-user', 'load-balancer',
      'ip', 'vrack', 'dns', 'domain-zone', 'iam', 'user',
      'dedicated-server', 'dedicated-ceph', 'cloud-project-kube-iprestrictions',
      'database-kafka', 'database-mysql', 'database-postgresql', 'database-redis',
      'database-mongodb', 'database-opensearch', 'cold-archive', 'workflow', 'logs', 'metrics',
      'private-registry', 'vps', 'baremetal', 'email-pro', 'hosting-web', 'pci-project',
      'gpu-instance', 'gpu-node-pool', 'vllm',
    ]),
  },
  {
    id: 'deutsche-telekom',
    label: 'Deutsche Telekom (Open Telekom Cloud)',
    tfProvider: 'opentelekomcloud',
    tfSource: 'opentelekomcloud/opentelekomcloud',
    note: 'OTC provider (OpenStack lineage). Map VPC/ECS/CCE/OBS/RDS/ELB/IAM and related OTC services.',
    modules: uniqModules([
      'network', 'subnet', 'security-group', 'nat', 'eip', 'vpn',
      'compute-instance', 'as-autoscaling', 'evs', 'sfs',
      'cce', 'cce-node-pool',
      'object-storage', 'obs-bucket',
      'rds', 'dcs-redis', 'dds', 'dms',
      'load-balancer', 'elb',
      'iam', 'dns', 'smn', 'cts', 'ces', 'kms', 'waf', 'cbr-backup',
      'deh', 'css', 'mrs', 'dws', 'gaussdb', 'functiongraph', 'apig', 'swr',
      'vpcep', 'er', 'dc', 'cfw', 'antiddos', 'dis', 'dli', 'modelarts', 'workspace',
      'gpu-instance', 'gpu-node-pool', 'vllm',
    ]),
  },
  {
    id: 'ctrls',
    label: 'CtrlS',
    tfProvider: 'openstack',
    tfSource: 'terraform-provider-openstack/openstack',
    note:
      'No public CtrlS Terraform provider. IaaS is multi-platform (Nutanix/VMware/K8s). ' +
      'Scaffold uses OpenStack where APIs match; add nutanix/vsphere modules when credentials/API are available.',
    modules: uniqModules([
      'network', 'subnet', 'security-group', 'floating-ip', 'router',
      'compute-instance', 'volume', 'volume-attach',
      'kubernetes', 'load-balancer', 'object-storage', 'database', 'dns',
      'nutanix-cluster', 'nutanix-subnet', 'nutanix-vm',
      'vsphere-vm', 'vsphere-network', 'gpu-pool',
      'keypair', 'image', 'flavor', 'port', 'lb-member', 'lb-monitor', 'share', 'backup',
      'gpu-instance', 'gpu-node-pool', 'vllm',
    ]),
  },
  {
    id: 'yotta',
    label: 'Yotta',
    tfProvider: 'cloudstack',
    tfSource: 'cloudstack/cloudstack',
    note:
      'Yotta sovereign cloud is built on Apache CloudStack. Prefer cloudstack/* TF resources; ' +
      'keep openstack-* modules as optional if a region exposes OpenStack APIs.',
    modules: uniqModules([
      'network', 'vpc', 'acl', 'vpn',
      'compute-instance', 'instance-group', 'disk', 'snapshot',
      'kubernetes', 'load-balancer', 'object-storage', 'database', 'dns',
      'template', 'iso', 'ssh-keypair', 'security-group', 'affinity-group',
      'openstack-network', 'openstack-compute', 'gpu-instance',
      'volume', 'nic', 'ip-address', 'firewall', 'autoscale', 'project', 'account',
      'gpu-node-pool', 'vllm',
    ]),
  },
  {
    id: 'rancher',
    label: 'Rancher',
    tfProvider: 'rancher2',
    tfSource: 'rancher/rancher2',
    note: 'rancher/rancher2 — management plane over RKE/K3s/EKS/GKE/AKS/imported clusters.',
    modules: uniqModules([
      'cluster', 'cluster-v2', 'node-pool', 'node-template', 'cloud-credential',
      'project', 'namespace', 'app', 'app-v2', 'catalog', 'catalog-v2',
      'global-role', 'cluster-role-template', 'project-role-template-binding',
      'secret', 'config-map', 'storage-class', 'persistent-volume-claim',
      'ingress', 'service', 'registry', 'feature', 'setting', 'token',
      'machine-config', 'cluster-sync',
      'auth-config', 'bootstrap', 'certificate', 'etcd-backup', 'fleet-workspace',
      'pod-security-policy', 'rancher2-bootstrap', 'user', 'group', 'custom-user',
      'nvidia-gpu-operator', 'vllm', 'kserve', 'kuberay',
    ]),
  },
  {
    id: 'openshift',
    label: 'Red Hat OpenShift',
    tfProvider: 'rhcs',
    tfSource: 'terraform-redhat/rhcs',
    note:
      'ROSA via terraform-redhat/rhcs; ARO via azurerm; self-managed via openshift-install + TF where applicable; IBM ROKS via ibm provider.',
    modules: uniqModules([
      'rosa-cluster', 'rosa-hcp-cluster', 'rosa-machine-pool',
      'aro-cluster', 'aro-worker-node',
      'self-managed-cluster', 'machine-pool', 'machine-config-pool',
      'identity-provider', 'oauth', 'project', 'operator-hub',
      'route', 'ingress-controller', 'image-registry', 'cluster-autoscaler',
      'roks-cluster',
      'rosa-account-roles', 'rosa-sts-policy', 'aro-resource-group', 'machine-set',
      'cluster-monitoring', 'network-policy', 'storage-class', 'pvc',
      'nvidia-gpu-operator', 'vllm', 'kserve', 'kuberay',
    ]),
  },
];

/** Self-hosted LLM / GPU serving stacks — cloud TF for compute; runtime via helm/kubernetes. */
const UNMANAGED_LLM = uniqModules([
  'gpu-instance', // bare GPU VM (EC2 G/P, GCE A2/A3, Azure ND/NC, etc.)
  'gpu-node-pool', // K8s GPU node group / node pool
  'nvidia-gpu-operator', // Helm: drivers/device plugin (hashicorp/helm)
  'nvidia-nim', // NVIDIA NIM operator / self-hosted NIM
  'vllm', // vLLM OpenAI-compatible serving (Helm/K8s)
  'huggingface-tgi', // Text Generation Inference
  'triton-inference-server', // NVIDIA Triton
  'sglang', // SGLang serving
  'tensorrt-llm', // TensorRT-LLM
  'kserve', // KServe InferenceService controller
  'kuberay', // KubeRay operator
  'ray-cluster', // Ray / Ray Serve cluster
  'ollama', // Ollama on VM or K8s
  'open-webui', // optional chat UI in front of local models
  'litellm-gateway', // LiteLLM / multi-model gateway
  'milvus', // self-hosted vector DB
  'qdrant', // self-hosted vector DB
  'weaviate', // self-hosted vector DB
  'chroma', // self-hosted vector DB
  'pgvector', // Postgres + pgvector (self-managed RAG store)
  'mlflow', // model registry / tracking
  'bentoml', // BentoML serving
  'deepspeed', // distributed training stack marker
  'llm-inference-endpoint', // generic self-hosted inference LB + ASG/MIG pattern
]);

const UNMANAGED_LLM_SET = new Set(UNMANAGED_LLM);

/** Classic AWS modules often requested beyond the Day-1 bank (scaffold if missing). */
const AWS_EXTRA = uniqModules([
  'cloudfront', 'wafv2', 'nlb', 'transit-gateway', 'direct-connect', 'eip', 'nat-gateway',
  'efs', 'fsx', 'backup', 'glue', 'athena', 'opensearch', 'mq', 'batch', 'cognito',
  'codebuild', 'codepipeline', 'codedeploy', 'organizations', 'guardduty', 'config',
  'macie', 'security-hub', 'shield', 'global-accelerator', 'appmesh', 'servicecatalog',
  'transfer-family', 'memorydb', 'neptune', 'documentdb', 'timestream', 'qldb',
  'ses', 'amplify', 'apprunner', 'appsync', 'kinesis', 'kinesis-firehose', 'lakeformation',
  'quicksight', 'workspaces', 'directory-service', 'route53-resolver', 'vpc-endpoint',
  'network-firewall', 'client-vpn', 'vpn-gateway', 'ram', 'service-discovery', 'aurora', 'dms',
  'mwaa', 'managed-grafana', 'managed-prometheus', 'opensearch-serverless', 'codecommit',
  'codeartifact', 'elastic-beanstalk', 'cloudtrail', 'xray', 'inspector', 'detective',
  'appflow', 'datasync', 'storage-gateway', 'lightsail', 'gamelift', 'iot-core',
  'media-convert', 'medialive', 'connect', 'pinpoint', 'imagebuilder', 'ebs-volume', 'ami',
  'fargate', 'emr-serverless', 'redshift-serverless', 'appconfig', 'control-tower', 'budgets',
  'access-analyzer', 'identity-center', 'verified-access', 'vpc-lattice', 'eks-node-group',
  'ecr-public', 'glacier', 's3-access-point', 'rds-proxy', 'aurora-serverless',
  'dynamodb-accelerator', 'cloudformation', 'chatbot', 'location-service', 'iot-analytics',
  'greengrass', 'workspaces-web', 'appstream', 'finspace', 'managed-blockchain', 'keyspaces',
  'healthlake', 'braket', 'parallelcluster', 'proton', 'codestar-connections', 'pipes',
  'eventbridge-scheduler', 'msk-connect', 'glue-crawler', 'athena-workgroup', 'bedrock-prompt',
  'sagemaker-feature-store', 'personalize', 'forecast', 'fraud-detector', 'rekognition',
  'textract', 'transcribe', 'translate', 'comprehend', 'polly', 'lookout-metrics',
  'resilience-hub', 'fault-injection-simulator', 'network-manager', 'cloudwan',
  'firewall-manager', 'private-ca', 'acm-pca', 'outposts', 'snowball', 'ground-station',
  'ivs', 'elemental-mediapackage', 'elemental-mediastore', 'transfer-server', 'schemas',
  'registry', 'security-lake', 'audit-manager', 'artifact', 'trusted-advisor',
  'well-architected', 'application-migration', 'mainframe-modernization', 'refactor-spaces',
  'clean-rooms', 'datazone', 'q-business', 'verified-permissions', 'payment-cryptography',
  ...UNMANAGED_LLM,
  'karpenter',
  'eks-gpu-node-group',
]);

const AZURE_EXTRA = uniqModules([
  'cosmosdb', 'sql-server', 'mysql-flexible', 'mariadb', 'key-vault', 'app-service',
  'function-app', 'container-apps', 'container-registry', 'front-door', 'application-gateway',
  'bastion', 'firewall', 'vpn-gateway', 'private-dns', 'monitor', 'log-analytics',
  'service-bus', 'event-hubs', 'data-factory', 'synapse', 'databricks', 'cdn',
  'traffic-manager', 'api-management', 'signalr', 'web-pubsub', 'purview', 'policy',
  'resource-group', 'managed-identity', 'role-assignment', 'management-group', 'private-endpoint',
  'nat-gateway', 'public-ip', 'vnet-peering', 'availability-set', 'vm-scale-set', 'managed-disk',
  'snapshot', 'dns', 'eventgrid', 'iothub', 'iotcentral', 'hdinsight', 'healthcare-apis',
  'kusto', 'logic-apps', 'maps', 'netapp', 'notification-hub', 'recovery-services',
  'stream-analytics', 'sentinel', 'service-fabric', 'desktop-virtualization', 'digital-twins',
  'hpc-cache', 'managed-hsm', 'mssql-managed-instance', 'postgresql-flexible', 'app-configuration',
  'automation', 'batch', 'bot-service', 'application-insights', 'communication-services',
  'confidential-ledger', 'cost-management', 'domain-services', 'elastic-san', 'load-test', 'nginx',
  'oracle-database', 'power-bi', 'relay', 'security-center', 'vmware', 'spring-apps',
  'static-web-app', 'service-plan', 'ai-foundry', 'redis-enterprise', 'data-protection',
  'data-share', 'maintenance', 'lighthouse', 'media-services', 'mixed-reality',
  'timeseries-insights', 'hybrid-compute', 'fluid-relay', 'fabric', 'graph', 'elastic-cloud',
  ...UNMANAGED_LLM,
]);

const GCP_EXTRA = uniqModules([
  'cloud-sql-sqlserver', 'alloydb', 'spanner', 'firestore', 'bigtable', 'filestore',
  'cloud-armor', 'cloud-cdn', 'interconnect', 'vpn', 'cloud-build', 'cloud-deploy',
  'artifact-registry', 'gke-autopilot', 'workstations', 'batch', 'tpu',
  'cloud-tasks', 'cloud-workflows', 'eventarc', 'apigee', 'identity-platform', 'firebase',
  'looker', 'dataplex', 'datastream', 'pubsub-lite', 'memorystore-memcached', 'gke-hub',
  'binary-authorization', 'private-ca', 'media-cdn', 'network-connectivity', 'cloud-router',
  'firewall-policy', 'compute-disk', 'instance-group', 'mig', 'app-engine', 'service-directory',
  'private-service-connect', 'cloud-run-job', 'cloud-functions-gen2', 'source-repositories',
  'cloud-asset', 'access-context-manager', 'vpc-service-controls', 'beyondcorp',
  'identity-aware-proxy', 'dialogflow', 'speech-to-text', 'translation', 'vision-ai',
  'natural-language', 'healthcare-api', 'life-sciences', 'cloud-ids', 'network-security',
  'cloud-logging', 'monitoring', 'error-reporting', 'cloud-trace', 'bigquery-data-transfer',
  'dataproc-metastore', 'dataform', 'redis-cluster',
  ...UNMANAGED_LLM,
]);

function humanizeModuleName(moduleName) {
  return moduleName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function writeIfAbsent(file, contents) {
  if (fs.existsSync(file)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  return true;
}

function scaffoldModule(cloudId, label, tfProvider, tfSource, moduleName) {
  const dir = path.join(ROOT, cloudId, moduleName);
  const created = [];
  const human = humanizeModuleName(moduleName);

  const main = `/**
 * ${label} — ${moduleName}
 *
 * Provisions ${human} via the ${tfProvider} Terraform provider.
 */

resource "terraform_data" "scaffold" {
  input = {
    cloud       = "${cloudId}"
    module      = "${moduleName}"
    tf_provider = "${tfProvider}"
    note        = "module placeholder"
  }
}
`;

  const variables = `variable "name" {
  type        = string
  description = "Resource name / prefix for ${moduleName}"
}

variable "labels" {
  type        = map(string)
  default     = {}
  description = "Labels / tags"
}

variable "region" {
  type        = string
  default     = null
  description = "Region / location (provider-specific)"
}
`;

  const outputs = `output "scaffold_id" {
  description = "Module identifier"
  value       = terraform_data.scaffold.id
}

output "module" {
  description = "Module identifier"
  value       = "${cloudId}/${moduleName}"
}
`;

  const versions = `terraform {
  required_version = ">= 1.5"
}
`;

  if (writeIfAbsent(path.join(dir, 'main.tf'), main)) created.push('main.tf');
  if (writeIfAbsent(path.join(dir, 'variables.tf'), variables)) created.push('variables.tf');
  if (writeIfAbsent(path.join(dir, 'outputs.tf'), outputs)) created.push('outputs.tf');
  if (writeIfAbsent(path.join(dir, 'versions.tf'), versions)) created.push('versions.tf');
  return created.length;
}

function scaffoldCloud(cloud) {
  fs.mkdirSync(path.join(ROOT, cloud.id), { recursive: true });

  let n = 0;
  for (const m of cloud.modules) {
    n += scaffoldModule(cloud.id, cloud.label, cloud.tfProvider, cloud.tfSource, m);
  }
  return { count: cloud.modules.length, files: n };
}

function scaffoldExtras(cloudId, label, tfProvider, tfSource, modules) {
  let files = 0;
  for (const m of modules) {
    files += scaffoldModule(cloudId, label, tfProvider, tfSource, m);
  }
  return files;
}

let totalFiles = 0;
for (const cloud of CLOUDS) {
  const r = scaffoldCloud(cloud);
  totalFiles += r.files;
  console.log(`${cloud.id}: ${r.count} modules (+${r.files} new files)`);
}

totalFiles += scaffoldExtras('aws', 'Amazon Web Services', 'aws', 'hashicorp/aws', AWS_EXTRA);
totalFiles += scaffoldExtras('azure', 'Microsoft Azure', 'azurerm', 'hashicorp/azurerm', AZURE_EXTRA);
totalFiles += scaffoldExtras('gcp', 'Google Cloud', 'google', 'hashicorp/google', GCP_EXTRA);

console.log(`Done. New files written: ${totalFiles}`);
