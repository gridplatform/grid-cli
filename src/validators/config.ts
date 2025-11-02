import { z } from 'zod';

/**
 * Grid Configuration Schema
 * 
 * Defines the structure for Grid JSON configuration files
 */

// Provider enum
const ProviderSchema = z.enum(['gcp', 'aws', 'azure']);

// Resource type schemas
const VpcResourceSchema = z.object({
  type: z.literal('vpc'),
  name: z.string(),
  cidr: z.string().regex(/^\d+\.\d+\.\d+\.\d+\/\d+$/, 'Invalid CIDR format'),
  description: z.string().optional(),
});

const SubnetResourceSchema = z.object({
  type: z.literal('subnet'),
  name: z.string(),
  vpc: z.string(), // Reference to VPC name
  cidr: z.string().regex(/^\d+\.\d+\.\d+\.\d+\/\d+$/, 'Invalid CIDR format'),
  region: z.string().optional(),
  description: z.string().optional(),
});

const VmResourceSchema = z.object({
  type: z.literal('vm'),
  name: z.string(),
  machineType: z.string(),
  zone: z.string().optional(),
  subnet: z.string(), // Reference to subnet name
  image: z.string().optional(),
  diskSize: z.number().optional(),
  diskType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
});

// Union of all resource types
const ResourceSchema = z.discriminatedUnion('type', [
  VpcResourceSchema,
  SubnetResourceSchema,
  VmResourceSchema,
]);

// Main configuration schema
export const GridConfigSchema = z.object({
  provider: ProviderSchema,
  project: z.string(), // GCP project ID, AWS account ID, Azure subscription ID
  region: z.string().optional(),
  resources: z.array(ResourceSchema).min(1, 'At least one resource is required'),
  metadata: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    environment: z.enum(['dev', 'staging', 'prod']).optional(),
  }).optional(),
});

export type GridConfig = z.infer<typeof GridConfigSchema>;
export type Resource = z.infer<typeof ResourceSchema>;

/**
 * Validate Grid configuration
 */
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
        errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
      };
    }

    // Additional validation checks
    const warnings: string[] = [];
    
    // Check resource dependencies
    const resourceNames = new Set(result.data.resources.map(r => r.name));
    const referencedResources: string[] = [];
    
    result.data.resources.forEach(resource => {
      if (resource.type === 'subnet' && !resourceNames.has(resource.vpc)) {
        warnings.push(`Subnet "${resource.name}" references VPC "${resource.vpc}" which doesn't exist`);
      }
      if (resource.type === 'vm' && !resourceNames.has(resource.subnet)) {
        warnings.push(`VM "${resource.name}" references subnet "${resource.subnet}" which doesn't exist`);
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

