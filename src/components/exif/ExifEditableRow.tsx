import { Box, TextField } from "@mui/material";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { trackExifSave } from "../../services/exifSaveCoordinator";

type ExifEditableRowProps = {
  label: string;
  value: string | null;
  onSave: (value: string) => Promise<void>;
};

export function ExifEditableRow({ label, value, onSave }: ExifEditableRowProps) {
  const committed = value ?? "";
  const [draft, setDraft] = useState(committed);
  const [focused, setFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const skipBlurSave = useRef(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!focused && !savingRef.current) setDraft(committed);
  }, [committed, focused]);

  const save = async () => {
    if (savingRef.current || draft === committed) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await trackExifSave(onSave(draft));
    } catch {
      setDraft(committed);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      skipBlurSave.current = true;
      setDraft(committed);
      event.currentTarget.blur();
    }
  };

  return (
    <Box
      component="div"
      sx={{
        display: "grid",
        gridTemplateColumns: "80px minmax(0, 1fr)",
        alignItems: "center",
        minHeight: 28,
        columnGap: 1.5,
        opacity: !focused && !draft ? 0.4 : 1,
      }}
    >
      <Box component="dt" sx={{ m: 0, color: "text.secondary", fontSize: 12, textAlign: "right" }}>
        {label}
      </Box>
      <Box component="dd" sx={{ m: 0, minWidth: 0 }}>
        <TextField
          aria-label={label}
          variant="standard"
          value={draft}
          placeholder="—"
          fullWidth
          inputProps={{ readOnly: saving }}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (skipBlurSave.current) {
              skipBlurSave.current = false;
              return;
            }
            void save();
          }}
          onKeyDown={handleKeyDown}
          sx={(theme) => {
            const colors = theme.still.colors[theme.palette.mode];
            return {
              "& .MuiInput-root": {
                minHeight: 26,
                px: 0.5,
                borderRadius: `${theme.still.radius.sm}px`,
                backgroundColor: "transparent",
                transition: `background-color ${theme.still.motion.duration.fast}ms ${theme.still.motion.easing}`,
                "&:hover": { backgroundColor: colors.bg.elevated },
                "&::before": { borderBottom: "1px solid transparent" },
                "&:hover:not(.Mui-disabled, .Mui-error)::before": { borderBottom: "1px solid transparent" },
                "&::after": { borderBottom: `1px solid ${colors.accent}` },
              },
              "& .MuiInput-input": {
                py: 0.25,
                color: colors.text.primary,
                fontSize: 12,
                lineHeight: "20px",
              },
              "& .MuiInput-input::placeholder": {
                color: colors.text.primary,
                opacity: 1,
              },
            };
          }}
        />
      </Box>
    </Box>
  );
}
