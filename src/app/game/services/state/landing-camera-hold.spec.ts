import { LandingCameraHold, LandingCameraHoldHost } from './landing-camera-hold';
import { CameraMode } from '../../Camera';
import { LandingApproachContext } from '../../types/landing.types';

function makeHost(opts: { awaiting?: boolean; pending?: LandingApproachContext | null; camera?: boolean } = {}) {
  const camera = { setCameraMode: jasmine.createSpy('setCameraMode') };
  const spies = {
    clearPending: jasmine.createSpy('clearAutoLandingPending'),
    takePending: jasmine.createSpy('takeAutoLandingPending').and.returnValue(opts.pending ?? null),
    startAuto: jasmine.createSpy('startAutoLandingCamera'),
  };
  const host: LandingCameraHoldHost = {
    getCamera: () => (opts.camera === false ? null : camera),
    isPanelAwaitingUser: () => opts.awaiting ?? false,
    clearAutoLandingPending: spies.clearPending,
    takeAutoLandingPending: spies.takePending,
    startAutoLandingCamera: spies.startAuto,
  };
  return { host, camera, spies };
}

describe('LandingCameraHold', () => {
  it('acquire con el panel esperando activa el hold', () => {
    const { host } = makeHost({ awaiting: true });
    const h = new LandingCameraHold();
    h.acquire(host, CameraMode.COCKPIT);
    expect(h.isActive).toBe(true);
  });

  it('acquire SIN panel esperando NO activa el hold y restaura el modo previo', () => {
    const { host, camera } = makeHost({ awaiting: false });
    const h = new LandingCameraHold();
    h.acquire(host, CameraMode.COCKPIT);
    expect(h.isActive).toBe(false);
    expect(camera.setCameraMode).toHaveBeenCalledWith(CameraMode.COCKPIT);
  });

  it('release sin hold limpia el pending de auto-aterrizaje y no restaura cámara', () => {
    const { host, camera, spies } = makeHost();
    new LandingCameraHold().release(host);
    expect(spies.clearPending).toHaveBeenCalled();
    expect(camera.setCameraMode).not.toHaveBeenCalled();
  });

  it('release con hold restaura el modo previo y re-dispara el auto-aterrizaje diferido', () => {
    const pending = {} as LandingApproachContext;
    const { host, camera, spies } = makeHost({ awaiting: true, pending });
    const h = new LandingCameraHold();
    h.acquire(host, CameraMode.REAR_TRACKING);
    h.release(host);
    expect(h.isActive).toBe(false);
    expect(camera.setCameraMode).toHaveBeenCalledWith(CameraMode.REAR_TRACKING);
    expect(spies.startAuto).toHaveBeenCalledWith(pending);
  });

  it('release con restoreCamera:false NO restaura la cámara', () => {
    const { host, camera } = makeHost({ awaiting: true });
    const h = new LandingCameraHold();
    h.acquire(host, CameraMode.COCKPIT);
    camera.setCameraMode.calls.reset();
    h.release(host, { restoreCamera: false });
    expect(camera.setCameraMode).not.toHaveBeenCalled();
  });
});
