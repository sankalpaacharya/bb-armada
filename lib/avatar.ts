import { AVATAR_BACKGROUNDS, PORTRAIT_COUNT, type Avatar } from "./captains";
import { PORTRAITS } from "./portraits";

PORTRAITS satisfies { length: typeof PORTRAIT_COUNT };

export const portraitOf = (avatar: Avatar): string =>
  PORTRAITS[avatar.character];

export const backgroundOf = (avatar: Avatar): string =>
  AVATAR_BACKGROUNDS[avatar.background].color;

const randomBelow = (bound: number): number =>
  crypto.getRandomValues(new Uint32Array(1))[0] % bound;

export function randomAvatar(): Avatar {
  return {
    style: "anime",
    character: randomBelow(PORTRAIT_COUNT),
    background: randomBelow(AVATAR_BACKGROUNDS.length),
  };
}

/** A different character on the same background. */
export function nextCharacter(avatar: Avatar): Avatar {
  return {
    ...avatar,
    character:
      (avatar.character + 1 + randomBelow(PORTRAIT_COUNT - 1)) % PORTRAIT_COUNT,
  };
}
