// Custom weapon import — constants

import { FRAME_SIZE, ANIMATION_OFFSETS } from "../../../state/constants.ts";

export const STANDARD_SHEET_WIDTH = 13 * FRAME_SIZE;
export const STANDARD_SHEET_HEIGHT =
  Math.max(...Object.values(ANIMATION_OFFSETS)) + 4 * FRAME_SIZE;

export const ANIMATION_OFFSET_BY_NAME = ANIMATION_OFFSETS as Record<
  string,
  number
>;

export const MAINHAND_IMPORT_TYPE_NAMES = new Set([
  "weapon",
  "weapon_magic_crystal",
]);
