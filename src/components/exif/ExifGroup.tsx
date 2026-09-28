import { Box } from "@mui/material";
import type { ReactNode } from "react";

type ExifGroupProps = {
  title: string;
  children: ReactNode;
};

export function ExifGroup({ title, children }: ExifGroupProps) {
  return (
    <Box component="section" sx={{ py: 1 }}>
      <Box
        component="h3"
        sx={{ m: 0, py: 1, color: "text.secondary", fontSize: 13, fontWeight: 500 }}
      >
        {title}
      </Box>
      <Box component="dl" sx={{ m: 0 }}>
        {children}
      </Box>
    </Box>
  );
}
