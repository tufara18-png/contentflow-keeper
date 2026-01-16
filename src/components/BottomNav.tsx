import { NavLink } from 'react-router-dom';
import { PenLine, Target, List, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', icon: List, label: 'Dashboard' },
  { path: '/capture', icon: PenLine, label: 'Capture' },
  { path: '/focus', icon: Target, label: 'Focus' },
  { path: '/tasks', icon: List, label: 'All Tasks' },
  { path: '/calendar', icon: Calendar, label: 'Calendrier' },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav">
      <div className="flex items-center justify-around max-w-md mx-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn('bottom-nav-item', isActive && 'active')
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="text-xs mt-1">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
