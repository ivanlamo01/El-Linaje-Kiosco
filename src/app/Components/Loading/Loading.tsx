
import React from 'react';

interface LoadingProps {
  loading: boolean;
}

const Loading: React.FC<LoadingProps> = ({ loading }) => {
  if (!loading) return null;
  return (
    <div className="loading">
      <span>Cargando...</span>
    </div>
  );
};

export default Loading;
