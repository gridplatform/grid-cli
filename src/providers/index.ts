/**
 * Register cloud adapters once for CLI / generate.
 * Resource generation always uses the shared catalog.
 */
import { registerProvider } from './registry';
import { awsProvider } from './aws';
import { gcpProvider } from './gcp';
import { azureProvider } from './azure';
import {
  alibabaProvider,
  ctrlsProvider,
  deutscheTelekomProvider,
  huaweiProvider,
  ibmProvider,
  openshiftProvider,
  oracleProvider,
  ovhProvider,
  rancherProvider,
  tencentProvider,
  yottaProvider,
} from './catalogOnly';

let bootstrapped = false;

export function bootstrapProviders(): void {
  if (bootstrapped) return;

  registerProvider(awsProvider);
  registerProvider(gcpProvider);
  registerProvider(azureProvider);
  registerProvider(oracleProvider);
  registerProvider(ibmProvider);
  registerProvider(alibabaProvider);
  registerProvider(tencentProvider);
  registerProvider(huaweiProvider);
  registerProvider(ovhProvider);
  registerProvider(deutscheTelekomProvider);
  registerProvider(ctrlsProvider);
  registerProvider(yottaProvider);
  registerProvider(rancherProvider);
  registerProvider(openshiftProvider);

  bootstrapped = true;
}
