import React from 'react';

interface DataToggleProps {
  useMockData: boolean;
  onToggle: (use: boolean) => void;
  isLoading?: boolean;
}

export const DataToggle: React.FC<DataToggleProps> = ({
  useMockData,
  onToggle,
  isLoading = false,
}) => {
  return (
    <div className="data-toggle">
      <input
        type="checkbox"
        id="data-toggle"
        checked={useMockData}
        onChange={(e) => onToggle(e.target.checked)}
        disabled={isLoading}
      />
      <label htmlFor="data-toggle" style={{ cursor: 'pointer', margin: 0 }}>
        {useMockData ? '📚 Mock Data' : '📡 Live API'}
      </label>
      {isLoading && <div className="loading-dot"></div>}
    </div>
  );
};
