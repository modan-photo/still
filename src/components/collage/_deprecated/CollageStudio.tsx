import {
  Alert, Button, Checkbox, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem,
  Select, Slider, TextField, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import { open, save } from '@tauri-apps/plugin-dialog';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '../../Icons';
import { cacheAssetUrl, getCachedImage, normalizeError } from '../../../services/tauri/image';
import { composeCollage } from '../../../services/tauri/collage';
import { useCollageStore } from '../../../stores/collageStore';
import type { CollageConfig, CollageItem, CollageMode } from '../../../types/collage';

type Photo = { id: string; path: string; thumbUrl: string };
type Props = { photos: Photo[]; onClose: () => void };
const RATIOS = [{ label: '1:1', value: 1 }, { label: '4:3', value: 4 / 3 }, { label: '16:9', value: 16 / 9 }, { label: '9:16', value: 9 / 16 }];

export function CollageStudio({ photos, onClose }: Props) {
  const items = useCollageStore((state) => state.items);
  const config = useCollageStore((state) => state.config);
  const selectedItemId = useCollageStore((state) => state.selectedItemId);
  const templates = useCollageStore((state) => state.templates);
  const initialize = useCollageStore((state) => state.initialize);
  const setConfig = useCollageStore((state) => state.setConfig);
  const select = useCollageStore((state) => state.select);
  const updateItem = useCollageStore((state) => state.updateItem);
  const reorder = useCollageStore((state) => state.reorder);
  const saveTemplate = useCollageStore((state) => state.saveTemplate);
  const applyTemplate = useCollageStore((state) => state.applyTemplate);
  const [templateName, setTemplateName] = useState('');
  const [message, setMessage] = useState<{ severity: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const images = useCollageImages(items);
  const backgroundImage = useBackgroundImage(config);
  const selected = items.find((item) => item.id === selectedItemId) ?? null;
  useEffect(() => { initialize(photos); }, [initialize, photos]);

  const switchMode = (mode: CollageMode | null) => {
    if (!mode) return;
    const count = Math.max(1, items.length);
    const columns = Math.ceil(Math.sqrt(count));
    setConfig({ mode, columns, rows: Math.ceil(count / columns) });
  };
  const setRatio = (ratio: number) => setConfig({ height: Math.max(1, Math.round(config.width / ratio)) });
  const doExport = async () => {
    const outputPath = await save({ title: 'Export collage', defaultPath: 'still-collage.png', filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
    if (!outputPath) return;
    setExporting(true); setMessage(null);
    try {
      const pixels = config.width * config.height;
      if (pixels > 100_000_000) setMessage({ severity: 'warning', text: 'The canvas exceeds 100 MP and will be downsampled proportionally during export.' });
      const path = await composeCollage(items, { ...config, outputPath });
      setMessage({ severity: 'success', text: `Exported to ${path}` });
    } catch (reason) { setMessage({ severity: 'error', text: normalizeError(reason).message }); }
    finally { setExporting(false); }
  };
  const chooseBackground = async () => {
    const path = await open({ multiple: false, directory: false, title: 'Choose background image', filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff'] }] });
    if (typeof path === 'string') setConfig({ background: { type: 'image', path, mode: 'contain' } });
  };
  const patchGradient = (patch: Partial<{ colors: string[]; angle: number }>) => {
    const current = config.background.type === 'linearGradient' ? config.background : { type: 'linearGradient' as const, colors: ['#f3f1ec', '#a9b8aa'], angle: 135 };
    setConfig({ background: { ...current, ...patch } });
  };
  const patchBackgroundImageMode = (mode: 'tile' | 'stretch' | 'contain') => {
    if (config.background.type === 'image') setConfig({ background: { ...config.background, mode } });
  };

  return <div className="fixed inset-0 z-[100] grid min-h-0 grid-rows-[52px_minmax(0,1fr)_104px] bg-app-base text-primary">
    <header className="flex items-center justify-between gap-4 border-b border-subtle bg-app-surface px-4">
      <div className="flex items-center gap-3"><IconButton aria-label="Close collage" onClick={onClose}><Icon name="close" size={18} /></IconButton><div><div className="text-sm font-semibold">Collage Studio</div><div className="text-[10px] uppercase tracking-[.14em] text-secondary">Collage composer</div></div></div>
      <ToggleButtonGroup exclusive size="small" value={config.mode} onChange={(_, value) => switchMode(value)} aria-label="Layout mode">
        <ToggleButton value="grid">Grid</ToggleButton><ToggleButton value="strip">Strip</ToggleButton><ToggleButton value="free">Freeform</ToggleButton>
      </ToggleButtonGroup>
      <div className="flex items-center gap-2"><Button size="small" onClick={onClose}>Back to editor</Button><Button variant="contained" disabled={exporting || items.length === 0} onClick={() => void doExport()}>{exporting ? 'Exporting…' : 'Export collage'}</Button></div>
    </header>

    <div className="grid min-h-0 grid-cols-[240px_minmax(320px,1fr)_260px]">
      <aside className="min-h-0 overflow-y-auto border-r border-subtle bg-app-surface p-4">
        <PanelTitle title="Canvas" />
        <div className="grid grid-cols-2 gap-2"><NumberField label="Width" value={config.width} onChange={(width) => setConfig({ width })} /><NumberField label="Height" value={config.height} onChange={(height) => setConfig({ height })} /></div>
        <div className="mt-2 grid grid-cols-4 gap-1">{RATIOS.map((ratio) => <Button key={ratio.label} size="small" variant={Math.abs(config.width / config.height - ratio.value) < .01 ? 'contained' : 'outlined'} onClick={() => setRatio(ratio.value)}>{ratio.label}</Button>)}</div>
        {config.mode === 'grid' && <div className="mt-4 grid grid-cols-2 gap-2"><NumberField label="Columns" value={config.columns} min={1} max={12} onChange={(columns) => setConfig({ columns })} /><NumberField label="Rows" value={config.rows} min={1} max={12} onChange={(rows) => setConfig({ rows })} /></div>}
        {config.mode === 'strip' && <ToggleButtonGroup exclusive fullWidth size="small" value={config.direction} onChange={(_, direction) => direction && setConfig({ direction })} sx={{ mt: 2 }}><ToggleButton value="vertical">Vertical</ToggleButton><ToggleButton value="horizontal">Horizontal</ToggleButton></ToggleButtonGroup>}
        <PanelTitle title="Spacing & shape" />
        <Range label="Outer margin" value={config.outerMargin} max={300} onChange={(outerMargin) => setConfig({ outerMargin })} />
        <Range label="Gap" value={config.gap} max={200} onChange={(gap) => setConfig({ gap })} />
        <Range label="Corner radius" value={config.cornerRadius} max={240} onChange={(cornerRadius) => setConfig({ cornerRadius })} />
        <PanelTitle title="Background" />
        <ToggleButtonGroup exclusive fullWidth size="small" value={config.background.type} onChange={(_, type) => { if(type==='color')setConfig({background:{type:'color',color:'#f3f1ec'}});if(type==='linearGradient')setConfig({background:{type:'linearGradient',colors:['#f3f1ec','#a9b8aa'],angle:135}});if(type==='image')void chooseBackground(); }}><ToggleButton value="color">Color</ToggleButton><ToggleButton value="linearGradient">Gradient</ToggleButton><ToggleButton value="image">Image</ToggleButton></ToggleButtonGroup>
        {config.background.type === 'color' && <div className="mt-2 flex items-center gap-2"><input aria-label="Background color" type="color" className="h-9 w-12 rounded border border-subtle bg-transparent" value={config.background.color} onChange={(event) => setConfig({ background: { type: 'color', color: event.target.value } })} /><TextField size="small" fullWidth value={config.background.color} onChange={(event) => setConfig({ background: { type: 'color', color: event.target.value } })} /></div>}
        {config.background.type === 'linearGradient' && <div className="mt-2 grid grid-cols-[44px_44px_1fr] gap-2"><input aria-label="Gradient start color" type="color" value={config.background.colors[0] ?? '#f3f1ec'} onChange={(event)=>patchGradient({colors:[event.target.value,config.background.type==='linearGradient'?config.background.colors[1]??'#a9b8aa':'#a9b8aa']})} /><input aria-label="Gradient end color" type="color" value={config.background.colors[1] ?? '#a9b8aa'} onChange={(event)=>patchGradient({colors:[config.background.type==='linearGradient'?config.background.colors[0]??'#f3f1ec':'#f3f1ec',event.target.value]})} /><NumberField label="Angle" value={config.background.angle} min={0} max={360} onChange={(angle)=>patchGradient({angle})} /></div>}
        {config.background.type === 'image' && <div className="mt-2 space-y-2"><Button size="small" fullWidth variant="outlined" onClick={()=>void chooseBackground()}><span className="truncate">{config.background.path.split(/[\\/]/).pop() || 'Choose background image'}</span></Button><ToggleButtonGroup exclusive fullWidth size="small" value={config.background.mode} onChange={(_,mode)=>mode&&patchBackgroundImageMode(mode)}><ToggleButton value="tile">Tile</ToggleButton><ToggleButton value="stretch">Stretch</ToggleButton><ToggleButton value="contain">Fit</ToggleButton></ToggleButtonGroup></div>}
        <FormControlLabel control={<Checkbox checked={config.shadow.enabled} onChange={(event) => setConfig({ shadow: { ...config.shadow, enabled: event.target.checked } })} />} label="Photo shadow" />
        {config.shadow.enabled && <><Range label="Shadow blur" value={config.shadow.blur} max={80} onChange={(blur)=>setConfig({shadow:{...config.shadow,blur}})} /><Range label="Vertical offset" value={config.shadow.offsetY} min={-40} max={80} onChange={(offsetY)=>setConfig({shadow:{...config.shadow,offsetY}})} /></>}
        <PanelTitle title="Templates" />
        <div className="flex gap-2"><TextField size="small" placeholder="Template name" value={templateName} onChange={(event) => setTemplateName(event.target.value)} /><Button size="small" variant="outlined" disabled={!templateName.trim()} onClick={() => { saveTemplate(templateName.trim()); setTemplateName(''); setMessage({ severity: 'success', text: 'Template saved.' }); }}>Save</Button></div>
        {templates.length > 0 && <FormControl size="small" fullWidth sx={{ mt: 1 }}><InputLabel>Apply template</InputLabel><Select label="Apply template" value="" onChange={(event) => applyTemplate(String(event.target.value))}><MenuItem value=""><em>Choose a template</em></MenuItem>{templates.map((template) => <MenuItem key={template.id} value={template.id}>{template.name}</MenuItem>)}</Select></FormControl>}
      </aside>

      <main className="relative min-h-0 overflow-hidden bg-[#111512] p-7">
        <div className="pointer-events-none absolute inset-0 opacity-[.22]" style={{ backgroundImage: 'radial-gradient(#7f8b82 0.7px, transparent 0.7px)', backgroundSize: '18px 18px' }} />
        <div className="relative flex h-full items-center justify-center">
          {config.mode === 'free'
            ? <FreeCanvas items={items} config={config} images={images} selectedId={selectedItemId} onSelect={select} onUpdate={updateItem} />
            : <RasterCanvas items={items} config={config} images={images} backgroundImage={backgroundImage} selectedId={selectedItemId} onSelect={select} />}
        </div>
        {message && <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ position: 'absolute', left: 24, right: 24, bottom: 18 }}>{message.text}</Alert>}
      </main>

      <aside className="min-h-0 overflow-y-auto border-l border-subtle bg-app-surface p-4">
        <PanelTitle title="Photo settings" />
        {!selected && <p className="text-xs leading-5 text-secondary">Select a photo on the canvas to adjust its crop, offset, and rotation.</p>}
        {selected && <>
          <div className="mb-3 truncate rounded border border-subtle bg-app-base px-2 py-2 text-xs">{selected.path.split(/[\\/]/).pop()}</div>
          <ToggleButtonGroup exclusive fullWidth size="small" value={selected.transform.fit} onChange={(_, fit) => fit && updateItem(selected.id, { transform: { ...selected.transform, fit } })}><ToggleButton value="cover">Fill</ToggleButton><ToggleButton value="contain">Fit</ToggleButton></ToggleButtonGroup>
          <Range label="Scale" value={selected.transform.scale} min={.2} max={3} step={.01} onChange={(scale) => updateItem(selected.id, { transform: { ...selected.transform, scale } })} />
          <Range label="Horizontal offset" value={selected.transform.offsetX} min={-1} max={1} step={.01} onChange={(offsetX) => updateItem(selected.id, { transform: { ...selected.transform, offsetX } })} />
          <Range label="Vertical offset" value={selected.transform.offsetY} min={-1} max={1} step={.01} onChange={(offsetY) => updateItem(selected.id, { transform: { ...selected.transform, offsetY } })} />
          <Range label="Rotation" value={selected.transform.rotation} min={-180} max={180} onChange={(rotation) => updateItem(selected.id, { transform: { ...selected.transform, rotation } })} />
          {config.mode === 'grid' && <div className="mt-3 grid grid-cols-2 gap-2"><NumberField label="Column span" value={selected.cell.columnSpan} min={1} max={config.columns} onChange={(columnSpan) => updateItem(selected.id, { cell: { ...selected.cell, columnSpan } })} /><NumberField label="Row span" value={selected.cell.rowSpan} min={1} max={config.rows} onChange={(rowSpan) => updateItem(selected.id, { cell: { ...selected.cell, rowSpan } })} /></div>}
          <Button size="small" fullWidth sx={{ mt: 2 }} onClick={() => updateItem(selected.id, { transform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0, fit: 'cover' } })}>Reset photo transform</Button>
        </>}
      </aside>
    </div>

    <footer className="flex min-w-0 items-center gap-3 overflow-x-auto border-t border-subtle bg-app-surface px-4 py-2">
      <div className="w-24 shrink-0"><div className="text-xs font-semibold">Collage photos</div><div className="mt-1 text-[10px] text-secondary">Drag to reorder · {items.length} photos</div></div>
      {items.map((item, index) => { const thumb = photos.find((photo) => photo.id === item.id)?.thumbUrl; return <button key={item.id} draggable onDragStart={() => setDragIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragIndex !== null) reorder(dragIndex, index); setDragIndex(null); }} onClick={() => select(item.id)} className={`group relative h-[76px] w-[92px] shrink-0 overflow-hidden rounded-md border-2 bg-app-base transition ${selectedItemId === item.id ? 'border-accent' : 'border-transparent hover:border-subtle'}`}>{thumb && <img alt="" src={cacheAssetUrl(thumb)} className="h-full w-full object-cover" />}<span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded bg-black/70 text-[10px] text-white">{index + 1}</span></button>; })}
    </footer>
  </div>;
}

function useCollageImages(items: CollageItem[]) {
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  useEffect(() => { let disposed = false; const loaded: Record<string, HTMLImageElement> = {};
    void Promise.all(items.map(async (item) => { try { const cached = await getCachedImage(item.path, 'preview'); const image = new Image(); image.src = cacheAssetUrl(cached.path); await image.decode(); loaded[item.id] = image; } catch { /* surfaced as an empty cell */ } })).then(() => { if (!disposed) setImages(loaded); });
    return () => { disposed = true; Object.values(loaded).forEach((image) => image.removeAttribute('src')); };
  }, [items.map((item) => item.path).join('|')]);
  return images;
}

function useBackgroundImage(config: CollageConfig) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const path = config.background.type === 'image' ? config.background.path : null;
  useEffect(() => { let disposed = false; if (!path) { setImage(null); return; } const next = new Image(); next.src = cacheAssetUrl(path); void next.decode().then(() => { if (!disposed) setImage(next); }).catch(() => setImage(null)); return () => { disposed = true; next.removeAttribute('src'); }; }, [path]);
  return image;
}

function RasterCanvas({ items, config, images, backgroundImage, selectedId, onSelect }: { items: CollageItem[]; config: CollageConfig; images: Record<string, HTMLImageElement>; backgroundImage: HTMLImageElement | null; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const display = fitSize(config.width, config.height);
  useEffect(() => { const target = canvas.current; if (!target) return; const dpr = Math.min(window.devicePixelRatio || 1, 2); target.width = Math.round(display.width * dpr); target.height = Math.round(display.height * dpr); const ctx = target.getContext('2d'); if (!ctx) return; ctx.setTransform(dpr,0,0,dpr,0,0); drawPreview(ctx, items, config, images, backgroundImage, display.width / config.width, selectedId); }, [items, config, images, backgroundImage, selectedId, display.width, display.height]);
  const pick = (event: ReactPointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); const x = (event.clientX-rect.left)/rect.width; const y = (event.clientY-rect.top)/rect.height; const found = [...items].reverse().find((item,index) => { const cell = normalizedRect(item,index,items.length,config); return x>=cell.x && x<=cell.x+cell.width && y>=cell.y && y<=cell.y+cell.height; }); onSelect(found?.id ?? null); };
  return <canvas ref={canvas} onPointerDown={pick} style={{ width: display.width, height: display.height }} className="max-h-full max-w-full shadow-[0_28px_80px_rgba(0,0,0,.42)]" />;
}

function FreeCanvas({ items, config, images, selectedId, onSelect, onUpdate }: { items: CollageItem[]; config: CollageConfig; images: Record<string, HTMLImageElement>; selectedId: string | null; onSelect: (id: string | null) => void; onUpdate: (id: string, patch: Partial<CollageItem>) => void }) {
  const display = fitSize(config.width, config.height); const surface = useRef<HTMLDivElement>(null);
  const begin = (event: ReactPointerEvent, item: CollageItem, kind: 'move'|'resize'|'rotate') => { event.stopPropagation(); onSelect(item.id); const start = { x: event.clientX, y: event.clientY, cell: { ...item.cell }, rotation: item.transform.rotation }; const target = event.currentTarget as HTMLElement; target.setPointerCapture(event.pointerId);
    const move = (native: PointerEvent) => { const dx = (native.clientX-start.x)/display.width; const dy = (native.clientY-start.y)/display.height; if (kind==='move') onUpdate(item.id,{ cell:{...start.cell,x:start.cell.x+dx,y:start.cell.y+dy} }); if(kind==='resize') onUpdate(item.id,{cell:{...start.cell,width:Math.max(.05,start.cell.width+dx),height:Math.max(.05,start.cell.height+dy)}}); if(kind==='rotate'){ const rect=surface.current?.getBoundingClientRect(); if(!rect)return; const cx=rect.left+(start.cell.x+start.cell.width/2)*display.width; const cy=rect.top+(start.cell.y+start.cell.height/2)*display.height; onUpdate(item.id,{transform:{...item.transform,rotation:Math.atan2(native.clientY-cy,native.clientX-cx)*180/Math.PI+90}}); } };
    const end = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end); }; target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end);
  };
  return <div ref={surface} onPointerDown={() => onSelect(null)} className="relative overflow-hidden shadow-[0_28px_80px_rgba(0,0,0,.42)]" style={{ width: display.width, height: display.height, background: backgroundCss(config) }}>
    {[...items].sort((a,b)=>a.cell.zIndex-b.cell.zIndex).map((item) => { const active=item.id===selectedId; const image=images[item.id]; return <div key={item.id} onPointerDown={(event)=>begin(event,item,'move')} className={`absolute touch-none select-none overflow-visible ${active?'z-20':'z-10'}`} style={{ left:`${item.cell.x*100}%`,top:`${item.cell.y*100}%`,width:`${item.cell.width*100}%`,height:`${item.cell.height*100}%`,transform:`rotate(${item.transform.rotation}deg)`,borderRadius:config.cornerRadius*display.width/config.width,boxShadow:config.shadow.enabled?'0 8px 22px rgba(0,0,0,.28)':undefined }}>
      <div className="h-full w-full overflow-hidden" style={{borderRadius:'inherit'}}>{image&&<img src={image.src} draggable={false} className="pointer-events-none h-full w-full" style={{objectFit:item.transform.fit,transform:`translate(${item.transform.offsetX*100}%,${item.transform.offsetY*100}%) scale(${item.transform.scale})`}}/>}</div>
      {active&&<><span className="pointer-events-none absolute inset-0 border-2 border-[#3b82f6]"/><span onPointerDown={(event)=>begin(event,item,'resize')} className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-white bg-[#3b82f6] shadow"/><span onPointerDown={(event)=>begin(event,item,'rotate')} className="absolute -top-7 left-1/2 h-5 w-5 -translate-x-1/2 cursor-grab rounded-full border-2 border-white bg-[#3b82f6] shadow after:absolute after:left-1/2 after:top-full after:h-2 after:w-px after:bg-[#3b82f6]"/></>}
    </div>; })}
  </div>;
}

function drawPreview(ctx: CanvasRenderingContext2D, items: CollageItem[], config: CollageConfig, images: Record<string, HTMLImageElement>, backgroundImage: HTMLImageElement | null, scale: number, selectedId: string | null) {
  ctx.save(); ctx.fillStyle = backgroundCss(config); ctx.fillRect(0,0,config.width*scale,config.height*scale); if(config.background.type==='image'&&backgroundImage){const w=config.width*scale,h=config.height*scale;if(config.background.mode==='stretch')ctx.drawImage(backgroundImage,0,0,w,h);else if(config.background.mode==='tile'){const pattern=ctx.createPattern(backgroundImage,'repeat');if(pattern){ctx.fillStyle=pattern;ctx.fillRect(0,0,w,h)}}else{const factor=Math.min(w/backgroundImage.naturalWidth,h/backgroundImage.naturalHeight),dw=backgroundImage.naturalWidth*factor,dh=backgroundImage.naturalHeight*factor;ctx.drawImage(backgroundImage,(w-dw)/2,(h-dh)/2,dw,dh)}}
  items.forEach((item,index)=>{ const r=normalizedRect(item,index,items.length,config); const x=r.x*config.width*scale,y=r.y*config.height*scale,w=r.width*config.width*scale,h=r.height*config.height*scale; const image=images[item.id]; if(!image)return; ctx.save(); roundRect(ctx,x,y,w,h,config.cornerRadius*scale); ctx.clip(); ctx.translate(x+w/2,y+h/2); ctx.rotate(item.transform.rotation*Math.PI/180); const fit=item.transform.fit==='cover'?Math.max(w/image.naturalWidth,h/image.naturalHeight):Math.min(w/image.naturalWidth,h/image.naturalHeight); const dw=image.naturalWidth*fit*item.transform.scale,dh=image.naturalHeight*fit*item.transform.scale; ctx.drawImage(image,-dw/2+item.transform.offsetX*w,-dh/2+item.transform.offsetY*h,dw,dh); ctx.restore(); if(item.id===selectedId){ctx.save();ctx.strokeStyle='#3b82f6';ctx.lineWidth=2;roundRect(ctx,x+1,y+1,w-2,h-2,config.cornerRadius*scale);ctx.stroke();ctx.restore();} }); ctx.restore();
}
function normalizedRect(item: CollageItem,index:number,count:number,config:CollageConfig){ const mx=config.outerMargin/config.width,my=config.outerMargin/config.height,gx=config.gap/config.width,gy=config.gap/config.height; if(config.mode==='grid'){const cw=(1-2*mx-gx*(config.columns-1))/config.columns,ch=(1-2*my-gy*(config.rows-1))/config.rows;return{x:mx+item.cell.column*(cw+gx),y:my+item.cell.row*(ch+gy),width:cw*item.cell.columnSpan+gx*(item.cell.columnSpan-1),height:ch*item.cell.rowSpan+gy*(item.cell.rowSpan-1)}} if(config.direction==='vertical'){const h=(1-2*my-gy*(count-1))/count;return{x:mx,y:my+index*(h+gy),width:1-2*mx,height:h}}const w=(1-2*mx-gx*(count-1))/count;return{x:mx+index*(w+gx),y:my,width:w,height:1-2*my}}
function fitSize(width:number,height:number){const maxW=Math.max(320,window.innerWidth-560-64),maxH=Math.max(260,window.innerHeight-52-104-56),factor=Math.min(maxW/width,maxH/height);return{width:Math.round(width*factor),height:Math.round(height*factor)}}
function backgroundCss(config:CollageConfig){if(config.background.type==='color')return config.background.color;if(config.background.type==='linearGradient')return`linear-gradient(${config.background.angle}deg,${config.background.colors.join(',')})`;if(config.background.type==='image'){const size=config.background.mode==='tile'?'auto':config.background.mode==='stretch'?'100% 100%':'contain';return`#fff url("${cacheAssetUrl(config.background.path)}") center / ${size} ${config.background.mode==='tile'?'repeat':'no-repeat'}`}return'#fff'}
function roundRect(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){ctx.beginPath();ctx.roundRect(x,y,w,h,Math.min(r,w/2,h/2))}
function PanelTitle({title}:{title:string}){return <h2 className="mb-3 mt-5 first:mt-0 text-[11px] font-semibold uppercase tracking-[.12em] text-secondary">{title}</h2>}
function Range({label,value,min=0,max,step=1,onChange}:{label:string;value:number;min?:number;max:number;step?:number;onChange:(value:number)=>void}){return <div className="mt-3"><div className="flex justify-between text-xs text-secondary"><span>{label}</span><span className="font-mono text-primary">{Number(value.toFixed(2))}</span></div><Slider size="small" value={value} min={min} max={max} step={step} onChange={(_,next)=>onChange(next as number)}/></div>}
function NumberField({label,value,min=1,max=20000,onChange}:{label:string;value:number;min?:number;max?:number;onChange:(value:number)=>void}){return <TextField size="small" type="number" label={label} value={value} onChange={(event)=>onChange(Math.min(max,Math.max(min,Number(event.target.value)||min)))} slotProps={{htmlInput:{min,max}}}/>} 
