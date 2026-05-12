import { Setlist, Song } from '../types.ts';

export const setlistService = {
  calculateTotalSeconds(setlist: Partial<Setlist>, songs: Song[]): number {
    let total = 0;
    const defaultGap = setlist.default_gap ?? 10;
    
    songs.forEach((song, i) => {
      const duration = song.duration !== null ? song.duration : (song.song_library?.default_duration || 0);
      total += duration;
      if (i < songs.length - 1) {
        total += song.custom_pause ?? defaultGap;
      }
    });
    return total;
  },

  formatDuration(totalSeconds: number): string {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    if (h > 0) {
      return `${h}h ${m.toString().padStart(2, '0')}m`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
};
