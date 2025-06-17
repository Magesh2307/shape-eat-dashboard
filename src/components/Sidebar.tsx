import React from 'react';

interface SidebarProps {
  onSelectView: (view: string) => void;
  activeView: string;
}

const Sidebar: React.FC<SidebarProps> = ({ onSelectView, activeView }) => {
  const items = [
    { key: 'dashboard', label: 'Dashboard', icon: '📊' },
    { key: 'machines', label: 'Liste de machines', icon: '🏪' },
    { key: 'sales', label: 'Ventes', icon: '💰' },
    { key: 'stock', label: 'Mouvements de stocks', icon: '📦' }
  ];

  return (
    <div className="w-64 bg-blue-900/50 backdrop-blur-md text-white h-screen p-4 border-r border-white/10">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2 flex items-center space-x-2">
          <span>🍔</span>
          <span>Shape Eat</span>
        </h2>
        <p className="text-blue-300 text-sm">Dashboard VendLive</p>
      </div>
      
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.key}
            className={`cursor-pointer px-4 py-3 rounded-lg transition-all duration-200 hover:bg-blue-800/50 flex items-center space-x-3 ${
              activeView === item.key ? 'bg-blue-600 shadow-lg' : ''
            }`}
            onClick={() => onSelectView(item.key)}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="font-medium">{item.label}</span>
            {activeView === item.key && (
              <span className="ml-auto">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </span>
            )}
          </li>
        ))}
      </ul>

      {/* Footer de la sidebar */}
      <div className="absolute bottom-4 left-4 right-4">
        <div className="border-t border-white/20 pt-4">
          <p className="text-xs text-blue-300 text-center">
            Dernière sync: {new Date().toLocaleTimeString('fr-FR')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;