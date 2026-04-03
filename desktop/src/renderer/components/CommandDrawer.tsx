import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { SkillEntry } from '../../shared/types';
import SkillCard from './SkillCard';

interface Props {
  open: boolean;
  searchMode: boolean;
  skills: SkillEntry[];
  onSelect: (skill: SkillEntry) => void;
  onClose: () => void;
}

const categoryOrder = ['personal', 'work', 'development', 'admin', 'other'] as const;
const categoryLabels: Record<string, string> = {
  personal: 'PERSONAL',
  work: 'WORK',
  development: 'DEVELOPMENT',
  admin: 'DESTINCLAUDE ADMIN',
  other: 'OTHER SKILLS',
};

export default function CommandDrawer({ open, searchMode, skills, onSelect, onClose }: Props) {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus search on open (always in search mode, optionally in browse mode)
  useEffect(() => {
    if (open) {
      setSearch('');
      // Small delay to let the transition start before focusing
      const t = setTimeout(() => searchRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open, searchMode]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Filter skills by search query
  const filtered = useMemo(() => {
    if (!search.trim()) return skills;
    const q = search.toLowerCase();
    return skills.filter(
      (s) =>
        s.displayName.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
    );
  }, [skills, search]);

  // Group by category (only when not searching)
  const grouped = useMemo(() => {
    if (search.trim()) return null;
    const groups = new Map<string, SkillEntry[]>();
    for (const s of filtered) {
      const list = groups.get(s.category) || [];
      list.push(s);
      groups.set(s.category, list);
    }
    return groups;
  }, [filtered, search]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-canvas/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-panel border-t border-edge-dim rounded-t-xl transition-transform duration-300 ease-out ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight: '45vh' }}
      >
        {/* Grab handle */}
        <div className="flex justify-center py-2">
          <div className="w-8 h-1 rounded-full bg-fg-faint" />
        </div>

        {/* Search bar */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 bg-well rounded-lg px-3 py-2 border border-edge-dim">
            <svg className="w-4 h-4 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search skills and commands..."
              className="flex-1 bg-transparent text-sm text-fg placeholder-fg-muted outline-none"
            />
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-4 pb-4" style={{ maxHeight: 'calc(45vh - 80px)' }}>
          {filtered.length === 0 ? (
            <p className="text-sm text-fg-muted text-center py-6">No matching skills</p>
          ) : grouped ? (
            // Categorized view
            categoryOrder.map((cat) => {
              const items = grouped.get(cat);
              if (!items || items.length === 0) return null;
              return (
                <div key={cat} className="mb-4">
                  <h3 className="text-[10px] font-medium text-fg-muted tracking-wider mb-2">
                    {categoryLabels[cat]}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {items.map((skill) => (
                      <SkillCard key={skill.id} skill={skill} onClick={onSelect} />
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            // Flat search results
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {filtered.map((skill) => (
                <SkillCard key={skill.id} skill={skill} onClick={onSelect} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
