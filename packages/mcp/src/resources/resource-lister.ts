// changedown-plugin/mcp-server/src/resources/resource-lister.ts
import type { BackendRegistry, DocumentResourceDescriptor } from '@changedown/core/backend';

export class ResourceLister {
  constructor(private readonly registry: BackendRegistry) {}

  list(): DocumentResourceDescriptor[] {
    return this.registry.listResources();
  }
}
