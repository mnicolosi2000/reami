import React, { useState, useEffect } from 'react';
import { GripVertical, ChevronLeft, Plus, Save, Clock, Trash2, Settings, Share, FileDown, MoreHorizontal, ChevronUp, ChevronDown, Music, LayoutGrid } from 'lucide-react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DeleteConfirmationModal } from './DeleteConfirmationModal.tsx';
import { Setlist, Song, SongLibraryEntry } from '../types.ts';
import { setlistService } from '../services/setlistService.ts';
import { apiService } from '../services/apiService.ts';

interface SetlistEditorProps {
  setlist: Setlist;
  onBack: () => void;
  onUpdate: (updated: Setlist) => void;
  onMenuClick?: () => void;
}

export function SetlistEditor({ setlist, onBack, onUpdate, onMenuClick }: SetlistEditorProps) {
  const [name, setName] = useState(setlist.name);
  const [date, setDate] = useState(setlist.date || '');
  const [songs, setSongs] = useState<Song[]>(setlist.songs || []);
  const [defaultGap, setDefaultGap] = useState(setlist.default_gap);
  const [newSongTitle, setNewSongTitle] = useState('');
  const [songIdToDelete, setSongIdToDelete] = useState<string | null>(null);
  const [librarySuggestions, setLibrarySuggestions] = useState<SongLibraryEntry[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editingPositionId, setEditingPositionId] = useState<string | null>(null);
  const [tempPosition, setTempPosition] = useState('');

  const addSong = async (libraryEntry?: SongLibraryEntry) => {
    const title = newSongTitle.trim();
    if (!title && !libraryEntry) return;

    try {
      let entry = libraryEntry;
      if (!entry) {
        entry = await apiService.getOrCreateLibrarySong(title);
      }

      const newSong = await apiService.addSong(setlist.id, {
        song_library_id: entry.id,
        position: songs.length,
        duration: null // No override by default
      });
      
      // Ensure the joined data is present for UI
      const songWithLibrary = {
        ...newSong,
        song_library: entry
      };

      setSongs([...songs, songWithLibrary]);
      setNewSongTitle('');
      setLibrarySuggestions([]);
      setShowSuggestions(false);
    } catch (error) {
      console.error('Error adding song:', error);
    }
  };

  useEffect(() => {
    const searchLibrary = async () => {
      if (newSongTitle.trim().length > 1) {
        try {
          const results = await apiService.searchSongLibrary(newSongTitle);
          setLibrarySuggestions(results);
          setShowSuggestions(results.length > 0);
        } catch (error) {
          console.error('Error searching library:', error);
        }
      } else {
        setLibrarySuggestions([]);
        setShowSuggestions(false);
      }
    };

    const timer = setTimeout(searchLibrary, 300);
    return () => clearTimeout(timer);
  }, [newSongTitle]);

  const removeSong = (id: string) => {
    setSongIdToDelete(id);
  };

  const confirmDeleteSong = async () => {
    if (!songIdToDelete) return;
    const id = songIdToDelete;
    try {
      await apiService.deleteSong(id);
      setSongs(songs.filter(s => s.id !== id));
    } catch (error) {
      console.error('Error removing song:', error);
    } finally {
      setSongIdToDelete(null);
    }
  };

  const updateSong = async (id: string, updates: Partial<Song>) => {
    setSongs(songs.map(s => s.id === id ? { ...s, ...updates } : s));
    try {
      await apiService.updateSong(id, updates);
    } catch (error) {
      console.error('Error updating song:', error);
    }
  };

  const moveSong = async (id: string, direction: 'up' | 'down') => {
    const index = songs.findIndex(s => s.id === id);
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === songs.length - 1) return;

    const newSongs = [...songs];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newSongs[index], newSongs[targetIndex]] = [newSongs[targetIndex], newSongs[index]];
    
    // Update positions
    newSongs.forEach((s, i) => {
      s.position = i;
    });

    setSongs([...newSongs]);

    try {
      await Promise.all([
        apiService.updateSong(newSongs[index].id, { position: index }),
        apiService.updateSong(newSongs[targetIndex].id, { position: targetIndex })
      ]);
    } catch (error) {
      console.error('Error moving song:', error);
    }
  };

  const setCustomPause = (songId: string, value: number) => {
    updateSong(songId, { custom_pause: value });
  };

  const handlePositionClick = (id: string, currentPos: number) => {
    setEditingPositionId(id);
    setTempPosition((currentPos + 1).toString());
  };

  const handlePositionSubmit = (id: string) => {
    const newPos = parseInt(tempPosition);
    if (isNaN(newPos) || newPos < 1 || newPos > songs.length) {
      setEditingPositionId(null);
      return;
    }

    const targetIndex = newPos - 1;
    const currentIndex = songs.findIndex(s => s.id === id);
    if (currentIndex === targetIndex) {
      setEditingPositionId(null);
      return;
    }

    const newSongs = [...songs];
    const [removed] = newSongs.splice(currentIndex, 1);
    newSongs.splice(targetIndex, 0, removed);

    // Update positions
    const reorderedSongs = newSongs.map((s, i) => ({
      ...s,
      position: i
    }));

    setSongs(reorderedSongs);
    setEditingPositionId(null);
  };

  const handleSave = async () => {
    try {
      await apiService.updateSetlist(setlist.id, {
        name,
        date,
        default_gap: defaultGap,
        total_duration: totalSeconds
      });
      onBack();
    } catch (error) {
      console.error('Error saving setlist settings:', error);
    }
  };

  useEffect(() => {
    onUpdate({
      ...setlist,
      name,
      date,
      songs,
      default_gap: defaultGap,
    });
  }, [name, date, songs, defaultGap]);

  // Sincronizza il nome e la data nel database con un debounce (Auto-save)
  useEffect(() => {
    const timer = setTimeout(async () => {
      // Verifica se c'è effettivamente un cambiamento rispetto al setlist originale
      if (name === setlist.name && date === (setlist.date || '')) return;
      
      try {
        await apiService.updateSetlist(setlist.id, {
          name,
          date: date || null
        });
      } catch (error) {
        console.error('Error auto-saving setlist metadata:', error);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [name, date, setlist.id]);

  // Sincronizza le posizioni nel database dopo un riordino o modifica
  useEffect(() => {
    if (!songs.length) return;
    const timer = setTimeout(async () => {
      try {
        await apiService.updateSongsPositions(songs);
      } catch (error) {
        console.error('Error syncing positions to database:', error);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [songs]);

  const handleReorder = (newOrder: Song[]) => {
    // Aggiorna le posizioni nell'array locale
    const reorderedSongs = newOrder.map((song, index) => ({
      ...song,
      position: index
    }));
    setSongs(reorderedSongs);
  };

  const totalSeconds = setlistService.calculateTotalSeconds({ ...setlist, default_gap: defaultGap }, songs);
  const intervalSeconds = songs.length > 0 ? (totalSeconds - songs.reduce((acc, s) => acc + (s.duration !== null ? s.duration : (s.song_library?.default_duration || 0)), 0)) : 0;

  const secondsToInput = (sec: number | null, song?: Song) => {
    const duration = sec !== null ? sec : (song?.song_library?.default_duration || 0);
    const h = Math.floor(duration / 3600);
    const m = Math.floor((duration % 3600) / 60);
    const s = duration % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const inputToSeconds = (val: string) => {
    const [m, s] = val.split(':').map(n => parseInt(n) || 0);
    return (m * 60) + (s || 0);
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59); // Slate-800
    doc.text(name, 14, 20);
    
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139); // Slate-400
    let yPos = 30;
    if (date) {
      doc.text(`Data: ${new Date(date).toLocaleDateString('it-IT')}`, 14, yPos);
      yPos += 7;
    }
    doc.text(`Canzoni: ${songs.length} | Durata Totale: ${setlistService.formatDuration(totalSeconds)}`, 14, yPos);
    
    // Table
    const tableData = songs.map((song, index) => [
      (index + 1).toString().padStart(2, '0'),
      song.song_library?.title || 'Unknown',
      setlistService.formatDuration(song.duration !== null ? song.duration : (song.song_library?.default_duration || 0))
    ]);
    
    autoTable(doc, {
      startY: yPos + 10,
      head: [['#', 'Titolo Canzone', 'Durata']],
      body: tableData,
      theme: 'grid',
      headStyles: { 
        fillColor: [79, 70, 229], // Brand primary
        textColor: [255, 255, 255],
        fontSize: 10,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 12,
        textColor: [51, 65, 85], // Slate-700
        cellPadding: 5
      },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center', fontSize: 10 },
        1: { cellWidth: 'auto', fontStyle: 'bold', fontSize: 18 },
        2: { cellWidth: 35, halign: 'right', fontSize: 12 }
      },
      margin: { top: 20 },
      didDrawPage: (data) => {
        // Footer
        doc.setFontSize(8);
        doc.setTextColor(150);
        const str = "Generato con Setlist Studio";
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        doc.text(str, 14, pageHeight - 10);
      }
    });
    
    doc.save(`${name.replace(/\s+/g, '_')}_scaletta.pdf`);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="min-h-20 py-2 bg-white border-b border-brand-border px-3 sm:px-8 flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
          <div className="flex md:hidden items-center gap-1">
            <button 
              onClick={onMenuClick}
              className="p-2 -ml-1 text-slate-400 hover:text-brand-primary flex-shrink-0"
              title="Apri Menu"
            >
              <LayoutGrid size={22} />
            </button>
            <button 
              onClick={onBack} 
              className="p-2 text-slate-400 hover:text-brand-primary flex-shrink-0"
              title="Torna alle scalette"
            >
              <ChevronLeft size={24} />
            </button>
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 sm:gap-3">
              <input 
                type="text" 
                value={name} 
                onChange={(e) => setName(e.target.value)}
                className="text-base sm:text-xl font-extrabold bg-transparent border-none outline-none focus:ring-0 w-28 sm:w-64 text-slate-800 truncate"
                placeholder="Nome scaletta"
              />
              <div className="flex items-center gap-1 sm:gap-2 bg-slate-50 px-1.5 py-1 rounded border border-slate-100 flex-shrink-0 overflow-hidden">
                <Clock size={12} className="text-slate-400 hidden xs:block" />
                <input 
                  type="date" 
                  value={date} 
                  onChange={(e) => setDate(e.target.value)}
                  className="text-[9px] sm:text-xs font-bold text-slate-500 bg-transparent border-none outline-none focus:ring-0 w-20 sm:w-28 uppercase"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 text-[9px] sm:text-xs text-slate-400 font-bold uppercase tracking-widest mt-1 truncate">
              <span className="flex items-center gap-1">• {songs.length} <span className="hidden xs:inline">Canzoni</span><span className="xs:hidden">Tracks</span></span>
              <span className="hidden sm:inline">• Live Performance Mode</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
          <button 
            onClick={generatePDF}
            title="Esporta PDF"
            className="p-2 text-slate-400 hover:text-brand-primary transition-colors flex-shrink-0"
          >
            <Share size={18} />
          </button>
          <button 
            onClick={handleSave}
            className="bg-brand-primary text-white px-3 sm:px-5 py-2 rounded-lg text-[10px] sm:text-sm font-bold shadow-sm hover:bg-indigo-700 transition-all active:scale-95 flex items-center gap-1.5 sm:gap-2"
          >
            <Save size={14} className="sm:w-4 sm:h-4" /> <span className="hidden xs:inline sm:inline">Salva</span><span className="hidden sm:inline"> Sessione</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden p-4 sm:p-8 gap-8 overflow-y-auto lg:overflow-hidden custom-scrollbar">
        {/* Songs List Area */}
        <div className="flex-1 flex flex-col gap-4 overflow-hidden min-h-[400px] lg:min-h-0">
          <div className="relative z-20">
            <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-brand-border shadow-sm flex-shrink-0">
              <div className="flex-1 flex items-center gap-2 px-3">
                <Plus className="text-slate-300" size={18} />
                <input 
                  type="text" 
                  placeholder="Aggiungi canzone (es. Bohemian Rhapsody)" 
                  className="w-full outline-none text-sm placeholder:text-slate-300 text-slate-600 h-10"
                  value={newSongTitle}
                  onChange={(e) => {
                    setNewSongTitle(e.target.value);
                  }}
                  onFocus={() => {
                    if (librarySuggestions.length > 0) setShowSuggestions(true);
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      addSong();
                    }
                  }}
                />
              </div>
              <button 
                onClick={() => addSong()}
                className="px-4 py-2 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-200 transition-colors"
              >
                Aggiungi
              </button>
            </div>

            {/* Library Suggestions Dropdown */}
            <AnimatePresence>
              {showSuggestions && librarySuggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-brand-border shadow-xl overflow-hidden z-30"
                >
                  <div className="max-h-60 overflow-y-auto custom-scrollbar">
                    {librarySuggestions.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => addSong(entry)}
                        className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between border-b border-slate-50 last:border-0 transition-colors"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-700">{entry.title}</span>
                          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">
                            {entry.artist || 'Artista Sconosciuto'} • {setlistService.formatDuration(entry.default_duration)}
                          </span>
                        </div>
                        <Plus size={14} className="text-slate-300" />
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-20 lg:pb-4">
            <div className="space-y-1 mb-2 text-[10px] uppercase font-bold text-slate-400 tracking-widest px-2">
              Scaletta
            </div>
            
            <Reorder.Group axis="y" values={songs} onReorder={handleReorder} className="space-y-4">
              {songs.map((song, index) => (
                <DraggableSongItem 
                  key={song.id}
                  song={song}
                  index={index}
                  songsCount={songs.length}
                  editingPositionId={editingPositionId}
                  tempPosition={tempPosition}
                  setTempPosition={setTempPosition}
                  handlePositionClick={handlePositionClick}
                  handlePositionSubmit={handlePositionSubmit}
                  setEditingPositionId={setEditingPositionId}
                  moveSong={moveSong}
                  updateSong={updateSong}
                  removeSong={removeSong}
                  setCustomPause={setCustomPause}
                  secondsToInput={secondsToInput}
                  inputToSeconds={inputToSeconds}
                  defaultGap={defaultGap}
                />
              ))}
            </Reorder.Group>
            
            {songs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                <Music size={48} className="mb-4 opacity-20" />
                <p className="text-sm italic">Inizia ad aggiungere brani</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Summary Area */}
        <aside className="w-full lg:w-72 flex flex-col gap-6 flex-shrink-0">
          {/* Total Duration Widget */}
          <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-col justify-between h-48 sm:h-56">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Durata Totale</span>
              <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse"></div>
              </div>
            </div>
            <div className="text-4xl sm:text-5xl font-mono font-bold tracking-tighter">
              {setlistService.formatDuration(totalSeconds)}
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1 font-medium">
              <Clock size={12} /> Include {setlistService.formatDuration(intervalSeconds)} di intervalli totali
            </div>
          </div>

          {/* Timing Options Card */}
          <div className="bg-white rounded-3xl border border-brand-border p-6 flex-1 flex flex-col gap-6 shadow-sm">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Opzioni Timing</h3>
            
            <div className="space-y-6">
              <div className="flex flex-col gap-3">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Gap Globale (secondi)</label>
                <div className="flex items-center gap-4 text-sm font-mono bg-slate-50 p-4 rounded-2xl border border-slate-100 group">
                  <button 
                    onClick={() => setDefaultGap(Math.max(0, defaultGap - 5))}
                    className="p-1 text-slate-300 hover:text-brand-primary transition-colors"
                  > - </button>
                  <span className="flex-1 text-center font-bold text-slate-700">{defaultGap}</span>
                  <button 
                    onClick={() => setDefaultGap(defaultGap + 5)}
                    className="p-1 text-slate-300 hover:text-brand-primary transition-colors"
                  > + </button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <DeleteConfirmationModal 
        isOpen={!!songIdToDelete}
        title="Elimina Canzone"
        message="Sei sicuro di voler eliminare questo brano dalla scaletta?"
        onConfirm={confirmDeleteSong}
        onCancel={() => setSongIdToDelete(null)}
      />
    </div>
  );
}

interface DraggableSongItemProps {
  song: Song;
  index: number;
  songsCount: number;
  editingPositionId: string | null;
  tempPosition: string;
  setTempPosition: (val: string) => void;
  handlePositionClick: (id: string, currentPos: number) => void;
  handlePositionSubmit: (id: string) => void;
  setEditingPositionId: (id: string | null) => void;
  moveSong: (id: string, direction: 'up' | 'down') => void;
  updateSong: (id: string, updates: Partial<Song>) => void;
  removeSong: (id: string) => void;
  setCustomPause: (songId: string, value: number) => void;
  secondsToInput: (sec: number | null, song: Song) => string;
  inputToSeconds: (val: string) => number;
  defaultGap: number;
}

const DraggableSongItem: React.FC<DraggableSongItemProps> = ({
  song,
  index,
  songsCount,
  editingPositionId,
  tempPosition,
  setTempPosition,
  handlePositionClick,
  handlePositionSubmit,
  setEditingPositionId,
  moveSong,
  updateSong,
  removeSong,
  setCustomPause,
  secondsToInput,
  inputToSeconds,
  defaultGap
}) => {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={song}
      dragListener={false}
      dragControls={controls}
      className="space-y-4"
    >
      <div className="flex items-center bg-white p-2 sm:p-4 rounded-xl sm:rounded-2xl border border-brand-border shadow-sm gap-1.5 sm:gap-4 transition-all group relative">
        <div 
          onPointerDown={(e) => controls.start(e)}
          className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-brand-primary p-1 flex-shrink-0 touch-none"
        >
          <GripVertical size={20} />
        </div>

        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:flex">
          <button onClick={() => moveSong(song.id, 'up')} disabled={index === 0} className="text-slate-300 hover:text-brand-primary disabled:opacity-30">
            <ChevronUp size={16} />
          </button>
          <button onClick={() => moveSong(song.id, 'down')} disabled={index === songsCount - 1} className="text-slate-300 hover:text-brand-primary disabled:opacity-30">
            <ChevronDown size={16} />
          </button>
        </div>

        <div className="w-6 sm:w-8 flex-shrink-0">
          {editingPositionId === song.id ? (
            <input
              autoFocus
              type="text"
              value={tempPosition}
              onChange={(e) => setTempPosition(e.target.value)}
              onBlur={() => handlePositionSubmit(song.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePositionSubmit(song.id);
                if (e.key === 'Escape') setEditingPositionId(null);
              }}
              className="w-full text-center text-brand-primary text-[10px] sm:text-xs font-mono font-bold bg-indigo-50 border border-brand-primary rounded outline-none"
            />
          ) : (
            <button 
              onClick={() => handlePositionClick(song.id, index)}
              className="w-full text-left text-slate-300 hover:text-brand-primary transition-colors text-[10px] font-mono font-bold"
              title="Cambia posizione"
            >
              {(index + 1).toString().padStart(2, '0')}
            </button>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="w-full font-bold text-sm text-slate-800 truncate">
            {song.song_library?.title || 'Unknown'}
          </div>
          {song.song_library?.artist && (
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest truncate">
              {song.song_library.artist}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="relative">
            <input 
              type="text"
              value={secondsToInput(song.duration, song)}
              onChange={(e) => updateSong(song.id, { duration: inputToSeconds(e.target.value) })}
              className={`bg-indigo-50 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-brand-primary font-mono text-[10px] sm:text-xs font-bold w-14 sm:w-20 text-center outline-none focus:ring-2 focus:ring-indigo-200 transition-all ${song.duration !== null ? 'bg-indigo-100' : ''}`}
            />
          </div>
        </div>

        <button 
          onClick={() => removeSong(song.id)}
          className="md:opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 transition-all"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Interval Visualizer */}
      {index < songsCount - 1 && (
        <div className="h-10 flex items-center justify-center relative group/interval pointer-events-none">
          <div className="absolute left-1/2 md:left-6 -translate-x-1/2 w-px h-full bg-slate-200"></div>
          <div className="z-10 bg-white border border-brand-border px-3 py-1 rounded-full text-[9px] text-slate-400 font-bold uppercase tracking-tighter shadow-sm flex items-center gap-2 pointer-events-auto">
            <span>Gap</span>
            <input 
              type="number"
              value={song.custom_pause ?? defaultGap}
              onChange={(e) => setCustomPause(song.id, parseInt(e.target.value) || 0)}
              className="w-8 bg-transparent text-center text-brand-primary focus:outline-none"
            />
            <span>sec</span>
          </div>
        </div>
      )}
    </Reorder.Item>
  );
}
