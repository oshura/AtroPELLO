import { AtmosphereAutoLandingCamera, AtmosphereAutoLandingCameraHost } from './atmosphere-auto-landing-camera';
import { CameraMode } from '../../Camera';
import { LandingApproachContext } from '../../types/landing.types';

function makeCamera() {
  return {
    position: { x: 0, y: 0, z: 0 },
    target: { x: 0, y: 0, z: 1 },
    up: { x: 0, y: 1, z: 0 },
    mode: CameraMode.COCKPIT as CameraMode,
    getCurrentMode() { return this.mode; },
    setCameraMode: jasmine.createSpy('setCameraMode').and.callFake(function (this: { mode: CameraMode }, m: CameraMode) { this.mode = m; }),
    seedManualTransform: jasmine.createSpy('seedManualTransform'),
    markDirty: jasmine.createSpy('markDirty'),
  };
}

function makeHost(opts: { camera?: ReturnType<typeof makeCamera> | null; velocity?: { x: number; y: number; z: number }; hold?: boolean } = {}) {
  const camera = opts.camera === null ? null : (opts.camera ?? makeCamera());
  const ship = { position: { x: 0, y: 0, z: 0 }, velocity: opts.velocity ?? { x: 0, y: 0, z: 0 }, forwardDirection: { x: 0, y: 0, z: 1 } };
  const spies = { dust: jasmine.createSpy('spawnAutoLandingDust'), cue: jasmine.createSpy('startAutoLandingCue'), stopCue: jasmine.createSpy('stopAutoLandingCue') };
  const host: AtmosphereAutoLandingCameraHost = {
    getCamera: () => camera as never,
    getSpaceship: () => ship,
    getLandingContext: () => ({ autoLand: true, surfaceNormal: { x: 0, y: 1, z: 0 } } as unknown as LandingApproachContext),
    hasCinematicCameraHold: () => opts.hold ?? false,
    deriveLandingNormal: () => ({ x: 0, y: 1, z: 0 }),
    resolveContactPoint: () => ({ x: 0, y: 0, z: 0 }),
    buildPerpendicularGroundDirection: () => ({ x: 1, y: 0, z: 0 }),
    spawnAutoLandingDust: spies.dust,
    startAutoLandingCue: spies.cue,
    stopAutoLandingCue: spies.stopCue,
  };
  return { host, camera, spies };
}

const ctx = { autoLand: true, surfaceNormal: { x: 0, y: 1, z: 0 } } as unknown as LandingApproachContext;

describe('AtmosphereAutoLandingCamera', () => {
  it('start activa la cámara, pasa a MANUAL y aplica pose + polvo', () => {
    spyOn(performance, 'now').and.returnValue(0);
    const { host, camera, spies } = makeHost();
    const cam = new AtmosphereAutoLandingCamera();
    cam.start(host, ctx);
    expect(cam.isActive).toBe(true);
    expect(camera!.setCameraMode).toHaveBeenCalledWith(CameraMode.MANUAL);
    expect(camera!.seedManualTransform).toHaveBeenCalled();
    expect(spies.dust).toHaveBeenCalled();
  });

  it('start con hold cinemático activo difiere (pending) y NO activa', () => {
    const { host } = makeHost({ hold: true });
    const cam = new AtmosphereAutoLandingCamera();
    cam.start(host, ctx);
    expect(cam.isActive).toBe(false);
    expect(cam.takePending()).toBe(ctx);
    expect(cam.takePending()).toBeNull(); // takePending limpia
  });

  it('update no hace nada si no está activa (early-return HOT)', () => {
    const { host, camera } = makeHost();
    new AtmosphereAutoLandingCamera().update(host);
    expect(camera!.seedManualTransform).not.toHaveBeenCalled();
  });

  it('update libera la cámara tras el min-hold con velocidad lateral baja, y restaura el modo previo', () => {
    spyOn(performance, 'now').and.returnValues(0, 1000); // start@0, update@1000 (>900 min-hold)
    const { host, camera } = makeHost({ velocity: { x: 0, y: 0, z: 0 } }); // lateral 0 <= 0.4
    const cam = new AtmosphereAutoLandingCamera();
    cam.start(host, ctx);
    cam.update(host);
    expect(cam.isActive).toBe(false);
    expect(camera!.setCameraMode).toHaveBeenCalledWith(CameraMode.COCKPIT); // restaura el modo previo
  });

  it('update NO libera antes del min-hold', () => {
    spyOn(performance, 'now').and.returnValues(0, 100); // update@100 (<900)
    const { host } = makeHost({ velocity: { x: 0, y: 0, z: 0 } });
    const cam = new AtmosphereAutoLandingCamera();
    cam.start(host, ctx);
    cam.update(host);
    expect(cam.isActive).toBe(true);
  });
});
