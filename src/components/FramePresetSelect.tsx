import {
  Box,
  ButtonBase,
  ClickAwayListener,
  Drawer,
  Fade,
  IconButton,
  Paper,
  Popper,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import type { FramePreset } from '../types/frame';
import { FrameMiniPreview } from './FrameMiniPreview';
import { Icon } from './Icons';

type FramePreviewPreset = Pick<FramePreset, 'style' | 'params'>;

export interface FramePresetSelectProps {
  presets: readonly FramePreset[];
  selectedPresetId: string;
  currentPreviewPreset?: FramePreviewPreset;
  modified?: boolean;
  previewSource: string;
  originalWidth: number;
  originalHeight: number;
  onSelect: (preset: FramePreset) => void;
  onSaveCurrent: () => void;
  onQuickSave?: () => void;
  saveCurrentDisabled?: boolean;
  onPresetActions?: (preset: FramePreset, position: FramePresetActionPosition) => void;
}

export interface FramePresetActionPosition {
  top: number;
  left: number;
}

export function FramePresetSelect({
  presets,
  selectedPresetId,
  currentPreviewPreset,
  modified = false,
  previewSource,
  originalWidth,
  originalHeight,
  onSelect,
  onSaveCurrent,
  onQuickSave,
  saveCurrentDisabled = false,
  onPresetActions,
}: FramePresetSelectProps) {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  const listboxId = useId();
  const desktopListboxId = `${listboxId}-desktop`;
  const mobileListboxId = `${listboxId}-mobile`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const open = Boolean(anchor);
  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) ?? presets[0];

  useEffect(() => {
    if (!open || mobile) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setAnchor(null);
      triggerRef.current?.focus();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [mobile, open]);

  if (!selectedPreset) return null;

  const close = () => setAnchor(null);
  const select = (preset: FramePreset) => {
    onSelect(preset);
    close();
    if (!mobile) triggerRef.current?.focus();
  };
  const openPresetActions = (preset: FramePreset, position: FramePresetActionPosition) => {
    close();
    onPresetActions?.(preset, position);
  };
  const previewPreset = currentPreviewPreset ?? selectedPreset;

  return (
    <>
      <div className="group relative">
        <ButtonBase
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? (mobile ? mobileListboxId : desktopListboxId) : undefined}
          onClick={(event) => setAnchor(open ? null : event.currentTarget)}
          sx={(currentTheme) => ({
            width: '100%',
            height: 40,
            display: 'flex',
            gap: `${currentTheme.still.spacing.sm}px`,
            justifyContent: 'flex-start',
            padding: `${currentTheme.still.spacing.xs}px ${currentTheme.still.spacing.sm}px`,
            paddingRight: modified
              ? `${currentTheme.still.spacing.xxl * 2}px`
              : `${currentTheme.still.spacing.xxl}px`,
            border: '1px solid transparent',
            borderRadius: `${currentTheme.still.radius.md}px`,
            backgroundColor: currentTheme.still.colors[currentTheme.palette.mode].bg.elevated,
            color: currentTheme.still.colors[currentTheme.palette.mode].text.primary,
            transition: currentTheme.transitions.create(['background-color', 'border-color'], {
              duration: currentTheme.still.motion.duration.fast,
            }),
            '&:hover': {
              backgroundColor: currentTheme.still.colors[currentTheme.palette.mode].bg.surface,
              borderColor: currentTheme.still.colors[currentTheme.palette.mode].border.subtle,
            },
          })}
        >
          <FrameMiniPreview
            src={previewSource}
            preset={previewPreset}
            originalWidth={originalWidth}
            originalHeight={originalHeight}
          />
          <span className="min-w-0 flex-1 truncate text-left text-sm">
            {selectedPreset.name}{modified ? ' *' : ''}
          </span>
          <span className={`absolute right-2 text-secondary transition-transform duration-fast ${open ? 'rotate-180' : ''}`}>
            <Icon name="chevron" size={14} />
          </span>
        </ButtonBase>
        {modified && onQuickSave && (
          <Tooltip title="Save changes">
            <IconButton
              type="button"
              size="small"
              aria-label={`Save changes to ${selectedPreset.name}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onQuickSave();
              }}
              sx={(currentTheme) => ({
                position: 'absolute',
                top: 6,
                right: currentTheme.still.spacing.xxl,
                width: 28,
                height: 28,
                opacity: mobile ? 1 : 0,
                color: currentTheme.still.colors[currentTheme.palette.mode].text.secondary,
                transition: currentTheme.transitions.create(['opacity', 'color'], {
                  duration: currentTheme.still.motion.duration.fast,
                }),
                '.group:hover &': { opacity: 1 },
                '&:focus-visible': { opacity: 1 },
                '&:hover': { color: currentTheme.still.colors[currentTheme.palette.mode].accent },
              })}
            >
              <Icon name="save" size={14} />
            </IconButton>
          </Tooltip>
        )}
      </div>

      <Popper
        open={open && !mobile}
        anchorEl={anchor}
        placement="bottom-start"
        transition
        disablePortal={false}
        sx={{ zIndex: theme.zIndex.modal }}
        modifiers={[
          { name: 'offset', options: { offset: [0, theme.still.spacing.xs] } },
          { name: 'flip', options: { padding: theme.still.spacing.sm } },
          { name: 'preventOverflow', options: { padding: theme.still.spacing.sm } },
        ]}
      >
        {({ TransitionProps }) => (
          <Fade {...TransitionProps} timeout={theme.still.motion.duration.fast}>
            <div>
              <ClickAwayListener onClickAway={close}>
                <Paper
                  sx={(currentTheme) => ({
                    width: anchor?.clientWidth,
                    minWidth: 260,
                    maxHeight: 320,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    borderRadius: `${currentTheme.still.radius.lg}px`,
                    backgroundColor: currentTheme.still.colors[currentTheme.palette.mode].bg.elevated,
                    boxShadow: currentTheme.still.shadow.elev3,
                    animation: `frame-preset-enter ${currentTheme.still.motion.duration.fast}ms ${currentTheme.still.motion.easing}`,
                    '@keyframes frame-preset-enter': {
                      from: { opacity: 0, transform: 'translateY(-4px)' },
                      to: { opacity: 1, transform: 'translateY(0)' },
                    },
                  })}
                >
                  <PresetPanelContent
                    id={desktopListboxId}
                    presets={presets}
                    selectedPresetId={selectedPreset.id}
                    previewSource={previewSource}
                    originalWidth={originalWidth}
                    originalHeight={originalHeight}
                    saveCurrentDisabled={saveCurrentDisabled}
                    onSelect={select}
                    onPresetActions={openPresetActions}
                    onSaveCurrent={() => {
                      close();
                      onSaveCurrent();
                    }}
                  />
                </Paper>
              </ClickAwayListener>
            </div>
          </Fade>
        )}
      </Popper>

      <Drawer
        anchor="bottom"
        variant="temporary"
        open={open && mobile}
        onClose={close}
        ModalProps={{ keepMounted: true }}
        slotProps={{
          paper: {
            sx: (currentTheme) => ({
              height: 'min(70dvh, 420px)',
              maxHeight: '70dvh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              borderTopLeftRadius: `${currentTheme.still.radius.xl}px`,
              borderTopRightRadius: `${currentTheme.still.radius.xl}px`,
              backgroundColor: currentTheme.still.colors[currentTheme.palette.mode].bg.elevated,
              boxShadow: currentTheme.still.shadow.panelUp,
              transitionDuration: `${currentTheme.still.motion.duration.fast}ms`,
            }),
          },
          backdrop: {
            sx: (currentTheme) => ({
              backgroundColor: `${currentTheme.still.colors[currentTheme.palette.mode].text.primary}33`,
            }),
          },
        }}
      >
        <Box
          sx={(currentTheme) => ({
            display: 'grid',
            flex: '0 0 auto',
            height: 28,
            placeItems: 'center',
            paddingTop: `${currentTheme.still.spacing.sm}px`,
          })}
        >
          <Box
            aria-hidden="true"
            sx={(currentTheme) => ({
              width: 36,
              height: 4,
              borderRadius: `${currentTheme.still.radius.full}px`,
              backgroundColor: currentTheme.still.colors[currentTheme.palette.mode].border.subtle,
            })}
          />
        </Box>
        <div className="px-4 pb-2 text-base font-semibold text-primary">Presets</div>
        <PresetPanelContent
          id={mobileListboxId}
          presets={presets}
          selectedPresetId={selectedPreset.id}
          previewSource={previewSource}
          originalWidth={originalWidth}
          originalHeight={originalHeight}
          saveCurrentDisabled={saveCurrentDisabled}
          mobile
          showHeading={false}
          onSelect={select}
          onPresetActions={openPresetActions}
          onSaveCurrent={() => {
            close();
            onSaveCurrent();
          }}
        />
      </Drawer>
    </>
  );
}

function PresetPanelContent({
  id,
  presets,
  selectedPresetId,
  previewSource,
  originalWidth,
  originalHeight,
  saveCurrentDisabled,
  mobile = false,
  showHeading = true,
  onSelect,
  onPresetActions,
  onSaveCurrent,
}: {
  id: string;
  presets: readonly FramePreset[];
  selectedPresetId: string;
  previewSource: string;
  originalWidth: number;
  originalHeight: number;
  saveCurrentDisabled: boolean;
  mobile?: boolean;
  showHeading?: boolean;
  onSelect: (preset: FramePreset) => void;
  onPresetActions?: (preset: FramePreset, position: FramePresetActionPosition) => void;
  onSaveCurrent: () => void;
}) {
  return (
    <div id={id} role="listbox" aria-label="Frame presets" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
        <PresetGroup
          title="Presets"
          showHeading={showHeading}
          presets={presets}
          selectedPresetId={selectedPresetId}
          previewSource={previewSource}
          originalWidth={originalWidth}
          originalHeight={originalHeight}
          mobile={mobile}
          onSelect={onSelect}
          onPresetActions={onPresetActions}
        />
      </div>
      <div className="shrink-0 border-t border-subtle p-1">
        <ButtonBase
          type="button"
          disabled={saveCurrentDisabled}
          onClick={onSaveCurrent}
          sx={(currentTheme) => ({
            width: '100%',
            minHeight: 40,
            justifyContent: 'flex-start',
            gap: `${currentTheme.still.spacing.sm}px`,
            padding: `0 ${currentTheme.still.spacing.md}px`,
            borderRadius: `${currentTheme.still.radius.sm}px`,
            color: currentTheme.still.colors[currentTheme.palette.mode].text.primary,
            fontSize: 13,
            '&:hover': {
              backgroundColor: currentTheme.still.colors[currentTheme.palette.mode].bg.surface,
            },
            '&.Mui-disabled': {
              color: currentTheme.still.colors[currentTheme.palette.mode].text.secondary,
              opacity: 0.5,
            },
          })}
        >
          <Icon name="plus" size={14} />
          Save current settings as preset
        </ButtonBase>
      </div>
    </div>
  );
}

function PresetGroup({
  title,
  presets,
  selectedPresetId,
  previewSource,
  originalWidth,
  originalHeight,
  onSelect,
  onPresetActions,
  mobile = false,
  showHeading = true,
}: {
  title: string;
  showHeading?: boolean;
  presets: readonly FramePreset[];
  selectedPresetId: string;
  previewSource: string;
  originalWidth: number;
  originalHeight: number;
  onSelect: (preset: FramePreset) => void;
  onPresetActions?: (preset: FramePreset, position: FramePresetActionPosition) => void;
  mobile?: boolean;
}) {
  return (
    <div role="group" aria-label={title}>
      {showHeading && <div className="px-3 pb-1 pt-2 text-[11px] font-medium text-secondary">{title}</div>}
      {presets.map((preset) => (
        <PresetItem
          key={preset.id}
          preset={preset}
          selected={preset.id === selectedPresetId}
          previewSource={previewSource}
          originalWidth={originalWidth}
          originalHeight={originalHeight}
          onSelect={onSelect}
          onPresetActions={onPresetActions}
          mobile={mobile}
        />
      ))}
    </div>
  );
}

function PresetItem({
  preset,
  selected,
  previewSource,
  originalWidth,
  originalHeight,
  onSelect,
  onPresetActions,
  mobile = false,
}: {
  preset: FramePreset;
  selected: boolean;
  previewSource: string;
  originalWidth: number;
  originalHeight: number;
  onSelect: (preset: FramePreset) => void;
  onPresetActions?: (preset: FramePreset, position: FramePresetActionPosition) => void;
  mobile?: boolean;
}) {
  const openActions = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    onPresetActions?.(preset, { top: rect.bottom, left: rect.right });
  };
  return (
    <div className="group relative flex h-12 items-center rounded-sm hover:bg-app-surface">
      <ButtonBase
        type="button"
        role="option"
        aria-selected={selected}
        onClick={() => onSelect(preset)}
        sx={(theme) => ({
          width: '100%',
          height: '100%',
          minWidth: 0,
          justifyContent: 'flex-start',
          gap: `${theme.still.spacing.sm}px`,
          padding: `0 ${theme.still.spacing.sm}px`,
          paddingRight: preset.builtin ? `${theme.still.spacing.sm}px` : `${theme.still.spacing.xxl * 2}px`,
          borderRadius: `${theme.still.radius.sm}px`,
          color: theme.still.colors[theme.palette.mode].text.primary,
        })}
      >
        <FrameMiniPreview
          src={previewSource}
          preset={preset}
          originalWidth={originalWidth}
          originalHeight={originalHeight}
        />
        <span className="min-w-0 flex-1 truncate text-left text-sm">{preset.name}</span>
        {selected && <span className="shrink-0 text-accent"><Icon name="check" size={16} /></span>}
      </ButtonBase>
      {!preset.builtin && (
        <IconButton
          type="button"
          size="small"
          aria-label={`Actions for ${preset.name}`}
          onClick={openActions}
          sx={(theme) => ({
            position: 'absolute',
            right: theme.still.spacing.xs,
            width: 28,
            height: 28,
            opacity: mobile ? 1 : 0,
            color: theme.still.colors[theme.palette.mode].text.secondary,
            transition: theme.transitions.create('opacity', { duration: theme.still.motion.duration.fast }),
            '.group:hover &': { opacity: 1 },
            '&:focus-visible': { opacity: 1 },
          })}
        >
          <Icon name="more" size={14} />
        </IconButton>
      )}
    </div>
  );
}
