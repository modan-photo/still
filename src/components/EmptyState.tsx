import { alpha, Box, Button } from "@mui/material";
import { StillMark } from "./StillMark";
import { useTranslation } from "../i18n/messages";

type EmptyStateProps = {
  onImportPhotos: () => void;
  onImportFolder: () => void;
  showFolderImport: boolean;
};

export function EmptyState({ onImportPhotos, onImportFolder, showFolderImport }: EmptyStateProps) {
  const t = useTranslation();
  return (
    <Box
      className="absolute inset-0 grid place-items-center bg-app-base px-6 text-center"
      aria-label={t('emptyWorkspace')}
      sx={(theme) => {
        const colors = theme.still.colors[theme.palette.mode];

        return {
          animation: `empty-state-enter ${theme.still.motion.duration.base}ms ${theme.still.motion.easing} ${theme.still.motion.delay.stagger}ms both`,
          "@keyframes empty-state-enter": {
            from: { opacity: 0 },
            to: { opacity: 1 },
          },
          "& .still-mark": {
            color: alpha(colors.text.secondary, 0.4),
          },
        };
      }}
    >
      <div className="flex max-w-sm flex-col items-center">
        <StillMark size={64} />
        <p className="mb-0 mt-4 text-[15px] text-secondary">{t('emptyPrompt')}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button variant="contained" onClick={onImportPhotos}>{t('importPhotos')}</Button>
          {showFolderImport && (
            <Button variant="outlined" onClick={onImportFolder}>{t('importFolder')}</Button>
          )}
        </div>
      </div>
    </Box>
  );
}
