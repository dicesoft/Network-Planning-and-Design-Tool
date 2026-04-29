import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

/**
 * Network Router schematic symbol - crossed arrows in a circle
 */
export const RouterIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="15,8 19,12 15,16" />
    <line x1="12" y1="5" x2="12" y2="19" />
    <polyline points="8,9 12,5 16,9" />
  </svg>
);

/**
 * Network Switch schematic symbol - rectangle with bidirectional arrows
 */
export const SwitchIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <line x1="7" y1="10" x2="17" y2="10" />
    <polyline points="14,8 17,10 14,12" />
    <line x1="7" y1="14" x2="17" y2="14" />
    <polyline points="10,12 7,14 10,16" />
  </svg>
);

/**
 * OADM/ROADM schematic symbol - diamond/rhombus shape representing
 * optical add-drop multiplexer
 */
export const OADMIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polygon points="12,3 22,12 12,21 2,12" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="12" y1="12" x2="12" y2="21" />
  </svg>
);

/**
 * Amplifier schematic symbol - triangle (gain element)
 */
export const AmplifierIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polygon points="4,18 4,6 20,12" />
    <line x1="1" y1="12" x2="4" y2="12" />
    <line x1="20" y1="12" x2="23" y2="12" />
  </svg>
);

/**
 * Terminal/Server schematic symbol - rectangle with horizontal lines
 */
export const TerminalIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <line x1="8" y1="7" x2="16" y2="7" />
    <line x1="8" y1="11" x2="16" y2="11" />
    <line x1="8" y1="15" x2="12" y2="15" />
    <circle cx="16" cy="18" r="1" fill="currentColor" />
  </svg>
);

/**
 * OSP Termination schematic symbol - splice closure / cable junction
 */
export const OSPIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <ellipse cx="12" cy="12" rx="7" ry="4" />
    <line x1="2" y1="12" x2="5" y2="12" />
    <line x1="19" y1="12" x2="22" y2="12" />
    <line x1="12" y1="8" x2="12" y2="5" />
    <line x1="9" y1="12" x2="15" y2="12" />
  </svg>
);

/**
 * OLT (Optical Line Terminal) schematic symbol - rack unit with PON ports
 */
export const OLTIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="7" cy="9" r="1" fill="currentColor" />
    <circle cx="7" cy="13" r="1" fill="currentColor" />
    <line x1="10" y1="8" x2="10" y2="16" />
    <line x1="14" y1="8" x2="14" y2="16" />
    <line x1="18" y1="8" x2="18" y2="16" />
  </svg>
);

/**
 * ONT (Optical Network Terminal) schematic symbol - small CPE box
 */
export const ONTIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="4" y="7" width="16" height="10" rx="2" />
    <circle cx="8" cy="12" r="1" fill="currentColor" />
    <line x1="12" y1="10" x2="18" y2="10" />
    <line x1="12" y1="12" x2="18" y2="12" />
    <line x1="12" y1="14" x2="18" y2="14" />
  </svg>
);

/**
 * Custom/Generic node icon - hexagon
 */
export const CustomNodeIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polygon points="12,2 20,7 20,17 12,22 4,17 4,7" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
