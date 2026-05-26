import React from 'react';
import '../styles/components.css';

const PageHeader = ({ title, subtitle }) => {
  return (
    <div className="page-header">
      <h1 className="page-title">{title}</h1>
      {subtitle && <p className="page-subtitle">{subtitle}</p>}
    </div>
  );
};

export default PageHeader;
