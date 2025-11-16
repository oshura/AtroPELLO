import { Injectable } from '@angular/core';
import { PortalSnapshot } from '../../types/solar-system.types';
import { GameLogger } from '../../utils/GameLogger';
import { LogCategory } from '../../../services/logging.service';

/**
 * PortalRegistryService
 * Centralizes portal management and tracking across all solar systems.
 * Maintains a registry of all portals and their linkages for serialization and navigation.
 */
@Injectable({ providedIn: 'root' })
export class PortalRegistryService {
  // Map of portal ID -> portal data
  private portals = new Map<string, PortalSnapshot>();
  
  // Map of solar system ID -> array of portal IDs in that system
  private systemPortals = new Map<string, string[]>();
  
  // Counter for generating unique portal IDs
  private portalSequence = 0;

  /**
   * Register a new portal in the registry
   */
  registerPortal(portal: PortalSnapshot, systemId: string): void {
    this.portals.set(portal.id, { ...portal });
    
    // Add to system's portal list
    const existing = this.systemPortals.get(systemId) || [];
    if (!existing.includes(portal.id)) {
      existing.push(portal.id);
      this.systemPortals.set(systemId, existing);
    }
    
    GameLogger.info(LogCategory.PORTAL, 'Portal registered', { 
      portalId: portal.id, 
      systemId, 
      linkedTo: portal.linkedPortalId 
    });
  }

  /**
   * Update an existing portal's linkage
   */
  updatePortalLink(portalId: string, linkedPortalId: string): void {
    const portal = this.portals.get(portalId);
    if (portal) {
      portal.linkedPortalId = linkedPortalId;
      this.portals.set(portalId, portal);
      GameLogger.info(LogCategory.PORTAL, 'Portal link updated', { portalId, linkedPortalId });
    }
  }

  /**
   * Get portal by ID
   */
  getPortal(portalId: string): PortalSnapshot | undefined {
    return this.portals.get(portalId);
  }

  /**
   * Get all portals in a specific solar system
   */
  getPortalsInSystem(systemId: string): PortalSnapshot[] {
    const portalIds = this.systemPortals.get(systemId) || [];
    return portalIds.map(id => this.portals.get(id)).filter(p => p !== undefined) as PortalSnapshot[];
  }

  /**
   * Find which system contains a specific portal
   */
  findSystemForPortal(portalId: string): string | undefined {
    for (const [systemId, portalIds] of this.systemPortals.entries()) {
      if (portalIds.includes(portalId)) {
        return systemId;
      }
    }
    return undefined;
  }

  /**
   * Generate a unique portal ID
   */
  generatePortalId(): string {
    return `portal-${++this.portalSequence}`;
  }

  /**
   * Create a bidirectional portal link between origin and destination systems
   * Returns both portal snapshots [originPortal, destPortal]
   */
  createPortalPair(
    originSystemId: string,
    originPosition: { x: number; y: number; z: number },
    originRadius: number,
    destSystemId: string,
    destPosition: { x: number; y: number; z: number },
    destRadius: number
  ): [PortalSnapshot, PortalSnapshot] {
    const originId = this.generatePortalId();
    const destId = this.generatePortalId();

    const originPortal: PortalSnapshot = {
      id: originId,
      position: { ...originPosition },
      radius: originRadius,
      linkedPortalId: destId,
      eyeState: { gazeTarget: 'ship' as const, eyelidOpen: 1, intensity: 1 }
    };

    const destPortal: PortalSnapshot = {
      id: destId,
      position: { ...destPosition },
      radius: destRadius,
      linkedPortalId: originId,
      eyeState: { gazeTarget: 'ship' as const, eyelidOpen: 1, intensity: 1 }
    };

    this.registerPortal(originPortal, originSystemId);
    this.registerPortal(destPortal, destSystemId);

    GameLogger.info(LogCategory.PORTAL, 'Portal pair created', { 
      origin: { systemId: originSystemId, portalId: originId },
      dest: { systemId: destSystemId, portalId: destId }
    });

    return [originPortal, destPortal];
  }

  /**
   * Get all registered systems with their portal counts
   */
  getAllSystems(): Array<{ systemId: string; portalCount: number }> {
    return Array.from(this.systemPortals.entries()).map(([systemId, portalIds]) => ({
      systemId,
      portalCount: portalIds.length
    }));
  }

  /**
   * Serialize entire portal network to JSON-compatible structure
   */
  serialize(): {
    portals: Array<PortalSnapshot & { systemId?: string }>;
    systems: Array<{ systemId: string; portalIds: string[] }>;
  } {
    const portalsArray: Array<PortalSnapshot & { systemId?: string }> = [];
    
    for (const [systemId, portalIds] of this.systemPortals.entries()) {
      for (const portalId of portalIds) {
        const portal = this.portals.get(portalId);
        if (portal) {
          portalsArray.push({ ...portal, systemId });
        }
      }
    }

    const systems = Array.from(this.systemPortals.entries()).map(([systemId, portalIds]) => ({
      systemId,
      portalIds
    }));

    return { portals: portalsArray, systems };
  }

  /**
   * Load portal network from serialized data
   */
  deserialize(data: {
    portals: Array<PortalSnapshot & { systemId?: string }>;
    systems: Array<{ systemId: string; portalIds: string[] }>;
  }): void {
    this.clear();
    
    // Restore portals
    for (const portalData of data.portals) {
      const { systemId, ...portal } = portalData;
      this.portals.set(portal.id, portal);
      
      // Update sequence to avoid ID collisions
      const match = portal.id.match(/portal-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        this.portalSequence = Math.max(this.portalSequence, num);
      }
    }
    
    // Restore system mappings
    for (const system of data.systems) {
      this.systemPortals.set(system.systemId, [...system.portalIds]);
    }
    
    GameLogger.info(LogCategory.PORTAL, 'Portal registry deserialized', { 
      portalCount: this.portals.size,
      systemCount: this.systemPortals.size
    });
  }

  /**
   * Clear all portal data (useful for new game)
   */
  clear(): void {
    this.portals.clear();
    this.systemPortals.clear();
    this.portalSequence = 0;
    GameLogger.info(LogCategory.PORTAL, 'Portal registry cleared');
  }

  /**
   * Get statistics about the portal network
   */
  getStats(): {
    totalPortals: number;
    totalSystems: number;
    averagePortalsPerSystem: number;
    linkedPortals: number;
  } {
    const totalPortals = this.portals.size;
    const totalSystems = this.systemPortals.size;
    const linkedPortals = Array.from(this.portals.values()).filter(p => p.linkedPortalId).length;
    
    return {
      totalPortals,
      totalSystems,
      averagePortalsPerSystem: totalSystems > 0 ? totalPortals / totalSystems : 0,
      linkedPortals
    };
  }
}
