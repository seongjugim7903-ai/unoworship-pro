import { Setlist } from './types';

export const storage = {
  exportSetlistJSON(setlist: Setlist): string {
    return JSON.stringify(setlist, null, 2);
  },

  importSetlistJSON(json: string): Setlist | null {
    try {
      return JSON.parse(json) as Setlist;
    } catch {
      return null;
    }
  },
};
