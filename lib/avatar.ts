import * as adventurer from "@dicebear/adventurer";
import { createAvatar } from "@dicebear/core";

import type { Avatar } from "./captains";

const STYLES = { adventurer } satisfies Record<Avatar["style"], unknown>;

const rendered = new Map<string, string>();

/** The avatar as an SVG data URI, generated locally once per style and seed. */
export function avatarDataUri(avatar: Avatar): string {
  const key = `${avatar.style}:${avatar.seed}`;
  let uri = rendered.get(key);
  if (uri === undefined) {
    uri = createAvatar(STYLES[avatar.style], { seed: avatar.seed }).toDataUri();
    rendered.set(key, uri);
  }
  return uri;
}

const SEED_LENGTH = 10;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function randomAvatar(): Avatar {
  const bytes = crypto.getRandomValues(new Uint8Array(SEED_LENGTH));
  const seed = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
  return { style: "adventurer", seed };
}
