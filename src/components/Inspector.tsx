import { useState, type CSSProperties, type ReactNode } from "react";
import { Icon, type IconName } from "./Icons";
import { SketchLine } from "./Sketch";

type InspectorSectionProps = { title: string; icon: IconName; children: ReactNode; defaultOpen?: boolean };

function InspectorSection({ title, icon, children, defaultOpen = false }: InspectorSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const sectionId = `inspector-${title.toLowerCase()}`;
  return (
    <section className="inspector-section" data-open={open}>
      <button className="section-trigger" type="button" aria-expanded={open} aria-controls={sectionId} onClick={() => setOpen((value) => !value)}>
        <span className="section-title"><Icon name={icon} size={16} />{title}</span>
        <SketchLine />
        <Icon name="chevron" size={16} />
      </button>
      {open && <div className="section-content" id={sectionId}>{children}</div>}
    </section>
  );
}

function Toggle({ label, defaultChecked = false }: { label: string; defaultChecked?: boolean }) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <label className="control-row">
      <span className="control-label">{label}</span>
      <input className="toggle-input" type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
      <span className="toggle" aria-hidden="true"><span /></span>
    </label>
  );
}

function Slider({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  const [currentValue, setCurrentValue] = useState(value);
  return (
    <label className="field-group slider-field">
      <span className="field-heading"><span>{label}</span><output>{currentValue}{suffix}</output></span>
      <span className="slider-track" style={{ "--range-progress": `${currentValue}%` } as CSSProperties}>
        <input className="slider" type="range" aria-label={label} aria-valuetext={`${currentValue}${suffix}`} min="0" max="100" value={currentValue} onChange={(event) => setCurrentValue(Number(event.target.value))} />
      </span>
    </label>
  );
}

export function Inspector({ collapsed }: { collapsed: boolean }) {
  return (
    <aside id="inspector" className="inspector" data-collapsed={collapsed} hidden={collapsed} aria-label="Inspector">
        <div className="inspector-scroll">
          <InspectorSection title="Frame" icon="frame" defaultOpen>
            <Toggle label="Enable frame" />
            <Slider label="Width" value={12} suffix="%" />
            <label className="field-group"><span className="control-label">Background</span><select className="select" defaultValue="white"><option value="white">White</option><option value="black">Black</option><option value="custom">Custom…</option></select></label>
          </InspectorSection>
          <InspectorSection title="Watermark" icon="watermark">
            <Toggle label="Show watermark" />
            <label className="field-group"><span className="control-label">Text</span><input className="input" type="text" placeholder="Photographer name" /></label>
            <Slider label="Opacity" value={72} suffix="%" />
          </InspectorSection>
          <InspectorSection title="EXIF" icon="info">
            <Toggle label="Show camera" defaultChecked />
            <Toggle label="Show lens" defaultChecked />
            <Toggle label="Show exposure" />
            <p className="section-note">Metadata appears when a photo is open.</p>
          </InspectorSection>
          <InspectorSection title="Transform" icon="transform">
            <div className="button-pair"><button className="button button-secondary" type="button"><Icon name="rotate-left" />Left</button><button className="button button-secondary" type="button"><Icon name="rotate-right" />Right</button></div>
            <label className="field-group"><span className="control-label">Fit</span><select className="select" defaultValue="original"><option value="original">Original</option><option value="contain">Contain</option><option value="cover">Cover</option></select></label>
          </InspectorSection>
          <InspectorSection title="Export" icon="export">
            <label className="field-group"><span className="control-label">Format</span><select className="select" defaultValue="jpeg"><option value="jpeg">JPEG</option><option value="png">PNG</option><option value="webp">WebP</option></select></label>
            <Slider label="Quality" value={90} suffix="%" />
            <button className="button button-primary button-full" type="button" disabled>Export Photo</button>
          </InspectorSection>
        </div>
    </aside>
  );
}
