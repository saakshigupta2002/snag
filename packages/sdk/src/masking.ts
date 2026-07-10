import { looksSensitive, maskChars, scrubText } from './redact.js';
import type { SnagOptions } from './types.js';

/**
 * Screen masking config for rrweb. Masking happens in the browser, before
 * any data is sent. Defaults are aggressive on purpose (default to the safe
 * mistake): founders loosen deliberately via `unmask`.
 *
 * Note: rrweb's maskAllInputs is ALWAYS on under the hood; when the user sets
 * maskAllInputs:false we selectively return real text from maskInputFn. That
 * way the pattern safety net still sees every input value.
 */
export function buildMaskingOptions(opts: SnagOptions): Record<string, unknown> {
  const unmaskSelector = (opts.unmask ?? []).join(',');
  const maskSelector = ['.snag-mask', ...(opts.mask ?? [])].join(',');
  const inputsMaskedByDefault = opts.maskAllInputs !== false;

  const maskInputFn = (text: string, element?: HTMLElement): string => {
    const el = element as HTMLInputElement | undefined;
    if (el?.type === 'password') return maskChars(text); // non-negotiable
    if (el && unmaskSelector && el.closest?.(unmaskSelector) && !looksSensitive(text)) return text;
    if (!inputsMaskedByDefault && !looksSensitive(text) && !el?.closest?.(maskSelector)) {
      return text;
    }
    return maskChars(text);
  };

  const maskTextFn = (text: string, element?: HTMLElement | null): string => {
    if (element?.closest?.(maskSelector)) return maskChars(text);
    // Pattern safety net: emails / cards / tokens masked even if untagged.
    return scrubText(text);
  };

  return {
    blockClass: 'snag-block',
    blockSelector: opts.block?.length ? opts.block.join(',') : undefined,
    maskTextClass: 'snag-mask',
    // Route ALL text through maskTextFn so the safety net sees everything.
    maskTextSelector: '*',
    maskAllInputs: true,
    maskInputFn,
    maskTextFn,
  };
}
