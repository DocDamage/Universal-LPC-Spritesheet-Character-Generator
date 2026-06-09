// Slot configuration — barrel exports

export type { SlotKind, SlotDef, SlotOption } from "./types.ts";
export { SLOT_CONFIG, getSlotTypeNames } from "./data.ts";
export {
  getBodyTypeOptions,
  getSlotOptions,
  getDefaultRecolor,
  isOptionSelected,
  clearSlotSelections,
  getSlotSelectedValue,
  randomizeSlot,
  randomizeAll,
} from "./utils.ts";
