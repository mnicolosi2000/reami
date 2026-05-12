export interface SongLibraryEntry {
  id: string;
  title: string;
  artist: string | null;
  default_duration: number;
  created_at: string;
  created_by?: string | null;
  search_normalized?: string | null;
}

export interface Song {
  id: string;
  setlist_id: string;
  song_library_id: string;
  position: number;
  custom_pause: number | null;
  duration: number | null; // Override duration
  song_library?: SongLibraryEntry; // Joined data
}

export interface Setlist {
  id: string;
  name: string;
  date?: string;
  created_at: string;
  total_duration: number;
  default_gap: number;
  songs?: Song[];
}

export interface User {
  id: string;
  username: string;
  createdAt: number;
}

export interface ScoreEntry {
  id: string;
  username: string;
  score: number;
  timestamp: number;
}
