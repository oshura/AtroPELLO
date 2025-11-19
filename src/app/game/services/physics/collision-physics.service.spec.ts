import { TestBed } from '@angular/core/testing';
import { CollisionPhysicsService, CollisionInput } from './collision-physics.service';

describe('CollisionPhysicsService', () => {
  let service: CollisionPhysicsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CollisionPhysicsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Inelastic Collision Physics', () => {
    it('should conserve momentum in head-on collision', () => {
      const input: CollisionInput = {
        position1: { x: 0, y: 0, z: 0 },
        velocity1: { x: 10, y: 0, z: 0 },
        mass1: 1,
        radius1: 1,
        
        position2: { x: 3, y: 0, z: 0 },
        velocity2: { x: -5, y: 0, z: 0 },
        mass2: 1,
        radius2: 1,
        
        restitution: 0 // Completamente inelástico
      };

      const result = service.calculateInelasticCollision(input);

      // En colisión completamente inelástica, ambos objetos deben terminar con la misma velocidad
      // v_final = (m1*v1 + m2*v2) / (m1 + m2) = (1*10 + 1*(-5)) / 2 = 2.5
      expect(result.velocity1.x).toBeCloseTo(2.5, 1);
      expect(result.velocity2.x).toBeCloseTo(2.5, 1);
    });

    it('should handle heavy vs light object collision', () => {
      const input: CollisionInput = {
        position1: { x: 0, y: 0, z: 0 },
        velocity1: { x: 10, y: 0, z: 0 },
        mass1: 100, // Nave pesada
        radius1: 5,
        
        position2: { x: 10, y: 0, z: 0 },
        velocity2: { x: 0, y: 0, z: 0 },
        mass2: 1, // Asteroide ligero
        radius2: 1,
        
        restitution: 0.3
      };

      const result = service.calculateInelasticCollision(input);

      // El objeto pesado debe cambiar poco su velocidad
      expect(result.velocity1.x).toBeCloseTo(10, 0);
      
      // El objeto ligero debe salir disparado
      expect(result.velocity2.x).toBeGreaterThan(10);
    });

    it('should not apply impulse to separating objects', () => {
      const input: CollisionInput = {
        position1: { x: 0, y: 0, z: 0 },
        velocity1: { x: -10, y: 0, z: 0 }, // Alejándose
        mass1: 1,
        radius1: 1,
        
        position2: { x: 3, y: 0, z: 0 },
        velocity2: { x: 5, y: 0, z: 0 }, // Alejándose
        mass2: 1,
        radius2: 1,
        
        restitution: 0.5
      };

      const result = service.calculateInelasticCollision(input);

      // Velocidades no deben cambiar (objetos separándose)
      expect(result.impulseMagnitude).toBe(0);
      expect(result.velocity1.x).toBe(-10);
      expect(result.velocity2.x).toBe(5);
    });

    it('should handle 3D collision correctly', () => {
      const input: CollisionInput = {
        position1: { x: 0, y: 0, z: 0 },
        velocity1: { x: 10, y: 5, z: 3 },
        mass1: 1,
        radius1: 1,
        
        position2: { x: 2, y: 1, z: 0 },
        velocity2: { x: 0, y: 0, z: 0 },
        mass2: 1,
        radius2: 1,
        
        restitution: 0
      };

      const result = service.calculateInelasticCollision(input);

      // Ambos objetos deben conservar momento total
      const momentum1 = {
        x: input.velocity1.x * input.mass1,
        y: input.velocity1.y * input.mass1,
        z: input.velocity1.z * input.mass1
      };
      
      const momentum2Initial = {
        x: input.velocity2.x * input.mass2,
        y: input.velocity2.y * input.mass2,
        z: input.velocity2.z * input.mass2
      };
      
      const totalMomentumBefore = {
        x: momentum1.x + momentum2Initial.x,
        y: momentum1.y + momentum2Initial.y,
        z: momentum1.z + momentum2Initial.z
      };
      
      const totalMomentumAfter = {
        x: result.velocity1.x * input.mass1 + result.velocity2.x * input.mass2,
        y: result.velocity1.y * input.mass1 + result.velocity2.y * input.mass2,
        z: result.velocity1.z * input.mass1 + result.velocity2.z * input.mass2
      };
      
      expect(totalMomentumAfter.x).toBeCloseTo(totalMomentumBefore.x, 5);
      expect(totalMomentumAfter.y).toBeCloseTo(totalMomentumBefore.y, 5);
      expect(totalMomentumAfter.z).toBeCloseTo(totalMomentumBefore.z, 5);
    });

    it('should generate separation vector for overlapping spheres', () => {
      const input: CollisionInput = {
        position1: { x: 0, y: 0, z: 0 },
        velocity1: { x: 10, y: 0, z: 0 },
        mass1: 1,
        radius1: 5,
        
        position2: { x: 8, y: 0, z: 0 }, // Overlap: radios suman 6 pero distancia es 8
        velocity2: { x: 0, y: 0, z: 0 },
        mass2: 1,
        radius2: 1,
        
        restitution: 0.3
      };

      const result = service.calculateInelasticCollision(input);

      // Debe haber vector de separación negativo en x (empuja objeto 1 hacia atrás)
      expect(result.separationVector.x).toBeLessThan(0);
      expect(service.magnitude(result.separationVector)).toBeGreaterThan(0);
    });
  });

  describe('Utility Functions', () => {
    it('should calculate correct magnitude', () => {
      const v = { x: 3, y: 4, z: 0 };
      expect(service.magnitude(v)).toBe(5);
    });

    it('should normalize vector correctly', () => {
      const v = { x: 3, y: 4, z: 0 };
      const normalized = service.normalize(v);
      
      expect(normalized.x).toBeCloseTo(0.6, 5);
      expect(normalized.y).toBeCloseTo(0.8, 5);
      expect(service.magnitude(normalized)).toBeCloseTo(1, 5);
    });
  });
});
