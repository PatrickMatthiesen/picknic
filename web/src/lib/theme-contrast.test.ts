import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
function luminance(hex: string) {
  const [r,g,b] = hex.match(/\w\w/g)!.map(value => { const v = parseInt(value,16)/255; return v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4; });
  return .2126*r! + .7152*g! + .0722*b!;
}
test("primary foreground passes normal-text contrast in both themes and hover states", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const blocks = [css.split(':root {')[1]!.split('}')[0]!, css.split(':root[data-theme="dark"] {')[1]!.split('}')[0]!];
  for (const block of blocks) {
    const foreground = block.match(/--primary-foreground:\s*(#[a-f0-9]+)/i)![1]!;
    for (const token of ["primary", "primary-hover"]) {
      const background = block.match(new RegExp(`--${token}:\\s*(#[a-f0-9]+)`, "i"))![1]!;
      const values = [luminance(foreground.slice(1)), luminance(background.slice(1))].sort((a,b)=>b-a);
      expect((values[0]!+.05)/(values[1]!+.05)).toBeGreaterThanOrEqual(4.5);
    }
  }
});
