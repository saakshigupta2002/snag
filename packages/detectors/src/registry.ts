import type { Detector } from './types.js';
import { rageClick } from './detectors/rage-click.js';
import { deadClick } from './detectors/dead-click.js';
import { consoleError } from './detectors/console-error.js';
import { networkFailure } from './detectors/network-failure.js';
import { formAbandonment } from './detectors/form-abandonment.js';
import { backwardNavigation } from './detectors/backward-navigation.js';
import {
  navigationThrash,
  rapidBounce,
  refreshSpam,
  repeatedFormErrors,
} from './detectors/tier2.js';

/**
 * The open/closed seam: adding a detector = drop a module in detectors/,
 * implement the Detector interface, and register it here. No core changes.
 */
export const registry: Detector[] = [
  // Tier 1 — default on
  rageClick,
  deadClick,
  consoleError,
  networkFailure,
  formAbandonment,
  backwardNavigation,
  // Tier 2 — default off until tuned against real traffic (Principle 2)
  navigationThrash,
  refreshSpam,
  rapidBounce,
  repeatedFormErrors,
];

export function getDetector(id: string): Detector | undefined {
  return registry.find((d) => d.id === id);
}
