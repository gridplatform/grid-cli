import type { ProviderAdapter, ProviderId, ProviderStatus } from './types';

/**
 * Providers that only differ by id / provider.tf snippet.
 * Generate path is identical for all clouds (resourceCatalog + catalogResources).
 */
function provider(opts: {
  id: ProviderId;
  label: string;
  status: ProviderStatus;
  defaultRegion: string;
  moduleRoot: string;
  message: string;
  providerBlock?: string;
}): ProviderAdapter {
  const defaultBlock = `terraform {
  required_version = ">= 1.0"
}

# ${opts.label} (${opts.id}) — set credentials before apply.
# ${opts.message}
`;

  return {
    id: opts.id,
    label: opts.label,
    status: opts.status,
    defaultRegion: opts.defaultRegion,
    moduleRoot: opts.moduleRoot,
    statusMessage: opts.message,
    renderProviderBlock() {
      return opts.providerBlock ?? defaultBlock;
    },
  };
}

export const oracleProvider = provider({
  id: 'oracle',
  label: 'Oracle Cloud',
  status: 'planned',
  defaultRegion: 'ap-mumbai-1',
  moduleRoot: 'oracle',
  message: 'Modules under grid-terraform/oracle. Configure the OCI provider before apply.',
  providerBlock: `terraform {
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = ">= 5.0"
    }
  }
  required_version = ">= 1.0"
}

provider "oci" {}
`,
});

export const ibmProvider = provider({
  id: 'ibm',
  label: 'IBM Cloud',
  status: 'planned',
  defaultRegion: 'us-south',
  moduleRoot: 'ibm',
  message: 'Modules under grid-terraform/ibm. Configure the IBM provider before apply.',
  providerBlock: `terraform {
  required_providers {
    ibm = {
      source  = "IBM-Cloud/ibm"
      version = ">= 1.0"
    }
  }
  required_version = ">= 1.0"
}

provider "ibm" {}
`,
});

export const alibabaProvider = provider({
  id: 'alibaba',
  label: 'Alibaba Cloud',
  status: 'planned',
  defaultRegion: 'ap-south-1',
  moduleRoot: 'alibaba',
  message: 'Modules under grid-terraform/alibaba. Configure the Alibaba provider before apply.',
  providerBlock: `terraform {
  required_providers {
    alicloud = {
      source  = "aliyun/alicloud"
      version = ">= 1.0"
    }
  }
  required_version = ">= 1.0"
}

provider "alicloud" {}
`,
});

export const tencentProvider = provider({
  id: 'tencent',
  label: 'Tencent Cloud',
  status: 'planned',
  defaultRegion: 'ap-mumbai',
  moduleRoot: 'tencent',
  message: 'Modules under grid-terraform/tencent. Configure the Tencent provider before apply.',
  providerBlock: `terraform {
  required_providers {
    tencentcloud = {
      source  = "tencentcloudstack/tencentcloud"
      version = ">= 1.0"
    }
  }
  required_version = ">= 1.0"
}

provider "tencentcloud" {}
`,
});

export const huaweiProvider = provider({
  id: 'huawei',
  label: 'Huawei Cloud',
  status: 'planned',
  defaultRegion: 'ap-india',
  moduleRoot: 'huawei',
  message: 'Modules under grid-terraform/huawei. Configure the Huawei provider before apply.',
  providerBlock: `terraform {
  required_providers {
    huaweicloud = {
      source  = "huaweicloud/huaweicloud"
      version = ">= 1.0"
    }
  }
  required_version = ">= 1.0"
}

provider "huaweicloud" {}
`,
});

export const ovhProvider = provider({
  id: 'ovh',
  label: 'OVHcloud',
  status: 'planned',
  defaultRegion: 'gra',
  moduleRoot: 'ovh',
  message: 'Modules under grid-terraform/ovh. Configure the OVH provider before apply.',
  providerBlock: `terraform {
  required_providers {
    ovh = {
      source  = "ovh/ovh"
      version = ">= 0.30"
    }
  }
  required_version = ">= 1.0"
}

provider "ovh" {}
`,
});

export const deutscheTelekomProvider = provider({
  id: 'deutsche-telekom',
  label: 'Deutsche Telekom',
  status: 'planned',
  defaultRegion: 'eu-de',
  moduleRoot: 'deutsche-telekom',
  message:
    'Modules under grid-terraform/deutsche-telekom. Configure cloud credentials before apply.',
});

export const ctrlsProvider = provider({
  id: 'ctrls',
  label: 'CtrlS',
  status: 'planned',
  defaultRegion: 'in-hyderabad',
  moduleRoot: 'ctrls',
  message: 'Modules under grid-terraform/ctrls. Configure credentials before apply.',
});

export const yottaProvider = provider({
  id: 'yotta',
  label: 'Yotta',
  status: 'planned',
  defaultRegion: 'in-mumbai',
  moduleRoot: 'yotta',
  message: 'Modules under grid-terraform/yotta. Configure credentials before apply.',
});

export const rancherProvider = provider({
  id: 'rancher',
  label: 'Rancher',
  status: 'planned',
  defaultRegion: 'local',
  moduleRoot: 'rancher',
  message:
    'Modules under grid-terraform/rancher. Configure the Rancher2 provider (API URL + token) before apply.',
  providerBlock: `terraform {
  required_providers {
    rancher2 = {
      source  = "rancher/rancher2"
      version = ">= 3.0"
    }
  }
  required_version = ">= 1.0"
}

provider "rancher2" {
  # api_url = "https://rancher.example.com"
  # token_key = "…"
}
`,
});

export const openshiftProvider = provider({
  id: 'openshift',
  label: 'Red Hat OpenShift',
  status: 'planned',
  defaultRegion: 'us-east-1',
  moduleRoot: 'openshift',
  message:
    'Modules under grid-terraform/openshift. Configure cloud + OpenShift credentials before apply.',
});
