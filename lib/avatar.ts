import { createAvatar } from "@dicebear/core";
import * as micah from "@dicebear/micah";

import type { Avatar } from "./captains";

const STYLES = { micah } satisfies Record<Avatar["style"], unknown>;

const BACKGROUNDS = ["b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf", "c1f4c5"];

const rendered = new Map<string, string>();

/** The avatar as an SVG data URI, generated locally once per style and seed. */
export function avatarDataUri(avatar: Avatar): string {
  const key = `${avatar.style}:${avatar.seed}`;
  let uri = rendered.get(key);
  if (uri === undefined) {
    uri = createAvatar(STYLES[avatar.style], {
      seed: avatar.seed,
      backgroundColor: BACKGROUNDS,
      backgroundType: ["solid"],
    }).toDataUri();
    rendered.set(key, uri);
  }
  return uri;
}

const SEED_LENGTH = 10;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function randomAvatar(): Avatar {
  const bytes = crypto.getRandomValues(new Uint8Array(SEED_LENGTH));
  const seed = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
  return { style: "micah", seed };
}
