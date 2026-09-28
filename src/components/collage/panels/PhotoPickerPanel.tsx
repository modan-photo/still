import { Box, Button, ButtonBase, useTheme } from '@mui/material';
import { useRef, useState } from 'react';
import { ThumbnailImage } from '../../ThumbnailImage';
import { useProjectStore } from '../../../stores/projectStore';

export function PhotoPickerPanel({ expanded = false }: { expanded?: boolean }) {
  const theme = useTheme();
  const photos = useProjectStore((state) => state.photos);
  const photoIds = useProjectStore((state) => state.collageDraft.photoIds);
  const update = useProjectStore((state) => state.updateCollageDraft);
  const [showAll, setShowAll] = useState(expanded);
  const dragIndex = useRef<number | null>(null);
  const selected = photoIds.map((id) => photos.find((photo) => photo.id === id)).filter((photo) => Boolean(photo));
  const toggle = (id: string) => {
    if (photoIds.includes(id)) {
      if (photoIds.length <= 2) return;
      update({ photoIds: photoIds.filter((photoId) => photoId !== id) });
    } else {
      update({ photoIds: [...photoIds, id] });
    }
  };
  const reorder = (from: number, to: number) => {
    const next = [...photoIds];
    const [id] = next.splice(from, 1);
    next.splice(to, 0, id);
    update({ photoIds: next });
  };

  return <Box sx={{ display: 'grid', gap: `${theme.still.spacing.sm}px` }}>
    <Box sx={{ display: 'flex', gap: `${theme.still.spacing.xs}px`, minHeight: 48, overflowX: 'auto', pb: `${theme.still.spacing.xs}px` }}>
      {selected.map((photo, index) => photo && <Box key={photo.id} draggable onDragStart={() => { dragIndex.current = index; }} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragIndex.current !== null) reorder(dragIndex.current, index); dragIndex.current = null; }} sx={{ width: 48, height: 48, flex: '0 0 auto', overflow: 'hidden', border: '1px solid', borderColor: 'divider', borderRadius: `${theme.still.radius.sm}px`, cursor: 'grab' }}><ThumbnailImage thumbPath={photo.thumbUrl} revision={photo.thumbRevision} label={photo.path} /></Box>)}
    </Box>
    {!expanded && <Button size="small" variant="outlined" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Hide photo picker' : 'Select photos'}</Button>}
    {showAll && <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: `${theme.still.spacing.sm}px`, maxHeight: expanded ? 'none' : 240, overflowY: 'auto' }}>
      {photos.map((photo) => { const active = photoIds.includes(photo.id); return <ButtonBase key={photo.id} aria-label={`${active ? 'Remove' : 'Add'} ${photo.path.split(/[\\/]/).pop()}`} aria-pressed={active} onClick={() => toggle(photo.id)} sx={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', border: '2px solid', borderColor: active ? 'primary.main' : 'divider', borderRadius: `${theme.still.radius.md}px`, transition: theme.transitions.create('border-color', { duration: theme.still.motion.duration.fast }) }}><ThumbnailImage thumbPath={photo.thumbUrl} revision={photo.thumbRevision} label={photo.path} />{active && <Box sx={{ position: 'absolute', right: 4, bottom: 4, display: 'grid', width: 18, height: 18, placeItems: 'center', borderRadius: `${theme.still.radius.full}px`, color: theme.still.colors[theme.palette.mode].bg.surface, backgroundColor: 'primary.main', fontSize: 10 }}>{photoIds.indexOf(photo.id) + 1}</Box>}</ButtonBase>; })}
    </Box>}
    <Box sx={{ color: 'text.secondary', fontSize: 11 }}>{photoIds.length} selected · minimum 2</Box>
  </Box>;
}
