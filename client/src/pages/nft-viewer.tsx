import { useState, useEffect } from "react";

const DEFAULT_CONTRACT = '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D'; // BAYC

export default function NFTViewer() {
  const [imageKey, setImageKey] = useState(0);
  const [contractAddress, setContractAddress] = useState(DEFAULT_CONTRACT);

  // Check for contract override in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const contract = urlParams.get('contract');
    if (contract) {
      setContractAddress(contract);
    }
  }, []);

  // Force image refresh to bypass cache
  const refreshImage = () => {
    setImageKey(prev => prev + 1);
  };

  // Generate the dynamic image URL
  const imageUrl = `/api/nft-image?contract=${contractAddress}&_refresh=${imageKey}`;

  return (
    <div className="bg-gray-900 text-white min-h-screen flex items-center justify-center">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-3 bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
            Bull & Piano
          </h1>
          <p className="text-gray-300 text-lg">
            Dynamic NFT reflecting market sentiment
          </p>
        </header>

        {/* NFT Display */}
        <div className="relative bg-gray-800 border border-gray-700 rounded-xl p-6 mb-6">
          <div className="relative aspect-square w-full max-w-lg mx-auto" data-testid="nft-container">
            <img 
              src={imageUrl}
              alt="Bull & Piano - Dynamic NFT that changes based on market sentiment"
              className="w-full h-full object-cover rounded-lg transition-opacity duration-800"
              data-testid="img-dynamic-nft"
            />
          </div>
        </div>

        {/* Simple Controls */}
        <div className="text-center space-y-4">
          <button 
            onClick={refreshImage}
            className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700 transition-colors font-medium"
            data-testid="button-refresh"
          >
            Refresh Image
          </button>
          <p className="text-sm text-gray-400">
            Image automatically reflects current NFT market sentiment via Alchemy API
          </p>
        </div>
      </div>
    </div>
  );
}