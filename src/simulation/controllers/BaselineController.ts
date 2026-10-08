import type { TrafficController } from "./TrafficController";

export class BaselineController implements TrafficController {
  decide() {
    return null;
  }
}
