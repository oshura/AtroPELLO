import { Spaceship, ThrusterState } from '../../game-objects/Spaceship';
import { Vector3 } from '../../../types/game.types';
import { clamp, vec3Normalize } from '../../math/vector-math';

/**
 * Posicionamiento de la nave durante el aterrizaje: teletransporte limpio (place) y captura/restauración
 * de cinética (velocidad/empuje) al entrar en atmósfera. Antes vivía en GameEngine; la lógica es idéntica.
 * El motor delega vía 1 línea y satisface el host con un adaptador. docs/ARQUITECTURA.md Fase 5.2.
 */
export interface ShipKineticsSnapshot {
  velocity: Vector3;
  currentSpeed: number;
  targetSpeed: number;
  thrusterState: ThrusterState;
  isThrusting: boolean;
}

export interface ShipLandingHost {
  getSpaceship(): Spaceship | null;
  setLastShipPos(pos: Vector3): void;
}

export class ShipLandingPositioner {
  placeShipAtPosition(host: ShipLandingHost, position: Vector3): void {
    const ship = host.getSpaceship();
    if (!ship) {
      return;
    }
    ship.position = { ...position };
    ship.velocity = { x: 0, y: 0, z: 0 };
    ship.angularVelocity = { x: 0, y: 0, z: 0 };
    ship.currentSpeed = 0;
    ship.targetSpeed = 0;
    ship.isThrusting = false;
    ship.thrusterState = ThrusterState.IDLE;
    ship.updateModelMatrix();
    if (ship.boundingSphere) {
      ship.boundingSphere.center = { ...ship.position };
    }
    host.setLastShipPos({ ...ship.position });
    try {
      // Evitar que el recalculo de Void Energy cuente este teletransporte
      ship.resetVoidEnergyBaseline();
    } catch {}
  }

  captureKinetics(host: ShipLandingHost): ShipKineticsSnapshot | null {
    const ship = host.getSpaceship();
    if (!ship) {
      return null;
    }
    return {
      velocity: { ...ship.velocity },
      currentSpeed: Number.isFinite(ship.currentSpeed) ? ship.currentSpeed : 0,
      targetSpeed: Number.isFinite(ship.targetSpeed) ? ship.targetSpeed : 0,
      thrusterState: ship.thrusterState ?? ThrusterState.IDLE,
      isThrusting: !!ship.isThrusting,
    };
  }

  restoreKinetics(
    host: ShipLandingHost,
    snapshot: ShipKineticsSnapshot | null,
    options?: { ensureForwardVelocity?: boolean },
  ): void {
    const ship = host.getSpaceship();
    if (!snapshot || !ship) {
      return;
    }
    const maxSpeed = Math.max(0, ship.maxSpeed ?? snapshot.targetSpeed ?? snapshot.currentSpeed ?? 0);
    const desiredSpeed = clamp(Math.max(snapshot.currentSpeed ?? 0, snapshot.targetSpeed ?? 0), 0, maxSpeed);
    let velocity = { ...snapshot.velocity };
    const magnitude = Math.hypot(velocity.x, velocity.y, velocity.z);
    const rebuildForward = options?.ensureForwardVelocity || magnitude < 0.05;
    if (desiredSpeed <= 0) {
      velocity = { x: 0, y: 0, z: 0 };
    } else if (rebuildForward) {
      const forward = vec3Normalize({ ...ship.forwardDirection });
      if (forward.x || forward.y || forward.z) {
        velocity = {
          x: forward.x * desiredSpeed,
          y: forward.y * desiredSpeed,
          z: forward.z * desiredSpeed,
        };
      } else {
        velocity = { x: 0, y: 0, z: 0 };
      }
    } else {
      const scale = desiredSpeed > 0 && magnitude > 0 ? desiredSpeed / magnitude : 0;
      velocity = {
        x: velocity.x * scale,
        y: velocity.y * scale,
        z: velocity.z * scale,
      };
    }
    ship.velocity = velocity;
    ship.currentSpeed = desiredSpeed;
    const snapshotTarget = Number.isFinite(snapshot.targetSpeed) ? snapshot.targetSpeed : desiredSpeed;
    ship.targetSpeed = clamp(Math.max(desiredSpeed, snapshotTarget), 0, maxSpeed);
    ship.thrusterState = snapshot.thrusterState ?? ship.thrusterState;
    ship.isThrusting = snapshot.isThrusting;
  }
}
