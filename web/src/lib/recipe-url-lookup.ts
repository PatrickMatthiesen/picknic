import type { LookupAddress } from "node:dns";
import type { LookupFunction } from "node:net";

// Reuse only the address already checked against the import network policy.
// Node's automatic family selection requests an array with options.all.
export function pinnedRecipeLookup(address: LookupAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) callback(null, [address]);
    else callback(null, address.address, address.family);
  };
}
