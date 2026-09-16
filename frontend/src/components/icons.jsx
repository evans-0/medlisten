const common = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function ChatIcon() {
  return (
    <svg {...common}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

export function ClipboardIcon() {
  return (
    <svg {...common}>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M9 11h6M9 15h6" />
    </svg>
  );
}

export function FolderIcon() {
  return (
    <svg {...common}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

export function UserIcon() {
  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}

export function MicIcon() {
  return (
    <svg {...common}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
      <path d="M12 18v4M9 22h6" />
    </svg>
  );
}

export function PillIcon() {
  return (
    <svg {...common}>
      <rect x="3" y="9.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 13)" />
      <path d="M9.5 9.5l5 5" />
    </svg>
  );
}

export function FlaskIcon() {
  return (
    <svg {...common}>
      <path d="M9 2h6" />
      <path d="M10 2v6.5L4.8 18.4A2 2 0 0 0 6.6 21h10.8a2 2 0 0 0 1.8-2.6L14 8.5V2" />
      <path d="M7.5 15h9" />
    </svg>
  );
}

export function DischargeIcon() {
  return (
    <svg {...common}>
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10z" />
      <path d="M14 3v6a1 1 0 0 0 1 1h5" />
      <path d="M9 16h6M9.5 12.5L13 16l-3.5 3.5" />
    </svg>
  );
}

export function ScanIcon() {
  return (
    <svg {...common}>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M4 16v2a2 2 0 0 0 2 2h2M20 8V6a2 2 0 0 0-2-2h-2M20 16v2a2 2 0 0 1-2 2h-2" />
      <path d="M4 12h16" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function FileIcon() {
  return (
    <svg {...common}>
      <path d="M6 3h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

export function StethoscopeIcon() {
  return (
    <svg {...common}>
      <path d="M6 3v6a3 3 0 0 0 6 0V3" />
      <path d="M9 12v2a5 5 0 0 0 10 0v-3" />
      <circle cx="19" cy="9" r="2" />
    </svg>
  );
}

export function LeafIcon() {
  return (
    <svg {...common}>
      <path d="M20 20C10 20 4 14 4 6c8 0 14 4 16 14z" />
      <path d="M8 10c4 2 7 5 8 10" />
    </svg>
  );
}

export function EyeIcon() {
  return (
    <svg {...common}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon() {
  return (
    <svg {...common}>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A9.6 9.6 0 0 1 12 5c6.5 0 10 7 10 7a16.6 16.6 0 0 1-3.5 4.3M6.6 6.6C4 8.3 2 12 2 12s3.5 7 10 7a9.5 9.5 0 0 0 3.4-.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg {...common}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <circle cx="14" cy="7" r="2.2" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="8" cy="12" r="2.2" />
      <line x1="4" y1="17" x2="20" y2="17" />
      <circle cx="16" cy="17" r="2.2" />
    </svg>
  );
}
