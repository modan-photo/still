/** Still's three quiet signatures: crop corners, section rules, active underlines. */
export function CropCorners() {
  return (
    <svg className="crop-corners" viewBox="0 0 104 80" fill="none" aria-hidden="true">
      <path d="M2.4 23 2 2.5 23 2M81 2.5 102 2 101.6 23M102 57 102.3 77.5 81 78M23 77.4 2 78 2.5 57" />
      <path className="sketch-echo" d="M4 15 3.7 4 16 3.8M89 76 100 75.8 100.3 65" />
    </svg>
  );
}

export function SketchLine({ underline = false }: { underline?: boolean }) {
  return (
    <svg className={underline ? "sketch-underline" : "section-rule"} viewBox="0 0 80 6" preserveAspectRatio="none" fill="none" aria-hidden="true">
      <path d={underline ? "M1 3.8Q23 1.7 42 3T79 2.4" : "M1 3.2 22 2.6 47 3.3 79 2.5"} />
      <path className="sketch-echo" d="M7 4.8 35 4 65 4.4" />
    </svg>
  );
}
