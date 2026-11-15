import { createAvatar } from "@dicebear/core";
import * as micah from "@dicebear/micah";

import type { Avatar } from "./captains";

const BACKGROUNDS = [
  "b6e3f4",
  "c0aede",
  "d1d4f9",
  "ffd5dc",
  "ffdfbf",
  "c1f4c5",
];

const rendered = new Map<string, string>();

/**
 * The avatar's face as an SVG data URI, generated locally once per seed. For
 * a logo avatar it is the stand-in while its project has no logo.
 */
export function avatarDataUri(avatar: Avatar): string {
  let uri = rendered.get(avatar.seed);
  if (uri === undefined) {
    uri = createAvatar(micah, {
      seed: avatar.seed,
      backgroundColor: BACKGROUNDS,
      backgroundType: ["solid"],
    }).toDataUri();
    rendered.set(avatar.seed, uri);
  }
  return uri;
}

const SEED_LENGTH = 10;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function randomAvatar(): Avatar {
  const bytes = crypto.getRandomValues(new Uint8Array(SEED_LENGTH));
  const seed = Array.from(
    bytes,
    (byte) => ALPHABET[byte % ALPHABET.length],
  ).join("");
  return { style: "micah", seed };
}
