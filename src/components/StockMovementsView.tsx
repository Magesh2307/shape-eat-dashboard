export default function StockMovementsView() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Mouvements de stock</h1>
      
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-8 border border-white/20 text-center">
        <div className="text-6xl mb-4">🔄</div>
        <h2 className="text-2xl font-semibold mb-4">Module en cours de développement</h2>
        <p className="text-blue-300 mb-6">
          La gestion des mouvements de stock sera bientôt disponible !
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 text-left">
          <div className="bg-white/5 rounded-lg p-4">
            <h3 className="font-semibold mb-2 flex items-center space-x-2">
              <span>📥</span>
              <span>Réapprovisionnements</span>
            </h3>
            <p className="text-sm text-blue-300">
              Suivez les entrées de stock par machine et par produit
            </p>
          </div>
          
          <div className="bg-white/5 rounded-lg p-4">
            <h3 className="font-semibold mb-2 flex items-center space-x-2">
              <span>📤</span>
              <span>Consommations</span>
            </h3>
            <p className="text-sm text-blue-300">
              Analysez les sorties et optimisez vos approvisionnements
            </p>
          </div>
          
          <div className="bg-white/5 rounded-lg p-4">
            <h3 className="font-semibold mb-2 flex items-center space-x-2">
              <span>📊</span>
              <span>Prévisions</span>
            </h3>
            <p className="text-sm text-blue-300">
              Anticipez les besoins futurs grâce aux analyses prédictives
            </p>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-white/20">
          <p className="text-sm text-blue-300">
            💡 Conseil: Utilisez l'onglet Dashboard pour voir les alertes de stock actuelles
          </p>
        </div>
      </div>
    </div>
  );
}