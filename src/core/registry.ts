import type { Recipe, RecipeRoom } from './types';

export const ROOM_ORDER: RecipeRoom[] = ['time', 'structure', 'people', 'texture'];

const modules = import.meta.glob<{ default: Recipe }>('../recipes/*.ts', { eager: true });

function roomIndex(room: RecipeRoom): number {
  const i = ROOM_ORDER.indexOf(room);
  return i >= 0 ? i : ROOM_ORDER.length;
}

export function roomOf(recipe: Recipe): RecipeRoom {
  return recipe.room;
}

export const recipes: Recipe[] = Object.values(modules)
  .map((m) => m.default)
  .filter(Boolean)
  .sort((a, b) => {
    const ra = roomIndex(a.room);
    const rb = roomIndex(b.room);
    if (ra !== rb) return ra - rb;
    return a.id.localeCompare(b.id);
  });
