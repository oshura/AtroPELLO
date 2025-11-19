import { Camera } from '../Camera';
import { Spaceship } from '../game-objects/Spaceship';
import { Vector3 } from '../../types/game.types';
import { GameLogger } from '../utils/GameLogger';
import { LogCategory } from '../../services/logging.service';

/**
 * Test de integración para verificar la relación entre cámara y nave
 */
export class CameraSpaceshipIntegrationTest {
  private camera: Camera;
  private spaceship: Spaceship;

  constructor() {
    this.camera = new Camera(800/600); // aspect ratio típico
    this.spaceship = new Spaceship();
  }

  /**
   * Ejecuta todos los tests de integración
   */
  public runAllTests(): TestResults {
  try { GameLogger.info(LogCategory.DEBUG, '🧪 Ejecutando tests de integración cámara-nave...'); } catch {}
    
    const results: TestResults = {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      details: []
    };

    // Test 1: Posición inicial
    this.runTest(results, 'Initial Position', () => this.testInitialPosition());
    
    // Test 2: Yaw (Q/E)
    this.runTest(results, 'Yaw Rotation (Q/E)', () => this.testYawRotation());
    
    // Test 3: Pitch (W/S)
    this.runTest(results, 'Pitch Rotation (W/S)', () => this.testPitchRotation());
    
    // Test 4: Roll (A/D)
    this.runTest(results, 'Roll Rotation (A/D)', () => this.testRollRotation());
    
    // Test 5: Combinación de rotaciones
    this.runTest(results, 'Combined Rotations', () => this.testCombinedRotations());

  try { GameLogger.info(LogCategory.DEBUG, `✅ Tests completados: ${results.passedTests}/${results.totalTests} exitosos`); } catch {}
    return results;
  }

  /**
   * Ejecuta un test individual y registra el resultado
   */
  private runTest(results: TestResults, testName: string, testFunction: () => TestResult): void {
    results.totalTests++;
    try {
      const result = testFunction();
      if (result.passed) {
        results.passedTests++;
  try { GameLogger.info(LogCategory.DEBUG, `✅ ${testName}: ${result.message}`); } catch {}
      } else {
        results.failedTests++;
  try { GameLogger.warn(LogCategory.DEBUG, `❌ ${testName}: ${result.message}`); } catch {}
      }
      results.details.push({ name: testName, ...result });
    } catch (error) {
      results.failedTests++;
      const errorMessage = `Error en test: ${error}`;
  try { GameLogger.error(LogCategory.DEBUG, `❌ ${testName}: ${errorMessage}`); } catch {}
      results.details.push({ 
        name: testName, 
        passed: false, 
        message: errorMessage,
        expected: 'Sin errores',
        actual: String(error)
      });
    }
  }

  /**
   * Test 1: Verifica la posición inicial relativa
   */
  private testInitialPosition(): TestResult {
    // Reset ambos objetos
    this.spaceship.reset();
    this.camera.update(this.spaceship, 0.016); // ~60fps
    
    const relativePos = this.getRelativePosition();
    const distance = this.getDistance();
    const angle = this.getVerticalAngle();
    
    // Verificaciones
    const expectedDistance = 2.0; // followDistance
    const expectedAngle = 15; // pitchAngle en grados
    const tolerance = 0.1;
    
    const distanceOk = Math.abs(distance - expectedDistance) < tolerance;
    const angleOk = Math.abs(angle - expectedAngle) < 2; // 2 grados de tolerancia más estricta
    const behindNave = relativePos.z < 0; // La cámara debe estar detrás (Z negativo en local)
    
    if (distanceOk && angleOk && behindNave) {
      return {
        passed: true,
        message: `Posición correcta: distancia=${distance.toFixed(2)}, ángulo=${angle.toFixed(1)}°`,
        expected: `distancia≈${expectedDistance}, ángulo≈${expectedAngle}°, detrás de nave`,
        actual: `distancia=${distance.toFixed(2)}, ángulo=${angle.toFixed(1)}°, z=${relativePos.z.toFixed(2)}`
      };
    } else {
      return {
        passed: false,
        message: `Posición incorrecta`,
        expected: `distancia≈${expectedDistance}, ángulo≈${expectedAngle}°, detrás de nave`,
        actual: `distancia=${distance.toFixed(2)}, ángulo=${angle.toFixed(1)}°, z=${relativePos.z.toFixed(2)}`
      };
    }
  }

  /**
   * Test 2: Verifica que el yaw mantenga la relación
   */
  private testYawRotation(): TestResult {
    this.spaceship.reset();
    
    // Obtener posición inicial
    this.camera.update(this.spaceship, 0.016);
    const initialDistance = this.getDistance();
    const initialAngle = this.getVerticalAngle();
    
    // Aplicar rotación de yaw (90 grados)
    this.spaceship.rotation.y = Math.PI / 2; // 90 grados
    this.camera.update(this.spaceship, 0.016);
    
    // Verificar que la distancia y ángulo se mantienen
    const newDistance = this.getDistance();
    const newAngle = this.getVerticalAngle();
    const relativePos = this.getRelativePosition();
    
    const distanceMaintained = Math.abs(newDistance - initialDistance) < 0.1;
    const angleMaintained = Math.abs(newAngle - initialAngle) < 5;
    const stillBehind = relativePos.z < 0;
    
    if (distanceMaintained && angleMaintained && stillBehind) {
      return {
        passed: true,
        message: `Yaw correcto: distancia mantenida, ángulo mantenido`,
        expected: `Mantener distancia=${initialDistance.toFixed(2)}, ángulo=${initialAngle.toFixed(1)}°`,
        actual: `distancia=${newDistance.toFixed(2)}, ángulo=${newAngle.toFixed(1)}°`
      };
    } else {
      return {
        passed: false,
        message: `Yaw incorrecto`,
        expected: `Mantener distancia=${initialDistance.toFixed(2)}, ángulo=${initialAngle.toFixed(1)}°`,
        actual: `distancia=${newDistance.toFixed(2)}, ángulo=${newAngle.toFixed(1)}°, z=${relativePos.z.toFixed(2)}`
      };
    }
  }

  /**
   * Test 3: Verifica que el pitch mantenga la relación
   */
  private testPitchRotation(): TestResult {
    this.spaceship.reset();
    
    this.camera.update(this.spaceship, 0.016);
    const initialDistance = this.getDistance();
    
    // Aplicar rotación de pitch (30 grados)
    this.spaceship.rotation.x = Math.PI / 6; // 30 grados
    this.camera.update(this.spaceship, 0.016);
    
    const newDistance = this.getDistance();
    const relativePos = this.getRelativePosition();
    
    const distanceMaintained = Math.abs(newDistance - initialDistance) < 0.1;
    const stillBehind = relativePos.z < 0;
    
    if (distanceMaintained && stillBehind) {
      return {
        passed: true,
        message: `Pitch correcto: distancia mantenida`,
        expected: `Mantener distancia=${initialDistance.toFixed(2)}`,
        actual: `distancia=${newDistance.toFixed(2)}`
      };
    } else {
      return {
        passed: false,
        message: `Pitch incorrecto`,
        expected: `Mantener distancia=${initialDistance.toFixed(2)}`,
        actual: `distancia=${newDistance.toFixed(2)}, z=${relativePos.z.toFixed(2)}`
      };
    }
  }

  /**
   * Test 4: Verifica que el roll mantenga la relación (solo distancia, el ángulo puede cambiar con roll)
   */
  private testRollRotation(): TestResult {
    this.spaceship.reset();
    
    this.camera.update(this.spaceship, 0.016);
    const initialDistance = this.getDistance();
    const initialRelativePos = this.getRelativePosition();
    
    // Aplicar rotación de roll (45 grados)
    this.spaceship.rotation.z = Math.PI / 4; // 45 grados
    this.camera.update(this.spaceship, 0.016);
    
    const newDistance = this.getDistance();
    const newRelativePos = this.getRelativePosition();
    
    // En roll, la distancia debe mantenerse y la posición relativa en el plano XZ debe ser similar
    const distanceMaintained = Math.abs(newDistance - initialDistance) < 0.1;
    const stillBehind = newRelativePos.z < 0;
    const relativeXZDistance = Math.sqrt(newRelativePos.x * newRelativePos.x + newRelativePos.z * newRelativePos.z);
    const initialXZDistance = Math.sqrt(initialRelativePos.x * initialRelativePos.x + initialRelativePos.z * initialRelativePos.z);
    const xzDistanceMaintained = Math.abs(relativeXZDistance - initialXZDistance) < 0.1;
    
    if (distanceMaintained && stillBehind && xzDistanceMaintained) {
      return {
        passed: true,
        message: `Roll correcto: distancia y posición XZ mantenidas`,
        expected: `Mantener distancia=${initialDistance.toFixed(2)}, XZ=${initialXZDistance.toFixed(2)}`,
        actual: `distancia=${newDistance.toFixed(2)}, XZ=${relativeXZDistance.toFixed(2)}`
      };
    } else {
      return {
        passed: false,
        message: `Roll incorrecto`,
        expected: `Mantener distancia=${initialDistance.toFixed(2)}, XZ=${initialXZDistance.toFixed(2)}`,
        actual: `distancia=${newDistance.toFixed(2)}, XZ=${relativeXZDistance.toFixed(2)}, z=${newRelativePos.z.toFixed(2)}`
      };
    }
  }

  /**
   * Test 5: Verifica combinación de rotaciones
   */
  private testCombinedRotations(): TestResult {
    this.spaceship.reset();
    
    this.camera.update(this.spaceship, 0.016);
    const initialDistance = this.getDistance();
    
    // Aplicar rotaciones combinadas
    this.spaceship.rotation.x = Math.PI / 6;  // 30° pitch
    this.spaceship.rotation.y = Math.PI / 4;  // 45° yaw
    this.spaceship.rotation.z = Math.PI / 8;  // 22.5° roll
    this.camera.update(this.spaceship, 0.016);
    
    const newDistance = this.getDistance();
    const relativePos = this.getRelativePosition();
    
    const distanceMaintained = Math.abs(newDistance - initialDistance) < 0.1;
    const stillBehind = relativePos.z < 0;
    
    if (distanceMaintained && stillBehind) {
      return {
        passed: true,
        message: `Rotaciones combinadas correctas`,
        expected: `Mantener distancia=${initialDistance.toFixed(2)}`,
        actual: `distancia=${newDistance.toFixed(2)}`
      };
    } else {
      return {
        passed: false,
        message: `Rotaciones combinadas incorrectas`,
        expected: `Mantener distancia=${initialDistance.toFixed(2)}`,
        actual: `distancia=${newDistance.toFixed(2)}, z=${relativePos.z.toFixed(2)}`
      };
    }
  }

  /**
   * Calcula la posición relativa de la cámara en el sistema local de la nave
   */
  private getRelativePosition(): Vector3 {
    const dx = this.camera.position.x - this.spaceship.position.x;
    const dy = this.camera.position.y - this.spaceship.position.y;
    const dz = this.camera.position.z - this.spaceship.position.z;
    
    // Transformar al sistema local de la nave (inverso)
    const cosY = Math.cos(-this.spaceship.rotation.y);
    const sinY = Math.sin(-this.spaceship.rotation.y);
    const cosX = Math.cos(-this.spaceship.rotation.x);
    const sinX = Math.sin(-this.spaceship.rotation.x);
    const cosZ = Math.cos(-this.spaceship.rotation.z);
    const sinZ = Math.sin(-this.spaceship.rotation.z);
    
    // Aplicar rotaciones inversas
    let x = dx * cosY - dz * sinY;
    let y = dy;
    let z = dx * sinY + dz * cosY;
    
    const tempY = y * cosX - z * sinX;
    z = y * sinX + z * cosX;
    y = tempY;
    
    const tempX = x * cosZ - y * sinZ;
    y = x * sinZ + y * cosZ;
    x = tempX;
    
    return { x, y, z };
  }

  /**
   * Calcula la distancia entre cámara y nave
   */
  private getDistance(): number {
    const dx = this.camera.position.x - this.spaceship.position.x;
    const dy = this.camera.position.y - this.spaceship.position.y;
    const dz = this.camera.position.z - this.spaceship.position.z;
    
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Calcula el ángulo vertical de la cámara respecto a la nave
   */
  private getVerticalAngle(): number {
    const relativePos = this.getRelativePosition();
    const horizontalDistance = Math.sqrt(relativePos.x * relativePos.x + relativePos.z * relativePos.z);
    
    return Math.abs(Math.atan2(relativePos.y, horizontalDistance)) * (180 / Math.PI);
  }
}

// Tipos para los resultados del test
interface TestResult {
  passed: boolean;
  message: string;
  expected: string;
  actual: string;
}

interface TestResults {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  details: Array<TestResult & { name: string }>;
}

// Función para ejecutar los tests desde la consola
export function runCameraSpaceshipTests(): TestResults {
  const tester = new CameraSpaceshipIntegrationTest();
  return tester.runAllTests();
}