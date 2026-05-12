/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Plus, Music, Trash2, Clock, Settings2, ChevronRight, LayoutGrid, List, User as UserIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Setlist, Song, User } from './types.ts';
import { SetlistEditor } from './components/SetlistEditor.tsx';
import { RepertoireView } from './components/RepertoireView.tsx';
import { DeleteConfirmationModal } from './components/DeleteConfirmationModal.tsx';
import { setlistService } from './services/setlistService.ts';
import { apiService } from './services/apiService.ts';
import { isSupabaseConfigured } from './lib/supabaseClient.ts';

type View = 'setlists' | 'repertoire';

export default function App() {
  const [view, setView] = useState<View>('setlists');
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [activeSetlistId, setActiveSetlistId] = useState<string | null>(() => {
    return localStorage.getItem('lastActiveSetlistId');
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setlistIdToDelete, setSetlistIdToDelete] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Persistence effect
  useEffect(() => {
    if (activeSetlistId) {
      localStorage.setItem('lastActiveSetlistId', activeSetlistId);
    }
  }, [activeSetlistId]);

  const fetchSetlists = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiService.getSetlists();
      setSetlists(data);
    } catch (err: any) {
      console.error('Error fetching setlists:', err);
      setError(err.message || 'Errore di connessione a Supabase');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('Supabase Configured:', isSupabaseConfigured);
    fetchSetlists();
  }, []);

  const activeSetlist = setlists.find(s => s.id === activeSetlistId);

  const createNewSetlist = async () => {
    try {
      const newList = await apiService.createSetlist(`Nuova Scaletta ${setlists.length + 1}`, 10);
      setSetlists([ { ...newList, songs: [] }, ...setlists]);
      setActiveSetlistId(newList.id);
      setView('setlists');
      setIsSidebarOpen(false);
    } catch (error: any) {
      console.error('Error creating setlist:', error);
      alert(`Errore nella creazione della scaletta: ${error.message || 'Controlla la console o le tabelle Supabase'}`);
    }
  };

  const deleteSetlist = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSetlistIdToDelete(id);
  };

  const confirmDeleteSetlist = async () => {
    if (!setlistIdToDelete) return;
    const id = setlistIdToDelete;
    try {
      console.log('Confirmed deletion for id:', id);
      await apiService.deleteSetlist(id);
      console.log('API deletion successful');
      setSetlists(prev => prev.filter(s => s.id !== id));
      if (activeSetlistId === id) setActiveSetlistId(null);
    } catch (error: any) {
      console.error('Error deleting setlist:', error);
      alert(`Errore nell'eliminazione della scaletta: ${error.message || 'Controlla la console'}`);
    } finally {
      setSetlistIdToDelete(null);
    }
  };

  const updateSetlist = (updated: Setlist) => {
    setSetlists(setlists.map(s => s.id === updated.id ? updated : s));
  };

  return (
    <div className="flex h-screen w-full bg-brand-bg overflow-hidden relative">
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-brand-border flex flex-col transition-transform duration-300 transform md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-6 border-b border-slate-100 bg-white flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-brand-primary">SetlistStudio</h1>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-slate-400">
            <ChevronRight className="rotate-180" size={20} />
          </button>
        </div>

        <nav className="p-4 space-y-4">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => { setView('setlists'); setIsSidebarOpen(false); }}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${view === 'setlists' ? 'bg-white text-brand-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Scalette
            </button>
            <button 
              onClick={() => { setView('repertoire'); setIsSidebarOpen(false); }}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${view === 'repertoire' ? 'bg-white text-brand-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Repertorio
            </button>
          </div>
        </nav>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pt-0">
          {view === 'setlists' ? (
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-2">Le Mie Scalette</div>
              {setlists.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-sm italic">Nessuna scaletta</div>
              ) : (
                <AnimatePresence>
                  {setlists.map((s) => (
                    <motion.div 
                      key={s.id}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      onClick={() => { setActiveSetlistId(s.id); setView('setlists'); setIsSidebarOpen(false); }}
                      className={`group p-3 rounded-xl flex items-center gap-3 cursor-pointer transition-all relative ${activeSetlistId === s.id ? 'bg-indigo-50 text-brand-primary' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                      <div className={`w-2 h-2 rounded-full ${activeSetlistId === s.id ? 'bg-brand-primary' : 'bg-slate-300 group-hover:bg-brand-primary/50'}`} />
                      <div className="flex flex-col flex-1 truncate">
                        <span className="text-sm font-medium truncate">{s.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {s.date && <span className="mr-1">{new Date(s.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} •</span>}
                          {setlistService.formatDuration(setlistService.calculateTotalSeconds(s, s.songs || []))}
                        </span>
                      </div>
                      <button 
                        onClick={(e) => deleteSetlist(s.id, e)}
                        title="Elimina scaletta"
                        className={`p-2 rounded-lg transition-all flex items-center justify-center
                          ${activeSetlistId === s.id 
                            ? 'opacity-60 hover:opacity-100 hover:bg-red-500 hover:text-white' 
                            : 'opacity-0 group-hover:opacity-100 hover:bg-red-100 text-slate-300 hover:text-red-600'
                          }`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          ) : (
            <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 text-center">
              <Music className="mx-auto text-brand-primary/40 mb-2" size={24} />
              <p className="text-[11px] font-bold text-indigo-900/60 uppercase tracking-widest">Vista Repertorio</p>
              <p className="text-[10px] text-indigo-700/50 mt-1">Gestisci il database globale dei tuoi brani.</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100">
          <button 
            onClick={createNewSetlist}
            className="w-full py-2.5 px-4 bg-slate-900 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors shadow-sm active:scale-95"
          >
            <Plus size={16} /> Nuova Scaletta
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-brand-bg relative">
        {/* Mobile Menu Toggle */}
        {!activeSetlist && (
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="md:hidden p-2 absolute top-6 left-4 z-30 bg-white rounded-lg shadow-sm border border-brand-border text-slate-500"
          >
            <LayoutGrid size={20} />
          </button>
        )}
        
        {!isSupabaseConfigured && (
          <div className="bg-amber-50 border-b border-amber-200 p-3 text-center">
            <p className="text-amber-800 text-xs font-semibold flex items-center justify-center gap-2">
              <span className="w-2 h-2 bg-amber-500 rounded-full animate-ping" />
              Configurazione Supabase mancante. Aggiungi VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY in Impostazioni.
            </p>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border-b border-red-200 p-4 text-center">
            <p className="text-red-800 text-sm font-medium">
              Errore: {error}
            </p>
            <button 
              onClick={fetchSetlists}
              className="mt-2 text-xs text-red-600 underline hover:text-red-800"
            >
              Riprova caricamento
            </button>
          </div>
        )}
        {view === 'repertoire' ? (
          <RepertoireView onMenuClick={() => setIsSidebarOpen(true)} setlists={setlists} />
        ) : activeSetlist ? (
          <div key={activeSetlist.id} className="flex-1 flex flex-col overflow-hidden">
            <SetlistEditor 
              setlist={activeSetlist} 
              onBack={() => setActiveSetlistId(null)} 
              onUpdate={updateSetlist}
              onMenuClick={() => setIsSidebarOpen(true)}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <div className="bg-white p-8 rounded-3xl border border-brand-border shadow-sm max-w-sm w-full">
              <div className="w-16 h-16 bg-brand-soft rounded-2xl flex items-center justify-center mx-auto mb-6 text-brand-primary">
                <Music size={32} />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Pronto per lo show?</h2>
              <p className="text-sm leading-relaxed mb-8">Seleziona una scaletta esistente dalla barra laterale o creane una nuova per iniziare.</p>
              <button 
                onClick={createNewSetlist}
                className="w-full py-3 bg-brand-primary text-white rounded-xl font-semibold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95"
              >
                Crea Prima Scaletta
              </button>
            </div>
          </div>
        )}
      </main>

      <DeleteConfirmationModal 
        isOpen={!!setlistIdToDelete}
        title="Elimina Scaletta"
        message="Sei sicuro di voler eliminare definitivamente questa scaletta? Questa operazione non può essere annullata."
        onConfirm={confirmDeleteSetlist}
        onCancel={() => setSetlistIdToDelete(null)}
      />
    </div>
  );
}

