import { Service, PlatformAccessory, CharacteristicValue } from "homebridge";

import { ExampleHomebridgePlatform } from "./platform.js";

const sleep = async (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class PlatformSwitchAccessory {
  private service: Service;

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private states = {
    On: false,
  };

  /** Pending auto-off timer; cleared on any subsequent setOn (manual OFF or re-ON). */
  private autoOffTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly platform: ExampleHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.Characteristic.Manufacturer,
        "Default-Manufacturer",
      )
      .setCharacteristic(this.platform.Characteristic.Model, "Default-Model")
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        "Default-Serial",
      );

    this.service =
      this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch);

    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.switch.name,
    );

    // Restore persisted On state. Stateful switches (no auto-off) survive
    // restarts; auto-off buttons are always off at boot since the timer
    // would have lapsed during downtime.
    const autoOffSec = this.getAutoOffSeconds();
    if (autoOffSec > 0) {
      this.states.On = false;
      if (accessory.context.lastOn) {
        accessory.context.lastOn = false;
        this.platform.api.updatePlatformAccessories([accessory]);
      }
    } else {
      this.states.On = accessory.context.lastOn === true;
    }
    this.service.updateCharacteristic(
      this.platform.Characteristic.On,
      this.states.On,
    );

    this.service
      .getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));
  }

  getName(): string {
    return this.accessory.context.switch.name;
  }

  async toggleState() {
    const isOn = this.getOn();
    await this.setOn(!isOn);
    this.service?.updateCharacteristic(
      this.platform.Characteristic.On,
      this.states?.On,
    );
  }

  async setStateOn() {
    await this.setOn(true);
    this.service?.updateCharacteristic(
      this.platform.Characteristic.On,
      this.states?.On,
    );
    await sleep(1500);
    await this.setOn(false);
    this.service?.updateCharacteristic(
      this.platform.Characteristic.On,
      this.states?.On,
    );
  }

  /**
   * Handle "SET" requests from HomeKit. Auto-off semantics: any setOn call
   * cancels any pending auto-off timer; a setOn(true) re-arms it. setOn(false)
   * just cancels. This prevents two bugs from the original `cooldown` impl:
   *   - timer scheduled on every setOn including OFF (no-op noise)
   *   - rapid ON→OFF→ON had the first timer still pending, firing early
   */
  async setOn(value: CharacteristicValue) {
    this.platform.log.info(
      `Set Characteristic On -> for "${this.accessory.context.switch.name}"`,
      value,
    );
    this.states.On = value as boolean;
    this.persistState();

    if (this.autoOffTimer) {
      clearTimeout(this.autoOffTimer);
      this.autoOffTimer = undefined;
    }

    const autoOffSec = this.getAutoOffSeconds();
    if (this.states.On && autoOffSec > 0) {
      this.autoOffTimer = setTimeout(() => {
        this.platform.log.info(
          `Auto-off fired for "${this.accessory.context.switch.name}" after ${autoOffSec}s`,
        );
        this.states.On = false;
        this.persistState();
        this.service.updateCharacteristic(
          this.platform.Characteristic.On,
          this.states.On,
        );
        this.autoOffTimer = undefined;
      }, autoOffSec * 1000);
      this.autoOffTimer.unref?.();
    }

    await sleep(300);
  }

  /**
   * Resolve the auto-off timeout in seconds. Prefers the new `autoOffSeconds`
   * field; falls back to the legacy `cooldown` name (which was a misnomer —
   * it always meant auto-off-after-N-seconds, not a press debounce).
   * Returns 0 (= stateful, no auto-off) for missing/invalid values.
   */
  private getAutoOffSeconds(): number {
    const raw =
      this.accessory.context.switch.autoOffSeconds
      ?? this.accessory.context.switch.cooldown
      ?? 0;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  private persistState() {
    this.accessory.context.lastOn = this.states.On;
    this.platform.api.updatePlatformAccessories([this.accessory]);
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.

   * @example
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  getOn(): CharacteristicValue {
    return this.states.On;
  }
}
