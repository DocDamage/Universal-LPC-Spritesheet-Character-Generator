import { type SavedSnapshot } from "../components/desktop/workflow-tools/types.ts";
import { applyStudioProjectSnapshot } from "./studio-projects.ts";
import { triggerRender } from "../components/render-effect.ts";

export type FavoriteEntry = {
  label: string;
  snapshot: SavedSnapshot;
};

const FAVORITES_KEY = "lpc-free-favorite-builds-v2";

export const favoritesStore = {
  favorites: [] as FavoriteEntry[],

  loadFavorites(): FavoriteEntry[] {
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      this.favorites = stored ? JSON.parse(stored) : [];
    } catch {
      this.favorites = [];
    }
    return this.favorites;
  },

  saveFavorites(): void {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(this.favorites));
  },

  addFavorite(label: string, snapshot: SavedSnapshot): void {
    this.loadFavorites();
    // Keep maximum of 8 favorites
    this.favorites = [{ label, snapshot }, ...this.favorites].slice(0, 8);
    this.saveFavorites();
  },

  removeFavorite(index: number): void {
    this.loadFavorites();
    this.favorites.splice(index, 1);
    this.saveFavorites();
  },

  async loadFavorite(entry: FavoriteEntry): Promise<void> {
    applyStudioProjectSnapshot(entry.snapshot);
    await triggerRender();
  }
};
