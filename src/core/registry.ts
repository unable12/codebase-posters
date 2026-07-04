import type { Recipe } from './types';

const modules = import.meta.glob<{ default: Recipe }>('../recipes/*.ts', { eager: true });

export const recipes: Recipe[] = Object.values(modules)
  .map((m) => m.default)
  .filter(Boolean)
  .sort((a, b) => a.id.localeCompare(b.id));
