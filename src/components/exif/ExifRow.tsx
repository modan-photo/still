import { Box } from "@mui/material";
import type { ReactNode } from "react";

type ExifRowProps = {
  label: string;
  value: ReactNode | null | undefined;
};

export function ExifRow({ label, value }: ExifRowProps) {
  const missing = value === null || value === undefined || value === "";

  return (
    <Box
      component="div"
      sx={{
        display: "grid",
        gridTemplateColumns: "80px minmax(0, 1fr)",
        alignItems: "center",
        minHeight: 28,
        columnGap: 1.5,
        opacity: missing ? 0.4 : 1,
      }}
    >
      <Box component="dt" sx={{ m: 0, color: "text.secondary", fontSize: 12, textAlign: "right" }}>
        {label}
      </Box>
      <Box
        component="dd"
        sx={{ m: 0, minWidth: 0, color: "text.primary", fontSize: 12, overflowWrap: "anywhere" }}
      >
        {missing ? "—" : value}
      </Box>
    </Box>
  );
}
