import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Skeleton, Snackbar, SnackbarContent, TextField } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useState } from "react";
import { invalidateExifCache, useExif } from "../../hooks/useExif";
import { trackExifSave } from "../../services/exifSaveCoordinator";
import { writeExif, writeExifBatch } from "../../services/tauri/exif";
import { normalizeError } from "../../services/tauri/image";
import { useProjectStore } from "../../stores/projectStore";
import { useUIStore } from "../../stores/uiStore";
import { motionTokens } from "../../theme/tokens";
import type { ExifData, ExifEdits, LocationInfo } from "../../types/exif";
import { Icon } from "../Icons";
import { ExifGroup } from "./ExifGroup";
import { ExifEditableRow } from "./ExifEditableRow";
import { ExifRow } from "./ExifRow";
import { ExifSummary } from "./ExifSummary";

type Notice = { message: string; error?: boolean; persistent?: boolean } | null;

export function ExifPanel() {
  const currentPhotoId = useProjectStore((state) => state.currentPhotoId);
  const currentPath = useProjectStore((state) =>
    state.photos.find((photo) => photo.id === state.currentPhotoId)?.path ?? null,
  );
  const activeRightTab = useUIStore((state) => state.activeRightTab);
  const photos = useProjectStore((state) => state.photos);
  const selectedIds = useProjectStore((state) => state.selectedIds);
  const batchItems = useMemo(() => photos.filter((photo) => selectedIds.includes(photo.id)).map((photo) => ({ id: photo.id, path: photo.path })), [photos, selectedIds]);
  const { data, loading, error, retry, update } = useExif(currentPhotoId);
  const [notice, setNotice] = useState<Notice>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchFields, setBatchFields] = useState({
    artist: { apply: false, value: "" },
    copyright: { apply: false, value: "" },
    keywords: { apply: false, value: "" },
  });

  const copy = useCallback(async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice({ message: successMessage });
    } catch {
      setNotice({ message: "Unable to copy to the clipboard.", error: true });
    }
  }, []);

  const copyAll = useCallback(() => {
    if (data) void copy(formatExifText(data), "EXIF copied to the clipboard.");
  }, [copy, data]);

  const saveField = useCallback(async (
    field: "artist" | "copyright" | "keywords",
    value: string,
  ) => {
    if (!currentPhotoId || !currentPath) return;
    const edits: ExifEdits = { [field]: value };
    try {
      const result = await writeExif(currentPath, edits);
      update({ [field]: value || null });
      setNotice(result.backupCleanupPath
        ? { message: `Saved. The original backup could not be removed. Delete it after verifying the image: ${result.backupCleanupPath}`, persistent: true }
        : { message: "Saved." });
    } catch (reason) {
      const failure = normalizeError(reason);
      setNotice({
        message: exifSaveErrorMessage(failure.code, failure.message),
        error: true,
        persistent: failure.code === "exif_recovery_required",
      });
      throw failure;
    }
  }, [currentPath, currentPhotoId, update]);

  const saveBatch = async () => {
    const edits: ExifEdits = {};
    for (const field of ["artist", "copyright", "keywords"] as const) {
      if (batchFields[field].apply) edits[field] = batchFields[field].value;
    }
    if (Object.keys(edits).length === 0) return;
    setBatchSaving(true);
    try {
      const result = await trackExifSave(writeExifBatch(batchItems, edits));
      invalidateExifCache(photos.map((photo) => photo.id));
      if (currentPhotoId) retry();
      setBatchOpen(false);
      setNotice(result.backupCleanupPaths.length
        ? { message: `Saved ${result.sourceCount} source files. Verify them, then remove these old backups: ${result.backupCleanupPaths.join(", ")}`, persistent: true }
        : { message: `Saved EXIF on ${result.sourceCount} source files.` });
    } catch (reason) {
      const failure = normalizeError(reason);
      if (failure.code === "exif_batch_recovery_required") {
        invalidateExifCache(photos.map((photo) => photo.id));
        if (currentPhotoId) retry();
      }
      setNotice({ message: exifSaveErrorMessage(failure.code, failure.message), error: true,
        persistent: failure.code === "exif_batch_recovery_required" || failure.code === "exif_recovery_required" });
    } finally {
      setBatchSaving(false);
    }
  };

  useEffect(() => {
    if (activeRightTab !== "exif" || !data) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== "c") return;
      event.preventDefault();
      copyAll();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeRightTab, copyAll, data]);

  if (loading) return <Box sx={{ px: 2 }}><ExifSkeleton /></Box>;
  if (error) return <Box sx={{ px: 2 }}><ExifError onRetry={retry} /></Box>;
  if (!data) return null;

  const empty = !hasExif(data);

  return (
    <Box>
      <ExifSummary data={data} onCopy={copyAll} />
      <Box sx={{ px: 2 }}>
        {batchItems.length > 1 && <Button size="small" variant="outlined" sx={{ mt: 1 }} disabled={batchItems.length > 100} onClick={() => setBatchOpen(true)}>
          Edit EXIF on {batchItems.length} selected photos
        </Button>}
        {batchItems.length > 100 && <Box sx={{ fontSize: 11, color: "text.secondary" }}>Select at most 100 photos for one EXIF batch.</Box>}
        {empty && (
          <Box sx={{ py: 2, color: "text.secondary", fontSize: 12, textAlign: "center" }}>
            This image does not contain EXIF metadata.
          </Box>
        )}

        <ExifGroup title="Capture">
          <ExifRow label="Make" value={data.camera.make} />
          <ExifRow label="Camera" value={data.camera.model} />
          <ExifRow label="Lens" value={data.camera.lens} />
          <ExifRow label="Serial" value={data.camera.serial} />
          <ExifRow label="Focal length" value={data.exposure.focalLength} />
          <ExifRow label="Aperture" value={data.exposure.aperture} />
          <ExifRow label="Shutter" value={data.exposure.shutterSpeed} />
          <ExifRow label="ISO" value={data.exposure.iso} />
          <ExifRow label="Exposure" value={data.exposure.exposureBias} />
        </ExifGroup>

        <ExifGroup title="Time">
          <ExifRow label="Captured" value={data.time.datetimeOriginal} />
          <ExifRow label="Modified" value={data.time.datetimeModified} />
        </ExifGroup>

        <ExifGroup title="Image">
          <ExifRow label="Dimensions" value={dimensions(data)} />
          <ExifRow label="Orientation" value={data.image.orientation} />
          <ExifRow label="Color space" value={data.image.colorSpace} />
          <ExifRow label="DPI" value={data.image.dpi} />
        </ExifGroup>

        {hasCompleteLocation(data.location) && (
          <LocationGroup location={data.location} onCopy={copy} onNotice={setNotice} />
        )}

        <ExifGroup title="Other">
          <ExifRow label="Software" value={data.other.software} />
          <ExifEditableRow
            key={`${currentPhotoId ?? "none"}-artist`}
            label="Artist"
            value={data.other.artist}
            onSave={(value) => saveField("artist", value)}
          />
          <ExifEditableRow
            key={`${currentPhotoId ?? "none"}-copyright`}
            label="Copyright"
            value={data.other.copyright}
            onSave={(value) => saveField("copyright", value)}
          />
          <ExifEditableRow
            key={`${currentPhotoId ?? "none"}-keywords`}
            label="Keywords"
            value={data.other.keywords}
            onSave={(value) => saveField("keywords", value)}
          />
        </ExifGroup>
      </Box>
      <Dialog open={batchOpen} onClose={batchSaving ? undefined : () => setBatchOpen(false)} fullWidth maxWidth="sm" aria-labelledby="batch-exif-title">
        <DialogTitle id="batch-exif-title">Edit selected source files</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2 }}>
          <Box sx={{ fontSize: 12, color: "text.secondary" }}>
            {batchItems.length} selected photos refer to {new Set(batchItems.map((item) => item.path)).size} source paths. All selected sources are prepared before writing; a failure triggers rollback. Check a field to change it. A checked blank field clears it.
          </Box>
          {(["artist", "copyright", "keywords"] as const).map((field) => <Box key={field} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <FormControlLabel control={<Checkbox disabled={batchSaving} checked={batchFields[field].apply} onChange={(event) => setBatchFields((current) => ({ ...current, [field]: { ...current[field], apply: event.target.checked } }))} />} label={`Change ${field}`} sx={{ minWidth: 150 }} />
            <TextField size="small" fullWidth label={field} disabled={batchSaving || !batchFields[field].apply} value={batchFields[field].value} onChange={(event) => setBatchFields((current) => ({ ...current, [field]: { ...current[field], value: event.target.value } }))} />
          </Box>)}
        </DialogContent>
        <DialogActions>
          <Button disabled={batchSaving} onClick={() => setBatchOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={batchSaving || !Object.values(batchFields).some((field) => field.apply)} onClick={() => void saveBatch()}>{batchSaving ? "Saving…" : "Save source files"}</Button>
        </DialogActions>
      </Dialog>
      <ExifNotice notice={notice} onClose={() => setNotice(null)} />
    </Box>
  );
}

function exifSaveErrorMessage(code: string, fallback: string): string {
  if (code === "file_busy") return "The file is in use and cannot be modified.";
  if (code === "file_read_only") return "The file is read-only and cannot be modified.";
  return fallback || "Unable to save EXIF metadata.";
}

function LocationGroup({
  location,
  onCopy,
  onNotice,
}: {
  location: LocationInfo;
  onCopy: (text: string, message: string) => Promise<void>;
  onNotice: (notice: Notice) => void;
}) {
  const latitude = coordinate(location.latitude, "N", "S");
  const longitude = coordinate(location.longitude, "E", "W");
  const complete = location.latitude !== null && location.longitude !== null;

  const openMap = async () => {
    if (!complete) return;
    const url = `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}`;
    try {
      await openUrl(url);
    } catch {
      onNotice({ message: "Unable to open the map.", error: true });
    }
  };

  return (
    <ExifGroup title="Location">
      <ExifRow label="Latitude" value={latitude && (
        <CoordinateButton onClick={() => void onCopy(latitude, "Latitude copied.")}>{latitude}</CoordinateButton>
      )} />
      <ExifRow label="Longitude" value={longitude && (
        <CoordinateButton onClick={() => void onCopy(longitude, "Longitude copied.")}>{longitude}</CoordinateButton>
      )} />
      <ExifRow label="Altitude" value={location.altitude === null ? null : `${formatNumber(location.altitude)} m`} />
      {complete && (
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 0.5, pt: 0.5 }}>
          <Button
            size="small"
            onClick={() => void onCopy(`${location.latitude}, ${location.longitude}`, "Coordinates copied.")}
            sx={{ minWidth: 0, px: 1, fontSize: 11 }}
          >
            Copy coordinates
          </Button>
          <Button size="small" onClick={() => void openMap()} sx={{ minWidth: 0, px: 1, fontSize: 11 }}>
            Open in map
          </Button>
        </Box>
      )}
    </ExifGroup>
  );
}

function CoordinateButton({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={(theme) => ({
        m: 0,
        p: 0,
        borderRadius: `${theme.still.radius.sm}px`,
        color: "inherit",
        textAlign: "left",
        textDecoration: "underline",
        textDecorationColor: "transparent",
        textUnderlineOffset: 2,
        transition: `color ${theme.still.motion.duration.fast}ms ${theme.still.motion.easing}, text-decoration-color ${theme.still.motion.duration.fast}ms ${theme.still.motion.easing}`,
        "&:hover": { color: "primary.main", textDecorationColor: "currentColor" },
      })}
    >
      {children}
    </Box>
  );
}

function ExifNotice({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  return (
    <Snackbar
      open={Boolean(notice)}
      autoHideDuration={notice?.persistent ? null : motionTokens.duration.slow * 5}
      anchorOrigin={{ vertical: "top", horizontal: "right" }}
      onClose={(_, reason) => reason !== "clickaway" && onClose()}
    >
      <SnackbarContent
        role={notice?.error ? "alert" : "status"}
        message={notice?.message ?? ""}
        action={notice?.persistent ? <Button size="small" onClick={onClose}>Close</Button> : undefined}
        sx={(theme) => {
          const colors = theme.still.colors[theme.palette.mode];
          return {
            minWidth: 0,
            color: notice?.error ? colors.danger : colors.text.primary,
            backgroundColor: alpha(colors.bg.elevated, theme.still.glass.backgroundOpacity),
            border: `1px solid ${colors.border.subtle}`,
            borderRadius: `${theme.still.radius.md}px`,
            boxShadow: theme.still.shadow.elev2,
            backdropFilter: theme.still.glass.backdropFilter,
            fontSize: 12,
          };
        }}
      />
    </Snackbar>
  );
}

function ExifSkeleton() {
  return (
    <Box aria-label="Loading EXIF" sx={{ pt: 1 }}>
      {[72, 94, 82, 88].map((width, index) => (
        <Box key={width} sx={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 1.5, py: 0.75 }}>
          <Skeleton animation={false} width={`${60 + index * 5}%`} sx={{ justifySelf: "end" }} />
          <Skeleton animation={false} width={`${width}%`} />
        </Box>
      ))}
    </Box>
  );
}

function ExifError({ onRetry }: { onRetry: () => void }) {
  return (
    <Box
      role="alert"
      sx={(theme) => ({
        display: "grid",
        justifyItems: "center",
        gap: 1,
        mt: 2,
        p: 2,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: `${theme.still.radius.md}px`,
        color: "text.secondary",
        textAlign: "center",
      })}
    >
      <Icon name="info" size={20} />
      <Box sx={{ fontSize: 12 }}>Unable to read EXIF metadata.</Box>
      <Button size="small" onClick={onRetry}>Retry</Button>
    </Box>
  );
}

function dimensions(data: ExifData): string | null {
  return data.image.width !== null && data.image.height !== null
    ? `${data.image.width} × ${data.image.height}`
    : null;
}

function hasCompleteLocation(location: LocationInfo | null): location is LocationInfo {
  return location?.latitude !== null
    && location?.latitude !== undefined
    && location.longitude !== null;
}

function coordinate(value: number | null, positive: string, negative: string): string | null {
  if (value === null) return null;
  return `${Math.abs(value).toFixed(4)}° ${value < 0 ? negative : positive}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function hasExif(data: ExifData): boolean {
  return [
    ...Object.values(data.camera),
    ...Object.values(data.exposure),
    ...Object.values(data.time),
    ...Object.values(data.image),
    ...Object.values(data.other),
    ...(data.location ? Object.values(data.location) : []),
  ].some((value) => value !== null);
}

export function formatExifText(data: ExifData): string {
  const sections: Array<[string, Array<[string, string | number | null]>]> = [
    ["Capture", [
      ["Make", data.camera.make],
      ["Camera", data.camera.model],
      ["Lens", data.camera.lens],
      ["Serial", data.camera.serial],
      ["Focal length", data.exposure.focalLength],
      ["Aperture", data.exposure.aperture],
      ["Shutter", data.exposure.shutterSpeed],
      ["ISO", data.exposure.iso],
      ["Exposure", data.exposure.exposureBias],
    ]],
    ["Time", [
      ["Captured", data.time.datetimeOriginal],
      ["Modified", data.time.datetimeModified],
    ]],
    ["Image", [
      ["Dimensions", dimensions(data)],
      ["Orientation", data.image.orientation],
      ["Color space", data.image.colorSpace],
      ["DPI", data.image.dpi],
    ]],
  ];

  if (hasCompleteLocation(data.location)) {
    sections.push(["Location", [
      ["Latitude", coordinate(data.location.latitude, "N", "S")],
      ["Longitude", coordinate(data.location.longitude, "E", "W")],
      ["Altitude", data.location.altitude === null ? null : `${formatNumber(data.location.altitude)} m`],
    ]]);
  }

  sections.push(["Other", [
    ["Software", data.other.software],
    ["Artist", data.other.artist],
    ["Copyright", data.other.copyright],
    ["Keywords", data.other.keywords],
  ]]);

  return sections
    .map(([title, rows]) => [title, ...rows.map(([label, value]) => `${label}: ${value ?? "—"}`)].join("\n"))
    .join("\n\n");
}
