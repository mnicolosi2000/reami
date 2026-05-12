import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { Setlist, Song, SongLibraryEntry } from '../types.ts';

const ensureConfigured = () => {
  if (!isSupabaseConfigured) {
    throw new Error('CONFIG_MISSING: Configurazione Supabase mancante. Controlla le variabili d\'ambiente.');
  }
};

export const apiService = {
  async getSetlists(): Promise<Setlist[]> {
    ensureConfigured();
    
    const { data, error } = await supabase
      .from('setlists')
      .select('*, songs(*, song_library(*))')
      .order('created_at', { ascending: false })
      .order('position', { foreignTable: 'songs', ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getSetlist(id: string): Promise<Setlist | null> {
    ensureConfigured();
    const { data, error } = await supabase
      .from('setlists')
      .select('*, songs(*, song_library(*))')
      .eq('id', id)
      .order('position', { foreignTable: 'songs', ascending: true })
      .single();

    if (error) throw error;
    return data;
  },

  async createSetlist(name: string, default_gap: number): Promise<Setlist> {
    ensureConfigured();
    const { data, error } = await supabase
      .from('setlists')
      .insert([{ name, default_gap, total_duration: 0 }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateSetlist(id: string, updates: Partial<Setlist>): Promise<void> {
    ensureConfigured();
    const { error } = await supabase
      .from('setlists')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
  },

  async deleteSetlist(id: string): Promise<void> {
    ensureConfigured();
    
    // First delete associated songs to avoid foreign key constraints
    const { error: songsError } = await supabase
      .from('songs')
      .delete()
      .eq('setlist_id', id);
      
    if (songsError) {
      console.error('Errore durante l\'eliminazione dei brani associati:', songsError);
    }

    const { error } = await supabase
      .from('setlists')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async getAllLibrarySongs(): Promise<SongLibraryEntry[]> {
    ensureConfigured();
    const { data, error } = await supabase
      .from('song_library')
      .select('*')
      .order('title', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  async addLibrarySong(song: Partial<SongLibraryEntry>): Promise<SongLibraryEntry> {
    ensureConfigured();
    const { data, error } = await supabase
      .from('song_library')
      .insert([song])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async updateLibrarySong(id: string, updates: Partial<SongLibraryEntry>): Promise<void> {
    ensureConfigured();
    const { error } = await supabase
      .from('song_library')
      .update(updates)
      .eq('id', id);
    
    if (error) throw error;
  },

  async deleteLibrarySong(id: string): Promise<void> {
    ensureConfigured();
    const { error } = await supabase
      .from('song_library')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  },

  async searchSongLibrary(query: string): Promise<SongLibraryEntry[]> {
    ensureConfigured();
    const { data, error } = await supabase
      .from('song_library')
      .select('*')
      .ilike('title', `%${query}%`)
      .limit(10);
    
    if (error) throw error;
    return data || [];
  },

  async getOrCreateLibrarySong(title: string): Promise<SongLibraryEntry> {
    ensureConfigured();
    // Case insensitive exact match check
    const { data: existing, error: searchError } = await supabase
      .from('song_library')
      .select('*')
      .ilike('title', title)
      .limit(1)
      .maybeSingle();

    if (searchError) throw searchError;
    if (existing) return existing;

    const { data, error } = await supabase
      .from('song_library')
      .insert([{ 
        title, 
        artist: null, 
        default_duration: 0
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async addSong(setlistId: string, songData: { song_library_id: string, position: number, duration?: number }): Promise<Song> {
    ensureConfigured();
    const { data, error } = await supabase
      .from('songs')
      .insert([{ 
        setlist_id: setlistId,
        song_library_id: songData.song_library_id,
        position: songData.position,
        duration: songData.duration || null,
        custom_pause: null
      }])
      .select('*, song_library(*)')
      .single();

    if (error) throw error;
    return data;
  },

  async updateSong(id: string, updates: Partial<Song>): Promise<void> {
    ensureConfigured();
    // Only update allowed fields in 'songs' table
    const allowedUpdates: any = {};
    if (updates.position !== undefined) allowedUpdates.position = updates.position;
    if (updates.duration !== undefined) allowedUpdates.duration = updates.duration;
    if (updates.custom_pause !== undefined) allowedUpdates.custom_pause = updates.custom_pause;

    if (Object.keys(allowedUpdates).length === 0) return;

    const { error } = await supabase
      .from('songs')
      .update(allowedUpdates)
      .eq('id', id);

    if (error) throw error;
  },

  async deleteSong(id: string): Promise<void> {
    ensureConfigured();
    const { error } = await supabase
      .from('songs')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async updateSongsPositions(songs: Song[]): Promise<void> {
    ensureConfigured();
    // Prepara i dati necessari per l'upsert
    const updates = songs.map(s => ({
      id: s.id,
      position: s.position,
      setlist_id: s.setlist_id,
      song_library_id: s.song_library_id,
      duration: s.duration,
      custom_pause: s.custom_pause
    }));
    
    const { error } = await supabase
      .from('songs')
      .upsert(updates, { onConflict: 'id' });

    if (error) throw error;
  },

  // Legacy/Other placeholders as required by modularity but using Supabase if possible
  async saveScore(username: string, score: number): Promise<void> {
    const { error } = await supabase
      .from('scores')
      .insert([{ username, score, timestamp: new Date().toISOString() }]);
    if (error) console.warn('Scores table might not exist yet', error);
  },

  async getLeaderboard(): Promise<any[]> {
    const { data, error } = await supabase
      .from('scores')
      .select('*')
      .order('score', { ascending: false })
      .limit(10);
    if (error) {
      console.warn('Scores table might not exist yet', error);
      return [];
    }
    return data || [];
  },

  async createUserIfNotExists(username: string): Promise<any> {
    // Basic implementation
    const { data: existing } = await supabase.from('users').select('*').eq('username', username).single();
    if (existing) return existing;

    const { data, error } = await supabase.from('users').insert([{ username }]).select().single();
    if (error) console.warn('Users table might not exist yet', error);
    return data;
  }
};
