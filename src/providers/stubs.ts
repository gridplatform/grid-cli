import type { ModuleCopySpec } from '../generators/terraform/moduleBank';
import type { ProviderAdapter, ProviderId, ProviderStatus } from './types';

/**
 * Placeholder adapters for clouds not yet implemented.
 * Registering them keeps grid.json + CLI discoverable and future-proof.
 */
function stubProvider(opts: {
  id: ProviderId;
  label: string;
  status: ProviderStatus;
  defaultRegion: string;
  moduleRoot: string;
  message: string;
}): ProviderAdapter {
  const emptySpecs: ModuleCopySpec[] = [];
  return {
    id: opts.id,
    label: opts.label,
    status: opts.status,
    defaultRegion: opts.defaultRegion,
    moduleRoot: opts.moduleRoot,
    moduleSpecsForGenerate: emptySpecs,
    statusMessage: opts.message,
    renderResources(): string {
      throw new Error(opts.message);
    },
    renderOutputs(): string {
      throw new Error(opts.message);
    },
    renderProviderBlock(): string {
      throw new Error(opts.message);
    },
  };
}

/** Hyperscalers / global */
export const oracleProvider = stubProvider({
  id: 'oracle',
  label: 'Oracle Cloud',
  status: 'planned',
  defaultRegion: 'ap-mumbai-1',
  moduleRoot: 'oracle',
  message: 'Oracle Cloud support is planned. Add modules under grid-terraform/oracle when ready.',
});

export const ibmProvider = stubProvider({
  id: 'ibm',
  label: 'IBM Cloud',
  status: 'planned',
  defaultRegion: 'us-south',
  moduleRoot: 'ibm',
  message: 'IBM Cloud support is planned. Add modules under grid-terraform/ibm when ready.',
});

export const alibabaProvider = stubProvider({
  id: 'alibaba',
  label: 'Alibaba Cloud',
  status: 'planned',
  defaultRegion: 'ap-south-1',
  moduleRoot: 'alibaba',
  message: 'Alibaba Cloud support is planned. Add modules under grid-terraform/alibaba when ready.',
});

export const tencentProvider = stubProvider({
  id: 'tencent',
  label: 'Tencent Cloud',
  status: 'planned',
  defaultRegion: 'ap-mumbai',
  moduleRoot: 'tencent',
  message: 'Tencent Cloud support is planned. Add modules under grid-terraform/tencent when ready.',
});

export const huaweiProvider = stubProvider({
  id: 'huawei',
  label: 'Huawei Cloud',
  status: 'planned',
  defaultRegion: 'ap-india',
  moduleRoot: 'huawei',
  message: 'Huawei Cloud support is planned. Add modules under grid-terraform/huawei when ready.',
});

export const ovhProvider = stubProvider({
  id: 'ovh',
  label: 'OVHcloud',
  status: 'planned',
  defaultRegion: 'gra',
  moduleRoot: 'ovh',
  message: 'OVHcloud support is planned. Add modules under grid-terraform/ovh when ready.',
});

export const deutscheTelekomProvider = stubProvider({
  id: 'deutsche-telekom',
  label: 'Deutsche Telekom',
  status: 'planned',
  defaultRegion: 'eu-de',
  moduleRoot: 'deutsche-telekom',
  message:
    'Deutsche Telekom support is planned. Add modules under grid-terraform/deutsche-telekom when ready.',
});

/** India / regional */
export const ctrlsProvider = stubProvider({
  id: 'ctrls',
  label: 'CtrlS',
  status: 'planned',
  defaultRegion: 'in-hyderabad',
  moduleRoot: 'ctrls',
  message: 'CtrlS support is planned. Add modules under grid-terraform/ctrls when ready.',
});

export const yottaProvider = stubProvider({
  id: 'yotta',
  label: 'Yotta',
  status: 'planned',
  defaultRegion: 'in-mumbai',
  moduleRoot: 'yotta',
  message: 'Yotta support is planned. Add modules under grid-terraform/yotta when ready.',
});

/**
 * Rancher is a Kubernetes management plane, not a raw IaaS provider.
 * Modeled as a planned target that will compose cluster modules + Rancher config.
 */
export const rancherProvider = stubProvider({
  id: 'rancher',
  label: 'Rancher',
  status: 'planned',
  defaultRegion: 'local',
  moduleRoot: 'rancher',
  message:
    'Rancher support is planned (K8s management plane). It will sit on top of cluster modules (EKS/GKE/AKS/on-prem), not replace them.',
});

export const openshiftProvider = stubProvider({
  id: 'openshift',
  label: 'Red Hat OpenShift',
  status: 'planned',
  defaultRegion: 'us-east-1',
  moduleRoot: 'openshift',
  message:
    'OpenShift support is planned (ROSA, ARO, self-managed). Module scaffolds live under grid-terraform/openshift.',
});
