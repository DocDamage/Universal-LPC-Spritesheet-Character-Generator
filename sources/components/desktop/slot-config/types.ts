// Slot configuration types

export type SlotKind = "typeName" | "bodyType";

export type SlotDef = {
  label: string;
  kind: SlotKind;
  /** type_name(s) to look up in byTypeName */
  typeNames?: string[];
  /** Which panel this slot appears in */
  panel: "left" | "right";
  /** Whether this slot has a color picker */
  hasColor?: boolean;
  /** Optional dice/randomize button */
  canRandomize?: boolean;
};

export type SlotOption = {
  value: string;
  label: string;
  itemId: string;
  variant?: string;
};
