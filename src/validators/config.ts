import { z } from 'zod';
import { PROVIDER_IDS } from '../providers/types';

/**
 * Zod schema for Grid unit JSON (<cloud>/<env>/<type>/<name>.json).
 * `provider` is any registered ProviderId; generate enforces bank coverage.
 */

const ProviderSchema = z.enum(PROVIDER_IDS as unknown as [string, ...string[]]);

const VpcResourceSchema = z.object({
  type: z.literal('vpc'),
  name: z.string(),
  cidr: z.string().regex(/^\d+\.\d+\.\d+\.\d+\/\d+$/, 'Invalid CIDR format'),
  description: z.string().optional(),
});

const SubnetResourceSchema = z.object({
  type: z.literal('subnet'),
  name: z.string(),
  vpc: z.string(),
  cidr: z.string().regex(/^\d+\.\d+\.\d+\.\d+\/\d+$/, 'Invalid CIDR format'),
  region: z.string().optional(),
  description: z.string().optional(),
});

const VmResourceSchema = z.object({
  type: z.literal('vm'),
  name: z.string(),
  machineType: z.string(),
  zone: z.string().optional(),
  subnet: z.string(),
  image: z.string().optional(),
  diskSize: z.number().optional(),
  diskType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
});

/**
 * Types with a dedicated Zod schema (stricter than passthrough generics).
 * Still rendered through the shared catalog path.
 */
export const STRUCTURED_RESOURCE_TYPES = ['vpc', 'subnet', 'vm'] as const;

/**
 * Any other catalogued resource type. Keys beyond `type`/`name`/`description`
 * are passed through to the module bank as Terraform variables, so the module's
 * own variables.tf is the contract rather than this schema.
 */
const GenericResourceSchema = z
  .object({
    type: z
      .string()
      .min(1)
      .refine(
        (t) => !(STRUCTURED_RESOURCE_TYPES as readonly string[]).includes(t),
        (t) => ({ message: `Resource type "${t}" has a dedicated schema` })
      ),
    name: z.string().min(1),
    description: z.string().optional(),
  })
  .passthrough();

const ResourceSchema = z.union([
  VpcResourceSchema,
  SubnetResourceSchema,
  VmResourceSchema,
  GenericResourceSchema,
]);

export const GridConfigSchema = z.object({
  provider: ProviderSchema,
  project: z.string(),
  region: z.string().optional(),
  resources: z.array(ResourceSchema).min(1, 'At least one resource is required'),
  metadata: z
    .object({
      name: z.string().optional(),
      description: z.string().optional(),
      // Canonical envs only; temporary copies use .ephemeral/ via `grid env clone`
      environment: z
        .enum(['development', 'staging', 'production', 'dev', 'prod'])
        .optional(),
      /** Optional service account email (e.g. GCP VMs) — passed via metadata or env */
      serviceAccountEmail: z.string().email().or(z.literal('REPLACE_WITH_SA_EMAIL')).optional(),
    })
    .passthrough()
    .optional(),
});

export type GridConfig = z.infer<typeof GridConfigSchema>;
export type Resource = z.infer<typeof ResourceSchema>;
export type VpcResource = z.infer<typeof VpcResourceSchema>;
export type SubnetResource = z.infer<typeof SubnetResourceSchema>;
export type VmResource = z.infer<typeof VmResourceSchema>;
export type GenericResource = z.infer<typeof GenericResourceSchema>;

export function isVpcResource(resource: Resource): resource is VpcResource {
  return resource.type === 'vpc';
}

export function isSubnetResource(resource: Resource): resource is SubnetResource {
  return resource.type === 'subnet';
}

export function isVmResource(resource: Resource): resource is VmResource {
  return resource.type === 'vm';
}

/** True when the resource uses a dedicated Zod schema (vpc/subnet/vm). */
export function isStructuredResource(resource: Resource): boolean {
  return (STRUCTURED_RESOURCE_TYPES as readonly string[]).includes(resource.type);
}

export function isGenericResource(resource: Resource): resource is GenericResource {
  return !isStructuredResource(resource);
}

/** Validate unit JSON against GridConfigSchema; returns errors and soft warnings. */
export function validateConfig(config: unknown): {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
} {
  try {
    const result = GridConfigSchema.safeParse(config);

    if (!result.success) {
      return {
        valid: false,
        errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
      };
    }

    const warnings: string[] = [];
    const resourceNames = new Set(result.data.resources.map((r) => r.name));

    result.data.resources.forEach((resource) => {
      if (isSubnetResource(resource) && !resourceNames.has(resource.vpc)) {
        warnings.push(
          `Subnet "${resource.name}" references VPC "${resource.vpc}" which doesn't exist`
        );
      }
      if (isVmResource(resource) && !resourceNames.has(resource.subnet)) {
        warnings.push(
          `VM "${resource.name}" references subnet "${resource.subnet}" which doesn't exist`
        );
      }
    });

    return {
      valid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'Unknown validation error'],
    };
  }
}
