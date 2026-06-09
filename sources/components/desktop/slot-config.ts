// Slot configuration — barrel re-export
// This file is kept for backward compatibility.
// New code should import from "./slot-config/index.ts" or "./slot-config" directly.

export type { SlotKind, SlotDef, SlotOption } from "./slot-config/types.ts";
export { SLOT_CONFIG, getSlotTypeNames } from "./slot-config/data.ts";
export {
  getBodyTypeOptions,
  getSlotOptions,
  getDefaultRecolor,
  isOptionSelected,
  clearSlotSelections,
  getSlotSelectedValue,
  randomizeSlot,
  randomizeAll,
} from "./slot-config/utils.ts";
