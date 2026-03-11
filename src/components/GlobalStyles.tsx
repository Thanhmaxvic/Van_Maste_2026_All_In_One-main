import React from 'react';

const GlobalStyles: React.FC = () => (
    <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;900&family=Patrick+Hand&display=swap');
    
    body { 
      margin: 0; 
      padding: 0; 
      background-color: #F0F9FF; 
      font-family: 'Nunito', sans-serif;
      color: #334155;
      overflow: hidden;
    }
    
    .font-serif { font-family: 'Patrick Hand', cursive, sans-serif; }
    
    .paper-pattern { 
      background-image: radial-gradient(#cbd5e1 1px, transparent 1px); 
      background-size: 20px 20px; 
    }

    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

    @keyframes slide-up {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .animate-slide-up { animation: slide-up 0.5s ease-out forwards; }

    @keyframes zoom-in {
      from { transform: scale(0.9); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    .animate-zoom-in { animation: zoom-in 0.3s ease-out forwards; }
  `}</style>
);

export default GlobalStyles;
