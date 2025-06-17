import React from 'react';
import clsx from 'clsx';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'destructive' | 'warning' | 'secondary' | 'outline';
}

const Badge: React.FC<BadgeProps> = ({ children, variant = 'default' }) => {
  const base = 'px-2 py-1 rounded text-xs font-medium';
  const styles = {
    default: 'bg-green-100 text-green-800',
    destructive: 'bg-red-100 text-red-800',
    warning: 'bg-yellow-100 text-yellow-800',
    secondary: 'bg-gray-100 text-gray-800',
    outline: 'border border-gray-300 text-gray-700',
  };
  return <span className={clsx(base, styles[variant])}>{children}</span>;
};

export { Badge };
