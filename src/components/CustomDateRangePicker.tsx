// components/CustomDateRangePicker.tsx
import React, { useState, useEffect } from 'react';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onDateChange: (startDate: string, endDate: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onDateChange,
  isOpen,
  onToggle
}) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  // ✅ Correction timezone : créer les dates correctement sans décalage
  const [tempStartDate, setTempStartDate] = useState<Date | null>(() => {
    if (startDate) {
      const [year, month, day] = startDate.split('-').map(Number);
      return new Date(year, month - 1, day);
    }
    return null;
  });
  
  const [tempEndDate, setTempEndDate] = useState<Date | null>(() => {
    if (endDate) {
      const [year, month, day] = endDate.split('-').map(Number);
      return new Date(year, month - 1, day);
    }
    return null;
  });
  
  const [isSelectingEnd, setIsSelectingEnd] = useState(false);

  // ✅ Mise à jour des dates temporaires quand les props changent
  useEffect(() => {
    if (startDate) {
      const [year, month, day] = startDate.split('-').map(Number);
      setTempStartDate(new Date(year, month - 1, day));
    } else {
      setTempStartDate(null);
    }
  }, [startDate]);

  useEffect(() => {
    if (endDate) {
      const [year, month, day] = endDate.split('-').map(Number);
      setTempEndDate(new Date(year, month - 1, day));
    } else {
      setTempEndDate(null);
    }
  }, [endDate]);

  const months = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  const daysOfWeek = ['L', 'Ma', 'Me', 'J', 'V', 'S', 'D'];

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = (firstDay.getDay() + 6) % 7; // Ajuster pour commencer lundi

    const days = [];
    
    // Jours du mois précédent pour remplir
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const prevDay = new Date(year, month, -i);
      days.push({ date: prevDay, isCurrentMonth: false });
    }
    
    // Jours du mois actuel
    for (let day = 1; day <= daysInMonth; day++) {
      days.push({ date: new Date(year, month, day), isCurrentMonth: true });
    }
    
    // Jours du mois suivant pour remplir
    const totalCells = Math.ceil(days.length / 7) * 7;
    for (let day = 1; days.length < totalCells; day++) {
      const nextDay = new Date(year, month + 1, day);
      days.push({ date: nextDay, isCurrentMonth: false });
    }
    
    return days;
  };

  const isDateInRange = (date: Date) => {
    if (!tempStartDate || !tempEndDate) return false;
    return date >= tempStartDate && date <= tempEndDate;
  };

  const isDateSelected = (date: Date) => {
    if (!tempStartDate && !tempEndDate) return false;
    const dateTime = date.getTime();
    const startTime = tempStartDate?.getTime();
    const endTime = tempEndDate?.getTime();
    return dateTime === startTime || dateTime === endTime;
  };

  const handleDateClick = (date: Date) => {
    if (!tempStartDate || (tempStartDate && tempEndDate)) {
      // Premier clic ou reset
      setTempStartDate(date);
      setTempEndDate(null);
      setIsSelectingEnd(true);
    } else {
      // Deuxième clic
      if (date < tempStartDate) {
        // Si la date de fin est antérieure, inverser
        setTempStartDate(date);
        setTempEndDate(tempStartDate);
      } else {
        setTempEndDate(date);
      }
      setIsSelectingEnd(false);
    }
  };

  const handleApply = () => {
    if (tempStartDate && tempEndDate) {
      // ✅ Correction timezone : utiliser getFullYear, getMonth, getDate pour éviter les décalages
      const startDateString = `${tempStartDate.getFullYear()}-${String(tempStartDate.getMonth() + 1).padStart(2, '0')}-${String(tempStartDate.getDate()).padStart(2, '0')}`;
      const endDateString = `${tempEndDate.getFullYear()}-${String(tempEndDate.getMonth() + 1).padStart(2, '0')}-${String(tempEndDate.getDate()).padStart(2, '0')}`;
      
      onDateChange(startDateString, endDateString);
      onToggle();
    }
  };

  const getDaysDifference = () => {
    if (!tempStartDate || !tempEndDate) return 0;
    const diffTime = Math.abs(tempEndDate.getTime() - tempStartDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const formatDateRange = () => {
    if (!tempStartDate || !tempEndDate) return '';
    
    // ✅ Correction timezone : formatage manuel pour éviter les décalages
    const formatDate = (date: Date) => {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    };
    
    return `${formatDate(tempStartDate)} - ${formatDate(tempEndDate)}`;
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev);
      if (direction === 'prev') {
        newMonth.setMonth(newMonth.getMonth() - 1);
      } else {
        newMonth.setMonth(newMonth.getMonth() + 1);
      }
      return newMonth;
    });
  };

  const handleMonthChange = (monthIndex: number) => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), monthIndex, 1));
  };

  const handleYearChange = (year: number) => {
    setCurrentMonth(prev => new Date(year, prev.getMonth(), 1));
  };

  const getCurrentYear = () => currentMonth.getFullYear();
  const getNextYear = () => nextMonth.getFullYear();

  const currentMonthDays = getDaysInMonth(currentMonth);
  const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  const nextMonthDays = getDaysInMonth(nextMonth);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-[99999]" onClick={onToggle}>
      <div 
        className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-4 w-[525px] max-h-[420px] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
      {/* Header avec navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigateMonth('prev')}
          className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        <div className="flex space-x-4">
          {/* Premier mois */}
          <div className="flex items-center space-x-1.5">
            <select
              value={currentMonth.getMonth()}
              onChange={(e) => handleMonthChange(parseInt(e.target.value))}
              className="text-white bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {months.map((month, index) => (
                <option key={index} value={index}>{month}</option>
              ))}
            </select>
            <select
              value={getCurrentYear()}
              onChange={(e) => handleYearChange(parseInt(e.target.value))}
              className="text-white bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {Array.from({ length: 10 }, (_, i) => getCurrentYear() - 5 + i).map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          
          {/* Deuxième mois */}
          <div className="flex items-center space-x-1.5">
            <select
              value={nextMonth.getMonth()}
              onChange={(e) => {
                const newMonth = new Date(nextMonth.getFullYear(), parseInt(e.target.value), 1);
                setCurrentMonth(new Date(newMonth.getFullYear(), newMonth.getMonth() - 1, 1));
              }}
              className="text-white bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {months.map((month, index) => (
                <option key={index} value={index}>{month}</option>
              ))}
            </select>
            <select
              value={getNextYear()}
              onChange={(e) => {
                const newYear = parseInt(e.target.value);
                const newMonth = new Date(newYear, nextMonth.getMonth(), 1);
                setCurrentMonth(new Date(newYear, newMonth.getMonth() - 1, 1));
              }}
              className="text-white bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {Array.from({ length: 10 }, (_, i) => getNextYear() - 5 + i).map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="flex items-center space-x-1">
          <button
            onClick={() => navigateMonth('next')}
            className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={onToggle}
            className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Calendriers côte à côte */}
      <div className="grid grid-cols-2 gap-4">
        {/* Premier mois */}
        <div>
          <div className="grid grid-cols-7 gap-0.5 mb-2">
            {daysOfWeek.map(day => (
              <div key={day} className="text-xs font-semibold text-slate-400 text-center w-7 h-6 flex items-center justify-center">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {currentMonthDays.map((day, index) => {
              const isSelected = isDateSelected(day.date);
              const isInRange = isDateInRange(day.date);
              const isToday = day.date.toDateString() === new Date().toDateString();
              
              return (
                <button
                  key={index}
                  onClick={() => day.isCurrentMonth && handleDateClick(day.date)}
                  disabled={!day.isCurrentMonth}
                  className={`
                    w-7 h-7 text-xs rounded-md transition-all duration-200 flex items-center justify-center font-medium border
                    ${!day.isCurrentMonth 
                      ? 'text-slate-600 cursor-not-allowed border-transparent' 
                      : 'text-slate-300 hover:bg-slate-700 cursor-pointer border-transparent hover:border-slate-600'
                    }
                    ${isSelected ? 'bg-emerald-500 text-white shadow-lg border-emerald-400' : ''}
                    ${isInRange && !isSelected ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50' : ''}
                    ${isToday && !isSelected && !isInRange ? 'bg-blue-500/20 text-blue-300 border-blue-400' : ''}
                  `}
                >
                  {day.date.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        {/* Deuxième mois */}
        <div>
          <div className="grid grid-cols-7 gap-0.5 mb-2">
            {daysOfWeek.map(day => (
              <div key={day} className="text-xs font-semibold text-slate-400 text-center w-7 h-6 flex items-center justify-center">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {nextMonthDays.map((day, index) => {
              const isSelected = isDateSelected(day.date);
              const isInRange = isDateInRange(day.date);
              const isToday = day.date.toDateString() === new Date().toDateString();
              
              return (
                <button
                  key={index}
                  onClick={() => day.isCurrentMonth && handleDateClick(day.date)}
                  disabled={!day.isCurrentMonth}
                  className={`
                    w-7 h-7 text-xs rounded-md transition-all duration-200 flex items-center justify-center font-medium border
                    ${!day.isCurrentMonth 
                      ? 'text-slate-600 cursor-not-allowed border-transparent' 
                      : 'text-slate-300 hover:bg-slate-700 cursor-pointer border-transparent hover:border-slate-600'
                    }
                    ${isSelected ? 'bg-emerald-500 text-white shadow-lg border-emerald-400' : ''}
                    ${isInRange && !isSelected ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50' : ''}
                    ${isToday && !isSelected && !isInRange ? 'bg-blue-500/20 text-blue-300 border-blue-400' : ''}
                  `}
                >
                  {day.date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer avec résumé et boutons */}
      <div className="mt-4 pt-3 border-t border-slate-700 bg-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-slate-300">
            {tempStartDate && tempEndDate ? (
              <div>
                <div className="font-medium">{formatDateRange()}</div>
                <div className="text-slate-400 text-xs mt-0.5">
                  {getDaysDifference()} jour{getDaysDifference() > 1 ? 's' : ''} sélectionné{getDaysDifference() > 1 ? 's' : ''}
                </div>
              </div>
            ) : (
              <div className="text-slate-400">
                {!tempStartDate ? 'Sélectionnez une date de début' : 'Sélectionnez une date de fin'}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end space-x-2">
          <button
            onClick={onToggle}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleApply}
            disabled={!tempStartDate || !tempEndDate}
            className="px-3 py-1.5 text-xs font-medium bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  </div>
  );
};

// Composant principal avec le bouton pour ouvrir le calendrier
const CustomDateRangePicker: React.FC<{
  startDate: string;
  endDate: string;
  onDateChange: (startDate: string, endDate: string) => void;
}> = ({ startDate, endDate, onDateChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  const formatDisplayDate = () => {
    if (!startDate || !endDate) return 'Sélectionner une période';
    
    // ✅ Correction timezone : formatage manuel pour éviter les décalages
    const formatDate = (dateStr: string) => {
      const [year, month, day] = dateStr.split('-').map(Number);
      return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    };
    
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
  };

  const getDaysDifference = () => {
    if (!startDate || !endDate) return 0;
    
    // ✅ Correction timezone : création manuelle des dates pour éviter les décalages
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    
    const start = new Date(startYear, startMonth - 1, startDay);
    const end = new Date(endYear, endMonth - 1, endDay);
    
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white hover:bg-slate-600/50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
      >
        <div className="flex items-center space-x-3">
          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <div className="text-left">
            <div className="font-medium">{formatDisplayDate()}</div>
            {startDate && endDate && (
              <div className="text-xs text-slate-400 mt-0.5">
                {getDaysDifference()} jour{getDaysDifference() > 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onDateChange={onDateChange}
        isOpen={isOpen}
        onToggle={() => setIsOpen(false)}
      />
    </div>
  );
};

export default CustomDateRangePicker;