import { LandingPanelController, LandingPanelHost } from './landing-panel-controller';
import { LandingApproachContext } from '../../types/landing.types';

const ctx = {} as LandingApproachContext;

function makeHost(opts: { opens?: boolean; deferred?: boolean } = {}) {
  const spies = {
    open: jasmine.createSpy('openPanelUI').and.returnValue(opts.opens ?? true),
    forceClose: jasmine.createSpy('forceClosePanelUI'),
    playAir: jasmine.createSpy('playLandingPanelAir').and.returnValue({ stop: () => {} }),
    releaseHold: jasmine.createSpy('releaseLandingCinematicCameraHold'),
    logWarn: jasmine.createSpy('logWarn'),
  };
  const host: LandingPanelHost = {
    openPanelUI: spies.open,
    forceClosePanelUI: spies.forceClose,
    playLandingPanelAir: spies.playAir,
    releaseLandingCinematicCameraHold: spies.releaseHold,
    isLandingCameraHoldDeferredForTakeoff: () => opts.deferred ?? false,
    logWarn: spies.logWarn,
  };
  return { host, spies };
}

describe('LandingPanelController', () => {
  it('tryOpen abre y, si está armado, arranca el foco de audio y lo desarma', () => {
    const { host, spies } = makeHost({ opens: true });
    const ctrl = new LandingPanelController();
    ctrl.setAudioFocusArmed(true);
    expect(ctrl.tryOpen(host, ctx)).toBe(true);
    expect(spies.playAir).toHaveBeenCalled();
    // desarmado ⇒ un segundo open no re-arranca audio
    spies.playAir.calls.reset();
    expect(ctrl.tryOpen(host, ctx)).toBe(true);
    expect(spies.playAir).not.toHaveBeenCalled();
  });

  it('tryOpen falla si el panel no se abre: awaiting=false + libera el hold', () => {
    const { host, spies } = makeHost({ opens: false });
    const ctrl = new LandingPanelController();
    ctrl.setAwaitingUser(true);
    expect(ctrl.tryOpen(host, ctx)).toBe(false);
    expect(ctrl.isAwaitingUser).toBe(false);
    expect(spies.releaseHold).toHaveBeenCalledWith('landing-panel-open-failed');
  });

  it('openWithDelay(0) abre inmediatamente', () => {
    const { host, spies } = makeHost({});
    expect(new LandingPanelController().openWithDelay(host, ctx, 0)).toBe(true);
    expect(spies.open).toHaveBeenCalled();
  });

  it('notifyClosed: si el hold está diferido para despegue, NO lo libera', () => {
    const { host, spies } = makeHost({ deferred: true });
    const ctrl = new LandingPanelController();
    ctrl.setAwaitingUser(true);
    ctrl.notifyClosed(host);
    expect(ctrl.isAwaitingUser).toBe(false);
    expect(spies.releaseHold).not.toHaveBeenCalled();
  });

  it('notifyClosed: si no está diferido, libera el hold', () => {
    const { host, spies } = makeHost({ deferred: false });
    new LandingPanelController().notifyClosed(host);
    expect(spies.releaseHold).toHaveBeenCalledWith('landing-panel-closed');
  });

  it('closeUI fuerza el cierre del panel UI', () => {
    const { host, spies } = makeHost({ deferred: true });
    new LandingPanelController().closeUI(host, 'planet-collapse');
    expect(spies.forceClose).toHaveBeenCalledWith('planet-collapse');
  });
});
