/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from "homebridge";
import http, { IncomingMessage, Server, ServerResponse } from "http";
import { PlatformSwitchAccessory } from "./platformAccessory";
import { PLATFORM_NAME, PLUGIN_NAME } from "./settings";

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class ExampleHomebridgePlatform implements DynamicPlatformPlugin {
  private requestServer?: Server;
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic =
    this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];
  public readonly instances: PlatformSwitchAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API
  ) {
    this.log.debug("Finished initializing platform:", this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on("didFinishLaunching", () => {
      // make it possible to toggle buttons via http
      this.createHttpService();
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });

    this.handleRequest = this.handleRequest.bind(this);
  }

  createHttpService() {
    this.requestServer = http.createServer((req, res) => {
      // Set CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*"); // This allows all origins
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS, PUT, PATCH, DELETE"
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "X-Requested-With,content-type"
      );
      res.setHeader("Access-Control-Allow-Credentials", "true");

      // Handle preflight OPTIONS request
      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      this.handleRequest(req, res);
    });
    this.requestServer.listen(18082, () =>
      this.log.info("Http server listening on 18082...")
    );
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse
  ) {
    if (request.url?.includes("/toggle")) {
      const [_url, query] = request.url ? request.url.split("?") : [];
      const nameRaw = query ? query.replace("name=", "") : "";
      const name = decodeURIComponent(nameRaw);
      const instance = this.instances.find((i) => {
        return i.getName() === name;
      });
      if (instance) {
        await instance.toggleState();
      } else {
        this.log.error("Could not find instance for name:", name);
      }
    }

    response.writeHead(204); // 204 No content
    response.end();
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info("Loading accessory from cache:", accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {
    if (!this.config.switches) {
      return;
    }
    const switches = this.config.switches;

    // loop over the discovered switches and register each one if it has not already been registered
    for (const button of switches) {
      // generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      const uuid = this.api.hap.uuid.generate(button.name);

      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.find(
        (accessory) => accessory.UUID === uuid
      );

      if (existingAccessory) {
        // the accessory already exists
        this.log.info(
          "Restoring existing accessory from cache:",
          existingAccessory.displayName
        );

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        // existingAccessory.context.device = device;
        // this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        const instance = new PlatformSwitchAccessory(this, existingAccessory);
        this.instances.push(instance);

        // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
        // remove platform accessories when no longer present
        // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        //   existingAccessory,
        // ]);
        // this.log.info(
        //   "Removing existing accessory from cache:",
        //   existingAccessory.displayName
        // );
      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info("Adding new accessory:", button.name);

        // create a new accessory
        const accessory = new this.api.platformAccessory(button.name, uuid);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.switch = button;

        // create the accessory handler for the newly create accessory
        // this is imported from `platformAccessory.ts`
        const instance = new PlatformSwitchAccessory(this, accessory);
        this.instances.push(instance);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ]);
      }
    }
  }
}
