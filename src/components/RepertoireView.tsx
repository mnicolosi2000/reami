import React, { useState, useEffect } from 'react';
import { Plus, Search, Trash2, Music, Clock, User, Calendar, Save, X, Edit2, LayoutGrid, ArrowUpDown, ArrowUpAZ, ArrowDownAZ, Layers, List } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SongLibraryEntry } from '../types.ts';
import { apiService } from '../services/apiService.ts';
import { setlistService } from '../services/setlistService.ts';
import { DeleteConfirmationModal } from './DeleteConfirmationModal.tsx';

interface RepertoireViewProps {
  onMenuClick?: () => void;
  setlists: any[];
}

export function RepertoireView({ onMenuClick, setlists }: RepertoireViewProps) {
  const [songs, setSongs] = useState<SongLibraryEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [songToDelete, setSongToDelete] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [setlistToAddTo, setSetlistToAddTo] = useState<SongLibraryEntry | null>(null);
  
  // Sort and Group state
  const [sortBy, setSortBy] = useState<'title' | 'artist'>('title');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [groupByArtist, setGroupByArtist] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Form state
  const [editingSong, setEditingSong] = useState<SongLibraryEntry | null>(null);
  const [songForm, setSongForm] = useState({
    title: '',
    artist: '',
    duration: '00:00',
    search_normalized: '',
    created_by: ''
  });

  useEffect(() => {
    fetchSongs();
  }, []);

  const fetchSongs = async () => {
    try {
      setLoading(true);
      const data = await apiService.getAllLibrarySongs();
      setSongs(data);
    } catch (error) {
      console.error('Error fetching repertoire:', error);
    } finally {
      setLoading(false);
    }
  };

  const inputToSeconds = (input: string): number => {
    const parts = input.split(':').map(val => parseInt(val) || 0);
    if (parts.length === 2) return (parts[0] * 60) + parts[1];
    return parts[0] || 0;
  };

  const openAddModal = () => {
    setEditingSong(null);
    setSongForm({
      title: '',
      artist: '',
      duration: '00:00',
      search_normalized: '',
      created_by: 'Musicista'
    });
    setIsAdding(true);
  };

  const openEditModal = (song: SongLibraryEntry) => {
    setEditingSong(song);
    setSongForm({
      title: song.title,
      artist: song.artist || '',
      duration: setlistService.formatDuration(song.default_duration),
      search_normalized: song.search_normalized || '',
      created_by: song.created_by || ''
    });
    setIsAdding(true);
  };

  const handleSaveSong = async () => {
    if (!songForm.title.trim()) return;

    try {
      if (editingSong) {
        await apiService.updateLibrarySong(editingSong.id, {
          title: songForm.title.trim(),
          artist: songForm.artist.trim() || null,
          default_duration: inputToSeconds(songForm.duration),
          search_normalized: songForm.search_normalized.trim() || songForm.title.trim().toLowerCase(),
          created_by: songForm.created_by.trim() || null
        });
        setSongs(prev => prev.map(s => s.id === editingSong.id ? { 
          ...s, 
          title: songForm.title.trim(), 
          artist: songForm.artist.trim() || null, 
          default_duration: inputToSeconds(songForm.duration),
          search_normalized: songForm.search_normalized.trim() || songForm.title.trim().toLowerCase(),
          created_by: songForm.created_by.trim() || null
        } : s).sort((a, b) => a.title.localeCompare(b.title)));
      } else {
        const added = await apiService.addLibrarySong({
          title: songForm.title.trim(),
          artist: songForm.artist.trim() || null,
          default_duration: inputToSeconds(songForm.duration),
          search_normalized: songForm.search_normalized.trim() || songForm.title.trim().toLowerCase(),
          created_by: songForm.created_by.trim() || null
        });
        setSongs(prev => [...prev, added].sort((a, b) => a.title.localeCompare(b.title)));
      }
      setIsAdding(false);
    } catch (error) {
      console.error('Error saving song to library:', error);
    }
  };

  const confirmDelete = async () => {
    if (!songToDelete) return;
    try {
      await apiService.deleteLibrarySong(songToDelete);
      setSongs(prev => prev.filter(s => s.id !== songToDelete));
    } catch (error) {
      console.error('Error deleting library song:', error);
      alert('Non è possibile eliminare questo brano perché è utilizzato in una o più scalette.');
    } finally {
      setSongToDelete(null);
    }
  };

  const filteredSongs = songs.filter(s => 
    s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.artist && s.artist.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const sortedSongs = [...filteredSongs].sort((a, b) => {
    let valA = sortBy === 'title' ? a.title : (a.artist || 'ZZZ');
    let valB = sortBy === 'title' ? b.title : (b.artist || 'ZZZ');
    
    if (sortOrder === 'asc') {
      return valA.localeCompare(valB);
    } else {
      return valB.localeCompare(valA);
    }
  });

  const groupedSongs = groupByArtist 
    ? sortedSongs.reduce((acc, song) => {
        const artist = song.artist || 'Artista Sconosciuto';
        if (!acc[artist]) acc[artist] = [];
        acc[artist].push(song);
        return acc;
      }, {} as Record<string, SongLibraryEntry[]>)
    : null;

  const toggleSortOrder = () => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');

  const handleAddToSetlist = async (setlistId: string) => {
    if (!setlistToAddTo) return;
    try {
      // Find the current number of songs in that setlist to determine the position
      const targetSetlist = setlists.find(s => s.id === setlistId);
      const position = targetSetlist?.songs?.length || 0;
      
      await apiService.addSong(setlistId, {
        song_library_id: setlistToAddTo.id,
        position,
        duration: setlistToAddTo.default_duration
      });
      
      alert(`Brano aggiunto con successo a "${targetSetlist?.name}"`);
      setSetlistToAddTo(null);
    } catch (error) {
      console.error('Error adding song to setlist:', error);
      alert('Errore durante l\'aggiunta del brano alla scaletta.');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Header */}
      <header className="h-20 bg-white border-b border-brand-border px-4 sm:px-8 flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={onMenuClick}
            className="md:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-all"
            title="Apri Menu"
          >
            <LayoutGrid size={24} />
          </button>
          <div className="hidden xs:flex w-10 h-10 bg-indigo-50 rounded-xl items-center justify-center text-brand-primary">
            <Music size={24} />
          </div>
          <div className="flex flex-col">
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-800">Repertorio</h2>
            <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">
              {songs.length} Brani
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center bg-slate-100 rounded-lg px-3 py-2 border border-slate-200">
            <Search size={16} className="text-slate-400" />
            <input 
              type="text"
              placeholder="Cerca nel repertorio..."
              className="bg-transparent border-none outline-none text-xs ml-2 w-48 text-slate-600"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={openAddModal}
            className="bg-brand-primary text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm hover:hover:bg-indigo-700 transition-all flex items-center gap-2"
          >
            <Plus size={16} /> <span className="hidden xs:inline">Nuovo Brano</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar">
        {/* Controls Bar */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6 items-start sm:items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-brand-border shadow-sm">
              <button 
                onClick={() => setGroupByArtist(false)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${!groupByArtist ? 'bg-indigo-50 text-brand-primary' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Layers size={14} className="rotate-180" /> Tutti
              </button>
              <button 
                onClick={() => setGroupByArtist(true)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${groupByArtist ? 'bg-indigo-50 text-brand-primary' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <User size={14} /> Artista
              </button>
            </div>

            <div className="flex items-center gap-1.5 p-1 bg-white rounded-xl border border-brand-border shadow-sm">
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-slate-100 text-brand-primary' : 'text-slate-400'}`}
                title="Vista Griglia"
              >
                <LayoutGrid size={16} />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-slate-100 text-brand-primary' : 'text-slate-400'}`}
                title="Vista Lista"
              >
                <List size={16} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 p-1 bg-white rounded-xl border border-brand-border shadow-sm">
              <button 
                onClick={() => setSortBy('title')}
                className={`px-3 py-2 rounded-lg text-[9px] font-bold uppercase transition-all ${sortBy === 'title' ? 'bg-slate-100 text-brand-primary' : 'text-slate-400'}`}
              >
                Titolo
              </button>
              <button 
                onClick={() => setSortBy('artist')}
                className={`px-3 py-2 rounded-lg text-[9px] font-bold uppercase transition-all ${sortBy === 'artist' ? 'bg-slate-100 text-brand-primary' : 'text-slate-400'}`}
              >
                Artista
              </button>
              <div className="w-px h-4 bg-slate-100 mx-1" />
              <button 
                onClick={toggleSortOrder}
                className="p-2 text-brand-primary hover:bg-slate-50 rounded-lg transition-all"
                title={sortOrder === 'asc' ? 'Ordine Crescente' : 'Ordine Decrescente'}
              >
                {sortOrder === 'asc' ? <ArrowUpAZ size={16} /> : <ArrowDownAZ size={16} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Search */}
        <div className="sm:hidden mb-6 flex items-center bg-white rounded-xl px-4 py-3 border border-brand-border shadow-sm">
          <Search size={18} className="text-slate-400" />
          <input 
            type="text"
            placeholder="Cerca nel repertorio..."
            className="bg-transparent border-none outline-none text-sm ml-3 w-full text-slate-600"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
          </div>
        ) : filteredSongs.length > 0 ? (
          <div className="space-y-8">
            {groupByArtist && groupedSongs ? (
              (Object.entries(groupedSongs) as [string, SongLibraryEntry[]][]).map(([artist, artistSongs]) => (
                <div key={artist} className="space-y-4">
                  <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
                    <User size={16} className="text-brand-primary" />
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">{artist}</h3>
                    <span className="text-[10px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full font-bold">
                      {artistSongs.length} {artistSongs.length === 1 ? 'brano' : 'brani'}
                    </span>
                  </div>
                  <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "flex flex-col gap-2"}>
                    {artistSongs.map((song: SongLibraryEntry) => (
                      viewMode === 'grid' ? (
                        <SongCard 
                          key={song.id} 
                          song={song} 
                          onClick={() => openEditModal(song)} 
                          onDelete={() => setSongToDelete(song.id)}
                          onAddToSetlist={() => setSetlistToAddTo(song)}
                        />
                      ) : (
                        <SongRow 
                          key={song.id} 
                          song={song} 
                          onClick={() => openEditModal(song)} 
                          onDelete={() => setSongToDelete(song.id)}
                          onAddToSetlist={() => setSetlistToAddTo(song)}
                        />
                      )
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "flex flex-col gap-2"}>
                {sortedSongs.map((song) => (
                  viewMode === 'grid' ? (
                    <SongCard 
                      key={song.id} 
                      song={song} 
                      onClick={() => openEditModal(song)} 
                      onDelete={() => setSongToDelete(song.id)}
                      onAddToSetlist={() => setSetlistToAddTo(song)}
                    />
                  ) : (
                    <SongRow 
                      key={song.id} 
                      song={song} 
                      onClick={() => openEditModal(song)} 
                      onDelete={() => setSongToDelete(song.id)}
                      onAddToSetlist={() => setSetlistToAddTo(song)}
                    />
                  )
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-slate-200 border border-brand-border mb-4">
              <Music size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Nessun brano trovato</h3>
            <p className="text-sm text-slate-400 max-w-xs mt-1">
              {searchTerm ? "Prova a cambiare i criteri di ricerca o aggiungi un nuovo brano." : "Il tuo repertorio è vuoto. Inizia aggiungendo la tua prima canzone."}
            </p>
          </div>
        )}
      </div>

      {/* Add/Edit Song Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setIsAdding(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden z-10"
            >
              <div className="p-6 sm:p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-bold text-slate-800">{editingSong ? 'Modifica Brano' : 'Nuovo Brano'}</h3>
                  <button onClick={() => setIsAdding(false)} className="p-2 text-slate-300 hover:text-slate-500">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4 max-h-[60vh] overflow-y-auto px-1 custom-scrollbar">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Titolo</label>
                    <input 
                      type="text"
                      className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm text-slate-600 focus:ring-2 focus:ring-brand-primary/20 outline-none"
                      placeholder="es. Billie Jean"
                      value={songForm.title}
                      onChange={(e) => setSongForm({...songForm, title: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Artista</label>
                    <input 
                      type="text"
                      className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm text-slate-600 focus:ring-2 focus:ring-brand-primary/20 outline-none"
                      placeholder="es. Michael Jackson"
                      value={songForm.artist}
                      onChange={(e) => setSongForm({...songForm, artist: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Durata (mm:ss)</label>
                      <input 
                        type="text"
                        className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm text-slate-600 font-mono focus:ring-2 focus:ring-brand-primary/20 outline-none text-center"
                        placeholder="04:30"
                        value={songForm.duration}
                        onChange={(e) => setSongForm({...songForm, duration: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Creato Da</label>
                      <input 
                        type="text"
                        className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm text-slate-600 focus:ring-2 focus:ring-brand-primary/20 outline-none"
                        value={songForm.created_by}
                        onChange={(e) => setSongForm({...songForm, created_by: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Tag di Ricerca (Normalizzato)</label>
                    <input 
                      type="text"
                      className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-xs text-slate-400 font-mono focus:ring-2 focus:ring-brand-primary/20 outline-none"
                      placeholder="es. billiejean"
                      value={songForm.search_normalized}
                      onChange={(e) => setSongForm({...songForm, search_normalized: e.target.value})}
                    />
                  </div>
                  {editingSong && (
                    <div className="pt-2">
                      <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest pl-1">ID Univoco</label>
                      <div className="text-[10px] text-slate-300 font-mono bg-slate-50 p-2 rounded-lg truncate mt-1">
                        {editingSong.id}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-8 flex gap-3">
                  <button
                    onClick={handleSaveSong}
                    className="flex-1 bg-brand-primary text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Save size={18} /> {editingSong ? 'Aggiorna Brano' : 'Salva nel Repertorio'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <DeleteConfirmationModal
        isOpen={!!songToDelete}
        title="Elimina dal Repertorio"
        message="Sei sicuro di voler eliminare questa canzone dal database globale? Questa azione non funzionerà se il brano è utilizzato in qualche scaletta esistente."
        onConfirm={confirmDelete}
        onCancel={() => setSongToDelete(null)}
      />

      {/* Add To Setlist Selection Modal */}
      <AnimatePresence>
        {setlistToAddTo && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setSetlistToAddTo(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden z-10"
            >
              <div className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-brand-primary">
                    <List size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-800">Aggiungi a Scaletta</h3>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                      "{setlistToAddTo.title}"
                    </p>
                  </div>
                </div>

                <div className="space-y-2 max-h-[40vh] overflow-y-auto custom-scrollbar pr-1">
                  {setlists.length > 0 ? (
                    setlists.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleAddToSetlist(s.id)}
                        className="w-full text-left p-4 rounded-2xl border border-slate-100 hover:bg-slate-50 hover:border-brand-primary/20 transition-all flex items-center justify-between group"
                      >
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800 group-hover:text-brand-primary transition-colors">{s.name}</span>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{s.songs?.length || 0} brani</span>
                        </div>
                        <Plus size={18} className="text-slate-300 group-hover:text-brand-primary transition-colors" />
                      </button>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-slate-400 text-sm">Nessuna scaletta trovata.</p>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setSetlistToAddTo(null)}
                  className="w-full mt-6 py-4 rounded-2xl text-slate-400 font-black uppercase tracking-widest text-[10px] hover:bg-slate-50 transition-all"
                >
                  Annulla
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SongCardProps {
  song: SongLibraryEntry;
  onClick: () => void;
  onDelete: () => void;
  onAddToSetlist: () => void;
}

const SongCard: React.FC<SongCardProps> = ({ song, onClick, onDelete, onAddToSetlist }) => {
  return (
    <motion.div 
      layout
      className="bg-white p-5 rounded-2xl border border-brand-border shadow-sm hover:shadow-md transition-all group cursor-pointer relative"
      onClick={onClick}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-800 truncate pr-2">{song.title}</h3>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1 truncate">
            {song.artist || 'Artista Sconosciuto'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={(e) => { e.stopPropagation(); onAddToSetlist(); }}
            className="p-2 text-slate-300 hover:text-brand-primary transition-colors"
            title="Aggiungi a Scaletta"
          >
            <Plus size={18} />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-2 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      
      <div className="flex items-center gap-4 pt-4 border-t border-slate-50 uppercase tracking-tighter">
        <div className="flex items-center gap-1.5">
          <Clock size={12} className="text-slate-300" />
          <span className="text-[10px] font-bold text-slate-500">
            {setlistService.formatDuration(song.default_duration)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar size={12} className="text-slate-300" />
          <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">
            {new Date(song.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })}
          </span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <User size={12} className="text-slate-300" />
          <span className="text-[10px] font-bold text-slate-500 group-hover:text-brand-primary transition-colors truncate max-w-[60px]">
            {song.created_by || 'Sistema'}
          </span>
        </div>
      </div>
      {song.search_normalized && (
        <div className="mt-2 text-[8px] text-slate-300 font-mono truncate">
          IDX: {song.search_normalized}
        </div>
      )}
    </motion.div>
  );
};

const SongRow: React.FC<SongCardProps> = ({ song, onClick, onDelete, onAddToSetlist }) => {
  return (
    <motion.div 
      layout
      className="bg-white px-4 py-3 rounded-xl border border-brand-border shadow-sm hover:shadow-md transition-all group cursor-pointer flex items-center gap-4"
      onClick={onClick}
    >
      <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-300 group-hover:text-brand-primary transition-colors flex-shrink-0">
        <Music size={16} />
      </div>
      
      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
        <h3 className="font-bold text-sm text-slate-800 truncate sm:w-2/5">{song.title}</h3>
        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate sm:flex-1">
          {song.artist || 'Artista Sconosciuto'}
        </span>
      </div>

      <div className="hidden xs:flex items-center gap-4 text-slate-400">
        <div className="flex items-center gap-1.5 w-16">
          <Clock size={12} />
          <span className="text-[10px] font-bold font-mono">
            {setlistService.formatDuration(song.default_duration)}
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 w-20">
          <Calendar size={12} />
          <span className="text-[10px] font-bold">
            {new Date(song.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button 
          onClick={(e) => { e.stopPropagation(); onAddToSetlist(); }}
          className="p-2 text-slate-300 hover:text-brand-primary transition-colors"
          title="Aggiungi a Scaletta"
        >
          <Plus size={18} />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-2 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </motion.div>
  );
};
