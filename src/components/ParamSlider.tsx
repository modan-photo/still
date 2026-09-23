import { Slider } from "@mui/material";
import { useState } from "react";

type ParamSliderProps = {
  label: string;
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
};

export function ParamSlider({
  label,
  defaultValue,
  min = 0,
  max = 100,
  step = 1,
  suffix = "",
}: ParamSliderProps) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-secondary">{label}</span>
        <output className="tabular-nums text-primary">{value}{suffix}</output>
      </div>
      <Slider
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(_, nextValue) => setValue(nextValue as number)}
        size="small"
      />
    </div>
  );
}
