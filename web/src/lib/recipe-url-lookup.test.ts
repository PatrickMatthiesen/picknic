import { expect, test } from "bun:test";
import { pinnedRecipeLookup } from "./recipe-url-lookup";

test("pinned recipe DNS lookup honors Node family-selection results without resolving again", () => {
  const address = { address: "93.184.215.14", family: 4 };
  const lookup = pinnedRecipeLookup(address);
  lookup("recipes.example", { all: true }, (error, addresses) => {
    expect(error).toBeNull();
    expect(addresses).toEqual([address]);
  });
  lookup("recipes.example", {}, (error, ip, family) => {
    expect(error).toBeNull();
    expect(ip).toBe(address.address);
    expect(family).toBe(4);
  });
});
