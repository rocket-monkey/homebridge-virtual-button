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

    // Restore persisted On state. Stateful switches (no cooldown) survive
    // restarts; momentary buttons (cooldown > 0) are always off at boot
    // since the cooldown timer would have lapsed during downtime.
    const cooldown = Number(accessory.context.switch.cooldown ?? 0);
    if (cooldown > 0) {
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
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async setOn(value: CharacteristicValue) {
    this.platform.log.info(
      `Set Characteristic On -> for "${this.accessory.context.switch.name}"`,
      value,
    );
    this.states.On = value as boolean;
    this.persistState();

    if (!!this.accessory.context.switch.cooldown && this.accessory.context.switch.cooldown > 0) {
      setTimeout(() => {
        this.platform.log.info(
          `Cooldown finished for "${this.accessory.context.switch.name}", turning off...`,
        );
        this.states.On = false;
        this.persistState();
        this.service.updateCharacteristic(
          this.platform.Characteristic.On,
          this.states.On,
        );
      }
      , this.accessory.context.switch.cooldown * 1000);
    }

    await sleep(300);
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
