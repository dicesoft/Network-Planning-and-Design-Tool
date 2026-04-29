import React from 'react';
import { NodeType } from '@/types';
import {
  RouterIcon,
  SwitchIcon,
  OADMIcon,
  AmplifierIcon,
  TerminalIcon,
  OSPIcon,
  OLTIcon,
  ONTIcon,
  CustomNodeIcon,
} from '@/assets/icons';

/**
 * Map of node type icon names to custom schematic SVG components.
 * Uses telecom-standard schematic symbols instead of generic Lucide icons.
 */
const ICON_MAP: Record<string, React.FC<{ size?: number; className?: string }>> = {
  Router: RouterIcon,
  Network: SwitchIcon,
  Waypoints: OADMIcon,
  Signal: AmplifierIcon,
  Server: TerminalIcon,
  Cable: OSPIcon,
  OLT: OLTIcon,
  ONT: ONTIcon,
  Box: CustomNodeIcon,
};

/**
 * Map of node types directly to icon components
 */
const NODE_TYPE_ICON_MAP: Record<NodeType, React.FC<{ size?: number; className?: string }>> = {
  router: RouterIcon,
  switch: SwitchIcon,
  oadm: OADMIcon,
  amplifier: AmplifierIcon,
  terminal: TerminalIcon,
  'osp-termination': OSPIcon,
  olt: OLTIcon,
  ont: ONTIcon,
  custom: CustomNodeIcon,
};

interface NodeIconProps {
  iconName: string;
  className?: string;
  size?: number;
}

/**
 * Renders a network schematic icon by name.
 * Uses custom SVG components with telecom-standard symbols.
 */
export const NodeIcon: React.FC<NodeIconProps> = ({
  iconName,
  className = '',
  size = 20,
}) => {
  const IconComponent = ICON_MAP[iconName] || CustomNodeIcon;
  return <IconComponent className={className} size={size} />;
};

/**
 * Get the icon component for a node type directly
 */
export const getNodeTypeIcon = (nodeType: NodeType): React.FC<{ size?: number; className?: string }> => {
  return NODE_TYPE_ICON_MAP[nodeType] || CustomNodeIcon;
};
