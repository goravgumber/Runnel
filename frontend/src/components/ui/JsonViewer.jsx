import React, { useState } from "react";
import { ChevronDown, ChevronUp, Copy, Check } from "lucide-react";

export default function JsonViewer({
  data,
  label = "Payload",
  initialOpen = true,
  maxHeight = "max-h-64",
}) {
  const [open, setOpen] = useState(initialOpen);
  const [copied, setCopied] = useState(false);

  if (data == null) {
    return (
      <div className="rounded-lg border border-stone-border bg-canvas-well/60 px-3 py-2 text-xs font-mono text-charcoal-muted">
        {label}: <span className="italic">null</span>
      </div>
    );
  }

  const jsonString = typeof data === "string" ? data : JSON.stringify(data, null, 2);

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(jsonString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="rounded-lg border border-stone-border bg-surface overflow-hidden shadow-sm">
      <div
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between px-3 py-2 bg-canvas-well/50 cursor-pointer hover:bg-canvas-well transition-colors border-b border-stone-border"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronUp className="w-3.5 h-3.5 text-charcoal-secondary" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-charcoal-secondary" />
          )}
          <span className="text-xs font-mono font-medium text-charcoal">{label}</span>
        </div>

        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 text-2xs font-mono text-charcoal-secondary hover:text-charcoal px-2 py-0.5 rounded hover:bg-surface border border-stone-border/60 transition-colors"
          title="Copy JSON to clipboard"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-[#2F7D5A]" />
              <span className="text-[#2F7D5A]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {open && (
        <pre
          className={`p-3 text-xs font-mono text-charcoal bg-surface overflow-x-auto leading-relaxed ${maxHeight} selection:bg-forest/15`}
        >
          <code>{jsonString}</code>
        </pre>
      )}
    </div>
  );
}
