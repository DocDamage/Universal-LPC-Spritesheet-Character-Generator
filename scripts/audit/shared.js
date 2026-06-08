export const ANIMATIONS = [
  { value: "walk", label: "Walk Cycle", folderName: "walk" },
  { value: "slash", label: "Slash / Melee", folderName: "slash" },
  { value: "shoot", label: "Shoot / Bow", folderName: "shoot" },
  { value: "thrust", label: "Thrust / Spear", folderName: "thrust" },
  { value: "cast", label: "Cast / Spell", folderName: "cast" },
  { value: "spellcast", label: "Spellcast", folderName: "spellcast" },
  { value: "hurt", label: "Hurt / Dead", folderName: "hurt" },
  { value: "bow", label: "Bow", folderName: "bow" },
  { value: "jump", label: "Jump", folderName: "jump" },
  { value: "sit", label: "Sit", folderName: "sit" },
  { value: "climb", label: "Climb", folderName: "climb" },
  { value: "crawl", label: "Crawl", folderName: "crawl" },
  { value: "fly", label: "Fly", folderName: "fly" },
  { value: "swim", label: "Swim", folderName: "swim" },
  { value: "ride", label: "Ride", folderName: "ride" },
  { value: "combat_idle", label: "Combat Idle", folderName: "combat_idle" },
  { value: "backslash", label: "Backslash", folderName: "backslash" },
  { value: "halfslash", label: "Halfslash", folderName: "halfslash" },
];

export function variantToFilename(variant) {
  return variant ? variant.replace(/_/g, "-") : "";
}

export function remapAnimationName(animName) {
  if (animName === "combat") return "combat_idle";
  if (animName === "1h_slash") return "slash";
  if (animName === "1h_backslash") return "backslash";
  if (animName === "1h_halfslash") return "halfslash";
  return animName;
}
