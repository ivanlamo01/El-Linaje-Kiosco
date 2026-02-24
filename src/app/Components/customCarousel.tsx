import React, { useState, ReactElement } from 'react';
import InventoryTable from './inventoryTable';
import AdditionsTable from './additionsTable';
import ExpensesTableCar from './ExpensesTableCar';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';

const CustomCarousel: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  const items: { component: ReactElement; title: string }[] = [
    { component: <InventoryTable key="inventory" />, title: "Inventario (Bajo Stock)" },
    { component: <AdditionsTable key="additions" />, title: "Últimas Adiciones" },
    { component: <ExpensesTableCar key="expenses" />, title: "Últimos Gastos" }
  ];

  const handlePrev = () => {
    setCurrentIndex((prevIndex) => (prevIndex === 0 ? items.length - 1 : prevIndex - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex === items.length - 1 ? 0 : prevIndex + 1));
  };

  return (
    <div className="relative w-full overflow-hidden group">
      {/* Carousel Content */}
      <div
        className="flex transition-transform duration-500 ease-in-out"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {items.map((item, index) => (
          <div key={index} className="min-w-full p-1">
            {item.component}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-between px-2 pointer-events-none">
        <button
          onClick={handlePrev}
          className="w-8 h-8 flex items-center justify-center bg-background/50 hover:bg-primary hover:text-primary-foreground text-foreground rounded-full backdrop-blur-sm transition-all pointer-events-auto opacity-0 group-hover:opacity-100 border border-border"
        >
          <FaChevronLeft size={14} />
        </button>
        <button
          onClick={handleNext}
          className="w-8 h-8 flex items-center justify-center bg-background/50 hover:bg-primary hover:text-primary-foreground text-foreground rounded-full backdrop-blur-sm transition-all pointer-events-auto opacity-0 group-hover:opacity-100 border border-border"
        >
          <FaChevronRight size={14} />
        </button>
      </div>

      {/* Indicators */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-2 pb-2">
        {items.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={`w-2 h-2 rounded-full transition-all ${index === currentIndex ? 'bg-primary w-4' : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
              }`}
          />
        ))}
      </div>
    </div>
  );
};

export default CustomCarousel;
